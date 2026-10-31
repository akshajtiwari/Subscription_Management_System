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


def test_subscription_lines_use_the_same_tax_calculation_as_the_invoice(api, subscription_factory):
    client, headers, _ = api
    subscription, _, _ = subscription_factory()
    assert (
        client.post(
            "/api/v1/tax-rules",
            json={
                "payload": {
                    "name": "Standard tax",
                    "rate_percent": "10",
                    "effective_from": "2000-01-01",
                }
            },
            headers=headers["admin"],
        ).status_code
        == 201
    )
    row = client.get(f"/api/v1/subscriptions/{subscription['id']}", headers=headers["staff"]).json()
    assert row["lines"][0]["tax_total"] == "2.00"
    assert row["lines"][0]["line_total"] == "22.00"
    assert row["estimate"]["total"] == "132.00"
