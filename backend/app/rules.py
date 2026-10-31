import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN

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


def allocate_discount(total, bases, currency):
    if not total or not sum(bases):
        return [money(0, currency) for _ in bases]
    quantum = Decimal(1).scaleb(-CURRENCY_DIGITS[currency])
    exact = [total * base / sum(bases) for base in bases]
    allocated = [value.quantize(quantum, rounding=ROUND_DOWN) for value in exact]
    remaining = int((total - sum(allocated)) / quantum)
    for index in sorted(range(len(bases)), key=lambda i: (-(exact[i] - allocated[i]), i))[
        :remaining
    ]:
        allocated[index] += quantum
    return allocated


def invoice_amount(plan, lines, discounts, taxes, on: date, jurisdiction=None):
    jurisdiction = jurisdiction or {}
    currency = plan["currency"]
    plan_fee = money(plan["price"], currency)
    components = [
        {
            "name": plan.get("name", "Plan fee"),
            "quantity": 1,
            "unit_price": str(plan_fee),
            "subtotal": str(plan_fee),
        }
    ]
    for line in lines:
        if line["currency"] != currency:
            raise ValueError("currency_mismatch")
        subtotal = money(Decimal(line["unit_price"]) * int(line["quantity"]), currency)
        components.append({**line, "subtotal": str(subtotal)})
    bases = [money(line["subtotal"], currency) for line in components]
    subtotal = sum(bases, money(0, currency))
    eligible = []
    for rule in discounts:
        if rule.get("currency", currency) != currency or not rule.get("active", True):
            continue
        if (
            on.isoformat() < rule["starts_on"]
            or rule.get("ends_on")
            and on.isoformat() > rule["ends_on"]
        ):
            continue
        if rule.get("usage_limit") is not None and int(rule.get("usage_count", 0)) >= int(
            rule["usage_limit"]
        ):
            continue
        eligible_bases = [
            base
            if rule.get("scope") != "products"
            or index > 0
            and components[index].get("product_id") in rule.get("product_ids", [])
            else money(0, currency)
            for index, base in enumerate(bases)
        ]
        base = sum(eligible_bases)
        eligible_quantity = sum(
            int(line["quantity"])
            for line in lines
            if rule.get("scope") != "products"
            or line.get("product_id") in rule.get("product_ids", [])
        )
        if base < money(rule.get("minimum_purchase", 0), currency) or eligible_quantity < int(
            rule.get("minimum_quantity", 0)
        ):
            continue
        reduction = (
            money(base * Decimal(rule["value"]) / 100, currency)
            if rule["kind"] == "percentage"
            else money(rule["value"], currency)
        )
        if base > 0:
            eligible.append((min(base, reduction), str(rule.get("id", "")), rule, eligible_bases))
    if eligible:
        discount, _, chosen, eligible_bases = min(eligible, key=lambda value: (-value[0], value[1]))
        allocated = allocate_discount(discount, eligible_bases, currency)
    else:
        discount, chosen = money(0, currency), None
        allocated = [money(0, currency) for _ in components]
    eligible_taxes = []
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
        eligible_taxes.append(tax)
    tax_sums = [money(0, currency) for _ in eligible_taxes]
    for index, component in enumerate(components):
        net = bases[index] - allocated[index]
        line_taxes = []
        for tax_index, tax in enumerate(eligible_taxes):
            charge = money(net * Decimal(tax["rate_percent"]) / 100, currency)
            tax_sums[tax_index] += charge
            line_taxes.append(
                {
                    "name": tax.get("name", "Tax"),
                    "rate_percent": tax["rate_percent"],
                    "amount": str(charge),
                }
            )
        total_tax = sum((money(tax["amount"], currency) for tax in line_taxes), money(0, currency))
        component.update(
            {
                "discount": str(allocated[index]),
                "taxes": line_taxes,
                "tax_total": str(total_tax),
                "amount": str(net + total_tax),
                "line_total": str(net + total_tax),
            }
        )
    tax_total = sum(tax_sums, money(0, currency))
    return {
        "currency": currency,
        "plan_fee": str(plan_fee),
        "plan_line": components[0],
        "lines": components[1:],
        "subtotal": str(subtotal),
        "discount_total": str(discount),
        "discount_rule_id": chosen.get("id") if chosen else None,
        "taxes": [
            {
                "name": tax.get("name", "Tax"),
                "rate_percent": tax["rate_percent"],
                "amount": str(tax_sums[index]),
            }
            for index, tax in enumerate(eligible_taxes)
        ],
        "tax_total": str(tax_total),
        "total": str(subtotal - discount + tax_total),
        "amount_paid": str(money(0, currency)),
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
