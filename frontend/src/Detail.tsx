import { type Row, type User } from './api';
import { Empty, Status, amount, day, label } from './ui';

export function ItemLines({ row, invoice = false }: { row: Row; invoice?: boolean }) {
  const currency = row.currency || row.plan?.currency || 'USD';
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th className="numeric">Unit price</th>
            <th className="numeric">Qty</th>
            <th className="numeric">Tax</th>
            <th className="numeric">Line amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice && (
            <tr>
              <td>
                <strong>{row.plan_name || 'Plan fee'}</strong>
              </td>
              <td className="numeric">{amount(row.plan_fee, currency)}</td>
              <td className="numeric">1</td>
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
              <td className="numeric">{amount(line.unit_price, currency)}</td>
              <td className="numeric">{line.quantity}</td>
              <td className="numeric">
                {line.taxes?.length
                  ? line.taxes.map((tax: Row) => `${tax.rate_percent}%`).join(' + ')
                  : line.tax_total !== undefined
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
  onAction,
  onEdit,
  onOpen,
  onDownload,
  showActions = true,
}: {
  kind: string;
  row: Row;
  user: User;
  token: string;
  onAction: (name: string) => void;
  onEdit: () => void;
  onOpen: (kind: string, id: number) => void;
  onDownload: () => void;
  showActions?: boolean;
}) {
  const currency = row.currency || row.plan?.currency || 'USD';
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
              <div className="tablewrap">
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
                    <button className="btn" key={record.id} onClick={() => onOpen(name, record.id)}>
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
      {kind === 'quotation-templates' && (
        <>
          <Facts
            values={[
              ['Plan', row.plan?.name],
              ['Validity', `${row.validity_days} days`],
            ]}
          />
          <h3>Product lines</h3>
          <ItemLines row={row} />
        </>
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
                        <button
                          className="btn"
                          onClick={() => onOpen('subscriptions', failure.subscription_id)}
                        >
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
              <button className="btn" onClick={() => onOpen('subscriptions', row.subscription_id)}>
                Open subscription
              </button>,
            ],
            ['Action', label(row.action)],
            [
              'Product',
              row.proposed_line?.name || (row.product_id ? `Product ${row.product_id}` : '—'),
            ],
            [
              'Unit price',
              row.proposed_line
                ? amount(row.proposed_line.unit_price, row.proposed_line.currency)
                : '—',
            ],
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
      {showActions && (
        <RecordActions
          kind={kind}
          row={row}
          user={user}
          onAction={onAction}
          onEdit={onEdit}
          onDownload={onDownload}
        />
      )}
    </div>
  );
}

export function RecordActions({
  kind,
  row,
  user,
  onAction,
  onEdit,
  onDownload,
}: {
  kind: string;
  row: Row;
  user: User;
  onAction: (action: string) => void;
  onEdit: () => void;
  onDownload: () => void;
}) {
  const internal = user.role !== 'customer';
  const edit =
    (user.role === 'admin' &&
      (kind !== 'staff' || row.role === 'staff') &&
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
  if (kind === 'invoices')
    return (
      <div className="detail-actions actions">
        {internal && actions.includes('confirm') && (
          <button className="btn primary" onClick={() => onAction('confirm')}>
            Confirm
          </button>
        )}
        {internal && actions.includes('send') && (
          <button className="btn" onClick={() => onAction('send')}>
            Send
          </button>
        )}
        {internal && row.status === 'confirmed' && Number(row.amount_due) > 0 && (
          <button className="btn primary" onClick={() => onAction('payment')}>
            Record payment
          </button>
        )}
        {!['draft', 'canceled'].includes(row.status || '') && (
          <button className="btn" onClick={onDownload}>
            Download PDF
          </button>
        )}
        {internal && actions.includes('cancel') && (
          <button className="btn" onClick={() => onAction('cancel')}>
            Cancel
          </button>
        )}
        {internal && actions.includes('recalculate') && (
          <button className="btn" onClick={() => onAction('recalculate')}>
            Recalculate
          </button>
        )}
      </div>
    );
  return (
    <div className="detail-actions actions">
      {edit && (
        <button className="btn" type="button" onClick={onEdit}>
          Edit
        </button>
      )}
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          className={`btn ${action === 'confirm' || action === 'activate' ? 'primary' : ''}`}
          onClick={() => onAction(action)}
        >
          {action === 'add_on' ? 'Change add-ons' : label(action)}
        </button>
      ))}
      {kind === 'billing-runs' && row.failed_count > 0 && (
        <button className="btn primary" onClick={() => onAction('retry')}>
          Retry failed
        </button>
      )}
    </div>
  );
}
