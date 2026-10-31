import calendar
from datetime import date, datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from .db import Invoice, Payment, Record, User
from .rules import money


def report_snapshot(session, start="", end=""):
    start_on = date.fromisoformat(start) if start else None
    end_on = date.fromisoformat(end) if end else None
    if start_on and end_on and start_on > end_on:
        raise ValueError("invalid_report_dates")
    bind = session.get_bind()
    if bind.dialect.name == "postgresql":
        with DbSession(bind=bind.execution_options(isolation_level="REPEATABLE READ")) as snapshot:
            return build_report(snapshot, start_on, end_on)
    connection = session.connection()
    if bind.dialect.name == "sqlite" and not connection.connection.driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN")
    return build_report(session, start_on, end_on)


def build_report(session, start, end):
    as_of = datetime.now(timezone.utc)
    payments = list(
        session.execute(
            select(Payment.invoice_id, Payment.amount, Payment.currency, Payment.paid_at)
        )
    )
    paid_by_invoice = {}
    dated_payments = {}
    currencies = {}
    points = {}

    def bucket(currency):
        return currencies.setdefault(
            currency,
            {
                "collections": money(0, currency),
                "outstanding": money(0, currency),
                "overdue_amount": money(0, currency),
                "overdue_invoice_count": 0,
            },
        )

    for payment in payments:
        value = money(payment.amount, payment.currency)
        paid_by_invoice[payment.invoice_id] = (
            paid_by_invoice.get(payment.invoice_id, Decimal(0)) + value
        )
        paid_on = date.fromisoformat(payment.paid_at[:10])
        dated_payments.setdefault(payment.invoice_id, []).append((paid_on, value))
        if start and paid_on < start or end and paid_on > end:
            continue
        bucket(payment.currency)["collections"] += value
        key = (paid_on.strftime("%Y-%m"), payment.currency)
        points[key] = points.get(key, money(0, payment.currency)) + value
    query = (
        select(Invoice, User.name, User.email)
        .join(User, User.id == Invoice.customer_id)
        .where(Invoice.status == "confirmed")
    )
    if start:
        query = query.where(Invoice.due_on >= start.isoformat())
    if end:
        query = query.where(Invoice.due_on <= end.isoformat())
    overdue = []
    for invoice, name, email in session.execute(query):
        currency = invoice.snapshot["currency"]
        due = money(invoice.snapshot["total"], currency) - paid_by_invoice.get(
            invoice.id, money(0, currency)
        )
        if due <= 0:
            continue
        group = bucket(currency)
        group["outstanding"] += due
        today = as_of.astimezone(ZoneInfo(invoice.snapshot.get("billing_timezone", "UTC"))).date()
        if invoice.due_on < today.isoformat():
            group["overdue_amount"] += due
            group["overdue_invoice_count"] += 1
            overdue.append(
                {
                    "id": invoice.id,
                    "number": invoice.number,
                    "customer": invoice.snapshot.get("customer", {"name": name, "email": email}),
                    "currency": currency,
                    "due_on": invoice.due_on,
                    "amount_due": str(due),
                    "status": invoice.status,
                    "overdue": True,
                }
            )
    if start and end:
        year, month = start.year, start.month
        while (year, month) <= (end.year, end.month):
            period = f"{year:04d}-{month:02d}"
            for currency in currencies:
                points.setdefault((period, currency), money(0, currency))
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    overview = {
        "active_subscriptions": session.scalar(
            select(func.count())
            .select_from(Record)
            .where(Record.kind == "subscriptions", Record.status == "active")
        ),
        "currencies": {
            currency: {
                name: str(value) if isinstance(value, Decimal) else value
                for name, value in values.items()
            }
            for currency, values in currencies.items()
        },
        "as_of": as_of.isoformat(),
    }
    historical = list(
        session.scalars(select(Invoice).where(Invoice.status.in_(["confirmed", "paid"])))
    )
    for invoice in historical:
        due = date.fromisoformat(invoice.due_on)
        if (not start or due >= start) and (not end or due <= end):
            points.setdefault(
                (invoice.due_on[:7], invoice.snapshot["currency"]),
                money(0, invoice.snapshot["currency"]),
            )
    series = []
    for (period, currency), value in sorted(points.items()):
        year, month = map(int, period.split("-"))
        cutoff = min(
            date(year, month, calendar.monthrange(year, month)[1]), end or date.max, as_of.date()
        )
        outstanding, overdue_amount, overdue_count = money(0, currency), money(0, currency), 0
        if cutoff >= date(year, month, 1):
            for invoice in historical:
                if invoice.snapshot["currency"] != currency or invoice.due_on > cutoff.isoformat():
                    continue
                paid = sum(
                    (
                        amount
                        for paid_on, amount in dated_payments.get(invoice.id, [])
                        if paid_on <= cutoff
                    ),
                    money(0, currency),
                )
                balance = money(invoice.snapshot["total"], currency) - paid
                if balance <= 0:
                    continue
                outstanding += balance
                if invoice.due_on < cutoff.isoformat():
                    overdue_amount += balance
                    overdue_count += 1
        series.append(
            {
                "period": period,
                "currency": currency,
                "collections": str(value),
                "outstanding": str(outstanding),
                "overdue_amount": str(overdue_amount),
                "overdue_invoice_count": overdue_count,
            }
        )
    return {
        "overview": overview,
        "series": series,
        "overdue": sorted(overdue, key=lambda row: (row["due_on"], row["id"])),
        "as_of": as_of.isoformat(),
    }
