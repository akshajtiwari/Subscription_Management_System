from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, User
from app.main import app, db, hash_password, token


def test_signup_to_partial_payment_and_repeat_billing():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False)
    with sessions() as session:
        admin = User(name="Admin", email="admin@example.test", password_hash=hash_password("AdminPass!1"), role="admin")
        session.add(admin)
        session.commit()
        admin_id = admin.id

    def override_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[db] = override_db
    try:
        client = TestClient(app)
        admin_headers = {"Authorization": f"Bearer {token(admin_id)}"}
        signup = client.post("/api/v1/auth/register", json={"name": "Customer", "email": "Customer@Example.test", "password": "CustomerPass!1"})
        assert signup.status_code == 201
        customer_id = signup.json()["user"]["id"]
        assert signup.json()["user"]["role"] == "customer"
        assert client.post("/api/v1/auth/register", json={"name": "Second", "email": "customer@example.test", "password": "CustomerPass!1"}).status_code == 409
        assert client.post("/api/v1/auth/register", json={"name": "Weak", "email": "weak@example.test", "password": "password"}).status_code == 422
        customer_headers = {"Authorization": f"Bearer {token(customer_id)}"}
        assert client.post("/api/v1/staff", json={"name": "No", "email": "staff@example.test", "password": "StaffPass!1"}, headers=customer_headers).status_code == 403

        product = client.post("/api/v1/products", json={"payload": {"name": "Seats", "sales_price": "20.00", "cost_price": "8.00", "currency": "USD"}}, headers=admin_headers).json()
        plan = client.post("/api/v1/plans", json={"payload": {"name": "Monthly", "price": "100.00", "currency": "USD", "billing_interval": "monthly", "minimum_quantity": 1, "allow_renewal": True}}, headers=admin_headers).json()
        today = date.today()
        body = {"payload": {"customer_id": customer_id, "plan_id": plan["id"], "start_date": today.isoformat(), "expiry_date": (today + timedelta(days=365)).isoformat(), "payment_terms_days": 14, "lines": [{"product_id": product["id"], "quantity": 2, "unit_price": "0.01"}]}}
        created = client.post("/api/v1/subscriptions", json=body, headers=admin_headers)
        assert created.status_code == 201
        subscription = created.json()
        assert subscription["lines"][0]["unit_price"] == "20.00"
        assert client.get(f"/api/v1/subscriptions/{subscription['id']}", headers=customer_headers).status_code == 200
        for action in ["quote", "confirm", "activate"]:
            result = client.post(f"/api/v1/subscriptions/{subscription['id']}/{action}", headers={**admin_headers, "If-Match": str(subscription["version"])})
            assert result.status_code == 200, result.text
            subscription = result.json()
        run_headers = {**admin_headers, "Idempotency-Key": "run-1"}
        first = client.post("/api/v1/billing-runs", json={"due_on": today.isoformat()}, headers=run_headers)
        assert first.status_code == 202, first.text
        assert first.json()["created_count"] == 1
        repeated = client.post("/api/v1/billing-runs", json={"due_on": today.isoformat()}, headers=run_headers)
        assert repeated.json()["id"] == first.json()["id"]
        invoices = client.get("/api/v1/invoices", headers=admin_headers).json()["data"]
        assert len(invoices) == 1
        invoice = invoices[0]
        assert invoice["total"] == "140.00"
        confirmed = client.post(f"/api/v1/invoices/{invoice['id']}/confirm", headers={**admin_headers, "If-Match": str(invoice["version"])})
        assert confirmed.status_code == 200
        payment = client.post(f"/api/v1/invoices/{invoice['id']}/payments", json={"amount": "40.00", "currency": "USD", "method": "bank_transfer"}, headers={**admin_headers, "Idempotency-Key": "payment-1"})
        assert payment.status_code == 201
        assert payment.json()["amount_due"] == "100.00"
        assert client.get(f"/api/v1/invoices/{invoice['id']}/pdf", headers=customer_headers).content.startswith(b"%PDF")
    finally:
        app.dependency_overrides.clear()
