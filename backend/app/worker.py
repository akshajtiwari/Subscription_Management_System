"""Daily fictional billing runner. Run as a separate process in a demo deployment."""

import os
import time
from datetime import datetime, timezone

from sqlalchemy import select

from .db import Session, User, init_db
from .main import billing_run


def run_once():
    init_db()
    today = datetime.now(timezone.utc).date().isoformat()
    with Session() as session:
        admin = session.scalar(select(User).where(User.role == "admin"))
        if admin:
            return billing_run({"due_on": today}, f"scheduled-{today}", admin, session)
    return None


if __name__ == "__main__":
    interval = max(int(os.getenv("BILLING_POLL_SECONDS", "3600")), 60)
    while True:
        print(run_once(), flush=True)
        time.sleep(interval)
