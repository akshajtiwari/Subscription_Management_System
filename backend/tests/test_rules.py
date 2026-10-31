from datetime import date

from app.rules import invoice_amount, invoice_balance, next_date


def test_month_end_and_leap_day():
    assert next_date(date(2025, 1, 31), "monthly") == date(2025, 2, 28)
    assert next_date(date(2024, 2, 29), "yearly") == date(2025, 2, 28)
    assert next_date(date(2025, 2, 28), "monthly", 31) == date(2025, 3, 31)


def test_tax_discount_and_plan_fee():
    plan = {"price": "100.00", "currency": "USD"}
    lines = [{"unit_price": "20.00", "quantity": 2, "currency": "USD", "product_id": 1}]
    discounts = [{"id": 1, "kind": "percentage", "value": "10", "starts_on": "2026-01-01", "scope": "subscription"}]
    taxes = [{"rate_percent": "5", "effective_from": "2026-01-01"}]
    result = invoice_amount(plan, lines, discounts, taxes, date(2026, 2, 1))
    assert result["subtotal"] == "140.00"
    assert result["discount_total"] == "14.00"
    assert result["tax_total"] == "6.30"
    assert result["total"] == "132.30"


def test_partial_payment_and_overpayment_boundary():
    assert invoice_balance("120.00", ["25.00", "10.00"]) == {"amount_paid": "35.00", "amount_due": "85.00"}
    try:
        invoice_balance("120.00", ["120.01"])
    except ValueError as error:
        assert str(error) == "payment_exceeds_total"
    else:
        raise AssertionError("overpayment was accepted")
