import { useEffect, useState } from 'react';
import { request, type Row, type User } from './api';
import { Icon } from './Icon';
import { Empty, ErrorBox, Loading, Status, amount, day } from './ui';

export function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="card">
      <small>{title}</small>
      <strong className="mono">{value}</strong>
      <span className="delta">{note}</span>
    </div>
  );
}

export function Trend({ points }: { points: Row[] }) {
  if (!points.length) return <Empty>No payments in this date range.</Empty>;
  const max = Math.max(...points.map((point) => Number(point.collections)), 1);
  const min = Math.min(...points.map((point) => Number(point.collections)));
  const coordinates = points.map((point, index) => [
    points.length === 1 ? 300 : (index * 600) / (points.length - 1),
    max === min ? 108 : 168 - ((Number(point.collections) - min) / (max - min)) * 121,
  ]);
  const path = coordinates
    .map(([x, y], index) =>
      index
        ? `C${coordinates[index - 1][0] + 45} ${coordinates[index - 1][1]} ${x - 45} ${y} ${x} ${y}`
        : `M${x} ${y}`,
    )
    .join(' ');
  const last = coordinates.at(-2) || coordinates.at(-1)!;
  return (
    <>
      <div className="chart-wrap collection-chart">
        <svg viewBox="0 0 600 205" role="img" aria-label="Collections across the last six months">
          <path className="chart-grid" d="M0 40H600M0 95H600M0 150H600M0 204H600" />
          <path className="chart-area" d={`${path} V205 H0Z`} />
          <path className="chart-line" d={path} />
          <circle className="chart-point" cx={last[0]} cy={last[1]} r="5" />
        </svg>
      </div>
      <div className="chart-labels">
        {points.map((point) => (
          <span key={point.period} title={amount(point.collections, point.currency)}>
            {new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(
              new Date(`${point.period}-01T00:00:00Z`),
            )}
            <span className="sr-only"> {amount(point.collections, point.currency)}</span>
          </span>
        ))}
      </div>
    </>
  );
}

export function Overview({
  token,
  user,
  revision,
  onOpen,
}: {
  token: string;
  user: User;
  revision: number;
  onOpen: (kind: string, id?: number) => void;
}) {
  const [summary, setSummary] = useState<Row | null>(null),
    [subscriptions, setSubscriptions] = useState<Row[]>([]),
    [invoices, setInvoices] = useState<Row[]>([]),
    [points, setPoints] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0),
    [currency, setCurrency] = useState('USD');
  const own = user.role === 'customer';
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    const end = new Date(),
      start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5, 1));
    Promise.all([
      request('subscriptions?limit=25&sort=newest', token, { signal: controller.signal }),
      request('invoices?limit=100', token, { signal: controller.signal }),
      own
        ? Promise.resolve(null)
        : request(
            `reports/summary?start=${start.toISOString().slice(0, 10)}&end=${end.toISOString().slice(0, 10)}`,
            token,
            { signal: controller.signal },
          ),
    ])
      .then(([subs, bills, report]) => {
        if (controller.signal.aborted) return;
        setSubscriptions(subs.data);
        setInvoices(bills.data);
        setSummary(report?.overview || null);
        setPoints(report?.series || []);
        const currencies = Object.keys(report?.overview?.currencies || {});
        if (currencies.length)
          setCurrency((current) => (currencies.includes(current) ? current : currencies[0]));
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [token, revision, retry, own]);
  const currencies = Object.keys(summary?.currencies || {}),
    metrics = summary?.currencies?.[currency] || {};
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthCollections = points
    .filter((point) => point.currency === currency && point.period === currentMonth)
    .reduce((sum, point) => sum + Number(point.collections), 0);
  const overdue = invoices.find((invoice) => invoice.overdue),
    draft = invoices.find((invoice) => invoice.status === 'draft'),
    active = subscriptions.find((subscription) => subscription.status === 'active');
  const renewalDays = active?.next_billing_date
    ? Math.round(
        (new Date(`${active.next_billing_date}T00:00:00Z`).getTime() -
          new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime()) /
          86400000,
      )
    : null;
  const activeCount = own
    ? subscriptions.filter((subscription) => subscription.status === 'active').length
    : summary?.active_subscriptions;
  return (
    <>
      <ErrorBox error={error} />
      {error && (
        <button className="btn" onClick={() => setRetry((value) => value + 1)}>
          Retry
        </button>
      )}
      {busy && <Loading />}
      {currencies.length > 1 && (
        <label className="currency-choice">
          Currency{' '}
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {currencies.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </label>
      )}
      <div className="grid metric-strip">
        <Metric
          title="Active subscriptions"
          value={activeCount === undefined ? '—' : Number(activeCount).toLocaleString('en')}
          note={
            own
              ? 'Current plans'
              : `As of ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date())}`
          }
        />
        <Metric
          title={own ? 'Next billing date' : 'Collected this month'}
          value={
            own
              ? active?.next_billing_date
                ? day(active.next_billing_date).slice(0, 6)
                : '—'
              : Math.round(monthCollections).toLocaleString('en')
          }
          note={
            own
              ? 'Upcoming'
              : `${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date())} total`
          }
        />
        <Metric
          title={own ? 'Open invoices' : 'Overdue invoices'}
          value={
            own
              ? String(
                  invoices.filter(
                    (invoice) => Number(invoice.amount_due) > 0 && invoice.status === 'confirmed',
                  ).length,
                )
              : String(metrics.overdue_invoice_count ?? '—')
          }
          note={own ? 'View balance' : 'Past due'}
        />
      </div>
      <div className="split">
        <div className="panel chart-panel">
          <div className="chart-header">
            <div>
              <h2>{own ? 'Billing history' : 'Collections trend'}</h2>
              <p>{own ? 'Your invoices over time' : 'A clear view of recurring cash collected'}</p>
            </div>
            <span className="chart-range">Last 6 months</span>
          </div>
          <Trend
            points={
              own
                ? invoices
                    .filter((invoice) => invoice.status === 'paid')
                    .map((invoice) => ({
                      id: invoice.id,
                      period: invoice.period_start.slice(0, 7),
                      collections: invoice.total,
                      currency: invoice.currency,
                    }))
                    .reverse()
                : points.filter((point) => point.currency === currency)
            }
          />
        </div>
        <div className="panel">
          <div className="panelhead">
            <h2>{own ? 'Recent activity' : 'Needs attention'}</h2>
            <button className="btn" onClick={() => onOpen('invoices')}>
              See all
            </button>
          </div>
          <div className="activity-list">
            {overdue && (
              <button className="activity-row" onClick={() => onOpen('invoices', overdue.id)}>
                <span className="activity-icon">
                  <Icon name="receipt" />
                </span>
                <span>
                  <strong>Invoice {overdue.number}</strong>
                  <small>
                    {overdue.customer?.name} ·{' '}
                    {Math.max(
                      0,
                      Math.floor((Date.now() - new Date(overdue.due_on).getTime()) / 86400000),
                    )}{' '}
                    days overdue
                  </small>
                </span>
                <span>{amount(overdue.amount_due, overdue.currency)}</span>
              </button>
            )}
            {active && (
              <button className="activity-row" onClick={() => onOpen('subscriptions', active.id)}>
                <span className="activity-icon">
                  <Icon name="box" />
                </span>
                <span>
                  <strong>Subscription {active.number}</strong>
                  <small>
                    {active.customer?.name} · Renews{' '}
                    {renewalDays === 1 ? 'tomorrow' : day(active.next_billing_date)}
                  </small>
                </span>
                <span>{own ? 'Active' : 'Review'}</span>
              </button>
            )}
            {draft && (
              <button className="activity-row" onClick={() => onOpen('invoices', draft.id)}>
                <span className="activity-icon">
                  <Icon name="receipt" />
                </span>
                <span>
                  <strong>Invoice {draft.number}</strong>
                  <small>{draft.customer?.name} · Ready to send</small>
                </span>
                <span>Draft</span>
              </button>
            )}
            {!busy && !overdue && !active && !draft && <Empty>No activity.</Empty>}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panelhead">
          <h2>{own ? 'My subscriptions' : 'Recent subscriptions'}</h2>
          <button className="btn" onClick={() => onOpen('subscriptions')}>
            View all
          </button>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Customer</th>
                <th>Plan</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.slice(0, 2).map((subscription) => (
                <tr key={subscription.id} data-go={`subscriptions/${subscription.id}`}>
                  <td>
                    <button
                      className="row-link"
                      onClick={() => onOpen('subscriptions', subscription.id)}
                    >
                      {subscription.number}
                    </button>
                  </td>
                  <td>{own ? 'Your account' : subscription.customer?.name}</td>
                  <td>{subscription.plan?.name}</td>
                  <td>
                    <Status value={subscription.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
