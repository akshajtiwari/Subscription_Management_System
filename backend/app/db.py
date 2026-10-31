import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(16))
    active: Mapped[bool] = mapped_column(default=True)


class Record(Base):
    __tablename__ = "records"
    __table_args__ = (UniqueConstraint("kind", "number"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    number: Mapped[str] = mapped_column(String(40))
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (UniqueConstraint("subscription_id", "period_start", "period_end"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(40), unique=True)
    subscription_id: Mapped[int] = mapped_column(ForeignKey("records.id"), index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    period_start: Mapped[str] = mapped_column(String(10))
    period_end: Mapped[str] = mapped_column(String(10))
    due_on: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(16), default="draft")
    version: Mapped[int] = mapped_column(Integer, default=1)
    snapshot: Mapped[dict] = mapped_column(JSON)


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    amount: Mapped[str] = mapped_column(String(32))
    currency: Mapped[str] = mapped_column(String(3))
    method: Mapped[str] = mapped_column(String(32))
    paid_at: Mapped[str] = mapped_column(String(40))
    note: Mapped[str] = mapped_column(String(1000), default="")


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    record_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(60))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Idempotency(Base):
    __tablename__ = "idempotency"
    key: Mapped[str] = mapped_column(String(180), primary_key=True)
    action: Mapped[str] = mapped_column(String(100))
    result: Mapped[dict] = mapped_column(JSON)


url = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{(Path(__file__).resolve().parents[1] / 'brightloop.db').as_posix()}",
)
engine = create_engine(
    url,
    connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
    pool_pre_ping=True,
)
Session = sessionmaker(engine, expire_on_commit=False)


def init_db():
    Base.metadata.create_all(engine)
