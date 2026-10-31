import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, User
from app.main import app, db, hash_password, token


@pytest.fixture
def api():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False)
    headers = {}
    with sessions() as session:
        for role in ["admin", "staff", "customer"]:
            user = User(
                name=role.title(),
                email=f"{role}@example.test",
                role=role,
                password_hash=hash_password("ValidPassword!1"),
            )
            session.add(user)
            session.flush()
            headers[role] = {"Authorization": f"Bearer {token(user.id)}"}
        session.commit()

    def override_db():
        with sessions() as session:
            yield session

    app.dependency_overrides[db] = override_db
    try:
        yield TestClient(app), headers, sessions
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


@pytest.fixture
def subscription_factory(api):
    from datetime import date, timedelta

    client, headers, _ = api

    def create(plan_price="100", product_price="20", currency="USD"):
        product = client.post(
            "/api/v1/products",
            json={"payload": {"name": "Seats", "sales_price": product_price, "currency": currency}},
            headers=headers["admin"],
        ).json()
        plan = client.post(
            "/api/v1/plans",
            json={
                "payload": {
                    "name": "Monthly",
                    "price": plan_price,
                    "currency": currency,
                    "billing_interval": "monthly",
                    "allow_pause": True,
                    "allow_renewal": True,
                    "allow_early_close": True,
                }
            },
            headers=headers["admin"],
        ).json()
        today = date.today()
        response = client.post(
            "/api/v1/subscriptions",
            json={
                "payload": {
                    "customer_id": 3,
                    "plan_id": plan["id"],
                    "start_date": today.isoformat(),
                    "expiry_date": (today + timedelta(days=365)).isoformat(),
                    "lines": [{"product_id": product["id"], "quantity": 1}],
                }
            },
            headers=headers["admin"],
        )
        assert response.status_code == 201, response.text
        subscription = response.json()
        for action in ["quote", "confirm", "activate"]:
            response = client.post(
                f"/api/v1/subscriptions/{subscription['id']}/{action}",
                headers={**headers["admin"], "If-Match": str(subscription["version"])},
            )
            assert response.status_code == 200, response.text
            subscription = response.json()
        return subscription, product, plan

    return create
