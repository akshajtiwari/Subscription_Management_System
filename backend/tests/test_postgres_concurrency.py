import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.db import Base, Record, User
from app.main import app, db, hash_password, token


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL"), reason="Requires the PostgreSQL test service"
)
def test_concurrent_billing_and_payments_cannot_duplicate_or_overallocate():
    engine = create_engine(os.environ["TEST_DATABASE_URL"])
    schema = "brightloop_test_" + uuid4().hex
    with engine.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
    scoped = engine.execution_options(schema_translate_map={None: schema})
    Base.metadata.create_all(scoped)
    sessions = sessionmaker(scoped, expire_on_commit=False)
    try:
        with sessions() as session:
            admin = User(
                name="Admin",
                email="admin@example.test",
                role="admin",
                password_hash=hash_password("Password!1"),
            )
            customer = User(
                name="Customer",
                email="customer@example.test",
                role="customer",
                password_hash=hash_password("Password!1"),
            )
            session.add_all([admin, customer])
            session.flush()
            plan = Record(
                kind="plans",
                number="PLAN-TEST",
                status="active",
                payload={
                    "name": "Monthly",
                    "price": "100.00",
                    "currency": "USD",
                    "billing_interval": "monthly",
                    "allow_renewal": True,
                },
            )
            session.add(plan)
            session.flush()
            subscription = Record(
                kind="subscriptions",
                number="SUB-TEST",
                status="active",
                owner_id=customer.id,
                payload={
                    "plan_id": plan.id,
                    "currency": "USD",
                    "start_date": date.today().isoformat(),
                    "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
                    "lines": [
                        {
                            "product_id": 1,
                            "name": "Seats",
                            "quantity": 1,
                            "unit_price": "20.00",
                            "currency": "USD",
                        }
                    ],
                },
            )
            session.add(subscription)
            session.commit()
            headers = {"Authorization": f"Bearer {token(admin.id)}"}

        def override_db():
            with sessions() as session:
                yield session

        app.dependency_overrides[db] = override_db
        client = TestClient(app)

        def bill(_):
            return client.post(
                "/api/v1/billing-runs",
                json={"due_on": date.today().isoformat()},
                headers={**headers, "Idempotency-Key": "concurrent-billing"},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(bill, range(2)))
        assert [response.status_code for response in responses] == [202, 202]
        assert responses[0].json()["id"] == responses[1].json()["id"]
        invoices = client.get("/api/v1/invoices", headers=headers).json()["data"]
        assert len(invoices) == 1
        invoice = invoices[0]
        assert (
            client.post(
                f"/api/v1/invoices/{invoice['id']}/confirm",
                headers={**headers, "If-Match": str(invoice["version"])},
            ).status_code
            == 200
        )

        def pay(index):
            return client.post(
                f"/api/v1/invoices/{invoice['id']}/payments",
                json={"amount": "100", "currency": "USD", "method": "cash"},
                headers={**headers, "Idempotency-Key": f"competing-payment-{index}"},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(pay, range(2)))
        assert sorted(response.status_code for response in responses) == [201, 422]
        balance = client.get(f"/api/v1/invoices/{invoice['id']}", headers=headers).json()
        assert balance["amount_paid"] == "100.00"
        assert balance["amount_due"] == "20.00"

        def final(_):
            return client.post(
                f"/api/v1/invoices/{invoice['id']}/payments",
                json={"amount": "20", "currency": "USD", "method": "cash"},
                headers={**headers, "Idempotency-Key": "one-final-payment"},
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(final, range(2)))
        assert [response.status_code for response in responses] == [201, 201]
        assert (
            client.get(f"/api/v1/invoices/{invoice['id']}", headers=headers).json()["amount_due"]
            == "0.00"
        )
        assert len(client.get("/api/v1/payments", headers=headers).json()["data"]) == 2
    finally:
        app.dependency_overrides.clear()
        with engine.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        engine.dispose()
