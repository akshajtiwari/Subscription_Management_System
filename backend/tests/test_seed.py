from sqlalchemy import func, select
from datetime import datetime, timezone

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
    seed.seed()
    with sessions() as session:
        counts = {
            table.__tablename__: session.scalar(select(func.count()).select_from(table))
            for table in [User, Record, Invoice, Payment, Event]
        }
        report = report_snapshot(session, "2026-10-01", "2026-10-31")
        assert report["overview"]["active_subscriptions"] == 1284
        assert report["overview"]["currencies"]["USD"]["collections"] == "248600.00"
        assert report["overview"]["currencies"]["USD"]["outstanding"] == "38400.00"
        assert report["overview"]["currencies"]["USD"]["overdue_invoice_count"] == 24
        history = report_snapshot(session, "2026-08-01", "2026-10-31")["series"]
        usd = [point for point in history if point["currency"] == "USD"]
        assert [point["collections"] for point in usd] == ["190400.00", "221800.00", "248600.00"]
        assert [point["outstanding"] for point in usd] == ["45200.00", "41200.00", "38400.00"]
        assert [point["overdue_invoice_count"] for point in usd] == [16, 19, 24]
        invoice = session.scalar(select(Invoice).where(Invoice.number == "INV-2048"))
        assert invoice.snapshot["total"] == "1320.00"
        assert invoice.snapshot["discount_total"] == "200.00"
        assert invoice.snapshot["tax_total"] == "120.00"
        product = session.scalar(select(Record).where(Record.number == "PROD-SUITE"))
        product.payload = {**product.payload, "name": "Edited demo product"}
        session.commit()
    seed.seed()
    with sessions() as session:
        assert counts == {
            table.__tablename__: session.scalar(select(func.count()).select_from(table))
            for table in [User, Record, Invoice, Payment, Event]
        }
        assert (
            session.scalar(select(Record).where(Record.number == "PROD-SUITE")).payload["name"]
            == "Edited demo product"
        )
