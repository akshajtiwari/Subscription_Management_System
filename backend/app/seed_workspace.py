"""Linked fictional records for populated catalog, portal, and reporting screens."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from .db import Event, Invoice, Payment, Record, User
from .rules import invoice_amount, money, next_date, term_length


def month_start(today, offset=0):
    index = today.year * 12 + today.month - 1 + offset
    year, month = divmod(index, 12)
    return date(year, month + 1, 1)


def populate_workspace(session, person, record, bakery, admin, staff, today):
    first, upcoming = month_start(today), month_start(today, 1)
    beginning = month_start(today, -11)
    future = month_start(today, 12)
    customers = []
    for prefix in ["Cedar", "Harbor", "Juniper", "Maple", "Orchard", "River", "Summit", "Willow"]:
        for industry in ["Retail", "Studio", "Systems", "Foods", "Health"]:
            name = f"{prefix} {industry}"
            customers.append(
                person(
                    f"billing@{prefix.lower()}-{industry.lower()}.example",
                    name,
                    "customer",
                    "DemoCustomer!1",
                )
            )
    for index, name in enumerate(
        [
            "Nora Patel",
            "Liam Chen",
            "Maya Reed",
            "Owen Brooks",
            "Ava Shah",
            "Theo Martin",
            "Leah Kim",
            "Arjun Mehta",
            "Zoe Wilson",
        ]
    ):
        person(
            f"{name.lower().replace(' ', '.')}@brightloop.demo",
            name,
            "staff",
            "DemoStaff!1",
            active=index < 7,
        )

    products, plans, discounts = {}, {}, []
    product_specs = [
        ("Commerce workspace", "software", 180, 65),
        ("Customer success desk", "software", 95, 28),
        ("Finance workspace", "software", 240, 80),
        ("Project workspace", "software", 120, 35),
        ("Team seats", "add_on", 24, 6),
        ("Advanced analytics", "add_on", 65, 16),
        ("Automation pack", "add_on", 49, 12),
        ("Cloud storage", "add_on", 18, 4),
        ("Onboarding service", "service", 350, 140),
    ]
    plan_specs = [
        ("Starter", "monthly", 79),
        ("Agency", "weekly", 29),
        ("Business", "yearly", 799),
        ("Pilot", "daily", 9),
    ]
    for currency, factor in [("USD", 1), ("EUR", 1), ("GBP", 1), ("INR", 80)]:
        products[currency], plans[currency] = [], []
        for index, (name, kind, price, cost) in enumerate(product_specs):
            products[currency].append(
                record(
                    "products",
                    f"PROD-SAMPLE-{currency}-{index + 1:02d}",
                    {
                        "name": f"{name} · {currency}",
                        "type": kind,
                        "sku": f"BL-{currency}-{index + 1:02d}",
                        "currency": currency,
                        "sales_price": str(money(price * factor, currency)),
                        "cost_price": str(money(cost * factor, currency)),
                        "notes": f"{name} subscription for growing teams.",
                        "active": index != 8,
                        "variants": [
                            {
                                "name": "Standard",
                                "brand": "Brightloop",
                                "price_adjustment": "0.00",
                                "sku": f"BL-{currency}-{index + 1:02d}-S",
                                "active": True,
                            },
                            {
                                "name": "Advanced",
                                "brand": "Brightloop",
                                "price_adjustment": str(30 * factor),
                                "sku": f"BL-{currency}-{index + 1:02d}-A",
                                "active": index != 8,
                            },
                        ],
                    },
                    "inactive" if index == 8 else "active",
                )
            )
        for index, (name, interval, price) in enumerate(plan_specs):
            plans[currency].append(
                record(
                    "plans",
                    f"PLAN-SAMPLE-{currency}-{index + 1:02d}",
                    {
                        "name": f"{name} {interval} · {currency}",
                        "currency": currency,
                        "price": str(money(price * factor, currency)),
                        "billing_interval": interval,
                        "minimum_quantity": 1,
                        "available_from": month_start(today, -24).isoformat(),
                        "available_until": None,
                        "allow_pause": interval != "daily",
                        "allow_early_close": interval != "yearly",
                        "allow_renewal": interval != "daily",
                        "auto_close": interval == "daily",
                        "active": True,
                    },
                )
            )
        for index in range(3):
            discounts.append(
                record(
                    "discount-rules",
                    f"DISC-SAMPLE-{currency}-{index + 1:02d}",
                    {
                        "name": f"{['Team expansion', 'Seasonal credit', 'Volume seats'][index]} · {currency}",
                        "currency": currency,
                        "kind": "fixed" if index == 1 else "percentage",
                        "value": str(50 * factor) if index == 1 else "15",
                        "scope": "subscription" if index == 1 else "products",
                        "product_ids": [] if index == 1 else [products[currency][4].id],
                        "minimum_purchase": "0",
                        "minimum_quantity": 1 if index == 1 else 3,
                        "starts_on": month_start(today, -14).isoformat(),
                        "ends_on": (first - timedelta(days=1)).isoformat()
                        if index == 1
                        else future.isoformat(),
                        "usage_limit": None if index == 0 else 100,
                        "usage_count": 100 if index == 2 else 0,
                        "active": index != 1,
                    },
                    "inactive" if index == 1 else "active",
                )
            )
        for index in range(3):
            record(
                "quotation-templates",
                f"TPL-SAMPLE-{currency}-{index + 1:02d}",
                {
                    "name": f"{['Retail launch', 'Agency team', 'Business rollout'][index]} · {currency}",
                    "plan_id": plans[currency][index].id,
                    "validity_days": [14, 30, 45][index],
                    "active": True,
                    "lines": [
                        {
                            "product_id": products[currency][index].id,
                            "variant_id": 0,
                            "quantity": 1,
                        },
                        {
                            "product_id": products[currency][4].id,
                            "variant_id": 0,
                            "quantity": 5 + index,
                        },
                    ],
                },
            )

    taxes = []
    for country, region, name, rate in [
        ("US", "CA", "California sample levy", "2.5"),
        ("US", "NY", "New York sample levy", "4"),
        ("CA", "ON", "Ontario sample tax", "13"),
        ("CA", "BC", "British Columbia sample tax", "12"),
        ("GB", "ENG", "UK sample VAT", "20"),
        ("DE", "BE", "Germany sample VAT", "19"),
        ("FR", "IDF", "France sample VAT", "20"),
        ("IN", "KA", "Karnataka sample GST", "18"),
        ("IN", "MH", "Maharashtra sample GST", "18"),
        ("AU", "NSW", "Australia sample GST", "10"),
    ]:
        taxes.append(
            record(
                "tax-rules",
                f"TAX-SAMPLE-{country}-{region}",
                {
                    "name": name,
                    "country": country,
                    "region": region,
                    "rate_percent": rate,
                    "effective_from": month_start(today, -24).isoformat(),
                    "effective_until": None,
                    "active": True,
                },
            ).payload
        )

    event_keys = set(session.execute(select(Event.kind, Event.record_id, Event.action)).all())
    taxes = [
        row.payload for row in session.scalars(select(Record).where(Record.kind == "tax-rules"))
    ]

    def activity(kind, row, action, on, detail=None):
        key = (kind, row.id, action)
        if key not in event_keys:
            session.add(
                Event(
                    kind=kind,
                    record_id=row.id,
                    action=action,
                    actor_id=admin.id if action in {"confirm", "close"} else staff.id,
                    detail=detail or {},
                    created_at=datetime.combine(on, datetime.min.time(), timezone.utc),
                )
            )
            event_keys.add(key)

    def subscription(number, customer, currency, index=0, status="active", plan_index=0):
        plan = plans[currency][plan_index]
        country, region = {
            "USD": ("US", "NY"),
            "EUR": ("DE", "BE"),
            "GBP": ("GB", "ENG"),
            "INR": ("IN", "KA"),
        }[currency]
        selected = [products[currency][index % 4], products[currency][4]]
        start = upcoming if status in {"draft", "quotation", "confirmed"} else beginning
        expiry = first if status in {"closed", "awaiting_renewal"} else future
        payload = {
            "customer_id": customer.id,
            "plan_id": plan.id,
            "plan_price": plan.payload["price"],
            "currency": currency,
            "billing_interval": plan.payload["billing_interval"],
            "start_date": start.isoformat(),
            "expiry_date": expiry.isoformat(),
            "next_billing_date": upcoming.isoformat(),
            "billing_anchor_day": 1,
            "payment_terms_days": [14, 21, 30][index % 3],
            "billing_country": country,
            "billing_region": region,
            "billing_timezone": "UTC",
            "validity_days": 30,
            "quote_expires_at": (today + timedelta(days=30)).isoformat(),
            **term_length(start, expiry),
            "lines": [
                {
                    "product_id": p.id,
                    "variant_id": 0,
                    "name": p.payload["name"],
                    "variant_name": "Standard",
                    "unit_price": p.payload["sales_price"],
                    "quantity": 1 if line == 0 else 3 + index % 8,
                    "currency": currency,
                }
                for line, p in enumerate(selected)
            ],
        }
        sub = record("subscriptions", number, payload, status, customer.id)
        stages = ["created"]
        if status != "draft":
            stages.append("quote")
        if status not in {"draft", "quotation"}:
            stages.append("confirm")
        if status not in {"draft", "quotation", "confirmed"}:
            stages.append("activate")
        if status in {"paused", "closed"}:
            stages.append("pause" if status == "paused" else "close")
        for action in stages:
            activity("subscriptions", sub, action, min(today, start))
        return sub

    financial = []
    for currency_index, currency in enumerate(products):
        for index in range(8):
            customer = (
                bakery
                if currency == "USD" and index < 4
                else customers[(currency_index * 8 + index) % len(customers)]
            )
            financial.append(
                subscription(f"SUB-SAMPLE-{currency}-{index + 1:02d}", customer, currency, index)
            )
    for index in range(28):
        customer = bakery if index < 4 else customers[index]
        status = [
            "draft",
            "quotation",
            "paused",
            "closed",
            "confirmed",
            "awaiting_renewal",
            "active",
        ][index % 7]
        subscription(f"SUB-SAMPLE-STAGE-{index + 1:02d}", customer, "USD", index, status, index % 4)

    invoices = {row.number: row for row in session.scalars(select(Invoice))}
    payment_keys = set(session.execute(select(Payment.invoice_id, Payment.note)).all())

    def settle(bill, value, on, part):
        note = f"Fictional settlement {part} · {bill.number}"
        if (bill.id, note) not in payment_keys:
            session.add(
                Payment(
                    invoice_id=bill.id,
                    amount=str(value),
                    currency=bill.snapshot["currency"],
                    method=["bank_transfer", "card", "cash", "other"][bill.id % 4],
                    paid_at=f"{on}T12:00:00+00:00",
                    note=note,
                )
            )
            payment_keys.add((bill.id, note))

    for offset in range(-11, 1):
        period = month_start(today, offset)
        for index, sub in enumerate(financial):
            number = f"INV-SAMPLE-{period:%Y%m}-{index + 1:02d}"
            if number in invoices:
                continue
            state = "paid"
            if offset >= -1:
                state = {0: "draft", 1: "canceled", 2: "confirmed", 3: "confirmed"}.get(
                    index % 8, "paid"
                )
            plan = session.get(Record, sub.payload["plan_id"])
            agreed_plan = {**plan.payload, "price": sub.payload["plan_price"]}
            historical_lines = [
                {**line, "quantity": max(1, line["quantity"] + offset // 3)} if position else line
                for position, line in enumerate(sub.payload["lines"])
            ]
            snapshot = invoice_amount(
                agreed_plan,
                historical_lines,
                [r.payload | {"id": r.id} for r in discounts],
                taxes,
                period,
                {
                    "country": sub.payload["billing_country"],
                    "region": sub.payload["billing_region"],
                },
            )
            customer = session.get(User, sub.owner_id)
            snapshot.update(
                {
                    "customer": {"id": customer.id, "name": customer.name, "email": customer.email},
                    "plan_name": plan.payload["name"],
                    "billing_timezone": "UTC",
                    "billing_country": sub.payload["billing_country"],
                    "billing_region": sub.payload["billing_region"],
                }
            )
            bill = Invoice(
                number=number,
                subscription_id=sub.id,
                customer_id=sub.owner_id,
                period_start=period.isoformat(),
                period_end=next_date(period, "monthly", 1).isoformat(),
                due_on=(period + timedelta(days=14)).isoformat(),
                status=state,
                snapshot=snapshot,
            )
            session.add(bill)
            session.flush()
            invoices[number] = bill
            total = money(snapshot["total"], snapshot["currency"])
            on = period.replace(day=min(20, today.day) if offset == 0 else 20)
            if state == "paid":
                if index % 3 == 0:
                    part = money(total * Decimal("0.4"), snapshot["currency"])
                    settle(bill, part, period.replace(day=min(10, on.day)), "deposit")
                    settle(bill, total - part, on, "balance")
                else:
                    settle(bill, total, on, "full")
            elif state == "confirmed" and index % 8 == 2:
                settle(bill, money(total * Decimal("0.35"), snapshot["currency"]), on, "partial")
            if state in {"confirmed", "paid"} and snapshot.get("discount_rule_id"):
                rule = next(r for r in discounts if r.id == snapshot["discount_rule_id"])
                rule.payload = {
                    **rule.payload,
                    "usage_count": rule.payload.get("usage_count", 0) + 1,
                }
            if state in {"confirmed", "paid"}:
                activity(
                    "outbox",
                    bill,
                    "invoice_sent",
                    min(today, period + timedelta(days=1)),
                    {"recipient": customer.email, "invoice_number": number, "delivery": "demo"},
                )
        record(
            "billing-runs",
            f"RUN-SAMPLE-{period:%Y%m}",
            {
                "due_on": period.isoformat(),
                "created_count": len(financial),
                "skipped_count": 4,
                "failed_count": 0,
                "failures": [],
            },
            "complete",
        )

    for index, sub in enumerate(financial[4:16]):
        status = ["pending", "rejected", "applied"][index % 3]
        request = record(
            "requests",
            f"REQ-SAMPLE-{index + 1:02d}",
            {"subscription_id": sub.id, "action": "renew", "quantity": 1},
            status,
            sub.owner_id,
        )
        activity("requests", request, "requested", today - timedelta(days=3))
        if status != "pending":
            activity("requests", request, "reject" if status == "rejected" else "applied", today)
