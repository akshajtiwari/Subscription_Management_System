from datetime import date


def run(client, headers, **body):
    response = client.post(
        "/api/v1/billing-runs",
        json={"due_on": date.today().isoformat(), **body},
        headers={**headers["admin"], "Idempotency-Key": "run"},
    )
    assert response.status_code == 202, response.text
    return response.json()


def test_discount_exhaustion_recalculation_and_send_retry(api, subscription_factory):
    client, headers, _ = api
    subscription_factory()
    subscription_factory()
    discount = client.post(
        "/api/v1/discount-rules",
        json={
            "payload": {
                "name": "One use",
                "kind": "fixed",
                "value": "10",
                "starts_on": date.today().isoformat(),
                "usage_limit": 1,
            }
        },
        headers=headers["admin"],
    ).json()
    assert run(client, headers)["created_count"] == 2
    invoices = client.get("/api/v1/invoices", headers=headers["admin"]).json()["data"]
    assert all(invoice["total"] == "110.00" for invoice in invoices)
    first, second = invoices
    confirm_headers = {
        **headers["admin"],
        "If-Match": str(first["version"]),
        "Idempotency-Key": "first-confirm",
    }
    confirmed = client.post(f"/api/v1/invoices/{first['id']}/confirm", headers=confirm_headers)
    assert confirmed.status_code == 200
    assert (
        client.post(f"/api/v1/invoices/{first['id']}/confirm", headers=confirm_headers).json()[
            "version"
        ]
        == confirmed.json()["version"]
    )
    assert (
        client.post(
            f"/api/v1/invoices/{second['id']}/confirm",
            headers={**headers["admin"], "If-Match": str(second["version"])},
        ).status_code
        == 409
    )
    recalculated = client.post(
        f"/api/v1/invoices/{second['id']}/recalculate",
        headers={**headers["admin"], "If-Match": str(second["version"])},
    )
    assert recalculated.status_code == 200
    assert recalculated.json()["total"] == "120.00"
    second_confirmed = client.post(
        f"/api/v1/invoices/{second['id']}/confirm",
        headers={**headers["admin"], "If-Match": str(recalculated.json()["version"])},
    ).json()
    send_headers = {
        **headers["admin"],
        "If-Match": str(second_confirmed["version"]),
        "Idempotency-Key": "one-delivery",
    }
    sent = client.post(f"/api/v1/invoices/{second['id']}/send", headers=send_headers)
    assert sent.status_code == 200
    assert (
        client.post(f"/api/v1/invoices/{second['id']}/send", headers=send_headers).status_code
        == 200
    )
    assert len(client.get("/api/v1/outbox", headers=headers["admin"]).json()["data"]) == 1
    assert (
        client.post(
            f"/api/v1/invoices/{first['id']}/cancel",
            headers={**headers["admin"], "If-Match": str(confirmed.json()["version"])},
        ).status_code
        == 200
    )
    assert (
        client.get(f"/api/v1/discount-rules/{discount['id']}", headers=headers["admin"]).json()[
            "usage_count"
        ]
        == 0
    )


def test_payment_boundaries_and_frozen_customer_details(api, subscription_factory):
    client, headers, _ = api
    subscription_factory()
    run(client, headers)
    invoice = client.get("/api/v1/invoices", headers=headers["admin"]).json()["data"][0]
    client.patch("/api/v1/me", json={"name": "Changed name"}, headers=headers["customer"])
    assert (
        client.get(f"/api/v1/invoices/{invoice['id']}", headers=headers["customer"]).json()[
            "customer"
        ]["name"]
        == "Customer"
    )
    assert (
        client.post(
            f"/api/v1/invoices/{invoice['id']}/confirm",
            headers={**headers["admin"], "If-Match": str(invoice["version"])},
        ).status_code
        == 200
    )
    path = f"/api/v1/invoices/{invoice['id']}/payments"
    for index, body in enumerate(
        [
            {"amount": "10", "method": "wire"},
            {"amount": "0", "method": "cash"},
            {"amount": "10.001", "method": "cash"},
        ]
    ):
        assert (
            client.post(
                path,
                json={"currency": "USD", **body},
                headers={**headers["staff"], "Idempotency-Key": f"invalid-{index}"},
            ).status_code
            == 422
        )
    assert (
        client.post(
            path,
            json={"amount": "121", "currency": "USD", "method": "cash"},
            headers={**headers["staff"], "Idempotency-Key": "overpay"},
        ).status_code
        == 422
    )
    partial = client.post(
        path,
        json={"amount": "20", "currency": "USD", "method": "cash"},
        headers={**headers["staff"], "Idempotency-Key": "partial"},
    ).json()
    assert partial["amount_due"] == "100.00"
    assert "cancel" not in partial["available_actions"]
    assert (
        client.post(
            f"/api/v1/invoices/{invoice['id']}/cancel",
            headers={**headers["admin"], "If-Match": str(partial["version"])},
        ).status_code
        == 409
    )
    full = client.post(
        path,
        json={
            "amount": "100",
            "currency": "USD",
            "method": "bank_transfer",
            "note": "Final amount",
        },
        headers={**headers["staff"], "Idempotency-Key": "final"},
    )
    assert full.json()["status"] == "paid"
    assert full.json()["amount_due"] == "0.00"


def test_billing_retry_can_target_failed_subscriptions(api, subscription_factory):
    client, headers, _ = api
    first, _, _ = subscription_factory()
    second, _, _ = subscription_factory()
    assert run(client, headers, subscription_ids=[second["id"]])["created_count"] == 1
    assert (
        client.get("/api/v1/invoices", headers=headers["admin"]).json()["data"][0][
            "subscription_id"
        ]
        == second["id"]
    )
    assert (
        client.post(
            "/api/v1/billing-runs",
            json={"due_on": "invalid"},
            headers={**headers["admin"], "Idempotency-Key": "invalid-date"},
        ).status_code
        == 422
    )
    assert first["id"] != second["id"]


def test_zero_total_invoice_is_paid_without_a_payment(api, subscription_factory):
    client, headers, _ = api
    subscription_factory("0", "0")
    run(client, headers)
    invoice = client.get("/api/v1/invoices", headers=headers["admin"]).json()["data"][0]
    confirmed = client.post(
        f"/api/v1/invoices/{invoice['id']}/confirm",
        headers={**headers["admin"], "If-Match": str(invoice["version"])},
    )
    assert confirmed.json()["status"] == "paid"
    assert confirmed.json()["payments"] == []
