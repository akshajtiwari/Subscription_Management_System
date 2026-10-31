"""Create a coherent fictional workspace without replacing existing records."""

from datetime import date, datetime, timezone

from sqlalchemy import select

from .db import Event, Invoice, Payment, Record, Session, User, init_db
from .main import hash_password
from .rules import invoice_amount, next_date, term_length


def seed():
    init_db()
    with Session() as session:
        users = {user.email: user for user in session.scalars(select(User))}
        passwords = {}

        def person(email, name, role, password):
            if email not in users:
                if password not in passwords:
                    passwords[password] = hash_password(password)
                user = User(name=name, email=email, role=role, password_hash=passwords[password])
                session.add(user)
                session.flush()
                users[email] = user
            return users[email]

        admin = person("admin@brightloop.demo", "Alex Morgan", "admin", "DemoAdmin!1")
        staff = person("staff@brightloop.demo", "Sam Lee", "staff", "DemoStaff!1")
        bakery = person(
            "customer@brightloop.demo", "Brightloop Bakery", "customer", "DemoCustomer!1"
        )
        northstar = person("ops@northstar.example", "Northstar Labs", "customer", "DemoCustomer!1")
        studio = person("hello@acme.example", "Acme Studio", "customer", "DemoCustomer!1")
        moss = person("accounts@moss.example", "Moss & Co", "customer", "DemoCustomer!1")
        existing = {
            (record.kind, record.number): record for record in session.scalars(select(Record))
        }

        def record(kind, number, payload, status="active", owner=None):
            key = (kind, number)
            if key not in existing:
                row = Record(
                    kind=kind, number=number, payload=payload, status=status, owner_id=owner
                )
                session.add(row)
                session.flush()
                existing[key] = row
            return existing[key]

        product = record(
            "products",
            "PROD-SUITE",
            {
                "name": "Business Suite",
                "type": "software",
                "sku": "SW-001",
                "sales_price": "1200.00",
                "cost_price": "480.00",
                "currency": "USD",
                "notes": "",
                "active": True,
                "variants": [
                    {
                        "name": "Standard",
                        "brand": "Brightloop",
                        "sku": "SW-001-S",
                        "price_adjustment": "0.00",
                        "active": True,
                    },
                    {
                        "name": "Odoo",
                        "brand": "Odoo",
                        "sku": "SW-001-O",
                        "price_adjustment": "560.00",
                        "active": True,
                    },
                ],
            },
        )
        seats = record(
            "products",
            "PROD-SEATS",
            {
                "name": "Additional seats",
                "type": "add_on",
                "sku": "ADD-010",
                "sales_price": "560.00",
                "cost_price": "100.00",
                "currency": "USD",
                "notes": "",
                "variants": [
                    {
                        "name": "Per seat",
                        "brand": "Brightloop",
                        "sku": "ADD-010",
                        "price_adjustment": "0.00",
                        "active": True,
                    }
                ],
                "active": True,
            },
        )
        record(
            "products",
            "PROD-ANALYTICS",
            {
                "name": "Analytics add-on",
                "type": "add_on",
                "sku": "ADD-020",
                "sales_price": "320.00",
                "cost_price": "80.00",
                "currency": "USD",
                "notes": "",
                "variants": [],
                "active": True,
            },
        )
        record(
            "products",
            "PROD-SUPPORT",
            {
                "name": "Priority support",
                "type": "service",
                "sku": "ADD-030",
                "sales_price": "400.00",
                "cost_price": "120.00",
                "currency": "USD",
                "notes": "",
                "variants": [],
                "active": True,
            },
        )
        flags = {
            "minimum_quantity": 1,
            "available_from": None,
            "available_until": None,
            "allow_pause": True,
            "allow_early_close": True,
            "allow_renewal": True,
            "auto_close": False,
            "active": True,
        }
        plan = record(
            "plans",
            "PLAN-GROWTH",
            {
                "name": "Growth monthly",
                "price": "1200.00",
                "currency": "USD",
                "billing_interval": "monthly",
                **flags,
            },
        )
        annual = record(
            "plans",
            "PLAN-ENTERPRISE",
            {
                "name": "Enterprise annual",
                "price": "12000.00",
                "currency": "USD",
                "billing_interval": "yearly",
                **flags,
            },
        )
        tax = {
            "name": "Standard tax",
            "rate_percent": "10",
            "country": "US",
            "region": "",
            "effective_from": "2026-01-01",
            "effective_until": None,
            "active": True,
        }
        record("tax-rules", "TAX-STANDARD", tax)
        discount = record(
            "discount-rules",
            "DISC-SEATS",
            {
                "name": "Team seats",
                "kind": "percentage",
                "value": "50",
                "currency": "USD",
                "scope": "products",
                "product_ids": [seats.id],
                "minimum_purchase": "0",
                "minimum_quantity": 2,
                "starts_on": "2026-01-01",
                "ends_on": "2027-12-31",
                "usage_limit": 30,
                "usage_count": 10,
                "active": True,
            },
        )
        record(
            "discount-rules",
            "DISC-LAUNCH",
            {
                "name": "Launch offer",
                "kind": "fixed",
                "value": "100",
                "currency": "USD",
                "scope": "subscription",
                "product_ids": [],
                "minimum_purchase": "1000",
                "minimum_quantity": 1,
                "starts_on": "2026-01-01",
                "ends_on": "2026-09-30",
                "usage_limit": 100,
                "usage_count": 12,
                "active": False,
            },
            "inactive",
        )
        record(
            "quotation-templates",
            "TPL-ENTERPRISE",
            {
                "name": "Enterprise offer",
                "plan_id": annual.id,
                "validity_days": 30,
                "active": True,
                "lines": [{"product_id": product.id, "variant_id": 1, "quantity": 5}],
            },
        )

        def subscription(number, customer, status="active", lines=None):
            start, expiry = date(2026, 10, 1), date(2027, 9, 30)
            return record(
                "subscriptions",
                number,
                {
                    "customer_id": customer.id,
                    "plan_id": plan.id,
                    "plan_price": "1200.00",
                    "currency": "USD",
                    "billing_interval": "monthly",
                    "start_date": start.isoformat(),
                    "expiry_date": expiry.isoformat(),
                    "next_billing_date": "2026-11-01",
                    "billing_anchor_day": 1,
                    "payment_terms_days": 14,
                    "billing_country": "US",
                    "billing_region": "",
                    "billing_timezone": "UTC",
                    "validity_days": 30,
                    "quote_expires_at": "2026-11-30",
                    **term_length(start, expiry),
                    "lines": lines
                    or [
                        {
                            "product_id": product.id,
                            "variant_id": 1,
                            "name": "Business Suite",
                            "variant_name": "Odoo",
                            "unit_price": "1760.00",
                            "quantity": 1,
                            "currency": "USD",
                        },
                        {
                            "product_id": seats.id,
                            "variant_id": 0,
                            "name": "Additional seats",
                            "variant_name": "Per seat",
                            "unit_price": "560.00",
                            "quantity": 1,
                            "currency": "USD",
                        },
                    ],
                },
                status,
                customer.id,
            )

        # Background records make the sample overview and pagination representative.
        bulk = [
            subscription(f"SUB-DEMO-{index:04d}", studio if index % 2 else moss)
            for index in range(1, 1282)
        ]
        bakery_active = subscription("SUB-1021", bakery)
        subscription("SUB-1022", bakery)
        subscription("SUB-1023", bakery, "quotation")
        primary = subscription("SUB-1024", northstar)
        primary_events = list(
            session.scalars(
                select(Event).where(Event.kind == "subscriptions", Event.record_id == primary.id)
            )
        )
        if not primary_events:
            for action, actor, day in [
                ("created", staff, 1),
                ("quote", staff, 2),
                ("confirm", admin, 5),
                ("activate", admin, 6),
            ]:
                session.add(
                    Event(
                        kind="subscriptions",
                        record_id=primary.id,
                        action=action,
                        actor_id=actor.id,
                        detail={},
                        created_at=datetime(2026, 10, day, 12, tzinfo=timezone.utc),
                    )
                )

        invoices = {invoice.number: invoice for invoice in session.scalars(select(Invoice))}

        def invoice(number, sub, total, start, due, status="confirmed", snapshot=None):
            if number in invoices:
                return invoices[number]
            customer = session.get(User, sub.owner_id)
            snapshot = snapshot or invoice_amount(
                {"name": "Growth monthly", "price": "0.00", "currency": "USD"},
                [
                    {
                        "product_id": product.id,
                        "name": "Business Suite",
                        "unit_price": str(total),
                        "quantity": 1,
                        "currency": "USD",
                    }
                ],
                [],
                [],
                date.fromisoformat(start),
            )
            snapshot = {
                **snapshot,
                "customer": {"id": customer.id, "name": customer.name, "email": customer.email},
                "plan_name": "Growth monthly",
                "billing_timezone": "UTC",
                "billing_country": "US",
                "billing_region": "",
            }
            row = Invoice(
                number=number,
                subscription_id=sub.id,
                customer_id=customer.id,
                period_start=start,
                period_end=next_date(date.fromisoformat(start), "monthly", 1).isoformat(),
                due_on=due,
                status=status,
                snapshot=snapshot,
            )
            session.add(row)
            session.flush()
            invoices[number] = row
            return row

        def payment(bill, amount, paid_on, note):
            if not session.scalar(
                select(Payment).where(Payment.invoice_id == bill.id, Payment.note == note)
            ):
                session.add(
                    Payment(
                        invoice_id=bill.id,
                        amount=str(amount),
                        currency="USD",
                        method="bank_transfer",
                        paid_at=f"{paid_on}T12:00:00+00:00",
                        note=note,
                    )
                )

        for month, total in [
            (5, 142000),
            (6, 167800),
            (7, 182400),
            (8, 190400),
            (9, 176600),
            (10, 207000),
        ]:
            start = f"2026-{month:02d}-01"
            historical = invoice(f"INV-DEMO-2026-{month:02d}", bulk[0], total, start, start, "paid")
            payment(historical, total, f"2026-{month:02d}-28", "Fictional monthly collection")
        for index in range(16):
            total = 3200 if index == 15 else 2800
            historical = invoice(
                f"INV-DEMO-AUG-{index + 1:02d}",
                bulk[index + 100],
                total,
                "2026-08-01",
                "2026-08-15",
                "paid",
            )
            payment(historical, total, "2026-09-28", "Fictional August settlement")
        for index in range(18):
            total = 2600 if index == 17 else 2200
            historical = invoice(
                f"INV-DEMO-SEP-{index + 1:02d}",
                bulk[index + 120],
                total,
                "2026-09-01",
                "2026-09-15",
                "paid",
            )
            payment(historical, total, "2026-10-28", "Fictional September settlement")
        paid = invoice("INV-2046", bakery_active, 1200, "2026-09-01", "2026-09-15", "paid")
        payment(paid, 1200, "2026-10-28", "Fictional customer payment")
        for index in range(23):
            total = 1600 if index == 0 else 1200
            bill = invoice(
                f"INV-DEMO-OVERDUE-{index + 1:02d}",
                bulk[index + 1],
                total,
                "2026-10-01",
                "2026-10-15",
            )
            if index == 0:
                payment(bill, 400, "2026-10-28", "Fictional partial payment")
        for index in range(8):
            invoice(
                f"INV-DEMO-DUE-{index + 1:02d}", bulk[index + 30], 1200, "2026-10-01", "2026-10-31"
            )
        snapshot = invoice_amount(
            {"name": "Growth monthly", "price": "0.00", "currency": "USD"},
            [
                {
                    "product_id": product.id,
                    "name": "Business Suite",
                    "variant_name": "Standard",
                    "unit_price": "1000.00",
                    "quantity": 1,
                    "currency": "USD",
                },
                {
                    "product_id": seats.id,
                    "name": "Additional seats",
                    "unit_price": "200.00",
                    "quantity": 2,
                    "currency": "USD",
                },
            ],
            [{**discount.payload, "id": discount.id}],
            [tax],
            date(2026, 10, 1),
            {"country": "US"},
        )
        invoice("INV-2047", bakery_active, 1200, "2026-10-01", "2026-10-15")
        invoice("INV-2048", primary, 1320, "2026-11-01", "2026-11-15", "draft", snapshot=snapshot)
        record(
            "billing-runs",
            "RUN-DEMO-1031",
            {
                "due_on": "2026-10-31",
                "created_count": 2,
                "skipped_count": 1,
                "failed_count": 1,
                "failures": [{"subscription_id": primary.id, "reason": "too_many_periods"}],
            },
            "complete_with_errors",
        )
        record(
            "requests",
            "REQ-DEMO-001",
            {"subscription_id": bakery_active.id, "action": "pause", "quantity": 1},
            "pending",
            bakery.id,
        )
        if not session.scalar(
            select(Event).where(
                Event.kind == "outbox", Event.record_id == paid.id, Event.action == "invoice_sent"
            )
        ):
            session.add(
                Event(
                    kind="outbox",
                    record_id=paid.id,
                    action="invoice_sent",
                    actor_id=staff.id,
                    detail={
                        "recipient": bakery.email,
                        "invoice_number": paid.number,
                        "delivery": "demo",
                    },
                )
            )
        session.commit()


if __name__ == "__main__":
    seed()
