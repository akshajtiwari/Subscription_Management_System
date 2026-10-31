def test_retried_creation_and_customer_requests_return_original_records(api, subscription_factory):
    client, headers, _ = api
    row, product, plan = subscription_factory()
    body = {
        "payload": {
            "customer_id": 3,
            "plan_id": plan["id"],
            "start_date": row["start_date"],
            "expiry_date": row["expiry_date"],
            "lines": [{"product_id": product["id"], "quantity": 1}],
        }
    }
    create_headers = {**headers["admin"], "Idempotency-Key": "one-subscription"}
    first = client.post("/api/v1/subscriptions", json=body, headers=create_headers)
    second = client.post("/api/v1/subscriptions", json=body, headers=create_headers)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    changed = {
        "payload": {**body["payload"], "lines": [{"product_id": product["id"], "quantity": 2}]}
    }
    assert (
        client.post("/api/v1/subscriptions", json=changed, headers=create_headers).status_code
        == 409
    )
    assert len(client.get("/api/v1/subscriptions", headers=headers["admin"]).json()["data"]) == 2
    path = f"/api/v1/me/subscriptions/{row['id']}/requests"
    request_headers = {**headers["customer"], "Idempotency-Key": "one-request"}
    first = client.post(path, json={"action": "pause"}, headers=request_headers)
    second = client.post(path, json={"action": "pause"}, headers=request_headers)
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert len(client.get("/api/v1/requests", headers=headers["customer"]).json()["data"]) == 1


def test_renewal_retry_does_not_extend_the_term_twice(api, subscription_factory):
    client, headers, _ = api
    row, _, _ = subscription_factory()
    path = f"/api/v1/subscriptions/{row['id']}/renew"
    action_headers = {
        **headers["staff"],
        "If-Match": str(row["version"]),
        "Idempotency-Key": "one-renewal",
    }
    first = client.post(path, headers=action_headers)
    second = client.post(path, headers=action_headers)
    assert first.status_code == second.status_code == 200
    assert first.json()["expiry_date"] == second.json()["expiry_date"]
    assert (
        client.get(f"/api/v1/subscriptions/{row['id']}", headers=headers["admin"]).json()[
            "expiry_date"
        ]
        == first.json()["expiry_date"]
    )
