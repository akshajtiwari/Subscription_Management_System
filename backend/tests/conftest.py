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
