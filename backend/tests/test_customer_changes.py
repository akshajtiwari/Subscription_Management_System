from datetime import date, timedelta

from app.db import Record
from app.rules import renewal_date, term_length


def subscription(api, **plan_flags):
    client, headers, _ = api
    product = client.post(
        "/api/v1/products",
        json={"payload": {"name": "Seats", "sales_price": "20", "currency": "USD"}},
        headers=headers["admin"],
    ).json()
    plan = client.post(
        "/api/v1/plans",
        json={
            "payload": {
                "name": "Monthly",
                "price": "100",
                "currency": "USD",
                "billing_interval": "monthly",
                "allow_pause": True,
                "allow_renewal": True,
                "allow_early_close": True,
                **plan_flags,
            }
        },
        headers=headers["admin"],
    ).json()
    today = date.today()
    created = client.post(
        "/api/v1/subscriptions",
        json={
            "payload": {
                "customer_id": 3,
                "plan_id": plan["id"],
                "start_date": today.isoformat(),
                "expiry_date": (today + timedelta(days=365)).isoformat(),
                "lines": [{"product_id": product["id"], "quantity": 1}],
            }
        },
        headers=headers["admin"],
    )
    assert created.status_code == 201, created.text
    row = created.json()
    for action in ["quote", "confirm", "activate"]:
        response = client.post(
            f"/api/v1/subscriptions/{row['id']}/{action}",
            headers={**headers["admin"], "If-Match": str(row["version"])},
        )
        assert response.status_code == 200, response.text
        row = response.json()
    return row, product, plan


def run_billing(api, key="run"):
    client, headers, _ = api
    response = client.post(
        "/api/v1/billing-runs",
        json={"due_on": date.today().isoformat()},
        headers={**headers["admin"], "Idempotency-Key": key},
    )
    assert response.status_code == 202, response.text
    return response.json()


def test_pause_request_cannot_override_owner_or_be_duplicated(api):
    client, headers, _ = api
    row, _, _ = subscription(api)
    path = f"/api/v1/me/subscriptions/{row['id']}/requests"
    assert (
        client.post(
            path, json={"action": "pause", "subscription_id": 999}, headers=headers["customer"]
        ).status_code
        == 422
    )
    change = client.post(path, json={"action": "pause"}, headers=headers["customer"])
    assert change.status_code == 201
    assert (
        client.post(path, json={"action": "pause"}, headers=headers["customer"]).status_code == 409
    )
    assert (
        client.post(
            f"/api/v1/requests/{change.json()['id']}/approve", headers=headers["staff"]
        ).status_code
        == 200
    )
    result = run_billing(api)
    assert result["created_count"] == 0
    assert (
        client.get(f"/api/v1/subscriptions/{row['id']}", headers=headers["customer"]).json()[
            "status"
        ]
        == "paused"
    )
    assert (
        client.get("/api/v1/requests", headers=headers["customer"]).json()["data"][0]["status"]
        == "applied"
    )
    resume = client.post(path, json={"action": "resume"}, headers=headers["customer"])
    assert resume.status_code == 201
    client.post(f"/api/v1/requests/{resume.json()['id']}/approve", headers=headers["staff"])
    assert run_billing(api, "resume")["created_count"] == 1


def test_plan_permissions_control_server_and_portal_actions(api):
    client, headers, _ = api
    row, _, _ = subscription(api, allow_pause=False, allow_renewal=False, allow_early_close=False)
    own = client.get(f"/api/v1/subscriptions/{row['id']}", headers=headers["customer"]).json()
    assert own["available_actions"] == ["add_on"]
    assert (
        client.post(
            f"/api/v1/me/subscriptions/{row['id']}/requests",
            json={"action": "pause"},
            headers=headers["customer"],
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/subscriptions/{row['id']}/pause",
            headers={**headers["staff"], "If-Match": str(row["version"])},
        ).status_code
        == 409
    )


def test_add_on_keeps_existing_agreed_prices(api):
    client, headers, _ = api
    row, product, _ = subscription(api)
    client.patch(
        f"/api/v1/products/{product['id']}",
        json={"payload": {"sales_price": "99"}},
        headers={**headers["admin"], "If-Match": str(product["version"])},
    )
    addon = client.post(
        "/api/v1/products",
        json={
            "payload": {"name": "Support", "type": "add_on", "sales_price": "10", "currency": "USD"}
        },
        headers=headers["admin"],
    ).json()
    selected = client.get("/api/v1/catalog-items", headers=headers["customer"]).json()["data"]
    assert all(product["product_id"] == addon["id"] for product in selected)
    change = client.post(
        f"/api/v1/me/subscriptions/{row['id']}/requests",
        json={"action": "add_on", "product_id": addon["id"], "quantity": 2},
        headers=headers["customer"],
    ).json()
    assert (
        client.post(
            f"/api/v1/requests/{change['id']}/approve", headers=headers["staff"]
        ).status_code
        == 200
    )
    assert run_billing(api)["created_count"] == 1
    invoice = client.get("/api/v1/invoices", headers=headers["customer"]).json()["data"][0]
    assert invoice["total"] == "140.00"
    assert invoice["lines"][0]["unit_price"] == "20.00"
    assert invoice["lines"][1]["quantity"] == 2


def test_expired_quote_must_be_reissued(api):
    client, headers, sessions = api
    row, _, _ = subscription(api)
    with sessions() as session:
        record = session.get(Record, row["id"])
        record.status = "quotation"
        record.payload = {**record.payload, "quote_expires_at": "2000-01-01"}
        session.commit()
    assert (
        client.post(
            f"/api/v1/subscriptions/{row['id']}/confirm",
            headers={**headers["admin"], "If-Match": str(row["version"])},
        ).status_code
        == 409
    )
    quote = client.post(
        f"/api/v1/subscriptions/{row['id']}/quote",
        headers={**headers["admin"], "If-Match": str(row["version"])},
    )
    assert quote.status_code == 200
    assert quote.json()["quote_expires_at"] >= date.today().isoformat()


def test_renewal_extends_original_term_instead_of_one_billing_interval():
    start, expiry = date(2024, 2, 29), date(2025, 2, 28)
    payload = {
        "start_date": start.isoformat(),
        "expiry_date": expiry.isoformat(),
        **term_length(start, expiry),
    }
    assert renewal_date(payload) == date(2026, 2, 28)
    payload = {
        "start_date": "2026-01-31",
        "expiry_date": "2026-02-28",
        "term_months": 1,
        "term_days": 28,
    }
    assert renewal_date(payload) == date(2026, 3, 31)


def test_staff_can_reject_a_scheduled_change_before_it_is_applied(api):
    client, headers, _ = api
    row, _, _ = subscription(api)
    change = client.post(
        f"/api/v1/me/subscriptions/{row['id']}/requests",
        json={"action": "pause"},
        headers=headers["customer"],
    ).json()
    path = f"/api/v1/requests/{change['id']}"
    assert client.post(path + "/approve", headers=headers["staff"]).status_code == 200
    assert client.post(path + "/reject", headers=headers["staff"]).status_code == 200
    assert client.get(f"/api/v1/subscriptions/{row['id']}", headers=headers["customer"]).json()[
        "available_actions"
    ]
    assert run_billing(api)["created_count"] == 1
