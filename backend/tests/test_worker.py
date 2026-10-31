from app import worker
from app.db import Invoice, Record


def test_scheduled_worker_activates_and_bills_without_duplicates(
    api, subscription_factory, monkeypatch
):
    _, _, sessions = api
    subscription, _, _ = subscription_factory()
    with sessions() as session:
        row = session.get(Record, subscription["id"])
        row.status = "confirmed"
        session.commit()
    monkeypatch.setattr(worker, "Session", sessions)
    monkeypatch.setattr(worker, "init_db", lambda: None)
    first = worker.run_once()
    second = worker.run_once()
    assert first["id"] == second["id"]
    assert first["created_count"] == 1
    with sessions() as session:
        assert session.query(Invoice).count() == 1
        assert session.get(Record, subscription["id"]).status == "active"
