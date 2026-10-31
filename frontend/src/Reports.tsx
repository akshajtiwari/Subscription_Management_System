import { useEffect, useState } from 'react';
import { request, type Row } from './api';
import { Empty, ErrorBox, Field, Loading, Status, amount, day } from './ui';

export function Reports({
  token,
  overview = false,
  revision,
  onOpen,
}: {
  token: string;
  overview?: boolean;
  revision: number;
  onOpen: (kind: string, id: number) => void;
}) {
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [currency, setCurrency] = useState('USD');
  const [summary, setSummary] = useState<Row | null>(null),
    [series, setSeries] = useState<Row[]>([]),
    [overdue, setOverdue] = useState<Row[]>([]),
    [busy, setBusy] = useState(true),
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
    const query = `?start=${from}&end=${to}`;
    request(`reports/summary${query}`, token, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setSummary(result.overview);
        const available = Object.keys(result.overview.currencies);
        setCurrency((current) => (available.includes(current) ? current : available[0] || 'USD'));
        setSeries(result.series);
        setOverdue(result.overdue);
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [token, from, to, retry, revision]);
  const currencies = [
    ...new Set([...Object.keys(summary?.currencies || {}), ...series.map((row) => row.currency)]),
  ];
  if (!currencies.length) currencies.push('USD');
  const metrics = summary?.currencies?.[currency] || {
    collections: '0',
    outstanding: '0',
    overdue_amount: '0',
    overdue_invoice_count: 0,
  };
  const points = series.filter((row) => row.currency === currency);
  const maximum = Math.max(...points.map((row) => Number(row.collections)), 1);
  const outstanding = overdue.filter((row) => row.currency === currency);
  return (
    <div className="reports">
      <div className="filter-bar">
        {!overview && (
          <>
            <Field name="From">
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field name="To">
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </>
        )}
        <Field name="Currency">
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {currencies.map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </Field>
        {!overview && (from || to) && (
          <button
            className="btn"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            Clear dates
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      {error && (
        <button className="btn" onClick={() => setRetry((value) => value + 1)}>
          Retry
        </button>
      )}
      {busy && <Loading />}
      <div className="metric-strip">
        <div>
          <span>Active subscriptions</span>
          <strong>{summary?.active_subscriptions ?? '—'}</strong>
        </div>
        <div>
          <span>Collections</span>
          <strong>{amount(metrics.collections, currency)}</strong>
        </div>
        <div>
          <span>Outstanding</span>
          <strong>{amount(metrics.outstanding, currency)}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong>{amount(metrics.overdue_amount, currency)}</strong>
        </div>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Collections by month</h2>
          <span className="muted">{currency}</span>
        </div>
        {points.length ? (
          <>
            <div className="collection-chart" aria-label={`Monthly collections in ${currency}`}>
              {points.map((point) => (
                <div className="chart-column" key={point.period}>
                  <strong>{amount(point.collections, currency)}</strong>
                  <div className="bar-track">
                    <div
                      className="chart-bar"
                      style={{
                        height: `${Math.max(2, (Number(point.collections) / maximum) * 100)}%`,
                      }}
                    />
                  </div>
                  <span>{point.period}</span>
                </div>
              ))}
            </div>
            {!overview && (
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Currency</th>
                      <th className="numeric">Collections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point) => (
                      <tr key={point.period}>
                        <td>{point.period}</td>
                        <td>{currency}</td>
                        <td className="numeric">{amount(point.collections, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          !busy && <Empty>No payments in this date range.</Empty>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Overdue invoices</h2>
          <span className="muted">{outstanding.length} invoices</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Due date</th>
                <th>Status</th>
                <th className="numeric">Amount due</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button className="text-button" onClick={() => onOpen('invoices', row.id)}>
                      {row.number}
                    </button>
                  </td>
                  <td>{row.customer?.name}</td>
                  <td>{day(row.due_on)}</td>
                  <td>
                    <Status value="overdue" />
                  </td>
                  <td className="numeric">{amount(row.amount_due, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!busy && !outstanding.length && <Empty>No overdue invoices in this date range.</Empty>}
        </div>
      </section>
    </div>
  );
}
