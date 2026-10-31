from app.db import Record


def test_search_applies_before_pagination(api):
    client, headers, sessions = api
    with sessions() as session:
        for index in range(35):
            session.add(
                Record(
                    kind="products",
                    number=f"PRODUCT-{index:03d}",
                    status="active",
                    payload={
                        "name": f"Product {index:03d}",
                        "sales_price": "10.00",
                        "currency": "USD",
                    },
                )
            )
        session.commit()
    matches = client.get(
        "/api/v1/products?search=Product%20034&limit=2", headers=headers["admin"]
    ).json()
    assert len(matches["data"]) == 1
    assert matches["data"][0]["name"] == "Product 034"
    first = client.get("/api/v1/products?limit=2", headers=headers["admin"]).json()
    second = client.get(
        f"/api/v1/products?limit=2&cursor={first['next_cursor']}", headers=headers["admin"]
    ).json()
    assert not {row["id"] for row in first["data"]} & {row["id"] for row in second["data"]}
    assert client.get("/api/v1/products?limit=0", headers=headers["admin"]).status_code == 422


def test_staff_deactivation_and_account_role_boundaries(api):
    client, headers, _ = api
    assert (
        client.patch(
            "/api/v1/staff/2", json={"active": False}, headers=headers["staff"]
        ).status_code
        == 403
    )
    assert (
        client.patch(
            "/api/v1/staff/2", json={"active": False}, headers=headers["admin"]
        ).status_code
        == 200
    )
    assert client.get("/api/v1/me", headers=headers["staff"]).status_code == 401
    assert (
        client.patch(
            "/api/v1/me",
            json={"name": "Customer updated", "role": "admin"},
            headers=headers["customer"],
        ).status_code
        == 422
    )
    assert (
        client.patch(
            "/api/v1/me", json={"name": "Customer updated"}, headers=headers["customer"]
        ).json()["name"]
        == "Customer updated"
    )
    assert client.get("/api/v1/customers/3", headers=headers["customer"]).status_code == 403
    assert (
        client.get("/api/v1/customers/3", headers=headers["admin"]).json()["email"]
        == "customer@example.test"
    )


def test_variant_indexes_are_preserved_by_deactivation(api):
    client, headers, _ = api
    row = client.post(
        "/api/v1/products",
        json={
            "payload": {
                "name": "Seats",
                "sales_price": "20",
                "variants": [{"name": "Odoo", "brand": "Odoo", "price_adjustment": "560"}],
            }
        },
        headers=headers["admin"],
    ).json()
    path = f"/api/v1/products/{row['id']}"
    update_headers = {**headers["admin"], "If-Match": str(row["version"])}
    assert (
        client.patch(path, json={"payload": {"variants": []}}, headers=update_headers).status_code
        == 409
    )
    result = client.patch(
        path,
        json={
            "payload": {
                "variants": [
                    {"name": "Odoo", "brand": "Odoo", "price_adjustment": "560", "active": False}
                ]
            }
        },
        headers=update_headers,
    )
    assert result.status_code == 200
    assert len(client.get("/api/v1/catalog-items", headers=headers["admin"]).json()["data"]) == 1
