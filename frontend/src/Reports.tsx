import { useEffect, useState } from 'react';
import { request, type Row } from './api';
import { Metric } from './Overview';
import { Empty, ErrorBox, Field, Loading, amount, label } from './ui';

export function Reports({
  token,
  revision,
  onOpen,
}: {
  token: string;
  revision: number;
  onOpen: (kind: string, id: number) => void;
}) {
  const now = new Date();
  const [from, setFrom] = useState(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(now.toISOString().slice(0, 10)),
    [currency, setCurrency] = useState('USD');
  const [view, setView] = useState('collections'),
    [summary, setSummary] = useState<Row | null>(null),
    [series, setSeries] = useState<Row[]>([]),
    [overdue, setOverdue] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError('');
    if (from && to && from > to) {
      setSummary(null);
      setSeries([]);
      setOverdue([]);
      setError('From date must be on or before To date.');
      setBusy(false);
      return;
    }
    request(`reports/summary?start=${from}&end=${to}`, token, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setSummary(result.overview);
        setSeries(result.series);
        setOverdue(result.overdue);
        const available = [
          ...new Set<string>([
            ...Object.keys(result.overview.currencies),
            ...result.series.map((point: Row) => point.currency),
          ]),
        ];
        setCurrency((current) => (available.includes(current) ? current : available[0] || 'USD'));
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [token, from, to, revision, retry]);
  const currencies = [
    ...new Set<string>([
      ...Object.keys(summary?.currencies || {}),
      ...series.map((point) => point.currency),
    ]),
  ];
  const points = series.filter((point) => point.currency === currency);
  const latest = points.at(-1);
  const maximum = Math.max(
    ...points.map((point) => Number(point[view === 'overdue' ? 'overdue_invoice_count' : view])),
    1,
  );
  const title =
    view === 'overdue' ? 'Overdue invoices' : view === 'collections' ? 'Collected' : 'Outstanding';
  const month = (period: string) =>
    new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(
      new Date(`${period}-01T00:00:00Z`),
    );
  return (
    <>
      <div className="toolbar report-toolbar">
        <Field name="From">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field name="To">
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        {currencies.length > 1 && (
          <Field name="Currency">
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {currencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <ErrorBox error={error} />
      {error && (
        <button className="btn" onClick={() => setRetry((value) => value + 1)}>
          Retry
        </button>
      )}
      {busy && <Loading />}
      <div className="grid metric-strip">
        <Metric
          title="Active subscriptions"
          value={summary ? Number(summary.active_subscriptions).toLocaleString('en') : '—'}
          note="Current"
        />
        <Metric
          title="Collected"
          value={latest ? amount(latest.collections, currency) : '—'}
          note={latest ? month(latest.period) : 'No data'}
        />
        <Metric
          title="Outstanding"
          value={latest ? amount(latest.outstanding, currency) : '—'}
          note={latest ? month(latest.period) : 'No data'}
        />
      </div>
      <div className="report-tabs" role="group" aria-label="Report view">
        {['collections', 'outstanding', 'overdue'].map((value) => (
          <button
            className={`btn ${view === value ? 'active' : ''}`}
            key={value}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {value === 'overdue' ? 'Overdue invoices' : label(value)}
          </button>
        ))}
      </div>
      {points.length ? (
        <div className="split">
          <section className="panel">
            <div className="panelhead">
              <h2>{title} over time</h2>
            </div>
            <div className="reportbars collection-chart" aria-label={`${title} in ${currency}`}>
              {points.map((point) => {
                const value = point[view === 'overdue' ? 'overdue_invoice_count' : view];
                return (
                  <div className="bar" key={point.period}>
                    <span>{month(point.period)}</span>
                    <i>
                      <b
                        style={
                          {
                            '--bar-width': `${(Number(value) / maximum) * 100}%`,
                          } as React.CSSProperties
                        }
                      />
                    </i>
                    <span className="mono">
                      {view === 'overdue' ? value : amount(value, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <div className="panelhead">
              <h2>{title} details</h2>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Collected</th>
                    <th>Outstanding</th>
                    <th>Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.period}>
                      <td>{month(point.period)}</td>
                      <td className="mono">{amount(point.collections, currency)}</td>
                      <td className="mono">{amount(point.outstanding, currency)}</td>
                      <td>{point.overdue_invoice_count} invoices</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        !busy && (
          <section className="panel">
            <Empty>No report data in this date range. Choose a different range.</Empty>
          </section>
        )
      )}
      {view === 'overdue' && (
        <section className="panel">
          <div className="panelhead">
            <h2>Overdue invoices</h2>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Due date</th>
                  <th>Amount due</th>
                </tr>
              </thead>
              <tbody>
                {overdue
                  .filter((bill) => bill.currency === currency)
                  .map((bill) => (
                    <tr key={bill.id}>
                      <td>
                        <button className="row-link" onClick={() => onOpen('invoices', bill.id)}>
                          {bill.number}
                        </button>
                      </td>
                      <td>{bill.customer?.name}</td>
                      <td>{bill.due_on}</td>
                      <td className="mono">{amount(bill.amount_due, currency)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
