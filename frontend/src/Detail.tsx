import { useEffect, useState } from 'react';
import { request, type Row, type User } from './api';
import { Empty, ErrorBox, Loading, Status, amount, day, label } from './ui';

export function ItemLines({ row, invoice = false }: { row: Row; invoice?: boolean }) {
  const currency = row.currency || row.plan?.currency || 'USD';
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th className="numeric">Quantity</th>
            <th className="numeric">Unit price</th>
            <th className="numeric">Tax</th>
            <th className="numeric">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice && (
            <tr>
              <td>
                <strong>{row.plan_name || 'Plan fee'}</strong>
              </td>
              <td className="numeric">1</td>
              <td className="numeric">{amount(row.plan_fee, currency)}</td>
              <td className="numeric">
                {row.plan_line ? amount(row.plan_line.tax_total, currency) : '—'}
              </td>
              <td className="numeric">
                {amount(row.plan_line?.line_total ?? row.plan_fee, currency)}
              </td>
            </tr>
          )}
          {(row.lines || []).map((line: Row, index: number) => (
            <tr key={`${line.product_id}:${line.variant_id}:${index}`}>
              <td>
                <strong>{line.name || `Product ${line.product_id}`}</strong>
                <small>
                  {line.variant_name || ''}
                  {line.discount && Number(line.discount) > 0
                    ? ` · Discount ${amount(line.discount, currency)}`
                    : ''}
                </small>
              </td>
              <td className="numeric">{line.quantity}</td>
              <td className="numeric">{amount(line.unit_price, currency)}</td>
              <td className="numeric">
                {invoice && line.tax_total !== undefined
                  ? amount(line.tax_total, currency)
                  : 'Automatic'}
              </td>
              <td className="numeric">
                {amount(
                  line.line_total ?? line.amount ?? Number(line.unit_price) * Number(line.quantity),
                  currency,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!row.lines?.length && <Empty>No product lines.</Empty>}
    </div>
  );
}

export function Facts({ values }: { values: [string, any][] }) {
  return (
    <dl className="facts">
      {values.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value === null || value === undefined || value === '' ? '—' : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Detail({
  kind,
  row,
  user,
  token,
  onAction,
  onEdit,
  onOpen,
  onDownload,
}: {
  kind: string;
  row: Row;
  user: User;
  token: string;
  onAction: (name: string) => void;
  onEdit: () => void;
  onOpen: (kind: string, id: number) => void;
  onDownload: () => void;
}) {
  const [history, setHistory] = useState<Row[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (kind !== 'subscriptions') return;
    const controller = new AbortController();
    setHistoryBusy(true);
    request(`subscriptions/${row.id}/history`, token, { signal: controller.signal })
      .then((result) => setHistory(result.data))
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryBusy(false);
      });
    return () => controller.abort();
  }, [kind, row.id, row.version, token]);
  const currency = row.currency || row.plan?.currency || 'USD';
  const internal = user.role !== 'customer';
  const edit =
    (user.role === 'admin' &&
      ['products', 'plans', 'tax-rules', 'discount-rules', 'staff', 'quotation-templates'].includes(
        kind,
      )) ||
    (internal &&
      ((kind === 'subscriptions' && row.status === 'draft') || kind === 'quotation-templates'));
  const actions: string[] =
    kind === 'requests'
      ? internal && row.status === 'pending'
        ? ['approve', 'reject']
        : internal && row.status === 'approved'
          ? ['reject']
          : []
      : kind === 'invoices'
        ? internal
          ? row.available_actions || []
          : []
        : kind === 'subscriptions'
          ? row.available_actions || []
          : [];
  return (
    <div className="detail-body">
      <div className="detail-status">
        <Status
          value={
            row.overdue ? 'overdue' : row.status || (row.active === false ? 'inactive' : 'active')
          }
        />
        <span className="muted">{row.number || row.email}</span>
      </div>
      {['products', 'plans', 'tax-rules', 'discount-rules'].includes(kind) && (
        <>
          {kind === 'products' && (
            <>
              <Facts
                values={[
                  ['Type', label(row.type || 'software')],
                  ['SKU', row.sku],
                  ['Sales price', amount(row.sales_price, currency)],
                  ['Cost price', amount(row.cost_price, currency)],
                  ['Notes', row.notes],
                ]}
              />
              <h3>Variants</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Variant</th>
                      <th>Brand</th>
                      <th className="numeric">Price adjustment</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(row.variants || []).map((variant: Row, index: number) => (
                      <tr key={index}>
                        <td>{variant.name}</td>
                        <td>{variant.brand || '—'}</td>
                        <td className="numeric">{amount(variant.price_adjustment, currency)}</td>
                        <td>
                          <Status value={variant.active === false ? 'inactive' : 'active'} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!row.variants?.length && <Empty>No variants.</Empty>}
              </div>
            </>
          )}
          {kind === 'plans' && (
            <Facts
              values={[
                ['Plan fee', amount(row.price, currency)],
                ['Billing interval', label(row.billing_interval)],
                ['Minimum quantity', row.minimum_quantity],
                ['Available from', day(row.available_from)],
                ['Available until', day(row.available_until)],
                ['Pause and resume', row.allow_pause ? 'Allowed' : 'Unavailable'],
                ['Early closure', row.allow_early_close ? 'Allowed' : 'Unavailable'],
                ['Renewal', row.allow_renewal ? 'Allowed' : 'Unavailable'],
                ['Close at term end', row.auto_close ? 'Automatic' : 'Manual'],
              ]}
            />
          )}
          {kind === 'tax-rules' && (
            <Facts
              values={[
                ['Rate', `${row.rate_percent}%`],
                ['Country', row.country || 'All'],
                ['Region', row.region || 'All'],
                ['Effective from', day(row.effective_from)],
                ['Effective until', day(row.effective_until)],
              ]}
            />
          )}
          {kind === 'discount-rules' && (
            <Facts
              values={[
                [
                  'Discount',
                  row.kind === 'percentage' ? `${row.value}%` : amount(row.value, currency),
                ],
                [
                  'Scope',
                  row.scope === 'products'
                    ? `${row.product_ids?.length || 0} products`
                    : 'Whole subscription',
                ],
                ['Minimum purchase', amount(row.minimum_purchase, currency)],
                ['Minimum quantity', row.minimum_quantity],
                ['Starts on', day(row.starts_on)],
                ['Ends on', day(row.ends_on)],
                ['Usage', `${row.usage_count || 0} / ${row.usage_limit || 'Unlimited'}`],
              ]}
            />
          )}
        </>
      )}
      {['customers', 'staff', 'account'].includes(kind) && (
        <Facts
          values={[
            ['Name', row.name],
            ['Email', row.email],
            ['Role', label(row.role || 'customer')],
            ['Active', row.active === false ? 'No' : 'Yes'],
          ]}
        />
      )}
      {kind === 'customers' && (
        <>
          {[
            ['subscriptions', 'Subscriptions'],
            ['invoices', 'Invoices'],
          ].map(([name, title]) => (
            <section key={name}>
              <h3>{title}</h3>
              {row[name]?.length ? (
                <div className="related-records">
                  {row[name].map((record: Row) => (
                    <button key={record.id} onClick={() => onOpen(name, record.id)}>
                      <span>{record.number}</span>
                      <Status value={record.status} />
                    </button>
                  ))}
                </div>
              ) : (
                <Empty>No {name}.</Empty>
              )}
            </section>
          ))}
        </>
      )}
      {['subscriptions', 'quotation-templates'].includes(kind) && (
        <>
          <Facts
            values={
              kind === 'subscriptions'
                ? [
                    ['Customer', row.customer?.name],
                    ['Plan', row.plan?.name],
                    ['Plan fee', amount(row.plan?.price, currency)],
                    ['Start date', day(row.start_date)],
                    ['Expiry date', day(row.expiry_date)],
                    ['Next billing date', day(row.next_billing_date)],
                    ['Payment terms', `${row.payment_terms_days} days`],
                    ['Billing timezone', row.billing_timezone || 'UTC'],
                    ['Quotation valid until', day(row.quote_expires_at)],
                  ]
                : [
                    ['Plan', row.plan?.name],
                    ['Validity', `${row.validity_days} days`],
                  ]
            }
          />
          <h3>Product lines</h3>
          <ItemLines row={row} />
          {kind === 'subscriptions' && row.pending_request && (
            <div className="scheduled-change">
              <strong>{label(row.pending_request.action)} requested</strong>
              <Status value={row.pending_request.status} />
            </div>
          )}
          {kind === 'subscriptions' && (
            <section>
              <h3>Lifecycle history</h3>
              <ErrorBox error={error} />
              {historyBusy ? (
                <Loading />
              ) : history.length ? (
                <ol className="history">
                  {history.map((entry, index) => (
                    <li key={index}>
                      <strong>{label(entry.action)}</strong>
                      <span>{day(entry.created_at)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>No history recorded.</Empty>
              )}
            </section>
          )}
        </>
      )}
      {kind === 'invoices' && (
        <div className="invoice-document">
          <div className="invoice-parties">
            <div>
              <span className="eyebrow">Bill to</span>
              <h3>{row.customer?.name}</h3>
              <p>{row.customer?.email}</p>
            </div>
            <Facts
              values={[
                ['Period', `${day(row.period_start)} – ${day(row.period_end)}`],
                ['Due date', day(row.due_on)],
                ['Currency', currency],
              ]}
            />
          </div>
          <ItemLines row={row} invoice />
          <dl className="invoice-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{amount(row.subtotal, currency)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>−{amount(row.discount_total, currency)}</dd>
            </div>
            {(row.taxes || []).map((tax: Row, index: number) => (
              <div key={index}>
                <dt>
                  {tax.name} ({tax.rate_percent}%)
                </dt>
                <dd>{amount(tax.amount, currency)}</dd>
              </div>
            ))}
            <div className="total">
              <dt>Total</dt>
              <dd>{amount(row.total, currency)}</dd>
            </div>
            <div>
              <dt>Payments</dt>
              <dd>{amount(row.amount_paid, currency)}</dd>
            </div>
            <div className="total">
              <dt>Amount due</dt>
              <dd>{amount(row.amount_due, currency)}</dd>
            </div>
          </dl>
          <h3>Payments</h3>
          {row.payments?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Note</th>
                    <th className="numeric">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {row.payments.map((payment: Row) => (
                    <tr key={payment.id}>
                      <td>{day(payment.paid_at)}</td>
                      <td>{label(payment.method)}</td>
                      <td>{payment.note || '—'}</td>
                      <td className="numeric">{amount(payment.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No payments recorded.</Empty>
          )}
        </div>
      )}
      {kind === 'payments' && (
        <Facts
          values={[
            ['Invoice', row.invoice_number || `Invoice ${row.invoice_id}`],
            ['Method', label(row.method)],
            ['Amount', amount(row.amount, currency)],
            ['Paid on', day(row.paid_at)],
            ['Note', row.note],
          ]}
        />
      )}
      {kind === 'billing-runs' && (
        <>
          <Facts
            values={[
              ['Billing date', day(row.due_on)],
              ['Created', row.created_count],
              ['Skipped', row.skipped_count],
              ['Failed', row.failed_count],
            ]}
          />
          {row.failures?.length ? (
            <>
              <h3>Failed subscriptions</h3>
              <table>
                <thead>
                  <tr>
                    <th>Subscription</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {row.failures.map((failure: Row, index: number) => (
                    <tr key={index}>
                      <td>
                        <button onClick={() => onOpen('subscriptions', failure.subscription_id)}>
                          Subscription {failure.subscription_id}
                        </button>
                      </td>
                      <td>{label(failure.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <Empty>No failed subscriptions.</Empty>
          )}
        </>
      )}
      {kind === 'requests' && (
        <Facts
          values={[
            [
              'Subscription',
              <button onClick={() => onOpen('subscriptions', row.subscription_id)}>
                Open subscription
              </button>,
            ],
            ['Action', label(row.action)],
            ['Product', row.product_id ? `Product ${row.product_id}` : '—'],
            ['Quantity', row.action === 'add_on' ? row.quantity : '—'],
          ]}
        />
      )}
      {kind === 'outbox' && (
        <>
          <Facts
            values={[
              ['Message', label(row.action)],
              ['Record', row.record_id],
              ['Expires', day(row.detail?.expires_at)],
              ['Delivery', row.detail?.used ? 'Used' : 'Available'],
            ]}
          />
          {row.action === 'password_reset' && (
            <label className="field">
              <span>Reset token</span>
              <a
                href={`/?reset_token=${encodeURIComponent(row.detail?.token || '')}`}
                target="_blank"
                rel="noreferrer"
              >
                Open reset link
              </a>
              <input
                readOnly
                value={row.detail?.token || ''}
                onFocus={(event) => event.target.select()}
              />
            </label>
          )}
        </>
      )}
      <div className="detail-actions">
        {edit && (
          <button type="button" onClick={onEdit}>
            Edit
          </button>
        )}
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className={action === 'confirm' || action === 'activate' ? 'primary' : ''}
            onClick={() => onAction(action)}
          >
            {user.role === 'customer' && kind === 'subscriptions' ? 'Request ' : ''}
            {label(action)}
          </button>
        ))}
        {kind === 'invoices' && !['draft', 'canceled'].includes(row.status || '') && (
          <>
            <button type="button" onClick={onDownload}>
              PDF
            </button>
            <button type="button" onClick={() => window.print()}>
              Print
            </button>
          </>
        )}
        {kind === 'invoices' &&
          internal &&
          row.status === 'confirmed' &&
          Number(row.amount_due) > 0 && (
            <button className="primary" onClick={() => onAction('payment')}>
              Record payment
            </button>
          )}
        {kind === 'billing-runs' && row.failed_count > 0 && (
          <button className="primary" onClick={() => onAction('retry')}>
            Retry failed
          </button>
        )}
      </div>
    </div>
  );
}
