import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, actionHeaders, request, type Row } from './api';
import { CatalogPicker, catalogKey } from './CatalogPicker';
import { Icon } from './Icon';
import { Dialog, Empty, ErrorBox, Field, Loading, Textarea, amount, today } from './ui';

const ownedFields: Record<string, string[]> = {
  staff: ['name', 'email', 'password', 'active'],
  products: [
    'name',
    'type',
    'sku',
    'sales_price',
    'cost_price',
    'currency',
    'notes',
    'variants',
    'active',
  ],
  plans: [
    'name',
    'price',
    'currency',
    'billing_interval',
    'minimum_quantity',
    'available_from',
    'available_until',
    'allow_pause',
    'allow_early_close',
    'allow_renewal',
    'auto_close',
    'active',
  ],
  'tax-rules': [
    'name',
    'rate_percent',
    'country',
    'region',
    'effective_from',
    'effective_until',
    'active',
  ],
  'discount-rules': [
    'name',
    'kind',
    'value',
    'currency',
    'scope',
    'minimum_purchase',
    'minimum_quantity',
    'starts_on',
    'ends_on',
    'usage_limit',
    'product_ids',
    'active',
  ],
  'quotation-templates': ['name', 'plan_id', 'validity_days', 'lines', 'active'],
  subscriptions: [
    'customer_id',
    'plan_id',
    'template_id',
    'start_date',
    'expiry_date',
    'payment_terms_days',
    'billing_country',
    'billing_region',
    'billing_timezone',
    'lines',
  ],
};
const titles: Record<string, string> = {
  staff: 'staff member',
  products: 'product',
  plans: 'plan',
  'tax-rules': 'tax rule',
  'discount-rules': 'discount rule',
  'quotation-templates': 'quotation template',
  subscriptions: 'subscription',
};
const currencies = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'SGD', 'JPY', 'KWD'];
const dateKeys = new Set(['available_from', 'available_until', 'effective_until', 'ends_on']);

function EditorFrame({
  title,
  children,
  onClose,
  busy,
  inline,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy: boolean;
  inline: boolean;
}) {
  if (!inline)
    return (
      <Dialog title={title} onClose={onClose} busy={busy} variant="editor">
        {children}
      </Dialog>
    );
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">
            <button className="back-link" disabled={busy} onClick={onClose}>
              ← Back to list
            </button>
          </div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="split">
        <section className="panel">
          <div className="panelhead">
            <div>
              <h2>Details</h2>
              <p>Set up the information below to continue.</p>
            </div>
            <span className="pill neutral">Draft</span>
          </div>
          {children}
        </section>
        <aside className="panel review-panel">
          <div className="review-head">
            <Icon name="check" />
            <span>Ready to review</span>
          </div>
          <h2>Before you continue</h2>
          <p className="muted">
            Check the dates, pricing, and permissions against the customer agreement.
          </p>
        </aside>
      </div>
    </>
  );
}
function defaults(kind: string) {
  const expiry = new Date();
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  const common: Record<string, any> = { active: true };
  const specific: Record<string, object> = {
    staff: { name: '', email: '', password: '' },
    products: {
      name: '',
      type: 'software',
      sku: '',
      sales_price: '',
      cost_price: '0',
      currency: 'USD',
      notes: '',
      variants: [],
    },
    plans: {
      name: '',
      price: '',
      currency: 'USD',
      billing_interval: 'monthly',
      minimum_quantity: 1,
      available_from: '',
      available_until: '',
      allow_pause: false,
      allow_early_close: false,
      allow_renewal: false,
      auto_close: false,
    },
    'tax-rules': {
      name: '',
      rate_percent: '',
      country: '',
      region: '',
      effective_from: today(),
      effective_until: '',
    },
    'discount-rules': {
      name: '',
      kind: 'percentage',
      value: '',
      currency: 'USD',
      scope: 'subscription',
      minimum_purchase: '0',
      minimum_quantity: 1,
      starts_on: today(),
      ends_on: '',
      usage_limit: '',
      product_ids: [],
    },
    'quotation-templates': { name: '', plan_id: '', validity_days: 30, lines: [] },
    subscriptions: {
      customer_id: '',
      plan_id: '',
      template_id: '',
      start_date: today(),
      expiry_date: expiry.toISOString().slice(0, 10),
      payment_terms_days: 14,
      billing_country: '',
      billing_region: '',
      billing_timezone: 'UTC',
      lines: [],
    },
  };
  return { ...common, ...specific[kind] };
}

export function Editor({
  kind,
  token,
  initial,
  onClose,
  onSaved,
  inline = false,
}: {
  kind: string;
  token: string;
  initial?: Row;
  onClose: () => void;
  onSaved: (row: Row) => void;
  inline?: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, any>>(() => ({
    ...defaults(kind),
    ...initial,
  }));
  const [references, setReferences] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState(false);
  const [key] = useState(crypto.randomUUID());
  const [retry, setRetry] = useState(0);
  const [customerSearch, setCustomerSearch] = useState(''),
    [customerMatches, setCustomerMatches] = useState<Row[]>([]),
    [customerBusy, setCustomerBusy] = useState(false),
    [selectedCustomer, setSelectedCustomer] = useState<Row | null>(initial?.customer || null);
  const set = (name: string, value: any) =>
    setDraft((current) => ({
      ...current,
      [name]: value,
      ...(name === 'scope' && value === 'subscription' ? { product_ids: [] } : {}),
    }));
  const plan = references.plans?.find((row) => row.id === Number(draft.plan_id));
  const currency = plan?.currency || draft.currency || 'USD';
  const customerOptions = customerSearch ? customerMatches : references.customers || [];
  const customers =
    selectedCustomer && !customerOptions.some((row) => row.id === selectedCustomer.id)
      ? [selectedCustomer, ...customerOptions]
      : customerOptions;
  useEffect(() => {
    if (kind !== 'subscriptions' || !customerSearch) {
      setCustomerMatches([]);
      setCustomerBusy(false);
      return;
    }
    const controller = new AbortController();
    setCustomerBusy(true);
    const timer = setTimeout(
      () =>
        request(`customers?limit=100&search=${encodeURIComponent(customerSearch)}`, token, {
          signal: controller.signal,
        })
          .then((result) => setCustomerMatches(result.data))
          .catch((cause) => {
            if (cause.name !== 'AbortError') setError(cause.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setCustomerBusy(false);
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [customerSearch, kind, token]);
  useEffect(() => {
    const names =
      kind === 'subscriptions'
        ? ['customers', 'plans', 'quotation-templates', 'catalog-items']
        : kind === 'quotation-templates'
          ? ['plans', 'catalog-items']
          : kind === 'discount-rules'
            ? ['products']
            : [];
    if (!names.length) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.allSettled(
      names.map((name) => request(`${name}?limit=100`, token, { signal: controller.signal })),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const next: Record<string, Row[]> = {};
      const failures: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[names[index]] = result.value.data;
        else failures.push(result.reason.message);
      });
      setReferences(next);
      if (failures.length) setError(failures.join(' '));
      setLoading(false);
    });
    return () => controller.abort();
  }, [kind, token, retry]);
  function field(
    name: string,
    title: string,
    type = 'text',
    options?: { value: string | number; title: string }[],
  ) {
    const attrs = {
      value: draft[name] ?? '',
      'aria-invalid': Boolean(errors[name]),
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (name === 'customer_id')
          setSelectedCustomer(
            customers.find((row) => row.id === Number(event.target.value)) || null,
          );
        set(name, event.target.value);
      },
      disabled: busy,
    };
    return (
      <Field name={title} error={errors[name]}>
        {options ? (
          <select {...attrs}>
            <option value="">Select…</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.title}
              </option>
            ))}
          </select>
        ) : (
          <input {...attrs} type={type} step={type === 'number' ? 'any' : undefined} />
        )}
      </Field>
    );
  }
  function checkbox(name: string, title: string) {
    return (
      <label className="check-field">
        <input
          type="checkbox"
          checked={Boolean(draft[name])}
          disabled={busy}
          onChange={(event) => set(name, event.target.checked)}
        />
        {title}
      </label>
    );
  }
  const currencyField = () =>
    field(
      'currency',
      'Currency',
      'text',
      currencies.map((code) => ({ value: code, title: code })),
    );
  function chooseTemplate(id: string) {
    const selected = references['quotation-templates']?.find((row) => row.id === Number(id));
    setDraft((current) => ({
      ...current,
      template_id: id,
      ...(selected
        ? { plan_id: selected.plan_id, lines: selected.lines.map((line: Row) => ({ ...line })) }
        : {}),
    }));
  }
  function addLines(rows: Row[]) {
    const lines = new Map((draft.lines || []).map((line: Row) => [catalogKey(line), line]));
    rows.forEach((row) => {
      if (!lines.has(catalogKey(row)))
        lines.set(catalogKey(row), {
          product_id: row.product_id,
          variant_id: row.variant_id,
          quantity: 1,
          name: row.name,
          variant_name: row.variant_name,
          unit_price: row.unit_price,
          currency: row.currency,
        });
    });
    set('lines', [...lines.values()]);
    setPicker(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setErrors({});
    setBusy(true);
    try {
      const payload: Record<string, any> = {};
      const keys =
        kind === 'staff'
          ? initial
            ? ['name', 'active']
            : ['name', 'email', 'password']
          : ownedFields[kind];
      for (const name of keys) {
        const value = draft[name];
        if (dateKeys.has(name)) payload[name] = value || null;
        else if (name === 'usage_limit') payload[name] = value === '' ? null : Number(value);
        else if (name === 'template_id' || name === 'plan_id') {
          if (value) payload[name] = Number(value);
        } else if (name === 'lines')
          payload[name] = value.map((line: Row) => ({
            product_id: Number(line.product_id),
            variant_id: line.variant_id ?? null,
            quantity: Number(line.quantity),
          }));
        else if (!(initial && kind === 'staff' && name === 'password') && value !== undefined)
          payload[name] = value;
      }
      if (kind === 'subscriptions') payload.customer_id = Number(payload.customer_id);
      const row = await request(`${kind}${initial ? `/${initial.id}` : ''}`, token, {
        method: initial ? 'PATCH' : 'POST',
        headers: actionHeaders(initial?.version, key),
        body: JSON.stringify(kind === 'staff' ? payload : { payload }),
      });
      onSaved(row);
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof ApiError)
        setErrors(Object.fromEntries(cause.fields.map((item) => [item.field, item.message])));
    } finally {
      setBusy(false);
    }
  }
  return (
    <EditorFrame
      title={
        inline
          ? kind === 'subscriptions'
            ? 'New subscription'
            : `${kind === 'quotation-templates' ? 'Template' : kind === 'discount-rules' ? 'Discount' : kind === 'products' ? 'Product' : 'Plan'} editor`
          : `${initial ? 'Edit' : 'Add'} ${titles[kind]}`
      }
      onClose={onClose}
      busy={busy}
      inline={inline}
    >
      <form noValidate onSubmit={save}>
        <ErrorBox error={error} focus />
        {Object.keys(errors).length > 0 && (
          <ul className="field-error-summary">
            {Object.entries(errors).map(([name, message]) => (
              <li key={name}>
                {name.replaceAll('_', ' ')}: {message}
              </li>
            ))}
          </ul>
        )}
        {loading && <Loading />}
        {error &&
          !Object.keys(references).length &&
          ['subscriptions', 'quotation-templates'].includes(kind) && (
            <button className="btn" type="button" onClick={() => setRetry((value) => value + 1)}>
              Retry loading options
            </button>
          )}
        <div className="form-grid">
          {kind !== 'subscriptions' &&
            field(
              'name',
              kind === 'products'
                ? 'Product name'
                : kind === 'plans'
                  ? 'Plan name'
                  : kind === 'quotation-templates'
                    ? 'Template name'
                    : ['tax-rules', 'discount-rules'].includes(kind)
                      ? 'Rule name'
                      : 'Name',
            )}
          {kind === 'staff' && (
            <>
              {!initial && (
                <>
                  {field('email', 'Email', 'email')}
                  {field('password', 'Temporary password', 'password')}
                </>
              )}
              {initial && checkbox('active', 'Active')}
            </>
          )}
          {kind === 'products' && (
            <>
              {field('type', 'Type', 'text', [
                { value: 'software', title: 'Software' },
                { value: 'add_on', title: 'Add-on' },
                { value: 'service', title: 'Service' },
              ])}
              {field('sku', 'SKU')}
              {currencyField()}
              {field('sales_price', 'Sales price', 'number')}
              {field('cost_price', 'Cost price', 'number')}
              <Field name="Notes" wide>
                <Textarea
                  className="resize-none"
                  rows={3}
                  value={draft.notes}
                  onChange={(event) => set('notes', event.target.value)}
                />
              </Field>
              <fieldset className="field-wide">
                <legend>Variants</legend>
                {draft.variants.map((variant: Row, index: number) => (
                  <div className="variant-row" key={index}>
                    <Field name="Variant name">
                      <input
                        value={variant.name}
                        onChange={(event) =>
                          set(
                            'variants',
                            draft.variants.map((row: Row, i: number) =>
                              i === index ? { ...row, name: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field name="Brand">
                      <input
                        value={variant.brand || ''}
                        onChange={(event) =>
                          set(
                            'variants',
                            draft.variants.map((row: Row, i: number) =>
                              i === index ? { ...row, brand: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field name="Price adjustment">
                      <input
                        type="number"
                        step="any"
                        value={variant.price_adjustment}
                        onChange={(event) =>
                          set(
                            'variants',
                            draft.variants.map((row: Row, i: number) =>
                              i === index ? { ...row, price_adjustment: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={variant.active !== false}
                        onChange={(event) =>
                          set(
                            'variants',
                            draft.variants.map((row: Row, i: number) =>
                              i === index ? { ...row, active: event.target.checked } : row,
                            ),
                          )
                        }
                      />
                      Active
                    </label>
                    {!initial && (
                      <button
                        className="btn"
                        type="button"
                        onClick={() =>
                          set(
                            'variants',
                            draft.variants.filter((_: Row, i: number) => i !== index),
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    set('variants', [
                      ...draft.variants,
                      { name: '', brand: '', price_adjustment: '0', active: true },
                    ])
                  }
                >
                  Add variant
                </button>
              </fieldset>
            </>
          )}
          {kind === 'plans' && (
            <>
              {currencyField()}
              {field('price', 'Plan fee', 'number')}
              {field(
                'billing_interval',
                'Billing interval',
                'text',
                ['daily', 'weekly', 'monthly', 'yearly'].map((value) => ({
                  value,
                  title: value[0].toUpperCase() + value.slice(1),
                })),
              )}
              {field('minimum_quantity', 'Minimum quantity', 'number')}
              {field('available_from', 'Available from', 'date')}
              {field('available_until', 'Available until', 'date')}
              <fieldset className="field-wide permission-fields">
                <legend>Plan permissions</legend>
                {checkbox('allow_pause', 'Allow pause and resume')}
                {checkbox('allow_early_close', 'Allow early closure')}
                {checkbox('allow_renewal', 'Allow renewal')}
                {checkbox('auto_close', 'Close automatically at term end')}
              </fieldset>
            </>
          )}
          {kind === 'tax-rules' && (
            <>
              {field('rate_percent', 'Rate (%)', 'number')}
              {field('country', 'Country code')}
              {field('region', 'Region')}
              {field('effective_from', 'Effective from', 'date')}
              {field('effective_until', 'Effective until', 'date')}
            </>
          )}
          {kind === 'discount-rules' && (
            <>
              {field('kind', 'Discount type', 'text', [
                { value: 'fixed', title: 'Fixed amount' },
                { value: 'percentage', title: 'Percentage' },
              ])}
              {field(
                'value',
                draft.kind === 'percentage' ? 'Percentage' : 'Discount amount',
                'number',
              )}
              {currencyField()}
              {field('minimum_purchase', 'Minimum purchase', 'number')}
              {field('minimum_quantity', 'Minimum quantity', 'number')}
              {field('starts_on', 'Starts on', 'date')}
              {field('ends_on', 'Ends on', 'date')}
              {field('usage_limit', 'Usage limit', 'number')}
              {field('scope', 'Applies to', 'text', [
                { value: 'subscription', title: 'Whole subscription' },
                { value: 'products', title: 'Selected products' },
              ])}
              {draft.scope === 'products' && (
                <fieldset className="field-wide">
                  <legend>Selected products</legend>
                  {draft.product_ids.map((id: number) => (
                    <div className="selected-product" key={id}>
                      <span>
                        {references.products?.find((row) => row.id === id)?.name || `Product ${id}`}
                      </span>
                      <button
                        className="btn"
                        type="button"
                        onClick={() =>
                          set(
                            'product_ids',
                            draft.product_ids.filter((value: number) => value !== id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button className="btn" type="button" onClick={() => setPicker(true)}>
                    Select products
                  </button>
                </fieldset>
              )}
            </>
          )}
          {['subscriptions', 'quotation-templates'].includes(kind) && (
            <>
              {kind === 'subscriptions' && (
                <>
                  <Field name="Find customer">
                    <input
                      type="search"
                      placeholder="Customer name or email"
                      value={customerSearch}
                      onChange={(event) => setCustomerSearch(event.target.value)}
                    />
                  </Field>
                  {customerBusy && <Loading />}
                  {field(
                    'customer_id',
                    'Customer',
                    'text',
                    customers.map((row) => ({
                      value: row.id,
                      title: `${row.name} · ${row.email}`,
                    })),
                  )}
                  <Field name="Quotation template">
                    <select
                      value={draft.template_id || ''}
                      onChange={(event) => chooseTemplate(event.target.value)}
                    >
                      <option value="">None</option>
                      {references['quotation-templates']
                        ?.filter((row) => row.active !== false)
                        .map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                </>
              )}
              {field(
                'plan_id',
                'Plan',
                'text',
                (references.plans || [])
                  .filter((row) => row.active !== false)
                  .map((row) => ({
                    value: row.id,
                    title: `${row.name} · ${amount(row.price, row.currency)}`,
                  })),
              )}
              {kind === 'subscriptions' ? (
                <>
                  {field('start_date', 'Start date', 'date')}
                  {field('expiry_date', 'Expiry date', 'date')}
                  {field('payment_terms_days', 'Payment terms (days)', 'number')}
                  {field('billing_country', 'Billing country code')}
                  {field('billing_region', 'Billing region')}
                  {field('billing_timezone', 'Billing timezone')}
                </>
              ) : (
                field('validity_days', 'Quotation validity (days)', 'number')
              )}
              <fieldset className="field-wide">
                <legend>Product lines</legend>
                <div className="tablewrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Quantity</th>
                        <th className="numeric">Unit price</th>
                        <th className="numeric">Amount</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((line: Row, index: number) => {
                        const item = references['catalog-items']?.find(
                          (row) => catalogKey(row) === catalogKey(line),
                        );
                        return (
                          <tr key={`${catalogKey(line)}:${index}`}>
                            <td>
                              <strong>
                                {item?.name || line.name || `Product ${line.product_id}`}
                              </strong>
                              <small>{item?.variant_name || line.variant_name}</small>
                            </td>
                            <td>
                              <input
                                className="quantity-input"
                                aria-label={`Quantity for ${item?.name || line.name || 'product'}`}
                                type="number"
                                min="1"
                                step="1"
                                value={line.quantity}
                                onChange={(event) =>
                                  set(
                                    'lines',
                                    draft.lines.map((row: Row, i: number) =>
                                      i === index ? { ...row, quantity: event.target.value } : row,
                                    ),
                                  )
                                }
                              />
                            </td>
                            <td className="numeric">
                              {amount(
                                item?.unit_price || line.unit_price || 0,
                                item?.currency || currency,
                              )}
                            </td>
                            <td className="numeric">
                              {amount(
                                Number(item?.unit_price || line.unit_price || 0) *
                                  Number(line.quantity),
                                item?.currency || currency,
                              )}
                            </td>
                            <td>
                              <button
                                className="btn"
                                type="button"
                                aria-label={`Remove ${item?.name || line.name || 'product'}`}
                                onClick={() =>
                                  set(
                                    'lines',
                                    draft.lines.filter((_: Row, i: number) => i !== index),
                                  )
                                }
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!draft.lines.length && <Empty>Select at least one product.</Empty>}
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={() => setPicker(true)}
                  disabled={!draft.plan_id}
                >
                  Add product
                </button>
                {plan && (
                  <span className="line-plan-fee">
                    Plan fee {amount(plan.price, plan.currency)} · Minimum quantity{' '}
                    {plan.minimum_quantity}
                  </span>
                )}
              </fieldset>
            </>
          )}
          {!['staff', 'subscriptions'].includes(kind) && checkbox('active', 'Active')}
        </div>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || loading || customerBusy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
      {picker && (
        <CatalogPicker
          token={token}
          currency={kind === 'discount-rules' ? undefined : currency}
          baseOnly={kind === 'discount-rules'}
          onClose={() => setPicker(false)}
          selected={kind === 'discount-rules' ? [] : draft.lines}
          onApply={(rows) => {
            if (kind === 'discount-rules') {
              set('product_ids', [
                ...new Set([...draft.product_ids, ...rows.map((row) => row.product_id)]),
              ]);
              setPicker(false);
            } else addLines(rows);
          }}
        />
      )}
    </EditorFrame>
  );
}
