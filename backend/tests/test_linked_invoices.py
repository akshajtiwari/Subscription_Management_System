from app.db import Record


def test_linked_invoices_filter_records_and_check_subscription_ownership(api, subscription_factory):
    client, headers, sessions = api
    first, _, _ = subscription_factory()
    second, _, _ = subscription_factory()
    response = client.post(
        "/api/v1/billing-runs",
        json={},
        headers={**headers["admin"], "Idempotency-Key": "linked-invoices"},
    )
    assert response.status_code == 202
    path = f"/api/v1/invoices?subscription_id={first['id']}"
    rows = client.get(path, headers=headers["customer"]).json()["data"]
    assert len(rows) == 1
    assert rows[0]["subscription_id"] == first["id"]
    with sessions() as session:
        subscription = session.get(Record, second["id"])
        subscription.owner_id = 1
        session.commit()
    assert (
        client.get(
            f"/api/v1/invoices?subscription_id={second['id']}", headers=headers["customer"]
        ).status_code
        == 404
    )
