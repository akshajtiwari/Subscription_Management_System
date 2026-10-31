from sqlalchemy import func, select
from datetime import date, datetime, timezone
from decimal import Decimal

from app import seed
from app import reporting
from app.db import Event, Invoice, Payment, Record, User
from app.reporting import report_snapshot


def test_demo_seed_is_idempotent_and_keeps_the_overview_and_ledger_consistent(api, monkeypatch):
    class DemoClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 31, 12, tzinfo=timezone.utc).astimezone(tz)

    _, _, sessions = api
    monkeypatch.setattr(reporting, "datetime", DemoClock)
    monkeypatch.setattr(seed, "Session", sessions)
    monkeypatch.setattr(seed, "init_db", lambda: None)
    seed.seed(as_of=date(2026, 10, 31))
    with sessions() as session:
        counts = {
            table.__tablename__: session.scalar(select(func.count()).select_from(table))
            for table in [User, Record, Invoice, Payment, Event]
        }
        report = report_snapshot(session, "2026-10-01", "2026-10-31")
        assert report["overview"]["active_subscriptions"] >= 1300
        history = report_snapshot(session, "2025-11-01", "2026-10-31")["series"]
        for currency in ["USD", "EUR", "GBP", "INR"]:
            points = [point for point in history if point["currency"] == currency]
            assert len(points) == 12
            assert all(Decimal(point["collections"]) > 0 for point in points)
            assert len({point["collections"] for point in points}) > 2
            assert Decimal(points[-1]["outstanding"]) > 0
            collected = sum(
                Decimal(payment.amount)
                for payment in session.scalars(select(Payment).where(Payment.currency == currency))
                if "2026-10-01" <= payment.paid_at[:10] <= "2026-10-31"
            )
            assert Decimal(report["overview"]["currencies"][currency]["collections"]) == collected
        assert counts["invoices"] >= 450
        assert counts["payments"] >= 500
        invoice = session.scalar(select(Invoice).where(Invoice.number == "INV-2048"))
        assert invoice.snapshot["total"] == "1320.00"
        assert invoice.snapshot["discount_total"] == "200.00"
        assert invoice.snapshot["tax_total"] == "120.00"
        product = session.scalar(select(Record).where(Record.number == "PROD-SUITE"))
        product.payload = {**product.payload, "name": "Edited demo product"}
        session.commit()
    seed.seed(as_of=date(2026, 10, 31))
    with sessions() as session:
        assert counts == {
            table.__tablename__: session.scalar(select(func.count()).select_from(table))
            for table in [User, Record, Invoice, Payment, Event]
        }
        assert (
            session.scalar(select(Record).where(Record.number == "PROD-SUITE")).payload["name"]
            == "Edited demo product"
        )


def test_seed_populates_every_workspace_list_and_the_customer_portal(api, monkeypatch):
    client, headers, sessions = api
    monkeypatch.setattr(seed, "Session", sessions)
    monkeypatch.setattr(seed, "init_db", lambda: None)
    seed.seed(as_of=date(2026, 10, 31))
    for kind, minimum in {
        "products": 30,
        "plans": 15,
        "quotation-templates": 12,
        "discount-rules": 12,
        "tax-rules": 10,
        "customers": 40,
        "staff": 10,
        "billing-runs": 12,
        "requests": 12,
    }.items():
        response = client.get(f"/api/v1/{kind}?limit=100", headers=headers["admin"])
        assert response.status_code == 200, response.text
        assert len(response.json()["data"]) >= minimum, kind
    with sessions() as session:
        customer = session.scalar(select(User).where(User.email == "customer@brightloop.demo"))
        from app.main import token

        own = {"Authorization": f"Bearer {token(customer.id)}"}
    bills = client.get("/api/v1/invoices?limit=100", headers=own).json()["data"]
    subscriptions = client.get("/api/v1/subscriptions?limit=100", headers=own).json()["data"]
    assert len(bills) >= 40
    assert len({bill["period_start"][:7] for bill in bills if bill["status"] == "paid"}) >= 10
    assert len(subscriptions) >= 10
    assert {"active", "draft", "quotation", "paused", "closed"} <= {
        s["status"] for s in subscriptions
    }
    assert {"paid", "confirmed", "draft", "canceled"} <= {bill["status"] for bill in bills}
    for bill in bills:
        if bill["status"] == "paid":
            assert Decimal(bill["amount_due"]) == 0
            assert Decimal(bill["amount_paid"]) == Decimal(bill["total"])
        if bill["status"] == "confirmed" and bill["payments"]:
            assert 0 < Decimal(bill["amount_paid"]) < Decimal(bill["total"])


def test_seed_adds_a_new_month_without_replacing_existing_billing_history(api, monkeypatch):
    _, _, sessions = api
    monkeypatch.setattr(seed, "Session", sessions)
    monkeypatch.setattr(seed, "init_db", lambda: None)
    seed.seed(as_of=date(2027, 1, 12))
    with sessions() as session:
        originals = {row.number: row.snapshot for row in session.scalars(select(Invoice))}
        assert "INV-SAMPLE-202701-01" in originals
    seed.seed(as_of=date(2027, 2, 12))
    with sessions() as session:
        bills = {row.number: row.snapshot for row in session.scalars(select(Invoice))}
        assert len(bills) == len(originals) + 32
        assert all(bills[number] == snapshot for number, snapshot in originals.items())
        assert "INV-SAMPLE-202702-01" in bills
