from app.db import Record, User


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


def test_newest_people_pages_include_new_accounts_without_overlapping_pages(api):
    client, headers, sessions = api
    with sessions() as session:
        password_hash = session.get(User, 1).password_hash
        for role in ["staff", "customer"]:
            for index in range(30):
                session.add(
                    User(
                        name=f"New {role} {index:02d}",
                        role=role,
                        email=f"{role}-{index}@example.test",
                        password_hash=password_hash,
                    )
                )
        session.commit()
    for resource in ["staff", "customers"]:
        first = client.get(f"/api/v1/{resource}?sort=newest&limit=25", headers=headers["admin"])
        assert first.status_code == 200
        first = first.json()
        assert first["data"][0]["name"].endswith("29")
        second = client.get(
            f"/api/v1/{resource}?sort=newest&limit=25&cursor={first['next_cursor']}",
            headers=headers["admin"],
        ).json()
        assert not {row["id"] for row in first["data"]} & {row["id"] for row in second["data"]}
        assert len(first["data"]) + len(second["data"]) >= 30
        assert (
            client.get(f"/api/v1/{resource}?sort=unknown", headers=headers["admin"]).status_code
            == 422
        )


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


def test_newest_first_pagination_has_no_overlapping_records(api):
    client, headers, sessions = api
    with sessions() as session:
        session.add_all(
            [
                Record(
                    kind="products",
                    number=f"NEWEST-{index}",
                    status="active",
                    payload={"name": f"Product {index}", "sales_price": "1.00", "currency": "USD"},
                )
                for index in range(6)
            ]
        )
        session.commit()
    newest = client.get("/api/v1/products?limit=2&sort=newest", headers=headers["admin"]).json()
    older = client.get(
        f"/api/v1/products?limit=2&sort=newest&cursor={newest['next_cursor']}",
        headers=headers["admin"],
    ).json()
    assert min(row["id"] for row in newest["data"]) > max(row["id"] for row in older["data"])


def test_catalog_currency_and_variant_filters_run_before_the_result_limit(api):
    client, headers, sessions = api
    with sessions() as session:
        session.add_all(
            [
                Record(
                    kind="products",
                    number=f"USD-{index}",
                    status="active",
                    payload={"name": f"Product {index}", "sales_price": "1.00", "currency": "USD"},
                )
                for index in range(105)
            ]
        )
        session.add(
            Record(
                kind="products",
                number="EUR-ONLY",
                status="active",
                payload={
                    "name": "European product",
                    "sales_price": "10.00",
                    "currency": "EUR",
                    "variants": [{"name": "Large", "price_adjustment": "2.00"}],
                },
            )
        )
        session.commit()
    rows = client.get(
        "/api/v1/catalog-items?currency=EUR&base_only=true", headers=headers["staff"]
    ).json()["data"]
    assert len(rows) == 1
    assert rows[0]["name"] == "European product"
    assert rows[0]["variant_id"] is None


def test_internal_directory_includes_admins_but_only_staff_accounts_can_be_changed(api):
    client, headers, _ = api
    members = client.get("/api/v1/staff", headers=headers["admin"]).json()["data"]
    assert {member["role"] for member in members} == {"admin", "staff"}
    assert client.get("/api/v1/staff/1", headers=headers["admin"]).json()["role"] == "admin"
    assert (
        client.patch(
            "/api/v1/staff/1", headers=headers["admin"], json={"active": False}
        ).status_code
        == 404
    )
    assert client.get("/api/v1/staff", headers=headers["customer"]).status_code == 403
