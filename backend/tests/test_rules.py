from datetime import date

from app.rules import invoice_amount, invoice_balance, next_date


def test_month_end_and_leap_day():
    assert next_date(date(2025, 1, 31), "monthly") == date(2025, 2, 28)
    assert next_date(date(2024, 2, 29), "yearly") == date(2025, 2, 28)
    assert next_date(date(2025, 2, 28), "monthly", 31) == date(2025, 3, 31)


def test_tax_discount_and_plan_fee():
    plan = {"price": "100.00", "currency": "USD"}
    lines = [{"unit_price": "20.00", "quantity": 2, "currency": "USD", "product_id": 1}]
    discounts = [
        {
            "id": 1,
            "kind": "percentage",
            "value": "10",
            "starts_on": "2026-01-01",
            "scope": "subscription",
        }
    ]
    taxes = [{"rate_percent": "5", "effective_from": "2026-01-01"}]
    result = invoice_amount(plan, lines, discounts, taxes, date(2026, 2, 1))
    assert result["subtotal"] == "140.00"
    assert result["discount_total"] == "14.00"
    assert result["tax_total"] == "6.30"
    assert result["total"] == "132.30"


def test_partial_payment_and_overpayment_boundary():
    assert invoice_balance("120.00", ["25.00", "10.00"]) == {
        "amount_paid": "35.00",
        "amount_due": "85.00",
    }
    try:
        invoice_balance("120.00", ["120.01"])
    except ValueError as error:
        assert str(error) == "payment_exceeds_total"
    else:
        raise AssertionError("overpayment was accepted")


def test_tax_rules_follow_customer_jurisdiction():
    plan = {"price": "100.00", "currency": "USD"}
    taxes = [
        {"name": "US rule", "rate_percent": "5", "country": "US", "effective_from": "2026-01-01"},
        {"name": "CA rule", "rate_percent": "10", "country": "CA", "effective_from": "2026-01-01"},
    ]
    result = invoice_amount(plan, [], [], taxes, date(2026, 2, 1), {"country": "US"})
    assert result["tax_total"] == "5.00"
    assert result["taxes"] == [{"name": "US rule", "rate_percent": "5", "amount": "5.00"}]


def test_fixed_discount_allocation_and_line_taxes_sum_to_invoice():
    from decimal import Decimal

    plan = {"name": "Plan", "price": "0.01", "currency": "USD"}
    lines = [
        {
            "product_id": index,
            "name": "Seat",
            "unit_price": "0.01",
            "quantity": 1,
            "currency": "USD",
        }
        for index in range(3)
    ]
    discount = {
        "id": 1,
        "kind": "fixed",
        "value": "0.02",
        "starts_on": "2026-01-01",
        "scope": "subscription",
    }
    tax = {"name": "Tax", "rate_percent": "50", "effective_from": "2026-01-01"}
    invoice = invoice_amount(plan, lines, [discount], [tax], date(2026, 2, 1))
    all_lines = [invoice["plan_line"], *invoice["lines"]]
    assert sum(Decimal(line["discount"]) for line in all_lines) == Decimal(
        invoice["discount_total"]
    )
    assert sum(Decimal(line["tax_total"]) for line in all_lines) == Decimal(invoice["tax_total"])
    assert sum(Decimal(line["line_total"]) for line in all_lines) == Decimal(invoice["total"])
    assert all(Decimal(line["line_total"]) >= 0 for line in all_lines)


def test_product_scoped_discount_excludes_plan_and_other_products():
    plan = {"price": "100.00", "currency": "USD"}
    lines = [
        {"product_id": 1, "unit_price": "10.00", "quantity": 1, "currency": "USD"},
        {"product_id": 2, "unit_price": "20.00", "quantity": 1, "currency": "USD"},
    ]
    rule = {
        "id": 1,
        "kind": "fixed",
        "value": "100.00",
        "starts_on": "2026-01-01",
        "scope": "products",
        "product_ids": [1],
    }
    result = invoice_amount(plan, lines, [rule], [], date(2026, 2, 1))
    assert result["discount_total"] == "10.00"
    assert result["plan_line"]["discount"] == "0.00"
    assert result["lines"][1]["discount"] == "0.00"


def test_product_discount_thresholds_only_count_eligible_products():
    plan = {"price": "100.00", "currency": "USD"}
    lines = [
        {"product_id": 1, "unit_price": "10.00", "quantity": 1, "currency": "USD"},
        {"product_id": 2, "unit_price": "20.00", "quantity": 100, "currency": "USD"},
    ]
    rule = {
        "id": 1,
        "kind": "percentage",
        "value": "10",
        "starts_on": "2026-01-01",
        "scope": "products",
        "product_ids": [1],
        "minimum_quantity": 5,
    }
    assert invoice_amount(plan, lines, [rule], [], date(2026, 2, 1))["discount_total"] == "0.00"
    rule = {**rule, "minimum_quantity": 1, "minimum_purchase": "50.00"}
    assert invoice_amount(plan, lines, [rule], [], date(2026, 2, 1))["discount_total"] == "0.00"
