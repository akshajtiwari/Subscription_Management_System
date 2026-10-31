from app.db import Invoice, Payment, Record


def test_reports_use_payment_dates_and_share_one_currency_snapshot(api):
    client, headers, sessions = api
    with sessions() as session:
        subscription = Record(
            kind="subscriptions", number="SUB-REPORT", owner_id=3, status="active", payload={}
        )
        session.add(subscription)
        session.flush()
        usd = Invoice(
            number="INV-USD",
            subscription_id=subscription.id,
            customer_id=3,
            period_start="2019-12-01",
            period_end="2020-01-01",
            due_on="2020-01-15",
            status="confirmed",
            snapshot={"total": "100.00", "currency": "USD"},
        )
        eur = Invoice(
            number="INV-EUR",
            subscription_id=subscription.id,
            customer_id=3,
            period_start="2020-01-01",
            period_end="2020-02-01",
            due_on="2020-01-20",
            status="confirmed",
            snapshot={"total": "50.00", "currency": "EUR"},
        )
        draft = Invoice(
            number="INV-DRAFT",
            subscription_id=subscription.id,
            customer_id=3,
            period_start="2020-02-01",
            period_end="2020-03-01",
            due_on="2020-01-25",
            status="draft",
            snapshot={"total": "500.00", "currency": "USD"},
        )
        session.add_all([usd, eur, draft])
        session.flush()
        session.add_all(
            [
                Payment(
                    invoice_id=usd.id,
                    amount="10.00",
                    currency="USD",
                    method="cash",
                    paid_at="2020-01-20T12:00:00Z",
                ),
                Payment(
                    invoice_id=usd.id,
                    amount="15.00",
                    currency="USD",
                    method="cash",
                    paid_at="2020-02-20T12:00:00Z",
                ),
                Payment(
                    invoice_id=eur.id,
                    amount="2.00",
                    currency="EUR",
                    method="cash",
                    paid_at="2020-01-20T12:00:00Z",
                ),
            ]
        )
        session.commit()
    response = client.get(
        "/api/v1/reports/summary?start=2020-01-01&end=2020-01-31", headers=headers["staff"]
    )
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["overview"]["currencies"]["USD"]["collections"] == "10.00"
    assert report["overview"]["currencies"]["USD"]["outstanding"] == "75.00"
    assert report["overview"]["currencies"]["EUR"]["outstanding"] == "48.00"
    assert len(report["overdue"]) == 2
    january = next(point for point in report["series"] if point["currency"] == "USD")
    assert january["outstanding"] == "90.00"
    assert january["overdue_invoice_count"] == 1
    history = client.get(
        "/api/v1/reports/summary?start=2020-01-01&end=2020-02-29", headers=headers["staff"]
    ).json()["series"]
    february = next(
        point for point in history if point["currency"] == "USD" and point["period"] == "2020-02"
    )
    assert february["outstanding"] == "75.00"
    assert february["collections"] == "15.00"
    for currency, values in report["overview"]["currencies"].items():
        assert sum(
            float(point["collections"])
            for point in report["series"]
            if point["currency"] == currency
        ) == float(values["collections"])
    assert client.get("/api/v1/reports/summary", headers=headers["customer"]).status_code == 403
    assert (
        client.get(
            "/api/v1/reports/summary?start=2020-02-01&end=2020-01-01", headers=headers["admin"]
        ).status_code
        == 422
    )
    assert (
        client.get("/api/v1/reports/summary?start=2020-02-30", headers=headers["admin"]).status_code
        == 422
    )
