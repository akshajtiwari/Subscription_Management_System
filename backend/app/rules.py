import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP


def money(value):
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def next_date(start: date, interval: str, anchor_day: int | None = None):
    if interval == "daily":
        return start + timedelta(days=1)
    if interval == "weekly":
        return start + timedelta(days=7)
    year = start.year + (start.month == 12 if interval == "monthly" else 1)
    month = start.month % 12 + 1 if interval == "monthly" else start.month
    return date(year, month, min(anchor_day or start.day, calendar.monthrange(year, month)[1]))


def invoice_balance(total, payments):
    paid = sum((money(amount) for amount in payments), Decimal(0))
    due = money(total) - paid
    if due < 0:
        raise ValueError("payment_exceeds_total")
    return {"amount_paid": str(paid), "amount_due": str(due)}


def invoice_amount(plan, lines, discounts, taxes, on: date, jurisdiction=None):
    jurisdiction = jurisdiction or {}
    currency = plan["currency"]
    plan_fee = money(plan["price"])
    resolved = []
    subtotal = plan_fee
    for line in lines:
        if line["currency"] != currency:
            raise ValueError("currency_mismatch")
        amount = money(money(line["unit_price"]) * int(line["quantity"]))
        subtotal += amount
        resolved.append({**line, "amount": str(amount)})
    eligible = []
    for rule in discounts:
        if (
            not rule.get("active", True)
            or on.isoformat() < rule["starts_on"]
            or (rule.get("ends_on") and on.isoformat() > rule["ends_on"])
        ):
            continue
        if (
            rule.get("usage_limit") is not None
            and rule.get("usage_count", 0) >= rule["usage_limit"]
        ):
            continue
        if subtotal < money(rule.get("minimum_purchase", 0)) or sum(
            int(x["quantity"]) for x in lines
        ) < int(rule.get("minimum_quantity", 0)):
            continue
        base = (
            subtotal
            if rule.get("scope") != "products"
            else sum(
                (
                    money(x["amount"])
                    for x in resolved
                    if x.get("product_id") in rule.get("product_ids", [])
                ),
                Decimal(0),
            )
        )
        reduction = (
            money(base * money(rule["value"]) / 100)
            if rule["kind"] == "percentage"
            else money(rule["value"])
        )
        eligible.append((min(base, reduction), str(rule.get("id", "")), rule))
    discount, _, chosen = (
        max(eligible, key=lambda x: (x[0], x[1])) if eligible else (Decimal(0), "", None)
    )
    taxable = subtotal - discount
    tax_breakdown = []
    for tax in taxes:
        if (
            not tax.get("active", True)
            or tax["effective_from"] > on.isoformat()
            or tax.get("effective_until")
            and tax["effective_until"] < on.isoformat()
        ):
            continue
        if (
            tax.get("country")
            and tax["country"] != jurisdiction.get("country")
            or tax.get("region")
            and tax["region"] != jurisdiction.get("region")
        ):
            continue
        tax_breakdown.append(
            {
                "name": tax.get("name", "Tax"),
                "rate_percent": tax["rate_percent"],
                "amount": str(money(taxable * money(tax["rate_percent"]) / 100)),
            }
        )
    tax_total = sum((money(tax["amount"]) for tax in tax_breakdown), Decimal(0))
    return {
        "currency": currency,
        "plan_fee": str(plan_fee),
        "lines": resolved,
        "subtotal": str(subtotal),
        "discount_total": str(discount),
        "discount_rule_id": chosen.get("id") if chosen else None,
        "taxes": tax_breakdown,
        "tax_total": str(tax_total),
        "total": str(subtotal - discount + tax_total),
        "amount_paid": "0.00",
    }
