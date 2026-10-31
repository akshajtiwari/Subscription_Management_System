"""Persistent fictional Brightloop workflows. No external delivery or money movement."""
import hashlib
import hmac
import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from .db import Event, Idempotency, Invoice, Payment, Record, Session, User, init_db
from .rules import invoice_amount, invoice_balance, money, next_date
from .pdf import invoice_pdf

app = FastAPI(title="Brightloop demo API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
SECRET = os.getenv("DEMO_SECRET", "local-demo-only-change-me").encode()
KINDS = {"products", "plans", "tax-rules", "discount-rules", "quotation-templates", "subscriptions", "requests", "billing-runs"}
ADMIN_ONLY = {"products", "plans", "tax-rules", "discount-rules"}
TRANSITIONS = {"quote": ("draft", "quotation"), "confirm": ("quotation", "confirmed"), "activate": ("confirmed", "active"), "pause": ("active", "paused"), "resume": ("paused", "active"), "close": ("active", "closed")}


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


@app.on_event("startup")
def startup():
    init_db()


def fail(code: str, status=422):
    raise HTTPException(status, {"code": code})


def hash_password(password: str, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ":" + hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 300_000).hex()


def valid_password(password):
    return len(password) > 8 and bool(re.search("[A-Z]", password)) and bool(re.search("[a-z]", password)) and bool(re.search("[^A-Za-z0-9]", password))


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
        if not hmac.compare_digest(sig, hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()) or int(expiry) < datetime.now(timezone.utc).timestamp():
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
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "active": user.active}


def record_json(record):
    return {"id": record.id, "number": record.number, "status": record.status, "owner_id": record.owner_id, "version": record.version, **record.payload}


def get_record(session, kind, record_id, user):
    record = session.get(Record, record_id)
    if record is None or record.kind != kind or (user.role == "customer" and record.owner_id != user.id):
        fail("not_found", 404)
    return record


def check_version(version, if_match):
    if if_match is None or if_match.strip('"') != str(version):
        fail("precondition_failed", 412)


def event(session, kind, record_id, action, actor_id=None, detail=None):
    session.add(Event(kind=kind, record_id=record_id, action=action, actor_id=actor_id, detail=detail or {}))


@app.post("/api/v1/auth/register", status_code=201)
def register(body: Credentials, session: DbSession = Depends(db)):
    if not valid_password(body.password):
        fail("password_rule")
    user = User(name=body.name.strip(), email=body.email.strip().lower(), password_hash=hash_password(body.password), role="customer")
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
    if not user or not user.active or not hmac.compare_digest(user.password_hash, hash_password(body.password, user.password_hash.split(":")[0])):
        fail("invalid_credentials", 401)
    return {"access_token": token(user.id), "user": public_user(user)}


@app.post("/api/v1/auth/password-resets", status_code=202)
def reset_request(body: ResetRequest, session: DbSession = Depends(db)):
    user = session.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user:
        reset_token = secrets.token_urlsafe(30)
        event(session, "outbox", user.id, "password_reset", detail={"token": reset_token, "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()})
        session.commit()
    return {"status": "accepted"}


@app.post("/api/v1/auth/password-resets/confirm")
def reset_confirm(body: dict, session: DbSession = Depends(db)):
    if not valid_password(body.get("new_password", "")):
        fail("password_rule")
    for entry in session.scalars(select(Event).where(Event.kind == "outbox", Event.action == "password_reset").order_by(Event.id.desc())):
        if hmac.compare_digest(entry.detail.get("token", ""), body.get("token", "")) and entry.detail["expires_at"] > datetime.now(timezone.utc).isoformat() and not entry.detail.get("used"):
            user = session.get(User, entry.record_id)
            user.password_hash = hash_password(body["new_password"])
            entry.detail = {**entry.detail, "used": True}
            session.commit()
            return {"status": "changed"}
    fail("invalid_reset_token", 400)


@app.get("/api/v1/me")
def me(user: User = Depends(current)):
    return public_user(user)


@app.get("/api/v1/outbox")
def outbox(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    return {"data": [{"id": e.id, "action": e.action, "record_id": e.record_id, "detail": e.detail} for e in session.scalars(select(Event).where(Event.kind == "outbox").order_by(Event.id.desc()).limit(50))]}


@app.get("/api/v1/staff")
def staff(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin")
    return {"data": [public_user(x) for x in session.scalars(select(User).where(User.role == "staff"))]}


@app.post("/api/v1/staff", status_code=201)
def add_staff(body: Credentials, user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin")
    if not valid_password(body.password):
        fail("password_rule")
    staff_user = User(name=body.name, email=body.email.lower(), password_hash=hash_password(body.password), role="staff")
    session.add(staff_user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        fail("duplicate_email", 409)
    return public_user(staff_user)


@app.get("/api/v1/customers")
def customers(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    return {"data": [public_user(x) for x in session.scalars(select(User).where(User.role == "customer"))]}


@app.get("/api/v1/catalog-items")
def catalog_items(search: str = "", user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    rows = []
    for product in session.scalars(select(Record).where(Record.kind == "products", Record.status == "active")):
        data = product.payload
        currency = data.get("currency", "USD")
        base = money(data.get("sales_price", "0"))
        rows.append({"product_id": product.id, "variant_id": None, "name": data.get("name", ""), "sku": data.get("sku", ""), "unit_price": str(base), "currency": currency})
        for index, variant in enumerate(data.get("variants", [])):
            if variant.get("active", True):
                rows.append({"product_id": product.id, "variant_id": index, "name": data.get("name", ""), "variant_name": variant.get("name", ""), "sku": variant.get("sku", ""), "unit_price": str(base + money(variant.get("price_adjustment", "0"))), "currency": currency})
    return {"data": [row for row in rows if search.lower() in str(row).lower()][:100]}


def resolved_subscription(session, payload):
    customer = session.get(User, payload.get("customer_id"))
    plan = session.get(Record, payload.get("plan_id"))
    if not customer or customer.role != "customer" or not plan or plan.kind != "plans" or plan.status != "active":
        fail("missing_subscription_fields")
    if not payload.get("lines") or date.fromisoformat(payload["start_date"]) > date.fromisoformat(payload["expiry_date"]):
        fail("invalid_subscription_dates")
    if int(payload.get("payment_terms_days", 0)) < 0:
        fail("invalid_payment_terms")
    currency = plan.payload.get("currency", "USD")
    lines = []
    quantity_total = 0
    for line in payload["lines"]:
        product = session.get(Record, line.get("product_id"))
        if not product or product.kind != "products" or product.status != "active" or product.payload.get("currency", "USD") != currency:
            fail("catalog_item_unavailable")
        try:
            quantity = int(line["quantity"])
        except (KeyError, TypeError, ValueError):
            fail("invalid_quantity")
        if quantity <= 0:
            fail("invalid_quantity")
        quantity_total += quantity
        variant_id = line.get("variant_id")
        variant = None
        if variant_id is not None:
            try:
                variant = product.payload.get("variants", [])[int(variant_id)]
            except (ValueError, IndexError, TypeError):
                fail("catalog_item_unavailable")
            if not variant.get("active", True):
                fail("catalog_item_unavailable")
        price = money(product.payload.get("sales_price", 0)) + money(variant.get("price_adjustment", 0) if variant else 0)
        if price < 0:
            fail("invalid_price")
        lines.append({"product_id": product.id, "variant_id": variant_id, "name": product.payload.get("name", ""), "variant_name": variant.get("name") if variant else None, "quantity": quantity, "unit_price": str(price), "currency": currency})
    if quantity_total < int(plan.payload.get("minimum_quantity", 1)):
        fail("minimum_quantity")
    return {**payload, "lines": lines, "currency": currency, "next_billing_date": payload["start_date"]}


def invoice_json(invoice, session):
    payments = list(session.scalars(select(Payment).where(Payment.invoice_id == invoice.id)))
    balance = invoice_balance(invoice.snapshot["total"], [p.amount for p in payments])
    paid = money(balance["amount_paid"])
    due = money(balance["amount_due"]) if invoice.status != "canceled" else Decimal(0)
    return {"id": invoice.id, "number": invoice.number, "subscription_id": invoice.subscription_id, "customer_id": invoice.customer_id, "period_start": invoice.period_start, "period_end": invoice.period_end, "due_on": invoice.due_on, "status": invoice.status, "overdue": invoice.status == "confirmed" and due > 0 and invoice.due_on < date.today().isoformat(), "version": invoice.version, **invoice.snapshot, "amount_paid": str(paid), "amount_due": str(due), "payments": [{"id": p.id, "amount": p.amount, "method": p.method, "paid_at": p.paid_at, "note": p.note} for p in payments]}


def get_invoice(session, invoice_id, user):
    invoice = session.get(Invoice, invoice_id)
    if not invoice or user.role == "customer" and invoice.customer_id != user.id:
        fail("not_found", 404)
    return invoice


@app.post("/api/v1/billing-runs", status_code=202)
def billing_run(body: dict, idempotency_key: str = Header(...), user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    key = f"billing:{user.id}:{idempotency_key}"
    previous = session.get(Idempotency, key)
    if previous:
        return previous.result
    due_on = date.fromisoformat(body["due_on"])
    counts = {"created_count": 0, "skipped_count": 0, "failed_count": 0, "failures": []}
    for subscription in session.scalars(select(Record).where(Record.kind == "subscriptions", Record.status == "active").with_for_update()):
        try:
            plan = get_record(session, "plans", subscription.payload["plan_id"], user).payload
            next_on = date.fromisoformat(subscription.payload.get("next_billing_date", subscription.payload["start_date"]))
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
                        subscription.payload = {**subscription.payload, "expiry_date": next_date(expiry, plan["billing_interval"]).isoformat()}
                        event(session, "subscriptions", subscription.id, "auto_renewed")
                    else:
                        subscription.status = "awaiting_renewal"
                        event(session, "subscriptions", subscription.id, "awaiting_renewal")
                        counts["skipped_count"] += 1
                        break
                anchor_day = int(subscription.payload.get("billing_anchor_day", date.fromisoformat(subscription.payload["start_date"]).day))
                end = next_date(next_on, plan["billing_interval"], anchor_day)
                existing = session.scalar(select(Invoice).where(Invoice.subscription_id == subscription.id, Invoice.period_start == next_on.isoformat(), Invoice.period_end == end.isoformat()))
                if existing:
                    counts["skipped_count"] += 1
                    next_on = end
                    continue
                lines = subscription.payload["lines"]
                discounts = [r.payload | {"id": r.id} for r in session.scalars(select(Record).where(Record.kind == "discount-rules"))]
                taxes = [r.payload for r in session.scalars(select(Record).where(Record.kind == "tax-rules"))]
                snapshot = invoice_amount(plan, lines, discounts, taxes, next_on)
                invoice = Invoice(number=f"INV-{secrets.token_hex(5).upper()}", subscription_id=subscription.id, customer_id=subscription.owner_id, period_start=next_on.isoformat(), period_end=end.isoformat(), due_on=(next_on + timedelta(days=int(subscription.payload.get("payment_terms_days", 14)))).isoformat(), snapshot=snapshot)
                session.add(invoice)
                session.flush()
                event(session, "invoices", invoice.id, "created", user.id)
                counts["created_count"] += 1
                next_on = end
            subscription.payload = {**subscription.payload, "next_billing_date": next_on.isoformat()}
            if cycles == 400 and next_on <= due_on:
                counts["failed_count"] += 1
                counts["failures"].append({"subscription_id": subscription.id, "reason": "too_many_periods"})
        except (KeyError, ValueError) as exc:
            counts["failed_count"] += 1
            counts["failures"].append({"subscription_id": subscription.id, "reason": str(exc)})
    run = Record(kind="billing-runs", number=f"RUN-{secrets.token_hex(4).upper()}", status="complete", payload={"due_on": due_on.isoformat(), **counts})
    session.add(run)
    session.flush()
    result = record_json(run)
    session.add(Idempotency(key=key, action="billing_run", result=result))
    session.commit()
    return result


@app.get("/api/v1/invoices")
def invoices(user: User = Depends(current), session: DbSession = Depends(db)):
    query = select(Invoice).order_by(Invoice.id.desc()).limit(100)
    if user.role == "customer":
        query = query.where(Invoice.customer_id == user.id)
    return {"data": [invoice_json(x, session) for x in session.scalars(query)]}


@app.get("/api/v1/me/invoices")
def my_invoices(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "customer")
    return invoices(user, session)


@app.get("/api/v1/me/invoices/{invoice_id}")
def my_invoice(invoice_id: int, user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "customer")
    return invoice_json(get_invoice(session, invoice_id, user), session)


@app.get("/api/v1/invoices/{invoice_id}")
def invoice_detail(invoice_id: int, user: User = Depends(current), session: DbSession = Depends(db)):
    return invoice_json(get_invoice(session, invoice_id, user), session)


@app.get("/api/v1/invoices/{invoice_id}/pdf")
def download_invoice(invoice_id: int, user: User = Depends(current), session: DbSession = Depends(db)):
    invoice = get_invoice(session, invoice_id, user)
    if invoice.status == "draft" or invoice.status == "canceled":
        fail("invoice_unavailable", 409)
    content = invoice_pdf(invoice_json(invoice, session))
    return Response(content=content, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{invoice.number}.pdf"'})


@app.post("/api/v1/invoices/{invoice_id}/payments", status_code=201)
def add_payment(invoice_id: int, body: dict, idempotency_key: str = Header(...), user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    key = f"payment:{user.id}:{invoice_id}:{idempotency_key}"
    previous = session.get(Idempotency, key)
    if previous:
        return previous.result
    invoice = get_invoice(session, invoice_id, user)
    current_invoice = invoice_json(invoice, session)
    amount = money(body.get("amount", "0"))
    if invoice.status != "confirmed" or amount <= 0 or amount > money(current_invoice["amount_due"]) or body.get("currency") != current_invoice["currency"]:
        fail("invalid_payment")
    payment = Payment(invoice_id=invoice.id, amount=str(amount), currency=body["currency"], method=body["method"], paid_at=body.get("paid_at", datetime.now(timezone.utc).isoformat()), note=body.get("note", ""))
    session.add(payment)
    session.flush()
    if amount == money(current_invoice["amount_due"]):
        invoice.status = "paid"
    invoice.version += 1
    result = invoice_json(invoice, session)
    session.add(Idempotency(key=key, action="payment", result=result))
    event(session, "payments", payment.id, "recorded", user.id)
    session.commit()
    return result


@app.post("/api/v1/invoices/{invoice_id}/{action}")
def invoice_action(invoice_id: int, action: str, if_match: str | None = Header(None), user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    invoice = get_invoice(session, invoice_id, user)
    check_version(invoice.version, if_match)
    if action == "confirm" and invoice.status == "draft":
        rule_id = invoice.snapshot.get("discount_rule_id")
        if rule_id:
            rule = get_record(session, "discount-rules", rule_id, user)
            used = int(rule.payload.get("usage_count", 0))
            limit = rule.payload.get("usage_limit")
            if limit is not None and used >= int(limit):
                fail("discount_exhausted", 409)
            rule.payload = {**rule.payload, "usage_count": used + 1}
        invoice.status = "confirmed"
    elif action == "cancel" and invoice.status in {"draft", "confirmed"} and not invoice_json(invoice, session)["payments"]:
        if invoice.status == "confirmed" and invoice.snapshot.get("discount_rule_id"):
            rule = get_record(session, "discount-rules", invoice.snapshot["discount_rule_id"], user)
            rule.payload = {**rule.payload, "usage_count": max(0, int(rule.payload.get("usage_count", 0)) - 1)}
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
    return {"data": [{"id": p.id, "invoice_id": p.invoice_id, "amount": p.amount, "currency": p.currency, "method": p.method, "paid_at": p.paid_at} for p in session.scalars(select(Payment).order_by(Payment.id.desc()).limit(100))]}


@app.get("/api/v1/reports/overview")
def report(start: str = "", end: str = "", user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    grouped = {}
    for invoice in session.scalars(select(Invoice)):
        if start and invoice.period_start < start or end and invoice.period_start > end:
            continue
        row = invoice_json(invoice, session)
        currency = row["currency"]
        bucket = grouped.setdefault(currency, {"collections": Decimal(0), "outstanding": Decimal(0), "overdue_amount": Decimal(0), "overdue_invoice_count": 0})
        bucket["collections"] += money(row["amount_paid"])
        bucket["outstanding"] += money(row["amount_due"])
        if row["overdue"]:
            bucket["overdue_amount"] += money(row["amount_due"])
            bucket["overdue_invoice_count"] += 1
    return {"active_subscriptions": session.query(Record).filter(Record.kind == "subscriptions", Record.status == "active").count(), "currencies": {k: {name: str(value) if isinstance(value, Decimal) else value for name, value in bucket.items()} for k, bucket in grouped.items()}, "as_of": datetime.now(timezone.utc).isoformat()}


@app.get("/api/v1/{kind}")
def list_records(kind: str, search: str = "", status: str = "", limit: int = 25, cursor: int = 0, user: User = Depends(current), session: DbSession = Depends(db)):
    if kind not in KINDS:
        fail("not_found", 404)
    if user.role == "customer" and kind not in {"subscriptions", "requests"}:
        fail("forbidden", 403)
    query = select(Record).where(Record.kind == kind, Record.id > cursor).order_by(Record.id).limit(min(max(limit, 1), 100) + 1)
    if user.role == "customer":
        query = query.where(Record.owner_id == user.id)
    if status:
        query = query.where(Record.status == status)
    records = list(session.scalars(query))
    if search:
        records = [x for x in records if search.lower() in str(record_json(x)).lower()]
    return {"data": [record_json(x) for x in records[:limit]], "next_cursor": records[limit - 1].id if len(records) > limit else None}


@app.get("/api/v1/me/subscriptions")
def my_subscriptions(user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "customer")
    return {"data": [record_json(x) for x in session.scalars(select(Record).where(Record.kind == "subscriptions", Record.owner_id == user.id))]}


@app.get("/api/v1/me/subscriptions/{record_id}")
def my_subscription(record_id: int, user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "customer")
    return record_json(get_record(session, "subscriptions", record_id, user))


@app.post("/api/v1/{kind}", status_code=201)
def create_record(kind: str, body: Payload, user: User = Depends(current), session: DbSession = Depends(db)):
    if kind not in KINDS:
        fail("not_found", 404)
    if kind in {"requests", "billing-runs"}:
        fail("forbidden", 403)
    allowed(user, "admin" if kind in ADMIN_ONLY else "admin", *([] if kind in ADMIN_ONLY else ["staff"]))
    payload = body.payload.copy()
    if kind == "subscriptions":
        payload = resolved_subscription(session, payload)
        owner_id = payload["customer_id"]
        status = "draft"
    else:
        owner_id = None
        status = "active"
    record = Record(kind=kind, number=f"{kind[:3].upper()}-{secrets.token_hex(4).upper()}", owner_id=owner_id, status=status, payload=payload)
    session.add(record)
    session.flush()
    event(session, kind, record.id, "created", user.id)
    session.commit()
    return record_json(record)


@app.get("/api/v1/{kind}/{record_id}")
def read_record(kind: str, record_id: int, user: User = Depends(current), session: DbSession = Depends(db)):
    if kind not in KINDS:
        fail("not_found", 404)
    if user.role == "customer" and kind not in {"subscriptions", "requests"}:
        fail("forbidden", 403)
    return record_json(get_record(session, kind, record_id, user))


@app.patch("/api/v1/{kind}/{record_id}")
def update_record(kind: str, record_id: int, body: Payload, if_match: str | None = Header(None), user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin" if kind in ADMIN_ONLY else "admin", *([] if kind in ADMIN_ONLY else ["staff"]))
    record = get_record(session, kind, record_id, user)
    check_version(record.version, if_match)
    if kind == "subscriptions" and record.status != "draft":
        fail("invalid_transition", 409)
    merged = {**record.payload, **body.payload}
    record.payload = resolved_subscription(session, merged) if kind == "subscriptions" else merged
    record.version += 1
    event(session, kind, record.id, "updated", user.id)
    session.commit()
    return record_json(record)


@app.post("/api/v1/subscriptions/{record_id}/{action}")
def subscription_action(record_id: int, action: str, if_match: str | None = Header(None), user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    record = get_record(session, "subscriptions", record_id, user)
    check_version(record.version, if_match)
    if action == "renew":
        if record.status not in {"active", "awaiting_renewal"}:
            fail("invalid_transition", 409)
        plan = get_record(session, "plans", record.payload["plan_id"], user)
        if not plan.payload.get("allow_renewal"):
            fail("plan_disallows_renewal", 409)
        record.payload = {**record.payload, "expiry_date": next_date(date.fromisoformat(record.payload["expiry_date"]), plan.payload["billing_interval"]).isoformat()}
        record.status = "active"
    else:
        transition = TRANSITIONS.get(action)
        if not transition or record.status != transition[0]:
            fail("invalid_transition", 409)
        if action == "confirm" and record.payload.get("quote_expires_at", "9999-12-31") < date.today().isoformat():
            fail("quotation_expired", 409)
        if action in {"pause", "close"}:
            plan = get_record(session, "plans", record.payload["plan_id"], user)
            if action == "pause" and not plan.payload.get("allow_pause") or action == "close" and not plan.payload.get("allow_early_close"):
                fail("plan_disallows_action", 409)
        record.status = transition[1]
        if action == "quote":
            validity = max(int(record.payload.get("validity_days", 30)), 1)
            record.payload = {**record.payload, "quote_expires_at": (date.today() + timedelta(days=validity)).isoformat()}
        if action == "activate":
            record.payload = {**record.payload, "next_billing_date": max(record.payload["start_date"], date.today().isoformat())}
    record.version += 1
    event(session, "subscriptions", record.id, action, user.id)
    session.commit()
    return record_json(record)


@app.get("/api/v1/subscriptions/{record_id}/history")
def subscription_history(record_id: int, user: User = Depends(current), session: DbSession = Depends(db)):
    get_record(session, "subscriptions", record_id, user)
    rows = session.scalars(select(Event).where(Event.kind == "subscriptions", Event.record_id == record_id).order_by(Event.id))
    return {"data": [{"action": row.action, "actor_id": row.actor_id, "created_at": row.created_at.isoformat()} for row in rows]}


@app.post("/api/v1/me/subscriptions/{record_id}/requests", status_code=201)
def customer_request(record_id: int, body: dict, user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "customer")
    subscription = get_record(session, "subscriptions", record_id, user)
    if body.get("action") not in {"add_on", "pause", "resume", "renew", "close"}:
        fail("invalid_action")
    plan = session.get(Record, subscription.payload["plan_id"])
    permission = {"pause": "allow_pause", "renew": "allow_renewal", "close": "allow_early_close"}.get(body["action"])
    if permission and (not plan or not plan.payload.get(permission)):
        fail("plan_disallows_action", 409)
    if body["action"] == "resume" and subscription.status != "paused" or body["action"] == "pause" and subscription.status != "active":
        fail("invalid_transition", 409)
    request = Record(kind="requests", number=f"REQ-{secrets.token_hex(4).upper()}", owner_id=user.id, status="pending", payload={"subscription_id": subscription.id, **body})
    session.add(request)
    session.commit()
    return record_json(request)


@app.post("/api/v1/requests/{record_id}/{decision}")
def decide_request(record_id: int, decision: str, user: User = Depends(current), session: DbSession = Depends(db)):
    allowed(user, "admin", "staff")
    request = get_record(session, "requests", record_id, user)
    if request.status != "pending" or decision not in {"approve", "reject"}:
        fail("invalid_transition", 409)
    request.status = "approved" if decision == "approve" else "rejected"
    if decision == "approve":
        subscription = get_record(session, "subscriptions", request.payload["subscription_id"], user)
        subscription.payload = {**subscription.payload, "pending_change": request.payload}
    event(session, "requests", request.id, decision, user.id)
    session.commit()
    return record_json(request)
