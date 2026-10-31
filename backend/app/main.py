"""Persistent fictional Brightloop workflows. No external delivery or money movement."""

import hashlib
import hmac
import json
import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, Header, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select, or_, cast, String
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .db import Event, Idempotency, Invoice, Payment, Record, Session, User, init_db
from .rules import (
    invoice_amount,
    invoice_balance,
    money,
    next_date,
    term_length,
    renewal_date,
    resume_date,
    subscription_actions,
)
from .pdf import invoice_pdf
from .reporting import report_snapshot
from .schemas import AccountUpdate, StaffUpdate, CustomerChange, PaymentInput, SCHEMAS, parse_record


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="Brightloop demo API", version="1.0", lifespan=lifespan)


@app.exception_handler(ValidationError)
async def domain_validation_error(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "code": "validation_error",
                "fields": [
                    {"field": ".".join(map(str, error["loc"])), "message": error["msg"]}
                    for error in exc.errors()
                ],
            }
        },
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
SECRET = os.getenv("DEMO_SECRET", "local-demo-only-change-me").encode()
KINDS = {
    "products",
    "plans",
    "tax-rules",
    "discount-rules",
    "quotation-templates",
    "subscriptions",
    "requests",
    "billing-runs",
}
ADMIN_ONLY = {"products", "plans", "tax-rules", "discount-rules"}


class Credentials(BaseModel):
    email: str
    password: str
    name: str = ""


class ResetRequest(BaseModel):
    email: str


class Payload(BaseModel):
    payload: dict = Field(default_factory=dict)


def db():
    with Session() as session:
        yield session


def fail(code: str, status=422):
    raise HTTPException(status, {"code": code})


def hash_password(password: str, salt=None):
    salt = salt or secrets.token_hex(16)
    return (
        salt + ":" + hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 300_000).hex()
    )


def valid_password(password):
    return (
        len(password) > 8
        and bool(re.search("[A-Z]", password))
        and bool(re.search("[a-z]", password))
        and bool(re.search("[^A-Za-z0-9]", password))
    )


def token(user_id, days=1):
    expiry = int((datetime.now(timezone.utc) + timedelta(days=days)).timestamp())
    body = f"{user_id}.{expiry}"
    sig = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def current(authorization: str = Header(default=""), session: DbSession = Depends(db)):
    try:
        raw = authorization.removeprefix("Bearer ")
        user_id, expiry, sig = raw.split(".")
        body = f"{user_id}.{expiry}"
        if (
            not hmac.compare_digest(
                sig, hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
            )
            or int(expiry) < datetime.now(timezone.utc).timestamp()
        ):
            fail("invalid_session", 401)
        user = session.get(User, int(user_id))
        if user is None or not user.active:
            fail("invalid_session", 401)
        return user
    except (ValueError, AttributeError):
        fail("invalid_session", 401)


def allowed(user, *roles):
    if user.role not in roles:
        fail("forbidden", 403)


def public_user(user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "active": user.active,
    }


def record_json(record):
    return {
        **record.payload,
        "id": record.id,
        "number": record.number,
        "status": record.status,
        "owner_id": record.owner_id,
        "version": record.version,
    }


def pending_request(session, record_id):
    return session.scalar(
        select(Record)
        .where(
            Record.kind == "requests",
            Record.status.in_(["pending", "approved"]),
            Record.payload["subscription_id"].as_integer() == record_id,
        )
        .order_by(Record.id.desc())
    )


def record_view(session, record, user):
    result = record_json(record)
    if record.kind == "quotation-templates":
        plan = session.get(Record, record.payload["plan_id"])
        lines = []
        for line in record.payload["lines"]:
            product = session.get(Record, line["product_id"])
            variant_id = line.get("variant_id")
            variants = product.payload.get("variants", []) if product else []
            variant = (
                variants[variant_id]
                if variant_id is not None and variant_id < len(variants)
                else {}
            )
            lines.append(
                {
                    **line,
                    "name": product.payload.get("name") if product else "Unavailable product",
                    "variant_name": variant.get("name"),
                    "unit_price": str(
                        money(product.payload["sales_price"], product.payload["currency"])
                        + money(variant.get("price_adjustment", 0), product.payload["currency"])
                    )
                    if product
                    else "0",
                    "currency": product.payload["currency"] if product else "USD",
                }
            )
        return {**result, "plan": record_json(plan) if plan else None, "lines": lines}
    if record.kind != "subscriptions":
        return result
    plan = session.get(Record, record.payload["plan_id"])
    today = datetime.now(ZoneInfo(record.payload.get("billing_timezone", "UTC"))).date()
    actions = subscription_actions(
        record.status, record.payload, plan.payload, today, customer=user.role == "customer"
    )
    pending = pending_request(session, record.id)
    if record.payload.get("pending_change") or user.role == "customer" and pending:
        actions = []
    return {
        **result,
        "plan": {
            "id": plan.id,
            **plan.payload,
            "price": record.payload.get("plan_price", plan.payload["price"]),
            "currency": record.payload.get("currency", plan.payload["currency"]),
        },
        "available_actions": actions,
        "pending_request": record_json(pending) if pending else None,
        "customer": public_user(session.get(User, record.owner_id)),
    }


def get_record(session, kind, record_id, user, lock=False):
    query = select(Record).where(Record.id == record_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    record = session.scalar(query)
    if (
        record is None
        or record.kind != kind
        or (user.role == "customer" and record.owner_id != user.id)
    ):
        fail("not_found", 404)
    return record


def check_version(version, if_match):
    if if_match is None or if_match.strip('"') != str(version):
        fail("precondition_failed", 412)


def event(session, kind, record_id, action, actor_id=None, detail=None):
    session.add(
        Event(kind=kind, record_id=record_id, action=action, actor_id=actor_id, detail=detail or {})
    )


def payload_fingerprint(action: str, body: dict):
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    return f"{action}:{hashlib.sha256(canonical.encode()).hexdigest()}"


@app.post("/api/v1/auth/register", status_code=201)
def register(body: Credentials, session: DbSession = Depends(db)):
    if not valid_password(body.password):
        fail("password_rule")
    user = User(
        name=body.name.strip(),
        email=body.email.strip().lower(),
        password_hash=hash_password(body.password),
        role="customer",
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        fail("duplicate_email", 409)
    return {"user": public_user(user)}


@app.post("/api/v1/auth/login")
def login(body: Credentials, session: DbSession = Depends(db)):
    user = session.scalar(select(User).where(User.email == body.email.strip().lower()))
    if (
        not user
        or not user.active
        or not hmac.compare_digest(
            user.password_hash, hash_password(body.password, user.password_hash.split(":")[0])
        )
    ):
        fail("invalid_credentials", 401)
    return {"access_token": token(user.id), "user": public_user(user)}


@app.post("/api/v1/auth/password-resets", status_code=202)
def reset_request(body: ResetRequest, session: DbSession = Depends(db)):
    user = session.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user:
        reset_token = secrets.token_urlsafe(30)
        event(
            session,
            "outbox",
            user.id,
            "password_reset",
            detail={
                "token": reset_token,
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            },
        )
        session.commit()
    return {"status": "accepted"}


@app.post("/api/v1/auth/password-resets/confirm")
def reset_confirm(body: dict, session: DbSession = Depends(db)):
    if not valid_password(body.get("new_password", "")):
        fail("password_rule")
    for entry in session.scalars(
        select(Event)
        .where(Event.kind == "outbox", Event.action == "password_reset")
        .order_by(Event.id.desc())
    ):
        if (
            hmac.compare_digest(entry.detail.get("token", ""), body.get("token", ""))
            and entry.detail["expires_at"] > datetime.now(timezone.utc).isoformat()
            and not entry.detail.get("used")
        ):
            user = session.get(User, entry.record_id)
            user.password_hash = hash_password(body["new_password"])
            entry.detail = {**entry.detail, "used": True}
            session.commit()
            return {"status": "changed"}
    fail("invalid_reset_token", 400)


@app.get("/api/v1/me")
def me(user: User = Depends(current)):
    return public_user(user)


@app.patch("/api/v1/me")
def update_account(
    body: AccountUpdate, user: User = Depends(current), session: DbSession = Depends(db)
):
    user.name = body.name
    session.commit()
    return public_user(user)


@app.get("/api/v1/outbox")
def outbox(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin")
    return {
        "data": [
            {"id": e.id, "action": e.action, "record_id": e.record_id, "detail": e.detail}
            for e in session.scalars(
                select(Event).where(Event.kind == "outbox").order_by(Event.id.desc()).limit(50)
            )
        ]
    }


def people_page(session, role, search, limit, cursor, active=None):
    query = select(User).where(User.role == role, User.id > cursor).order_by(User.id)
    if search:
        query = query.where(or_(User.name.ilike(f"%{search}%"), User.email.ilike(f"%{search}%")))
    if active is not None:
        query = query.where(User.active == active)
    rows = list(session.scalars(query.limit(limit + 1)))
    return {
        "data": [public_user(row) for row in rows[:limit]],
        "next_cursor": rows[limit - 1].id if len(rows) > limit else None,
    }


@app.get("/api/v1/staff")
def staff(
    search: str = "",
    limit: int = Query(25, ge=1, le=100),
    cursor: int = Query(0, ge=0),
    active: bool | None = None,
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    allowed(user, "admin")
    return people_page(session, "staff", search, limit, cursor, active)


@app.post("/api/v1/staff", status_code=201)
def add_staff(body: Credentials, user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin")
    if not valid_password(body.password):
        fail("password_rule")
    staff_user = User(
        name=body.name,
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role="staff",
    )
    session.add(staff_user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        fail("duplicate_email", 409)
    return public_user(staff_user)


@app.patch("/api/v1/staff/{staff_id}")
def update_staff(
    staff_id: int,
    body: StaffUpdate,
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    allowed(user, "admin")
    member = session.get(User, staff_id)
    if not member or member.role != "staff":
        fail("not_found", 404)
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(member, key, value)
    session.commit()
    return public_user(member)


@app.get("/api/v1/customers")
def customers(
    search: str = "",
    limit: int = Query(25, ge=1, le=100),
    cursor: int = Query(0, ge=0),
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    allowed(user, "admin", "staff")
    return people_page(session, "customer", search, limit, cursor)


@app.get("/api/v1/customers/{customer_id}")
def customer_detail(
    customer_id: int, user: User = Depends(current), session: DbSession = Depends(db)
):
    allowed(user, "admin", "staff")
    customer = session.get(User, customer_id)
    if not customer or customer.role != "customer":
        fail("not_found", 404)
    subscriptions = list(
        session.scalars(
            select(Record)
            .where(Record.kind == "subscriptions", Record.owner_id == customer_id)
            .order_by(Record.id.desc())
            .limit(10)
        )
    )
    invoices = list(
        session.scalars(
            select(Invoice)
            .where(Invoice.customer_id == customer_id)
            .order_by(Invoice.id.desc())
            .limit(10)
        )
    )
    return {
        **public_user(customer),
        "subscriptions": [record_view(session, row, user) for row in subscriptions],
        "invoices": [invoice_json(row, session) for row in invoices],
    }


@app.get("/api/v1/catalog-items")
def catalog_items(
    search: str = "", user: User = Depends(current), session: DbSession = Depends(db)
):
    allowed(user, "admin", "staff", "customer")
    rows = []
    for product in session.scalars(
        select(Record).where(Record.kind == "products", Record.status == "active")
    ):
        data = product.payload
        if user.role == "customer" and data.get("type") != "add_on":
            continue
        currency = data.get("currency", "USD")
        base = money(data.get("sales_price", "0"), currency)
        rows.append(
            {
                "product_id": product.id,
                "variant_id": None,
                "name": data.get("name", ""),
                "sku": data.get("sku", ""),
                "unit_price": str(base),
                "currency": currency,
            }
        )
        for index, variant in enumerate(data.get("variants", [])):
            if variant.get("active", True):
                rows.append(
                    {
                        "product_id": product.id,
                        "variant_id": index,
                        "name": data.get("name", ""),
                        "variant_name": variant.get("name", ""),
                        "sku": variant.get("sku", ""),
                        "unit_price": str(
                            base + money(variant.get("price_adjustment", "0"), currency)
                        ),
                        "currency": currency,
                    }
                )
    return {"data": [row for row in rows if search.lower() in str(row).lower()][:100]}


def resolve_lines(session, selections, currency):
    lines = []
    for line in selections:
        product = session.get(Record, line.get("product_id"))
        if (
            not product
            or product.kind != "products"
            or product.status != "active"
            or product.payload.get("currency", "USD") != currency
        ):
            fail("catalog_item_unavailable")
        try:
            quantity = int(line["quantity"])
        except (KeyError, TypeError, ValueError):
            fail("invalid_quantity")
        if quantity <= 0:
            fail("invalid_quantity")
        variant_id = line.get("variant_id")
        variant = None
        if variant_id is not None:
            try:
                variant = product.payload.get("variants", [])[int(variant_id)]
            except (ValueError, IndexError, TypeError):
                fail("catalog_item_unavailable")
            if not variant.get("active", True):
                fail("catalog_item_unavailable")
        price = money(product.payload.get("sales_price", 0), currency) + money(
            variant.get("price_adjustment", 0) if variant else 0, currency
        )
        if price < 0:
            fail("invalid_price")
        lines.append(
            {
                "product_id": product.id,
                "variant_id": variant_id,
                "name": product.payload.get("name", ""),
                "variant_name": variant.get("name") if variant else None,
                "quantity": quantity,
                "unit_price": str(price),
                "currency": currency,
            }
        )
    return lines


def resolved_subscription(session, payload):
    if payload.get("template_id"):
        template = session.get(Record, payload["template_id"])
        if not template or template.kind != "quotation-templates" or template.status != "active":
            fail("template_unavailable")
        payload = {
            **payload,
            "plan_id": payload.get("plan_id") or template.payload.get("plan_id"),
            "lines": payload.get("lines") or template.payload.get("lines", []),
            "validity_days": template.payload.get("validity_days", 30),
        }
    customer = session.get(User, payload.get("customer_id"))
    plan = session.get(Record, payload.get("plan_id"))
    if (
        not customer
        or customer.role != "customer"
        or not plan
        or plan.kind != "plans"
        or plan.status != "active"
    ):
        fail("missing_subscription_fields")
    if (
        plan.payload.get("available_from")
        and payload["start_date"] < plan.payload["available_from"]
    ) or (
        plan.payload.get("available_until")
        and payload["start_date"] > plan.payload["available_until"]
    ):
        fail("plan_unavailable")
    if not payload.get("lines") or date.fromisoformat(payload["start_date"]) > date.fromisoformat(
        payload["expiry_date"]
    ):
        fail("invalid_subscription_dates")
    if int(payload.get("payment_terms_days", 0)) < 0:
        fail("invalid_payment_terms")
    currency = plan.payload.get("currency", "USD")
    lines = resolve_lines(session, payload["lines"], currency)
    quantity_total = sum(line["quantity"] for line in lines)
    if quantity_total < int(plan.payload.get("minimum_quantity", 1)):
        fail("minimum_quantity")
    return {
        **payload,
        "lines": lines,
        "currency": currency,
        "plan_price": plan.payload["price"],
        "next_billing_date": payload["start_date"],
        **term_length(
            date.fromisoformat(payload["start_date"]), date.fromisoformat(payload["expiry_date"])
        ),
    }


def validate_references(session, kind, payload, user):
    if kind == "quotation-templates":
        plan = get_record(session, "plans", payload["plan_id"], user)
        if plan.status != "active":
            fail("plan_unavailable")
        for line in payload["lines"]:
            product = get_record(session, "products", line["product_id"], user)
            if (
                product.status != "active"
                or product.payload["currency"] != plan.payload["currency"]
            ):
                fail("catalog_item_unavailable")
            if line.get("variant_id") is not None and line["variant_id"] >= len(
                product.payload.get("variants", [])
            ):
                fail("catalog_item_unavailable")
    if kind == "discount-rules":
        for product_id in payload["product_ids"]:
            get_record(session, "products", product_id, user)


def invoice_json(invoice, session):
    payments = list(session.scalars(select(Payment).where(Payment.invoice_id == invoice.id)))
    balance = invoice_balance(
        invoice.snapshot["total"], [p.amount for p in payments], invoice.snapshot["currency"]
    )
    paid = money(balance["amount_paid"], invoice.snapshot["currency"])
    due = (
        money(balance["amount_due"], invoice.snapshot["currency"])
        if invoice.status != "canceled"
        else money(0, invoice.snapshot["currency"])
    )
    customer = session.get(User, invoice.customer_id)
    actions = (
        ["confirm", "cancel"]
        if invoice.status == "draft"
        else (["send"] + (["cancel"] if not payments else []))
        if invoice.status == "confirmed"
        else []
    )
    return {
        **invoice.snapshot,
        "id": invoice.id,
        "number": invoice.number,
        "subscription_id": invoice.subscription_id,
        "customer_id": invoice.customer_id,
        "period_start": invoice.period_start,
        "period_end": invoice.period_end,
        "due_on": invoice.due_on,
        "status": invoice.status,
        "overdue": invoice.status == "confirmed"
        and due > 0
        and invoice.due_on
        < datetime.now(ZoneInfo(invoice.snapshot.get("billing_timezone", "UTC")))
        .date()
        .isoformat(),
        "version": invoice.version,
        "customer": invoice.snapshot.get(
            "customer", {"id": customer.id, "name": customer.name, "email": customer.email}
        ),
        "available_actions": actions,
        "amount_paid": str(paid),
        "amount_due": str(due),
        "payments": [
            {
                "id": p.id,
                "amount": p.amount,
                "method": p.method,
                "paid_at": p.paid_at,
                "note": p.note,
            }
            for p in payments
        ],
    }


def get_invoice(session, invoice_id, user, lock=False):
    query = select(Invoice).where(Invoice.id == invoice_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    invoice = session.scalar(query)
    if not invoice or user.role == "customer" and invoice.customer_id != user.id:
        fail("not_found", 404)
    return invoice


@app.post("/api/v1/billing-runs", status_code=202)
def billing_run(
    body: dict,
    idempotency_key: str = Header(...),
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    allowed(user, "admin", "staff")
    key = f"billing:{user.id}:{idempotency_key}"
    fingerprint = payload_fingerprint("billing_run", body)
    previous = session.get(Idempotency, key)
    if previous:
        if previous.action != fingerprint:
            fail("idempotency_conflict", 409)
        return previous.result
    due_on = date.fromisoformat(body["due_on"])
    counts = {"created_count": 0, "skipped_count": 0, "failed_count": 0, "failures": []}
    failed_subscriptions = set()
    for subscription in session.scalars(
        select(Record).where(Record.kind == "subscriptions").with_for_update()
    ):
        plan = session.get(Record, subscription.payload["plan_id"])
        if (
            subscription.status == "confirmed"
            and subscription.payload["start_date"] <= due_on.isoformat()
        ):
            subscription.status = "active"
            subscription.version += 1
            event(session, "subscriptions", subscription.id, "auto_activated")
        change = subscription.payload.get("pending_change")
        next_on = date.fromisoformat(
            subscription.payload.get("next_billing_date", subscription.payload["start_date"])
        )
        if not change or next_on > due_on:
            if subscription.status == "paused":
                counts["skipped_count"] += 1
                if (
                    plan.payload.get("auto_close")
                    and subscription.payload["expiry_date"] <= due_on.isoformat()
                ):
                    subscription.status = "closed"
                    subscription.version += 1
                    event(session, "subscriptions", subscription.id, "auto_closed")
            continue
        try:
            action = change["action"]
            payload = {
                key: value for key, value in subscription.payload.items() if key != "pending_change"
            }
            if action not in subscription_actions(
                subscription.status, payload, plan.payload, due_on, customer=True
            ):
                raise ValueError("action_unavailable")
            if action == "add_on":
                new_lines = resolve_lines(
                    session,
                    [
                        {
                            "product_id": change["product_id"],
                            "variant_id": change.get("variant_id"),
                            "quantity": change["quantity"],
                        }
                    ],
                    payload["currency"],
                )
                payload["lines"] = payload["lines"] + new_lines
            elif action == "renew":
                payload["expiry_date"] = renewal_date(payload).isoformat()
            elif action == "resume":
                subscription.status = "active"
                payload["next_billing_date"] = resume_date(
                    payload, plan.payload["billing_interval"], due_on
                ).isoformat()
            else:
                subscription.status = {"pause": "paused", "close": "closed"}[action]
            subscription.payload = payload
            subscription.version += 1
            request = (
                session.get(Record, change.get("request_id")) if change.get("request_id") else None
            )
            if request:
                request.status = "applied"
                request.version += 1
                event(session, "requests", request.id, "applied")
            event(session, "subscriptions", subscription.id, f"approved_{action}")
            if subscription.status != "active":
                counts["skipped_count"] += 1
        except (KeyError, ValueError) as exc:
            failed_subscriptions.add(subscription.id)
            counts["failed_count"] += 1
            counts["failures"].append(
                {"subscription_id": subscription.id, "reason": f"approved_change: {exc}"}
            )
    for subscription in session.scalars(
        select(Record)
        .where(Record.kind == "subscriptions", Record.status == "active")
        .with_for_update()
    ):
        if subscription.id in failed_subscriptions:
            continue
        try:
            plan = get_record(
                session, "plans", subscription.payload["plan_id"], user
            ).payload.copy()
            plan["price"] = subscription.payload.get("plan_price", plan["price"])
            plan["currency"] = subscription.payload["currency"]
            next_on = date.fromisoformat(
                subscription.payload.get("next_billing_date", subscription.payload["start_date"])
            )
            if next_on > due_on:
                counts["skipped_count"] += 1
                continue
            cycles = 0
            while next_on <= due_on and cycles < 400:
                cycles += 1
                expiry = date.fromisoformat(subscription.payload["expiry_date"])
                if next_on >= expiry:
                    if plan.get("auto_close"):
                        subscription.status = "closed"
                        event(session, "subscriptions", subscription.id, "auto_closed")
                        counts["skipped_count"] += 1
                        break
                    if plan.get("allow_renewal"):
                        subscription.payload = {
                            **subscription.payload,
                            "expiry_date": renewal_date(subscription.payload).isoformat(),
                        }
                        event(session, "subscriptions", subscription.id, "auto_renewed")
                    else:
                        subscription.status = "awaiting_renewal"
                        event(session, "subscriptions", subscription.id, "awaiting_renewal")
                        counts["skipped_count"] += 1
                        break
                anchor_day = int(
                    subscription.payload.get(
                        "billing_anchor_day",
                        date.fromisoformat(subscription.payload["start_date"]).day,
                    )
                )
                end = min(
                    next_date(next_on, plan["billing_interval"], anchor_day),
                    date.fromisoformat(subscription.payload["expiry_date"]),
                )
                existing = session.scalar(
                    select(Invoice).where(
                        Invoice.subscription_id == subscription.id,
                        Invoice.period_start == next_on.isoformat(),
                        Invoice.period_end == end.isoformat(),
                    )
                )
                if existing:
                    counts["skipped_count"] += 1
                    next_on = end
                    continue
                lines = subscription.payload["lines"]
                discounts = [
                    r.payload | {"id": r.id}
                    for r in session.scalars(select(Record).where(Record.kind == "discount-rules"))
                ]
                taxes = [
                    r.payload
                    for r in session.scalars(select(Record).where(Record.kind == "tax-rules"))
                ]
                snapshot = invoice_amount(
                    plan,
                    lines,
                    discounts,
                    taxes,
                    next_on,
                    {
                        "country": subscription.payload.get("billing_country"),
                        "region": subscription.payload.get("billing_region"),
                    },
                )
                customer = session.get(User, subscription.owner_id)
                snapshot = {
                    **snapshot,
                    "customer": {"id": customer.id, "name": customer.name, "email": customer.email},
                    "plan_name": plan.get("name", "Plan"),
                    "billing_timezone": subscription.payload.get("billing_timezone", "UTC"),
                }
                invoice = Invoice(
                    number=f"INV-{secrets.token_hex(5).upper()}",
                    subscription_id=subscription.id,
                    customer_id=subscription.owner_id,
                    period_start=next_on.isoformat(),
                    period_end=end.isoformat(),
                    due_on=(
                        next_on
                        + timedelta(days=int(subscription.payload.get("payment_terms_days", 14)))
                    ).isoformat(),
                    snapshot=snapshot,
                )
                session.add(invoice)
                session.flush()
                event(session, "invoices", invoice.id, "created", user.id)
                counts["created_count"] += 1
                next_on = end
            subscription.payload = {
                **subscription.payload,
                "next_billing_date": next_on.isoformat(),
            }
            subscription.version += 1
            if cycles == 400 and next_on <= due_on:
                counts["failed_count"] += 1
                counts["failures"].append(
                    {"subscription_id": subscription.id, "reason": "too_many_periods"}
                )
        except (KeyError, ValueError) as exc:
            counts["failed_count"] += 1
            counts["failures"].append({"subscription_id": subscription.id, "reason": str(exc)})
    run = Record(
        kind="billing-runs",
        number=f"RUN-{secrets.token_hex(4).upper()}",
        status="complete",
        payload={"due_on": due_on.isoformat(), **counts},
    )
    session.add(run)
    session.flush()
    result = record_json(run)
    session.add(Idempotency(key=key, action=fingerprint, result=result))
    session.commit()
    return result


@app.get("/api/v1/invoices")
def invoices(
    search: str = "",
    status: str = "",
    overdue: bool = False,
    start: str = "",
    end: str = "",
    limit: int = Query(25, ge=1, le=100),
    cursor: int = Query(0, ge=0),
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    query = select(Invoice).join(User, User.id == Invoice.customer_id).order_by(Invoice.id.desc())
    if cursor:
        query = query.where(Invoice.id < cursor)
    if user.role == "customer":
        query = query.where(Invoice.customer_id == user.id)
    if search:
        query = query.where(
            or_(
                Invoice.number.ilike(f"%{search}%"),
                User.name.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
            )
        )
    if status:
        if status not in {"draft", "confirmed", "paid", "canceled"}:
            fail("invalid_status")
        query = query.where(Invoice.status == status)
    if overdue:
        query = query.where(
            Invoice.status == "confirmed", Invoice.due_on < date.today().isoformat()
        )
    if start:
        query = query.where(Invoice.due_on >= start)
    if end:
        query = query.where(Invoice.due_on <= end)
    rows = list(session.scalars(query.limit(limit + 1)))
    return {
        "data": [invoice_json(row, session) for row in rows[:limit]],
        "next_cursor": rows[limit - 1].id if len(rows) > limit else None,
    }


@app.get("/api/v1/me/invoices")
def my_invoices(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "customer")
    return invoices(user=user, session=session, limit=25, cursor=0)


@app.get("/api/v1/me/invoices/{invoice_id}")
def my_invoice(invoice_id: int, user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "customer")
    return invoice_json(get_invoice(session, invoice_id, user), session)


@app.get("/api/v1/invoices/{invoice_id}")
def invoice_detail(
    invoice_id: int, user: User = Depends(current), session: DbSession = Depends(db)
):
    return invoice_json(get_invoice(session, invoice_id, user), session)


@app.get("/api/v1/invoices/{invoice_id}/pdf")
def download_invoice(
    invoice_id: int, user: User = Depends(current), session: DbSession = Depends(db)
):
    invoice = get_invoice(session, invoice_id, user)
    if invoice.status == "draft" or invoice.status == "canceled":
        fail("invoice_unavailable", 409)
    content = invoice_pdf(invoice_json(invoice, session))
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{invoice.number}.pdf"'},
    )


@app.post("/api/v1/invoices/{invoice_id}/payments", status_code=201)
def add_payment(
    invoice_id: int,
    body: dict,
    idempotency_key: str = Header(...),
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    allowed(user, "admin", "staff")
    key = f"payment:{user.id}:{invoice_id}:{idempotency_key}"
    fingerprint = payload_fingerprint("payment", body)
    previous = session.get(Idempotency, key)
    if previous:
        if previous.action != fingerprint:
            fail("idempotency_conflict", 409)
        return previous.result
    body = PaymentInput.model_validate(body).model_dump(mode="json")
    invoice = get_invoice(session, invoice_id, user, lock=True)
    current_invoice = invoice_json(invoice, session)
    amount = money(body.get("amount", "0"), body["currency"])
    if (
        invoice.status != "confirmed"
        or amount <= 0
        or amount > money(current_invoice["amount_due"], current_invoice["currency"])
        or body.get("currency") != current_invoice["currency"]
    ):
        fail("invalid_payment")
    payment = Payment(
        invoice_id=invoice.id,
        amount=str(amount),
        currency=body["currency"],
        method=body["method"],
        paid_at=body.get("paid_at", datetime.now(timezone.utc).isoformat()),
        note=body.get("note", ""),
    )
    session.add(payment)
    session.flush()
    if amount == money(current_invoice["amount_due"], current_invoice["currency"]):
        invoice.status = "paid"
    invoice.version += 1
    result = invoice_json(invoice, session)
    session.add(Idempotency(key=key, action=fingerprint, result=result))
    event(session, "payments", payment.id, "recorded", user.id)
    session.commit()
    return result


@app.post("/api/v1/invoices/{invoice_id}/{action}")
def invoice_action(
    invoice_id: int,
    action: str,
    if_match: str | None = Header(None),
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    allowed(user, "admin", "staff")
    invoice = get_invoice(session, invoice_id, user, lock=True)
    check_version(invoice.version, if_match)
    if action == "confirm" and invoice.status == "draft":
        rule_id = invoice.snapshot.get("discount_rule_id")
        if rule_id:
            rule = get_record(session, "discount-rules", rule_id, user, lock=True)
            used = int(rule.payload.get("usage_count", 0))
            limit = rule.payload.get("usage_limit")
            if limit is not None and used >= int(limit):
                fail("discount_exhausted", 409)
            rule.payload = {**rule.payload, "usage_count": used + 1}
        invoice.status = "confirmed"
    elif (
        action == "cancel"
        and invoice.status in {"draft", "confirmed"}
        and not invoice_json(invoice, session)["payments"]
    ):
        if invoice.status == "confirmed" and invoice.snapshot.get("discount_rule_id"):
            rule = get_record(session, "discount-rules", invoice.snapshot["discount_rule_id"], user)
            rule.payload = {
                **rule.payload,
                "usage_count": max(0, int(rule.payload.get("usage_count", 0)) - 1),
            }
        invoice.status = "canceled"
    elif action == "send" and invoice.status == "confirmed":
        event(session, "outbox", invoice.id, "invoice_send", user.id)
    else:
        fail("invalid_transition", 409)
    invoice.version += 1
    event(session, "invoices", invoice.id, action, user.id)
    session.commit()
    return invoice_json(invoice, session)


@app.get("/api/v1/payments")
def payments(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    return {
        "data": [
            {
                "id": p.id,
                "invoice_id": p.invoice_id,
                "amount": p.amount,
                "currency": p.currency,
                "method": p.method,
                "paid_at": p.paid_at,
            }
            for p in session.scalars(select(Payment).order_by(Payment.id.desc()).limit(100))
        ]
    }


def report_result(session, start, end):
    try:
        return report_snapshot(session, start, end)
    except ValueError:
        fail("invalid_report_dates")


@app.get("/api/v1/reports/summary")
def report_summary(
    start: str = "", end: str = "", user: User = Depends(current), session: DbSession = Depends(db)
):
    allowed(user, "admin", "staff")
    return report_result(session, start, end)


@app.get("/api/v1/reports/overview")
def report(
    start: str = "", end: str = "", user: User = Depends(current), session: DbSession = Depends(db)
):
    allowed(user, "admin", "staff")
    return report_result(session, start, end)["overview"]


@app.get("/api/v1/reports/collections-series")
def collections_series(
    start: str = "", end: str = "", user: User = Depends(current), session: DbSession = Depends(db)
):
    allowed(user, "admin", "staff")
    return {"data": report_result(session, start, end)["series"]}


@app.get("/api/v1/reports/overdue-invoices")
def overdue_invoices(
    start: str = "", end: str = "", user: User = Depends(current), session: DbSession = Depends(db)
):
    allowed(user, "admin", "staff")
    return {"data": report_result(session, start, end)["overdue"]}


@app.get("/api/v1/{kind}")
def list_records(
    kind: str,
    search: str = "",
    status: str = "",
    limit: int = Query(25, ge=1, le=100),
    cursor: int = Query(0, ge=0),
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    if kind not in KINDS:
        fail("not_found", 404)
    if user.role == "customer" and kind not in {"subscriptions", "requests"}:
        fail("forbidden", 403)
    query = (
        select(Record)
        .where(Record.kind == kind, Record.id > cursor)
        .order_by(Record.id)
        .limit(min(max(limit, 1), 100) + 1)
    )
    if user.role == "customer":
        query = query.where(Record.owner_id == user.id)
    if status:
        query = query.where(Record.status == status)
    if search:
        query = query.outerjoin(User, User.id == Record.owner_id).where(
            or_(
                Record.number.ilike(f"%{search}%"),
                cast(Record.payload, String).ilike(f"%{search}%"),
                User.name.ilike(f"%{search}%"),
            )
        )
    records = list(session.scalars(query))
    return {
        "data": [record_view(session, x, user) for x in records[:limit]],
        "next_cursor": records[limit - 1].id if len(records) > limit else None,
    }


@app.get("/api/v1/me/subscriptions")
def my_subscriptions(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "customer")
    return {
        "data": [
            record_view(session, x, user)
            for x in session.scalars(
                select(Record).where(Record.kind == "subscriptions", Record.owner_id == user.id)
            )
        ]
    }


@app.get("/api/v1/me/subscriptions/{record_id}")
def my_subscription(
    record_id: int, user: User = Depends(current), session: DbSession = Depends(db)
):
    allowed(user, "customer")
    return record_view(session, get_record(session, "subscriptions", record_id, user), user)


@app.post("/api/v1/{kind}", status_code=201)
def create_record(
    kind: str, body: Payload, user: User = Depends(current), session: DbSession = Depends(db)
):
    if kind not in KINDS:
        fail("not_found", 404)
    if kind in {"requests", "billing-runs"}:
        fail("forbidden", 403)
    allowed(
        user, "admin" if kind in ADMIN_ONLY else "admin", *([] if kind in ADMIN_ONLY else ["staff"])
    )
    payload = parse_record(kind, body.payload)
    validate_references(session, kind, payload, user)
    if kind == "subscriptions":
        payload = resolved_subscription(session, payload)
        owner_id = payload["customer_id"]
        status = "draft"
    else:
        owner_id = None
        status = "active" if payload.get("active", True) else "inactive"
    record = Record(
        kind=kind,
        number=f"{kind[:3].upper()}-{secrets.token_hex(4).upper()}",
        owner_id=owner_id,
        status=status,
        payload=payload,
    )
    session.add(record)
    session.flush()
    event(session, kind, record.id, "created", user.id)
    session.commit()
    return record_view(session, record, user)


@app.get("/api/v1/{kind}/{record_id}")
def read_record(
    kind: str, record_id: int, user: User = Depends(current), session: DbSession = Depends(db)
):
    if kind not in KINDS:
        fail("not_found", 404)
    if user.role == "customer" and kind not in {"subscriptions", "requests"}:
        fail("forbidden", 403)
    return record_view(session, get_record(session, kind, record_id, user), user)


@app.patch("/api/v1/{kind}/{record_id}")
def update_record(
    kind: str,
    record_id: int,
    body: Payload,
    if_match: str | None = Header(None),
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    if kind not in SCHEMAS:
        fail("forbidden", 403)
    allowed(
        user, "admin" if kind in ADMIN_ONLY else "admin", *([] if kind in ADMIN_ONLY else ["staff"])
    )
    record = get_record(session, kind, record_id, user, lock=True)
    check_version(record.version, if_match)
    if kind == "subscriptions" and record.status != "draft":
        fail("invalid_transition", 409)
    fields = SCHEMAS[kind].model_fields
    extra_fields = set(body.payload) - fields.keys()
    if extra_fields:
        fail("unknown_fields")
    usage_count = int(record.payload.get("usage_count", 0))
    if (
        kind == "products"
        and "variants" in body.payload
        and len(body.payload["variants"]) < len(record.payload.get("variants", []))
    ):
        fail("deactivate_variants_instead", 409)
    merged = parse_record(
        kind,
        {**{key: value for key, value in record.payload.items() if key in fields}, **body.payload},
    )
    validate_references(session, kind, merged, user)
    record.payload = resolved_subscription(session, merged) if kind == "subscriptions" else merged
    if kind == "discount-rules":
        record.payload = {**record.payload, "usage_count": usage_count}
    if kind == "subscriptions":
        record.owner_id = record.payload["customer_id"]
    if kind != "subscriptions":
        record.status = "active" if record.payload.get("active", True) else "inactive"
    record.version += 1
    event(session, kind, record.id, "updated", user.id)
    session.commit()
    return record_view(session, record, user)


@app.post("/api/v1/subscriptions/{record_id}/{action}")
def subscription_action(
    record_id: int,
    action: str,
    if_match: str | None = Header(None),
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    allowed(user, "admin", "staff")
    record = get_record(session, "subscriptions", record_id, user, lock=True)
    check_version(record.version, if_match)
    plan = session.get(Record, record.payload["plan_id"])
    today = datetime.now(ZoneInfo(record.payload.get("billing_timezone", "UTC"))).date()
    if action not in record_view(session, record, user)["available_actions"]:
        fail("action_unavailable", 409)
    payload = record.payload.copy()
    if action == "quote":
        record.status = "quotation"
        payload["quote_expires_at"] = (
            today + timedelta(days=int(payload.get("validity_days", 30)))
        ).isoformat()
    elif action == "confirm":
        record.status = "confirmed"
    elif action == "activate":
        record.status = "active"
        payload["next_billing_date"] = max(payload["start_date"], today.isoformat())
    elif action == "renew":
        payload["expiry_date"] = renewal_date(payload).isoformat()
        if record.status == "awaiting_renewal":
            record.status = "active"
    elif action == "resume":
        record.status = "active"
        payload["next_billing_date"] = resume_date(
            payload, plan.payload["billing_interval"], today
        ).isoformat()
    else:
        record.status = {"pause": "paused", "close": "closed"}[action]
    record.payload = payload
    record.version += 1
    event(session, "subscriptions", record.id, action, user.id)
    session.commit()
    return record_view(session, record, user)


@app.get("/api/v1/subscriptions/{record_id}/history")
def subscription_history(
    record_id: int, user: User = Depends(current), session: DbSession = Depends(db)
):
    get_record(session, "subscriptions", record_id, user)
    rows = session.scalars(
        select(Event)
        .where(Event.kind == "subscriptions", Event.record_id == record_id)
        .order_by(Event.id)
    )
    return {
        "data": [
            {
                "action": row.action,
                "actor_id": row.actor_id,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }


@app.post("/api/v1/me/subscriptions/{record_id}/requests", status_code=201)
def customer_request(
    record_id: int,
    body: CustomerChange,
    user: User = Depends(current),
    session: DbSession = Depends(db),
):
    allowed(user, "customer")
    subscription = get_record(session, "subscriptions", record_id, user, lock=True)
    if body.action not in record_view(session, subscription, user)["available_actions"]:
        fail("action_unavailable", 409)
    if body.action == "add_on":
        product = session.get(Record, body.product_id)
        if not product or product.payload.get("type") != "add_on":
            fail("add_on_unavailable")
        resolve_lines(
            session,
            [
                {
                    "product_id": body.product_id,
                    "variant_id": body.variant_id,
                    "quantity": body.quantity,
                }
            ],
            subscription.payload["currency"],
        )
    request = Record(
        kind="requests",
        number=f"REQ-{secrets.token_hex(4).upper()}",
        owner_id=user.id,
        status="pending",
        payload={**body.model_dump(mode="json"), "subscription_id": subscription.id},
    )
    session.add(request)
    session.flush()
    event(session, "requests", request.id, "requested", user.id)
    session.commit()
    return record_json(request)


@app.post("/api/v1/requests/{record_id}/{decision}")
def decide_request(
    record_id: int, decision: str, user: User = Depends(current), session: DbSession = Depends(db)
):
    allowed(user, "admin", "staff")
    request = get_record(session, "requests", record_id, user, lock=True)
    if request.status != "pending" or decision not in {"approve", "reject"}:
        fail("invalid_transition", 409)
    if decision == "approve":
        subscription = get_record(
            session, "subscriptions", request.payload["subscription_id"], user, lock=True
        )
        plan = session.get(Record, subscription.payload["plan_id"])
        today = datetime.now(ZoneInfo(subscription.payload.get("billing_timezone", "UTC"))).date()
        if subscription.payload.get("pending_change") or request.payload[
            "action"
        ] not in subscription_actions(
            subscription.status, subscription.payload, plan.payload, today, customer=True
        ):
            fail("action_unavailable", 409)
        subscription.payload = {
            **subscription.payload,
            "pending_change": {**request.payload, "request_id": request.id},
        }
        subscription.version += 1
    request.status = "approved" if decision == "approve" else "rejected"
    request.version += 1
    event(session, "requests", request.id, decision, user.id)
    session.commit()
    return record_json(request)
