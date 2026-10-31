"""Small, dependency-free invoice PDF for fictional demo records."""


def invoice_pdf(invoice: dict) -> bytes:
    lines = [
        "BRIGHTLOOP SOFTWARE - DEMO INVOICE",
        f"Invoice {invoice['number']}",
        f"Billing period: {invoice['period_start']} to {invoice['period_end']}",
        f"Due on: {invoice['due_on']}",
        "",
        f"Plan fee: {invoice['currency']} {invoice['plan_fee']}",
    ]
    for line in invoice.get("lines", []):
        lines.append(f"{line.get('name', 'Product')} x {line['quantity']} at {line['unit_price']}: {invoice['currency']} {line['amount']}")
    lines += [
        "",
        f"Subtotal: {invoice['currency']} {invoice['subtotal']}",
        f"Discount: {invoice['currency']} {invoice['discount_total']}",
        f"Tax: {invoice['currency']} {invoice['tax_total']}",
        f"Total: {invoice['currency']} {invoice['total']}",
        f"Payments: {invoice['currency']} {invoice['amount_paid']}",
        f"Amount due: {invoice['currency']} {invoice['amount_due']}",
        "Fictional demo invoice. No payment is requested.",
    ]
    commands = ["BT /F1 11 Tf 50 780 Td 15 TL"]
    for index, line in enumerate(lines):
        safe = line.encode("ascii", "replace").decode().replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        commands.append(f"{'T* ' if index else ''}({safe[:110]}) Tj")
    commands.append("ET")
    stream = "\n".join(commands).encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
    ]
    result = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, body in enumerate(objects, 1):
        offsets.append(len(result))
        result += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(result)
    result += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        result += f"{offset:010d} 00000 n \n".encode()
    result += f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(result)
