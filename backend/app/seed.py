"""Create fictional demo accounts and catalog records."""
from .db import Record, Session, User, init_db
from .main import hash_password


def seed():
    init_db()
    with Session() as session:
        if session.query(User).count():
            return
        admin = User(name="Akshaj Admin", email="admin@brightloop.demo", password_hash=hash_password("DemoAdmin!1"), role="admin")
        staff = User(name="Aarush Staff", email="staff@brightloop.demo", password_hash=hash_password("DemoStaff!1"), role="staff")
        customer = User(name="Bright Shop", email="customer@brightloop.demo", password_hash=hash_password("DemoCustomer!1"), role="customer")
        session.add_all([admin, staff, customer])
        session.flush()
        plan = Record(kind="plans", number="PLAN-001", status="active", payload={"name": "Business monthly", "price": "120.00", "currency": "USD", "billing_interval": "monthly", "minimum_quantity": 1, "allow_pause": True, "allow_early_close": True, "allow_renewal": True, "auto_close": False})
        product = Record(kind="products", number="PROD-001", status="active", payload={"name": "Business software", "type": "software", "sales_price": "30.00", "cost_price": "12.00", "currency": "USD", "variants": [{"name": "Odoo", "brand": "Odoo", "price_adjustment": "560.00"}]})
        session.add_all([plan, product])
        session.flush()
        session.add(Record(kind="subscriptions", number="SUB-001", owner_id=customer.id, status="active", payload={"customer_id": customer.id, "plan_id": plan.id, "start_date": "2026-10-01", "expiry_date": "2027-10-01", "next_billing_date": "2026-10-01", "payment_terms_days": 14, "lines": [{"product_id": product.id, "name": "Business software", "unit_price": "30.00", "quantity": 3, "currency": "USD"}]}))
        session.commit()


if __name__ == "__main__":
    seed()
