import { useState, type FormEvent } from 'react';
import { ApiError, actionHeaders, request, type Row } from './api';
import { CatalogPicker } from './CatalogPicker';
import { Dialog, ErrorBox, Field, amount, day, label, today } from './ui';

export type Command = {
  title: string;
  path: string;
  version?: number;
  body?: object;
  summary?: string;
};

export function Review({
  command,
  token,
  onClose,
  onDone,
  onReload,
}: {
  command: Command;
  token: string;
  onClose: () => void;
  onDone: (row: Row) => void;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [stale, setStale] = useState(false);
  const [key] = useState(crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const row = await request(command.path, token, {
        method: 'POST',
        headers: actionHeaders(command.version, key),
        body: JSON.stringify(command.body || {}),
      });
      onDone(row);
    } catch (cause) {
      setError((cause as Error).message);
      setStale(cause instanceof ApiError && cause.status === 412);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={command.title} onClose={onClose} busy={busy}>
      <form noValidate onSubmit={submit}>
        {command.summary && <p className="review-summary">{command.summary}</p>}
        <ErrorBox error={error} focus />
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {stale ? (
            <button type="button" className="primary" onClick={onReload}>
              Reload record
            </button>
          ) : (
            <button className="primary" disabled={busy}>
              {busy ? 'Working…' : command.title}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

export function PaymentDialog({
  invoice,
  token,
  onClose,
  onDone,
}: {
  invoice: Row;
  token: string;
  onClose: () => void;
  onDone: (row: Row) => void;
}) {
  const [value, setValue] = useState(invoice.amount_due),
    [method, setMethod] = useState('bank_transfer'),
    [paidAt, setPaidAt] = useState(`${today()}T12:00`),
    [note, setNote] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [key] = useState(crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!paidAt || !Number(value) || Number(value) > Number(invoice.amount_due))
        throw new Error('Enter a positive amount within the invoice balance and a payment date.');
      const row = await request(`invoices/${invoice.id}/payments`, token, {
        method: 'POST',
        headers: actionHeaders(invoice.version, key),
        body: JSON.stringify({
          method,
          amount: String(value),
          currency: invoice.currency,
          paid_at: new Date(paidAt).toISOString(),
          note,
        }),
      });
      onDone(row);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Record payment" onClose={onClose} busy={busy}>
      <form noValidate onSubmit={submit}>
        <p className="review-summary">
          {invoice.number} · Amount due {amount(invoice.amount_due, invoice.currency)}
        </p>
        <ErrorBox error={error} focus />
        <div className="form-grid">
          <Field name={`Amount (${invoice.currency})`}>
            <input
              type="number"
              min="0"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          <Field name="Method">
            <select value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field name="Payment date">
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </Field>
          <Field name="Note" wide>
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </div>
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function BillingDialog({
  token,
  retry,
  onClose,
  onDone,
}: {
  token: string;
  retry?: Row;
  onClose: () => void;
  onDone: (row: Row) => void;
}) {
  const [dueOn, setDueOn] = useState(retry?.due_on || today()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [key] = useState(crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!dueOn) throw new Error('Choose a billing date.');
      const row = await request('billing-runs', token, {
        method: 'POST',
        headers: actionHeaders(undefined, key),
        body: JSON.stringify({
          due_on: dueOn,
          ...(retry
            ? {
                subscription_ids: [
                  ...new Set(retry.failures.map((failure: Row) => failure.subscription_id)),
                ],
              }
            : {}),
        }),
      });
      onDone(row);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={retry ? 'Retry failed subscriptions' : 'Run billing'}
      onClose={onClose}
      busy={busy}
    >
      <form noValidate onSubmit={submit}>
        <ErrorBox error={error} focus />
        <Field name="Bill subscriptions due through">
          <input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} />
        </Field>
        {retry && <p>{retry.failed_count} failed subscriptions</p>}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Running…' : retry ? 'Retry failed' : 'Run billing'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ChangeDialog({
  subscription,
  action,
  token,
  onClose,
  onDone,
}: {
  subscription: Row;
  action: string;
  token: string;
  onClose: () => void;
  onDone: (row: Row) => void;
}) {
  const [product, setProduct] = useState<Row | null>(null),
    [quantity, setQuantity] = useState(1),
    [picker, setPicker] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [key] = useState(crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (
        action === 'add_on' &&
        (!product || !Number.isInteger(Number(quantity)) || Number(quantity) < 1)
      )
        throw new Error('Choose an add-on and a positive whole quantity.');
      const row = await request(`me/subscriptions/${subscription.id}/requests`, token, {
        method: 'POST',
        headers: actionHeaders(subscription.version, key),
        body: JSON.stringify({
          action,
          ...(product
            ? {
                product_id: product.product_id,
                variant_id: product.variant_id,
                quantity: Number(quantity),
              }
            : {}),
        }),
      });
      onDone(row);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Request ${label(action)}`} onClose={onClose} busy={busy}>
      <form noValidate onSubmit={submit}>
        <p className="review-summary">
          {subscription.number} · {subscription.plan?.name}
        </p>
        <p>Staff approval is required. Changes apply at the next billing boundary.</p>
        <ErrorBox error={error} focus />
        {action === 'add_on' ? (
          <>
            <button type="button" onClick={() => setPicker(true)}>
              {product ? 'Change add-on' : 'Select add-on'}
            </button>
            {product && (
              <p>
                <strong>
                  {product.name} {product.variant_name}
                </strong>{' '}
                · {amount(product.unit_price, product.currency)}
              </p>
            )}
            <Field name="Quantity">
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </Field>
          </>
        ) : (
          <p>Next billing date: {day(subscription.next_billing_date)}</p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Requesting…' : 'Send request'}
          </button>
        </div>
      </form>
      {picker && (
        <CatalogPicker
          token={token}
          currency={subscription.currency}
          single
          onClose={() => setPicker(false)}
          onApply={(rows) => {
            setProduct(rows[0]);
            setPicker(false);
          }}
        />
      )}
    </Dialog>
  );
}
