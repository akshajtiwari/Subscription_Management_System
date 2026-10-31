from datetime import date

import pytest

from app.rules import invoice_amount, invoice_balance


@pytest.mark.parametrize(
    "kind,payload",
    [
        ("products", {"name": "Seats", "sales_price": "-1"}),
        ("products", {"name": "Seats", "sales_price": "NaN"}),
        ("products", {"name": "Seats", "sales_price": "20", "currency": "XYZ"}),
        ("products", {"name": "Seats", "sales_price": "20", "id": 99}),
        ("products", {"name": "Seats", "sales_price": "20", "status": "closed"}),
        (
            "products",
            {
                "name": "Seats",
                "sales_price": "20",
                "variants": [{"name": "Brand", "price_adjustment": "-21"}],
            },
        ),
        ("products", {"name": "Seats", "sales_price": "20.01", "currency": "JPY"}),
        ("plans", {"name": "Monthly", "price": "10", "billing_interval": "quarterly"}),
        (
            "plans",
            {
                "name": "Monthly",
                "price": "10",
                "billing_interval": "monthly",
                "minimum_quantity": 0,
            },
        ),
        (
            "plans",
            {
                "name": "Monthly",
                "price": "10",
                "billing_interval": "monthly",
                "available_from": "2027-02-01",
                "available_until": "2027-01-01",
            },
        ),
        ("tax-rules", {"name": "Tax", "rate_percent": "101", "effective_from": "2026-01-01"}),
        (
            "discount-rules",
            {"name": "Discount", "kind": "percentage", "value": "101", "starts_on": "2026-01-01"},
        ),
        (
            "discount-rules",
            {
                "name": "Discount",
                "kind": "fixed",
                "value": "10",
                "scope": "products",
                "starts_on": "2026-01-01",
            },
        ),
    ],
)
def test_invalid_configuration_is_rejected(api, kind, payload):
    client, headers, _ = api
    response = client.post(f"/api/v1/{kind}", json={"payload": payload}, headers=headers["admin"])
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "validation_error"


@pytest.mark.parametrize("role", ["staff", "customer"])
def test_only_admin_can_configure_pricing(api, role):
    client, headers, _ = api
    response = client.post(
        "/api/v1/products",
        json={"payload": {"name": "Seats", "sales_price": "20"}},
        headers=headers[role],
    )
    assert response.status_code == 403


def test_configuration_can_be_deactivated_without_overriding_metadata(api):
    client, headers, _ = api
    product = client.post(
        "/api/v1/products",
        json={"payload": {"name": "Seats", "sales_price": "20"}},
        headers=headers["admin"],
    ).json()
    assert (
        client.patch(
            f"/api/v1/products/{product['id']}",
            json={"payload": {"version": 100}},
            headers={**headers["admin"], "If-Match": str(product["version"])},
        ).status_code
        == 422
    )
    response = client.patch(
        f"/api/v1/products/{product['id']}",
        json={"payload": {"active": False}},
        headers={**headers["admin"], "If-Match": str(product["version"])},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "inactive"
    assert response.json()["version"] == 2
    assert not client.get("/api/v1/catalog-items", headers=headers["admin"]).json()["data"]


def test_currency_precision_and_fractional_tax_rates():
    jpy = invoice_amount(
        {"currency": "JPY", "price": "100"},
        [],
        [],
        [{"name": "Tax", "rate_percent": "7.125", "effective_from": "2026-01-01"}],
        date(2026, 2, 1),
    )
    assert jpy["tax_total"] == "7"
    assert jpy["total"] == "107"
    kwd = invoice_amount({"currency": "KWD", "price": "1.123"}, [], [], [], date(2026, 2, 1))
    assert kwd["total"] == "1.123"
    assert invoice_balance("1.123", ["0.123"], "KWD")["amount_due"] == "1.000"
