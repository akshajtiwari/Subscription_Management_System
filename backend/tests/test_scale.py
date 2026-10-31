from time import perf_counter

from sqlalchemy import insert, select

from app.db import Invoice, Payment, Record


def test_lists_and_reports_respond_under_two_seconds_at_demo_scale(api):
    client, headers, sessions = api
    with sessions() as session:
        plan = Record(
            kind="plans",
            number="PLAN-SCALE",
            status="active",
            payload={
                "name": "Monthly",
                "price": "100.00",
                "currency": "USD",
                "billing_interval": "monthly",
                "allow_pause": True,
            },
        )
        session.add(plan)
        session.flush()
        line = {
            "product_id": 1,
            "name": "Seats",
            "quantity": 1,
            "unit_price": "20.00",
            "currency": "USD",
        }
        payload = {
            "customer_id": 3,
            "plan_id": plan.id,
            "start_date": "2020-01-01",
            "expiry_date": "2030-01-01",
            "next_billing_date": "2027-01-01",
            "currency": "USD",
            "lines": [line],
        }
        session.execute(
            insert(Record),
            [
                {
                    "kind": "subscriptions",
                    "number": f"SUB-SCALE-{index:05d}",
                    "owner_id": 3,
                    "status": "active",
                    "payload": payload,
                }
                for index in range(5000)
            ],
        )
        session.flush()
        ids = list(
            session.scalars(select(Record.id).where(Record.kind == "subscriptions").limit(1000))
        )
        snapshot = {
            "currency": "USD",
            "total": "120.00",
            "subtotal": "120.00",
            "discount_total": "0.00",
            "tax_total": "0.00",
            "plan_fee": "100.00",
            "lines": [line],
        }
        session.execute(
            insert(Invoice),
            [
                {
                    "number": f"INV-SCALE-{index:05d}",
                    "subscription_id": identifier,
                    "customer_id": 3,
                    "period_start": "2020-01-01",
                    "period_end": "2020-02-01",
                    "due_on": "2020-01-15",
                    "status": "confirmed",
                    "snapshot": snapshot,
                }
                for index, identifier in enumerate(ids)
            ],
        )
        session.flush()
        invoice_ids = list(session.scalars(select(Invoice.id)))
        session.execute(
            insert(Payment),
            [
                {
                    "invoice_id": identifier,
                    "amount": "20.00",
                    "currency": "USD",
                    "method": "cash",
                    "paid_at": "2020-01-20T12:00:00Z",
                    "note": "",
                }
                for identifier in invoice_ids
            ],
        )
        session.commit()
    for path in [
        "/api/v1/subscriptions?limit=25",
        "/api/v1/invoices?limit=25",
        "/api/v1/reports/summary",
    ]:
        times = []
        for _ in range(5):
            start = perf_counter()
            response = client.get(path, headers=headers["staff"])
            times.append(perf_counter() - start)
            assert response.status_code == 200, response.text
        assert max(times) < 2.0, f"{path} took {max(times):.3f}s"
    summary = client.get("/api/v1/reports/summary", headers=headers["staff"]).json()["overview"]
    assert summary["active_subscriptions"] == 5000
    assert summary["currencies"]["USD"]["outstanding"] == "100000.00"
