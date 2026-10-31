import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from .currencies import CURRENCY_DIGITS


def money(value, currency="USD"):
    return Decimal(str(value)).quantize(
        Decimal(1).scaleb(-CURRENCY_DIGITS[currency]), rounding=ROUND_HALF_UP
    )


def next_date(start: date, interval: str, anchor_day: int | None = None):
    if interval == "daily":
        return start + timedelta(days=1)
    if interval == "weekly":
        return start + timedelta(days=7)
    year = start.year + (start.month == 12 if interval == "monthly" else 1)
    month = start.month % 12 + 1 if interval == "monthly" else start.month
    return date(year, month, min(anchor_day or start.day, calendar.monthrange(year, month)[1]))


def invoice_balance(total, payments, currency="USD"):
    paid = sum((money(amount, currency) for amount in payments), Decimal(0))
    due = money(total, currency) - paid
    if due < 0:
        raise ValueError("payment_exceeds_total")
    return {"amount_paid": str(paid), "amount_due": str(due)}


def invoice_amount(plan, lines, discounts, taxes, on: date, jurisdiction=None):
    jurisdiction = jurisdiction or {}
    currency = plan["currency"]
    plan_fee = money(plan["price"], currency)
    resolved = []
    subtotal = plan_fee
    for line in lines:
        if line["currency"] != currency:
            raise ValueError("currency_mismatch")
        amount = money(Decimal(line["unit_price"]) * int(line["quantity"]), currency)
        subtotal += amount
        resolved.append({**line, "amount": str(amount)})
    eligible = []
    for rule in discounts:
        if rule.get("currency", currency) != currency:
            continue
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
        if subtotal < money(rule.get("minimum_purchase", 0), currency) or sum(
            int(x["quantity"]) for x in lines
        ) < int(rule.get("minimum_quantity", 0)):
            continue
        base = (
            subtotal
            if rule.get("scope") != "products"
            else sum(
                (
                    money(x["amount"], currency)
                    for x in resolved
                    if x.get("product_id") in rule.get("product_ids", [])
                ),
                Decimal(0),
            )
        )
        reduction = (
            money(base * Decimal(rule["value"]) / 100, currency)
            if rule["kind"] == "percentage"
            else money(rule["value"], currency)
        )
        if base > 0:
            eligible.append((min(base, reduction), str(rule.get("id", "")), rule))
    discount, _, chosen = (
        min(eligible, key=lambda x: (-x[0], x[1])) if eligible else (Decimal(0), "", None)
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
                "amount": str(money(taxable * Decimal(tax["rate_percent"]) / 100, currency)),
            }
        )
    tax_total = sum((money(tax["amount"], currency) for tax in tax_breakdown), Decimal(0))
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


def term_length(start: date, expiry: date):
    months = (expiry.year - start.year) * 12 + expiry.month - start.month
    if months > 0 and expiry.day == min(
        start.day, calendar.monthrange(expiry.year, expiry.month)[1]
    ):
        return {"term_months": months, "term_days": (expiry - start).days}
    return {"term_months": 0, "term_days": (expiry - start).days}


def renewal_date(payload):
    expiry = date.fromisoformat(payload["expiry_date"])
    length = term_length(date.fromisoformat(payload["start_date"]), expiry)
    months = int(payload.get("term_months", length["term_months"]))
    if months:
        index = expiry.year * 12 + expiry.month - 1 + months
        year, month = index // 12, index % 12 + 1
        anchor = date.fromisoformat(payload["start_date"]).day
        return date(year, month, min(anchor, calendar.monthrange(year, month)[1]))
    return expiry + timedelta(days=int(payload.get("term_days", length["term_days"])))


def resume_date(payload, interval, today):
    due = date.fromisoformat(payload.get("next_billing_date", payload["start_date"]))
    anchor = date.fromisoformat(payload["start_date"]).day
    if interval == "daily":
        return max(due, today)
    while due < today:
        due = next_date(due, interval, anchor)
    return due


def subscription_actions(status, payload, plan, today, customer=False):
    if status == "closed":
        return []
    if not customer:
        if status == "draft":
            return ["quote"]
        if status == "quotation":
            return (
                ["quote"]
                if payload.get("quote_expires_at", "9999-12-31") < today.isoformat()
                else ["confirm"]
            )
        if status == "confirmed":
            return ["activate"] if payload["start_date"] <= today.isoformat() else []
    actions = []
    if status == "active":
        if customer:
            actions.append("add_on")
        if plan.get("allow_pause"):
            actions.append("pause")
    if status == "paused" and plan.get("allow_pause"):
        actions.append("resume")
    if status in {"active", "paused", "awaiting_renewal"} and plan.get("allow_renewal"):
        actions.append("renew")
    if status in {"active", "paused", "awaiting_renewal"} and (
        plan.get("allow_early_close") or payload["expiry_date"] <= today.isoformat()
    ):
        actions.append("close")
    return actions
