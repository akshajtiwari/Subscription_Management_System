"""Dependency-free, paginated PDF output for fictional invoice snapshots."""

from textwrap import wrap


def invoice_pdf(invoice: dict) -> bytes:
    currency = invoice["currency"]
    lines = [
        "BRIGHTLOOP SOFTWARE - DEMO INVOICE",
        f"Invoice {invoice['number']}",
        f"Status: {invoice.get('status', 'confirmed').title()}",
    ]
    customer = invoice.get("customer", {})
    if customer:
        lines += [f"Bill to: {customer.get('name', '')}", customer.get("email", "")]
    lines += [
        f"Billing period: {invoice['period_start']} to {invoice['period_end']}",
        f"Due on: {invoice['due_on']}",
        "",
    ]
    plan = invoice.get("plan_line", {})
    lines.append(
        f"{invoice.get('plan_name', 'Plan fee')} x 1 at {invoice['plan_fee']}: {currency} {plan.get('line_total', invoice['plan_fee'])}"
    )
    if plan:
        lines.append(
            f"  Discount: {currency} {plan.get('discount', '0')} | Tax: {currency} {plan.get('tax_total', '0')}"
        )
    for line in invoice.get("lines", []):
        name = line.get("name", "Product")
        if line.get("variant_name"):
            name += f" - {line['variant_name']}"
        lines.append(
            f"{name} x {line['quantity']} at {line['unit_price']}: {currency} {line.get('line_total', line['amount'])}"
        )
        if "discount" in line or "tax_total" in line:
            lines.append(
                f"  Discount: {currency} {line.get('discount', '0')} | Tax: {currency} {line.get('tax_total', '0')}"
            )
    lines += [
        "",
        f"Subtotal: {currency} {invoice['subtotal']}",
        f"Discount: {currency} {invoice['discount_total']}",
        *[
            f"{tax['name']} ({tax['rate_percent']}%): {currency} {tax['amount']}"
            for tax in invoice.get("taxes", [])
        ],
        f"Tax total: {currency} {invoice['tax_total']}",
        f"Total: {currency} {invoice['total']}",
        f"Payments: {currency} {invoice['amount_paid']}",
        f"Amount due: {currency} {invoice['amount_due']}",
    ]
    wrapped = []
    for line in lines:
        wrapped.extend(wrap(str(line).replace("\r", " ").replace("\n", " "), width=94) or [""])
    pages = [wrapped[index : index + 43] for index in range(0, len(wrapped), 43)]
    kids = " ".join(f"{4 + index * 2} 0 R" for index in range(len(pages)))
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    ]
    for index, page in enumerate(pages):
        content = [
            f"{invoice['number']} - Page {index + 1} of {len(pages)}",
            "",
            *page,
            "",
            "Fictional demo invoice. No payment is requested.",
        ]
        commands = [b"BT /F1 10 Tf 48 788 Td 15 TL"]
        for offset, line in enumerate(content):
            safe = (
                line.encode("cp1252", "replace")
                .replace(b"\\", b"\\\\")
                .replace(b"(", b"\\(")
                .replace(b")", b"\\)")
            )
            commands.append((b"T* " if offset else b"") + b"(" + safe + b") Tj")
        commands.append(b"ET")
        stream = b"\n".join(commands)
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {5 + index * 2} 0 R >>".encode()
        )
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
    result = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, body in enumerate(objects, 1):
        offsets.append(len(result))
        result += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(result)
    result += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        result += f"{offset:010d} 00000 n \n".encode()
    result += (
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(result)
