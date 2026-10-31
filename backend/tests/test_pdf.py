from app.pdf import invoice_pdf


def test_invoice_pdf_contains_frozen_totals():
    invoice = {
        "number": "INV-1",
        "period_start": "2026-01-01",
        "period_end": "2026-02-01",
        "due_on": "2026-02-15",
        "currency": "USD",
        "plan_fee": "100.00",
        "lines": [{"name": "Seats", "quantity": 2, "unit_price": "10.00", "amount": "20.00"}],
        "subtotal": "120.00",
        "discount_total": "0.00",
        "tax_total": "6.00",
        "total": "126.00",
        "amount_paid": "25.00",
        "amount_due": "101.00",
    }
    pdf = invoice_pdf(invoice)
    assert pdf.startswith(b"%PDF-1.4")
    assert b"Amount due: USD 101.00" in pdf
    assert b"Seats x 2" in pdf


def test_long_invoices_are_paginated_without_losing_final_lines():
    invoice = {
        "number": "INV-LONG",
        "status": "confirmed",
        "customer": {"name": "José (Demo)", "email": "customer@example.test"},
        "period_start": "2026-01-01",
        "period_end": "2026-02-01",
        "due_on": "2026-02-15",
        "currency": "USD",
        "plan_fee": "100.00",
        "lines": [
            {"name": f"Product {index}", "quantity": 1, "unit_price": "1.00", "amount": "1.00"}
            for index in range(100)
        ],
        "subtotal": "200.00",
        "discount_total": "0.00",
        "tax_total": "0.00",
        "total": "200.00",
        "amount_paid": "0.00",
        "amount_due": "200.00",
    }
    pdf = invoice_pdf(invoice)
    assert pdf.count(b"/Type /Page ") >= 3
    assert b"Product 99" in pdf
    assert b"Jos\xe9 \\(Demo\\)" in pdf
    assert b"Amount due: USD 200.00" in pdf
    assert b"/WinAnsiEncoding" in pdf
