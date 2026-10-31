# Brightloop API Contract · Proposed v1

**Status:** Review-ready proposal, not an implemented API. **Source:** `Subscription_Management_System.pdf`. The frontend owns display text and visual design; the API supplies data and stable error codes.

The PDF specifies the workflows and roles, but not every billing policy. **Required** below means stated by the PDF. **Proposed** means an implementation choice needed to make an interface testable. Open decisions at the end must be settled before financial calculations go live.

## 1. Protocol and shared types

- Base URL: `/api/v1`. JSON requests and responses use UTF-8; invoice PDF downloads use `application/pdf`.
- Authenticated calls send `Authorization: Bearer <access_token>`. The access token identifies one `admin`, `staff`, or `customer` account. Refresh uses a secure, HttpOnly, SameSite cookie. TLS is required outside local development.
- IDs and human-readable numbers are different: IDs are opaque strings (`sub_...`); `number` values such as `SUB-1024` are server-generated and unique.
- `Date` is `YYYY-MM-DD`; `DateTime` is RFC 3339 in UTC. APIs return the original billing date separately from timestamps. All monetary calculations use decimal arithmetic, never binary floating point.
- `Money` is `{ "amount": "1200.00", "currency": "INR" }`, where `currency` is an ISO 4217 code. `INR` is an **example only**; supported currency and rounding are open decisions. Request amounts are decimal strings with at most two fractional digits until currency precision is decided.
- Collection responses are `{ "data": [...], "next_cursor": "..." | null }`. `limit` defaults to 25, maximum 100. `cursor` is opaque. Lists sort newest first with ID as a stable tie breaker unless an endpoint says otherwise. `search` matches human-readable identifiers and names; domain filters are listed below.
- `POST` create returns `201`; reads and successful actions return `200`; successful no-body actions return `204`. A missing or inaccessible object returns `404`. `PATCH` accepts only documented editable fields; omitted fields are unchanged and `null` clears a nullable field.
- Mutable resources expose `version` and an `ETag` header. `PATCH` and state-changing actions require `If-Match: "<version>"`; stale versions return `412 precondition_failed` and the client reloads the resource before retrying.
- Every financial mutation and billing run requires `Idempotency-Key` (a unique client-generated string). The same key and same payload return the original result; the same key with different input returns `409 idempotency_conflict`. Keys are scoped to the caller and endpoint and retained for at least 24 hours (**proposed**).

### Error envelope

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "fields": { "lines[0].quantity": "must_be_positive" },
    "request_id": "req_123"
  }
}
```

`message` is diagnostic, not approved UI copy. The UI maps stable `code` and field reason keys to its approved text. Common statuses: `400` malformed request, `401` unauthenticated, `403` forbidden action, `404` missing or inaccessible resource, `409` duplicate or invalid lifecycle transition, `412` stale `If-Match`, `422` domain validation, `429` rate limit, `500` internal failure. Never reveal whether another customer's record exists.

## 2. Roles and account access

| Capability | Admin | Staff | Customer |
| --- | --- | --- | --- |
| Add or deactivate staff | Yes | No | No |
| Configure products, plans, taxes, discounts | Yes | Read only | No |
| Create and manage quotation templates | Yes | Yes | No |
| Manage customers, subscriptions, invoices, payments | Yes | Yes | Own read access only until self-service rules are approved |
| View reports and billing runs | Yes | Yes | No |
| View portal subscriptions and invoices | Own account if applicable | No | Own records only |

A role is assigned by the server and cannot be supplied in customer registration or updated through `/me`. Every read by ID checks ownership. Admin creates staff; public registration creates `customer` only. The PDF's password rule is **required**: more than eight characters with uppercase, lowercase, and a special character. Email uniqueness is case insensitive. Password-reset requests return the same public response whether or not the email exists.

### Authentication and people

| Method / path | Access | Request → response |
| --- | --- | --- |
| `POST /auth/register` | Public | `{name,email,password}` → `201 {user}` with role `customer`. |
| `POST /auth/login` | Public | `{email,password}` → `200 {access_token,expires_at,user}`; sets refresh cookie. |
| `POST /auth/refresh` | Refresh cookie | Empty body → new access token and expiry. |
| `POST /auth/logout` | Signed in | Empty body → `204`; revokes refresh session. |
| `POST /auth/password-resets` | Public | `{email}` → `202` with no account-existence signal; sends one-use, expiring link when eligible. |
| `POST /auth/password-resets/confirm` | Public | `{token,new_password}` → `204`; consumes token. |
| `GET /me` | Signed in | `{id,name,email,role}`. |
| `GET /staff` | Admin | Paged staff list; `search`, `active`. |
| `POST /staff` | Admin | `{name,email,temporary_password}` → `201` staff account. |
| `PATCH /staff/{id}` | Admin | `{name?,active?}` → updated staff account. |
| `GET /customers` | Admin, staff | Paged list; `search`, `active`. |
| `GET /customers/{id}` | Admin, staff | Customer account with stable ID and contact fields. |

**Proposed:** access tokens expire after 15 minutes; refresh sessions after 30 days. Rate-limit login and password-reset endpoints. Passwords and reset tokens are never returned.

## 3. Catalog and configuration

A product has `{id,name,type,sku,sales_price,cost_price,notes,active,variants,version}`. `type` is `software`, `add_on`, or `service` (**proposed names**). A variant has `{id,name,sku,attributes,price_adjustment,active}`. Its selectable unit price is product `sales_price + price_adjustment`; the PDF example adds 560 for the Odoo brand. A plan has `{id,name,price,billing_interval,minimum_quantity,available_from,available_until,auto_close,allow_early_close,allow_pause,allow_renewal,active,version}`. `billing_interval` is `daily | weekly | monthly | yearly` (**required**).

`sales_price`, `cost_price`, `price`, and `price_adjustment` use `Money` in one currency per priced item. A negative variant adjustment is allowed only when the resulting unit price stays nonnegative. Plan `minimum_quantity` is a positive integer; `available_from <= available_until` when both dates are set.

| Method / path | Access | Request or filters → response |
| --- | --- | --- |
| `GET /products`, `GET /products/{id}` | Admin, staff | `search`, `type`, `active` → product list/detail. Search includes names, SKUs, and variant names. |
| `POST /products` | Admin | `{name,type,sku?,sales_price,cost_price,notes?,active?}` → product. |
| `PATCH /products/{id}` | Admin | Editable product fields → product. |
| `POST /products/{id}/variants` | Admin | `{name,sku?,attributes?,price_adjustment,active?}` → variant. |
| `PATCH /products/{id}/variants/{variant_id}` | Admin | Editable variant fields → variant. |
| `GET /catalog-items` | Admin, staff | `search`, `active`, `limit`, `cursor` → one selectable row per base product or active variant. Supports the exact New subscription search-and-checkbox overlay. |
| `GET /plans`, `GET /plans/{id}` | Admin, staff | `search`, `active`, `billing_interval` → plan list/detail. |
| `POST /plans`, `PATCH /plans/{id}` | Admin | Plan fields above → plan; `PATCH` requires `If-Match`. |
| `GET /tax-rules`, `GET /tax-rules/{id}` | Admin, staff | `active`, `effective_on` → tax rules. |
| `POST /tax-rules`, `PATCH /tax-rules/{id}` | Admin | `{name,rate_percent,effective_from,effective_until?,active?}` → tax rule. |
| `GET /discount-rules`, `GET /discount-rules/{id}` | Admin, staff | `active`, `effective_on`, `scope` → discount rules. |
| `POST /discount-rules`, `PATCH /discount-rules/{id}` | Admin | Discount fields below → rule; `PATCH` requires `If-Match`. |

`GET /catalog-items` returns `{id,product_id,variant_id,name,sku,variant_name,unit_price,active}` for each row; `variant_id` is `null` for a base product. The client stores `product_id` and `variant_id`, not the display price. This endpoint excludes inactive selections by default and searches across name, SKU, and variant. A selected product becoming inactive before save produces `422 catalog_item_unavailable`.

A discount rule is `{id,name,kind,value,minimum_purchase?,minimum_quantity?,starts_on,ends_on?,usage_limit?,usage_count,scope,product_ids,active,version}`. `kind` is `fixed | percentage`; `scope` is `subscription | products`. For `percentage`, `value` is a decimal string greater than zero and at most 100. For `fixed`, `value` is positive `Money`. `minimum_purchase` is `Money`; `minimum_quantity` and `usage_limit` are positive integers. `starts_on <= ends_on` when an end date is set. `product_ids` is required for `products` scope and empty for `subscription` scope. Only admin may create rules (**required**). Rule applicability is checked by the server on every invoice; expiry and usage-limit checks are atomic.

Products, plans, tax rules, and discounts already used on an invoice are deactivated or versioned, not hard-deleted. Historical invoice snapshots do not change after configuration edits.

## 4. Quotation templates and subscriptions

A quotation template is `{id,name,plan_id,validity_days,lines,active,version}`. Each template line has `{product_id,variant_id?,quantity}`. Templates copy their current selections into a new subscription; later template edits do not silently rewrite it.

| Method / path | Access | Request or filters → response |
| --- | --- | --- |
| `GET /quotation-templates`, `GET /quotation-templates/{id}` | Admin, staff | `search`, `active` → templates. |
| `POST /quotation-templates`, `PATCH /quotation-templates/{id}` | Admin, staff | `{name,plan_id,validity_days,lines,active?}` → template. |
| `POST /subscriptions` | Admin, staff | `SubscriptionCreate` below → `201` draft subscription. |
| `GET /subscriptions`, `GET /subscriptions/{id}` | Admin, staff | `search`, `customer_id`, `plan_id`, `status`, `next_billing_before` → list/detail. |
| `PATCH /subscriptions/{id}` | Admin, staff | Draft-only editable fields; requires `If-Match`. |
| `POST /subscriptions/{id}/quote` | Admin, staff | Draft → Quotation; validity from template or request `{validity_days}`. |
| `POST /subscriptions/{id}/confirm` | Admin, staff | Quotation → Confirmed. |
| `POST /subscriptions/{id}/activate` | Admin, staff or scheduler | Confirmed → Active when activation policy permits. |
| `POST /subscriptions/{id}/pause` | Admin, staff | Active billing state → Paused if plan allows. |
| `POST /subscriptions/{id}/resume` | Admin, staff | Paused billing state → Running. |
| `POST /subscriptions/{id}/renew` | Admin, staff | Extends expiry under approved renewal policy; idempotency key required. |
| `POST /subscriptions/{id}/close` | Admin, staff or scheduler | Active → Closed; early close requires plan permission. |
| `GET /me/subscriptions`, `GET /me/subscriptions/{id}` | Customer | Own subscriptions only; `status` filter on list. |

`SubscriptionCreate` is:

```json
{
  "customer_id": "cus_123",
  "plan_id": "plan_123",
  "template_id": null,
  "start_date": "2026-11-01",
  "expiry_date": "2027-10-31",
  "payment_terms_days": 14,
  "lines": [
    {
      "product_id": "prod_123",
      "variant_id": "var_odoo",
      "quantity": 5,
      "tax_mode": "auto",
      "tax_rule_ids": []
    }
  ]
}
```

`tax_mode` is `auto | explicit` (**proposed**). With `auto`, `tax_rule_ids` must be empty and the server applies eligible admin rules. With `explicit`, at least one eligible ID is required; this corresponds to choosing a named tax rule in the interface. `quantity` is a positive integer; plan `minimum_quantity` must be satisfied. `start_date <= expiry_date`, `payment_terms_days >= 0`, and all referenced accounts and catalog items must exist and be active. `template_id` is optional; explicit `lines` override copied template lines only when supplied. The server resolves price, tax, and amount; clients cannot submit them as authoritative fields.

The response includes `{id,number,customer_id,plan_id,template_id,start_date,expiry_date,payment_terms_days,status,billing_state,quote_expires_at,next_billing_date,lines,version,created_at,updated_at}`. A resolved line includes a stable line ID, product and variant snapshots, quantity, unit price, tax breakdown, and amount. `status` is `draft | quotation | confirmed | active | closed`; `billing_state` is `running | paused` only while Active. Invalid transitions return `409 invalid_transition`. An expired quotation cannot be confirmed without requoting. A paused or closed subscription cannot be billed. Whether activation and renewal are automatic, and exact expiry boundaries, remain open decisions.

## 5. Invoices, billing runs, and payments

Invoice responses include `{id,number,customer_id,subscription_id,status,overdue,period_start,period_end,issued_on,due_on,lines,subtotal,discount_total,tax_total,total,amount_paid,amount_due,payments,version}`. Each invoice line is a historical snapshot of its description, product/variant IDs, quantity, unit price, discount, tax rule IDs/rates, and amount. The server calculates all totals. `overdue` is a derived boolean, not an invoice status.

| Method / path | Access | Request or filters → response |
| --- | --- | --- |
| `POST /billing-runs` | Admin or scheduler credential | `{due_on}` → `202 {id,status,created_count,skipped_count,failed_count}`. Idempotency key required. |
| `GET /billing-runs/{id}` | Admin, staff | Run status, counts, timestamps, per-subscription failures for retry. |
| `GET /invoices`, `GET /invoices/{id}` | Admin, staff | `search`, `customer_id`, `subscription_id`, `status`, `overdue`, `due_before` → list/detail. |
| `POST /invoices/{id}/confirm` | Admin, staff | Draft → Confirmed; server validates and locks snapshot. |
| `POST /invoices/{id}/cancel` | Admin, staff | Draft or Confirmed with no payments → Canceled. Paid or partially paid cancellation is unavailable until reversal policy is approved. |
| `POST /invoices/{id}/send` | Admin, staff | Queues delivery; `202 {delivery_id,status}`. Retries do not send duplicates. |
| `GET /invoices/{id}/pdf` | Admin, staff | PDF with `Content-Disposition: attachment`; same frozen invoice values as detail. |
| `GET /me/invoices`, `GET /me/invoices/{id}`, `GET /me/invoices/{id}/pdf` | Customer | Own invoices only; list accepts `status`, `overdue`. |
| `POST /invoices/{id}/payments` | Admin, staff | `PaymentCreate` → `201` payment and updated invoice balance; idempotency key required. |
| `GET /payments`, `GET /payments/{id}` | Admin, staff | `invoice_id`, `customer_id`, `method`, `from`, `to` → payment list/detail. |

`PaymentCreate` is `{method,amount,paid_at,reference?,note?}`. `method` is `bank_transfer | card | cash | other` (**proposed**). `amount` is `Money` in the invoice currency; it must be positive and cannot exceed the current amount due. `paid_at` is a UTC timestamp. Recording a payment and updating the invoice balance occur in one transaction. Partial payment leaves status Confirmed; when amount due reaches zero, status becomes Paid. A paid invoice cannot accept another payment. Refunds, reversals, and canceling paid invoices require a separate approved policy and have no v1 mutation endpoint yet.

An invoice moves `draft → confirmed → paid`; `draft` or an unpaid `confirmed` invoice may become `canceled`. A Confirmed invoice with `amount_due > 0` and `due_on < today` is overdue. A database uniqueness constraint on `(subscription_id, period_start, period_end)` prevents duplicate period invoices. The billing run records every due subscription as created, already billed, intentionally skipped with a reason, or failed; it never treats a failed item as successful. Retrying an identical run cannot create duplicate invoices. Discount usage is reserved atomically when an invoice is confirmed; cancel/reversal semantics are open.

## 6. Reporting

| Method / path | Access | Response |
| --- | --- | --- |
| `GET /reports/overview?from=Date&to=Date` | Admin, staff | `{active_subscriptions,collections,outstanding,overdue_invoice_count,overdue_amount,as_of}`. Money fields carry currency. |
| `GET /reports/collections-series?from=Date&to=Date&interval=month` | Admin, staff | Ordered `{period,collections}` points for the approved chart and table. |
| `GET /reports/overdue-invoices` | Admin, staff | Paged invoice records with customer, due date, amount due, and days overdue; oldest due first. |

`from` and `to` are inclusive dates; `from <= to`. Report figures and chart points must use the same snapshot/as-of time so the UI does not show contradictory numbers. The PDF asks for every page to respond in under two seconds at thousands-of-subscriptions scale. Verify the complete screen flow and its endpoints with representative data before claiming that target. The meaning of “revenue,” reporting timezone, and multicurrency aggregation remain open; the proposed `collections` field means recorded cash received.

## 7. UI-to-API handoff

| Frontend interaction | API source or command |
| --- | --- |
| Product checkbox overlay; search by name, SKU, variant | `GET /catalog-items?search=...` |
| Selected product lines and tax dropdown | `GET /catalog-items`, `GET /tax-rules`, then `POST /subscriptions` |
| Subscription list, lifecycle rail, details | `GET /subscriptions`, `GET /subscriptions/{id}` and action endpoints |
| Invoice detail, send, print, record payment | Invoice read/actions/PDF and `POST /invoices/{id}/payments` |
| Overview, reports, overdue queue | Reporting endpoints |
| Customer portal | `/me`, `/me/subscriptions`, `/me/invoices` |

The client retains draft form state and picker selection locally until submit. The API returns data and stable error codes, not page headings, helper text, button labels, or visual tokens. Review implemented screens at desktop and mobile sizes, including loading, error, empty, and success states.

## 8. Open decisions before financial release

1. **Currency and tax:** supported currencies, tax jurisdiction and eligibility, tax-inclusive versus tax-exclusive prices, rounding precision and order, and whether staff may override automatic tax selection.
2. **Plan charge and discounts:** whether a plan's base price is billed in addition to selected product lines, discount stacking/priority, fixed-discount allocation, and what happens to reserved usage on cancellation.
3. **Billing calendar:** business timezone, first invoice timing, period boundaries, month-end/leap-day behavior, proration, renewal timing, auto-activation, and auto-close timing.
4. **Customer self-service:** which pause, resume, renew, close, and change actions customers may perform, and whether staff approval is needed. No customer mutation endpoint is authorized until decided.
5. **Payment correction:** partial payments are proposed; decide refunds, reversals, overpayments, gateway collection, and cancellation of invoices with payments.
6. **Reporting:** whether revenue means invoiced revenue or cash collected, and how to display or aggregate multiple currencies.
7. **Quotation without template:** default validity days and whether a quote can be confirmed after expiry.

When these choices are made, update this contract, the billing tests, and any affected frontend state together before implementation.
