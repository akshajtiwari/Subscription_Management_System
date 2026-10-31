import { useEffect, useState, type ComponentProps } from 'react';
import { request, type Row } from './api';
import { Detail, Facts, ItemLines, RecordActions } from './Detail';
import { Metric } from './Overview';
import { Empty, ErrorBox, Loading, Status, amount, day, label } from './ui';

export function RecordPage(props: ComponentProps<typeof Detail> & { onBack: () => void }) {
  const { kind, row, user, token, onOpen, onBack } = props;
  const [history, setHistory] = useState<Row[]>([]),
    [invoices, setInvoices] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (kind !== 'subscriptions') return;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    Promise.all([
      request(`subscriptions/${row.id}/history`, token, { signal: controller.signal }),
      request(`invoices?subscription_id=${row.id}&limit=100`, token, { signal: controller.signal }),
    ])
      .then(([events, bills]) => {
        if (!controller.signal.aborted) {
          setHistory(events.data);
          setInvoices(bills.data);
        }
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [kind, row.id, row.version, token, retry]);
  const own = user.role === 'customer',
    invoice = kind === 'invoices',
    subscription = kind === 'subscriptions';
  const title = invoice
    ? own
      ? 'My invoice detail'
      : 'Invoice detail'
    : subscription
      ? own
        ? 'My subscription detail'
        : 'Subscription detail'
      : kind === 'customers'
        ? 'Customer account'
        : row.name || row.number || 'Record details';
  const description = invoice
    ? 'Line totals, tax, discount, payments, send and print.'
    : subscription
      ? 'Lifecycle rail, billing schedule, lines and linked invoices.'
      : kind === 'customers'
        ? 'Contact details, active subscriptions and invoices.'
        : '';
  const currency = row.currency || row.plan?.currency || 'USD';
  const status = row.overdue ? 'overdue' : row.status || 'active';
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">
            <button className="back-link" onClick={onBack}>
              ← Back to{' '}
              {kind === 'invoices'
                ? 'Invoices'
                : kind === 'subscriptions'
                  ? 'Subscriptions'
                  : label(kind)}
            </button>
          </div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        <RecordActions {...props} />
      </div>
      {invoice || subscription ? (
        <>
          <div className="grid metric-strip detail-status">
            <Metric
              title={invoice ? 'Invoice status' : 'Subscription status'}
              value={label(status)}
              note={row.number || ''}
            />
            <Metric
              title={invoice ? 'Total' : 'Next billing'}
              value={
                invoice
                  ? amount(row.total, currency)
                  : ['paused', 'closed'].includes(status)
                    ? '—'
                    : day(row.next_billing_date).slice(0, 6)
              }
              note={invoice ? 'Includes tax' : row.plan?.name || ''}
            />
            <Metric
              title={invoice ? 'Amount due' : 'Billing interval'}
              value={
                invoice
                  ? amount(row.amount_due, currency)
                  : label(row.plan?.billing_interval || 'monthly')
              }
              note={
                invoice
                  ? `Due ${day(row.due_on).slice(0, 6)}`
                  : `${row.payment_terms_days} day payment terms`
              }
            />
          </div>
          <div className="split">
            <div className="record-main">
              <section className="panel">
                <div className="panelhead">
                  <h2>{invoice ? 'Invoice summary' : 'Subscription terms'}</h2>
                  <Status value={status} />
                </div>
                <Facts
                  values={
                    invoice
                      ? [
                          ['Invoice', row.number],
                          ['Customer', own ? 'Your account' : row.customer?.name],
                          ['Issued', day(row.period_start)],
                          ['Due', day(row.due_on)],
                          ['Currency', currency],
                        ]
                      : [
                          ['Subscription', row.number],
                          ['Customer', own ? 'Your account' : row.customer?.name],
                          ['Start date', day(row.start_date)],
                          ['Expiry date', day(row.expiry_date)],
                          [
                            'Plan permissions',
                            [
                              row.plan?.allow_pause ? 'Pause' : null,
                              row.plan?.allow_early_close ? 'Early close' : null,
                              row.plan?.allow_renewal ? 'Renewal' : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'None',
                          ],
                          ['Currency', currency],
                        ]
                  }
                />
              </section>
              <section className="panel">
                <div className="panelhead">
                  <h2>{invoice ? 'Itemized charges' : 'Product lines'}</h2>
                </div>
                <ItemLines row={row} invoice={invoice} />
                {invoice && (
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
                          {tax.name} · {tax.rate_percent}%
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
                      <dd>−{amount(row.amount_paid, currency)}</dd>
                    </div>
                    <div className="total">
                      <dt>Amount due</dt>
                      <dd>{amount(row.amount_due, currency)}</dd>
                    </div>
                  </dl>
                )}
              </section>
              <section className="panel">
                <div className="panelhead">
                  <h2>{invoice ? 'Payments' : 'Linked invoices'}</h2>
                  {subscription && (
                    <button className="btn" onClick={() => onOpen('invoices', 0)}>
                      View all
                    </button>
                  )}
                </div>
                {invoice ? (
                  row.payments?.length ? (
                    <div className="tablewrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Method</th>
                            <th>Note</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.payments.map((payment: Row) => (
                            <tr key={payment.id}>
                              <td>{day(payment.paid_at)}</td>
                              <td>{label(payment.method)}</td>
                              <td>{payment.note || '—'}</td>
                              <td className="mono">{amount(payment.amount, currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty>No payments recorded.</Empty>
                  )
                ) : (
                  <>
                    <ErrorBox error={error} />
                    {error && (
                      <button className="btn" onClick={() => setRetry((value) => value + 1)}>
                        Retry
                      </button>
                    )}
                    {busy ? (
                      <Loading />
                    ) : invoices.length ? (
                      <div className="tablewrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Invoice</th>
                              <th>Issued</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invoices.map((bill) => (
                              <tr key={bill.id}>
                                <td>
                                  <button
                                    className="row-link"
                                    onClick={() => onOpen('invoices', bill.id)}
                                  >
                                    {bill.number}
                                  </button>
                                </td>
                                <td>{day(bill.period_start)}</td>
                                <td>
                                  <Status value={bill.overdue ? 'overdue' : bill.status} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty>No linked invoices.</Empty>
                    )}
                  </>
                )}
              </section>
              {subscription && row.pending_request && (
                <section className="panel scheduled-change">
                  <strong>{label(row.pending_request.action)} requested</strong>
                  <Status value={row.pending_request.status} />
                </section>
              )}
            </div>
            <aside className="panel">
              <h2>{invoice ? 'Invoice activity' : 'Lifecycle history'}</h2>
              {invoice ? (
                <div className="timeline">
                  <div>
                    <strong>Draft</strong>
                    <small>Created by billing run · {day(row.period_start)}</small>
                  </div>
                  {row.status !== 'draft' && (
                    <div>
                      <strong>{label(status)}</strong>
                      <small>
                        {Number(row.amount_paid) > 0 ? 'Payment recorded' : 'Current stage'}
                      </small>
                    </div>
                  )}
                </div>
              ) : busy ? (
                <Loading />
              ) : (
                <div className="timeline history">
                  {history.map((entry, index) => (
                    <div key={index}>
                      <strong>{label(entry.action)}</strong>
                      <small>{day(entry.created_at)}</small>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        </>
      ) : (
        <section className="panel">
          <Detail {...props} showActions={false} />
        </section>
      )}
    </>
  );
}
