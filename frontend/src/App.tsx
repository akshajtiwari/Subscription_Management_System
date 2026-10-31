import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Auth } from './Auth';
import { request, downloadInvoice, type Row, type User } from './api';
import { BillingDialog, ChangeDialog, PaymentDialog, Review, type Command } from './Actions';
import { Detail } from './Detail';
import { Editor } from './Editor';
import { Reports } from './Reports';
import { Dialog, Empty, ErrorBox, Field, Loading, Status, amount, day, label } from './ui';

const resources = [
  { id: 'overview', title: 'Overview', group: 'Billing operations', icon: 'grid' },
  { id: 'customers', title: 'Customers', group: 'Billing operations', icon: 'users' },
  { id: 'subscriptions', title: 'Subscriptions', group: 'Billing operations', icon: 'repeat' },
  { id: 'invoices', title: 'Invoices', group: 'Billing operations', icon: 'file' },
  { id: 'payments', title: 'Payments', group: 'Billing operations', icon: 'card' },
  { id: 'billing-runs', title: 'Billing runs', group: 'Billing operations', icon: 'repeat' },
  { id: 'reports', title: 'Reports', group: 'Billing operations', icon: 'chart' },
  { id: 'requests', title: 'Customer requests', group: 'Billing operations', icon: 'file' },
  { id: 'products', title: 'Products', group: 'Catalog & pricing', icon: 'box' },
  { id: 'plans', title: 'Plans', group: 'Catalog & pricing', icon: 'calendar' },
  { id: 'tax-rules', title: 'Tax rules', group: 'Catalog & pricing', icon: 'settings' },
  { id: 'discount-rules', title: 'Discount rules', group: 'Catalog & pricing', icon: 'tag' },
  {
    id: 'quotation-templates',
    title: 'Quotation templates',
    group: 'Catalog & pricing',
    icon: 'file',
  },
  { id: 'staff', title: 'Staff members', group: 'Team access', icon: 'users' },
  { id: 'outbox', title: 'Demo outbox', group: 'Team access', icon: 'file' },
  { id: 'account', title: 'My account', group: 'Account', icon: 'user' },
];
const configurations = new Set(['products', 'plans', 'tax-rules', 'discount-rules']);
const creatable = new Set([...configurations, 'staff', 'quotation-templates', 'subscriptions']);
const singular: Record<string, string> = {
  products: 'product',
  plans: 'plan',
  'tax-rules': 'tax rule',
  'discount-rules': 'discount rule',
  staff: 'staff member',
  'quotation-templates': 'quotation template',
  subscriptions: 'subscription',
};
const statusOptions: Record<string, string[]> = {
  subscriptions: [
    'draft',
    'quotation',
    'confirmed',
    'active',
    'paused',
    'awaiting_renewal',
    'closed',
  ],
  invoices: ['draft', 'confirmed', 'paid', 'canceled', 'overdue'],
  requests: ['pending', 'approved', 'rejected', 'applied'],
  products: ['active', 'inactive'],
  plans: ['active', 'inactive'],
  'tax-rules': ['active', 'inactive'],
  'discount-rules': ['active', 'inactive'],
  'quotation-templates': ['active', 'inactive'],
  staff: ['active', 'inactive'],
};
const navigate = (resource: string, id?: number) => {
  location.hash = `${resource}${id ? `/${id}` : ''}`;
};
const routeFromHash = () => {
  const [resource, id] = location.hash.slice(1).split('/');
  return { resource: resource || 'overview', id: /^\d+$/.test(id || '') ? Number(id) : null };
};

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    users:
      'M16 21v-2a5 5 0 0 0-5-5H6a5 5 0 0 0-5 5v2 M17 4a4 4 0 0 1 0 8 M22 21v-2a5 5 0 0 0-3-4 M8.5 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8',
    user: 'M5 21v-2a7 7 0 0 1 14 0v2 M12 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8',
    file: 'M5 3h9l5 5v13H5z M14 3v6h5 M9 13h6 M9 17h6',
    repeat: 'M4 8a6 6 0 0 1 6-4h9l-3-3 M20 16a6 6 0 0 1-6 4H5l3 3 M19 4l-3 3 M5 20l3-3',
    card: 'M3 5h18v14H3z M3 10h18 M7 15h4',
    chart: 'M3 3v18h18 M6 16l4-5 4 2 6-8',
    box: 'M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10',
    calendar: 'M3 5h18v16H3z M7 2v6 M17 2v6 M3 11h18',
    settings: 'M3 6h18 M3 12h18 M3 18h18 M8 3v6 M16 9v6 M10 15v6',
    tag: 'M3 4h8l10 10-7 7L3 10z M7 7h1',
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[name] || paths.file} />
    </svg>
  );
}

function Account({
  user,
  token,
  onSaved,
}: {
  user: User;
  token: string;
  onSaved: (user: User) => void;
}) {
  const [name, setName] = useState(user.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const row = await request('me', token, { method: 'PATCH', body: JSON.stringify({ name }) });
      onSaved(row);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel account-panel" noValidate onSubmit={submit}>
      <h2>Account details</h2>
      <ErrorBox error={error} focus />
      <Field name="Name">
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field name="Email">
        <input value={user.email} readOnly type="email" />
      </Field>
      <Field name="Role">
        <input value={label(user.role)} readOnly />
      </Field>
      <button className="primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

type Column = { title: string; value: (row: Row) => any; numeric?: boolean };
function columns(kind: string): Column[] {
  const status: Column = {
    title: 'Status',
    value: (row) => (
      <Status
        value={
          row.overdue ? 'overdue' : row.status || (row.active === false ? 'inactive' : 'active')
        }
      />
    ),
  };
  const common: Record<string, Column[]> = {
    customers: [
      { title: 'Customer', value: (row) => <strong>{row.name}</strong> },
      { title: 'Email', value: (row) => row.email },
      status,
    ],
    staff: [
      { title: 'Name', value: (row) => <strong>{row.name}</strong> },
      { title: 'Email', value: (row) => row.email },
      status,
    ],
    products: [
      {
        title: 'Product',
        value: (row) => (
          <>
            <strong>{row.name}</strong>
            <small>{row.sku || row.number}</small>
          </>
        ),
      },
      { title: 'Type', value: (row) => label(row.type || 'software') },
      {
        title: 'Sales price',
        numeric: true,
        value: (row) => amount(row.sales_price, row.currency),
      },
      status,
    ],
    plans: [
      { title: 'Plan', value: (row) => <strong>{row.name}</strong> },
      { title: 'Interval', value: (row) => label(row.billing_interval) },
      { title: 'Plan fee', numeric: true, value: (row) => amount(row.price, row.currency) },
      status,
    ],
    'tax-rules': [
      { title: 'Tax rule', value: (row) => row.name },
      { title: 'Rate', numeric: true, value: (row) => `${row.rate_percent}%` },
      {
        title: 'Jurisdiction',
        value: (row) => [row.country, row.region].filter(Boolean).join(' · ') || 'All',
      },
      { title: 'Effective from', value: (row) => day(row.effective_from) },
      status,
    ],
    'discount-rules': [
      { title: 'Discount', value: (row) => row.name },
      {
        title: 'Value',
        numeric: true,
        value: (row) =>
          row.kind === 'percentage' ? `${row.value}%` : amount(row.value, row.currency),
      },
      {
        title: 'Usage',
        value: (row) => `${row.usage_count || 0} / ${row.usage_limit || 'Unlimited'}`,
      },
      { title: 'Ends on', value: (row) => day(row.ends_on) },
      status,
    ],
    'quotation-templates': [
      { title: 'Template', value: (row) => row.name },
      { title: 'Plan', value: (row) => row.plan?.name || '—' },
      { title: 'Validity', value: (row) => `${row.validity_days} days` },
      status,
    ],
    subscriptions: [
      { title: 'Subscription', value: (row) => <strong>{row.number}</strong> },
      { title: 'Customer', value: (row) => row.customer?.name || '—' },
      { title: 'Plan', value: (row) => row.plan?.name || '—' },
      { title: 'Next billing', value: (row) => day(row.next_billing_date) },
      status,
    ],
    invoices: [
      { title: 'Invoice', value: (row) => <strong>{row.number}</strong> },
      { title: 'Customer', value: (row) => row.customer?.name || '—' },
      { title: 'Due date', value: (row) => day(row.due_on) },
      { title: 'Amount due', numeric: true, value: (row) => amount(row.amount_due, row.currency) },
      status,
    ],
    payments: [
      { title: 'Invoice', value: (row) => row.invoice_number || `Invoice ${row.invoice_id}` },
      { title: 'Date', value: (row) => day(row.paid_at) },
      { title: 'Method', value: (row) => label(row.method) },
      { title: 'Amount', numeric: true, value: (row) => amount(row.amount, row.currency) },
    ],
    'billing-runs': [
      { title: 'Run', value: (row) => row.number },
      { title: 'Billing date', value: (row) => day(row.due_on) },
      { title: 'Created', numeric: true, value: (row) => row.created_count },
      { title: 'Skipped', numeric: true, value: (row) => row.skipped_count },
      { title: 'Failed', numeric: true, value: (row) => row.failed_count },
      status,
    ],
    requests: [
      { title: 'Request', value: (row) => row.number },
      { title: 'Action', value: (row) => label(row.action) },
      { title: 'Subscription', value: (row) => `Subscription ${row.subscription_id}` },
      status,
    ],
    outbox: [
      { title: 'Message', value: (row) => label(row.action) },
      { title: 'Record', value: (row) => row.record_id },
      { title: 'Created', value: (row) => day(row.created_at) },
    ],
  };
  return common[kind] || [];
}

export function App() {
  const [token, setToken] = useState(localStorage.getItem('brightloop-token') || ''),
    [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(Boolean(token));
  const [route, setRoute] = useState(routeFromHash),
    [rows, setRows] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [selectedBusy, setSelectedBusy] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [detailError, setDetailError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [nextCursor, setNextCursor] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ kind: string; initial?: Row } | null>(null),
    [review, setReview] = useState<Command | null>(null),
    [payment, setPayment] = useState(false),
    [change, setChange] = useState<string | null>(null),
    [billing, setBilling] = useState<{ retry?: Row } | null>(null);
  const [mobile, setMobile] = useState(matchMedia('(max-width: 860px)').matches),
    [mobileOpen, setMobileOpen] = useState(false),
    [collapsed, setCollapsed] = useState(
      localStorage.getItem('brightloop-nav-collapsed') === 'true',
    );
  const sidebar = useRef<HTMLElement>(null),
    toggle = useRef<HTMLButtonElement>(null);
  const resource = resources.find((item) => item.id === route.resource);
  const visible = resources.filter((item) =>
    user?.role === 'customer'
      ? ['subscriptions', 'invoices', 'requests', 'account'].includes(item.id)
      : user?.role === 'staff'
        ? !['staff', 'outbox'].includes(item.id)
        : true,
  );
  const canCreate =
    user &&
    creatable.has(route.resource) &&
    (user.role === 'admin' ||
      (user.role === 'staff' && ['subscriptions', 'quotation-templates'].includes(route.resource)));
  function logout() {
    localStorage.removeItem('brightloop-token');
    setToken('');
    setUser(null);
    setRows([]);
    setSelected(null);
  }
  function loggedIn(nextToken: string, account: User) {
    localStorage.setItem('brightloop-token', nextToken);
    setToken(nextToken);
    setUser(account);
    navigate(account.role === 'customer' ? 'subscriptions' : 'overview');
  }
  function completed(message: string) {
    setNotice(message);
    setRevision((value) => value + 1);
    setReview(null);
    setPayment(false);
    setChange(null);
    setBilling(null);
  }
  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    request('me', token, { signal: controller.signal })
      .then(setUser)
      .catch((cause) => {
        if (cause.name !== 'AbortError') logout();
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [token]);
  useEffect(() => {
    const listener = () => {
      setRoute(routeFromHash());
      setEditor(null);
      setReview(null);
      setMobileOpen(false);
      setSearch('');
      setStatus('');
      setError('');
    };
    addEventListener('hashchange', listener);
    return () => removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    if (user && !visible.some((item) => item.id === route.resource))
      navigate(user.role === 'customer' ? 'subscriptions' : 'overview');
  }, [user, route.resource]);
  useEffect(() => {
    const media = matchMedia('(max-width: 860px)');
    const listener = () => {
      setMobile(media.matches);
      setMobileOpen(false);
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  useEffect(() => {
    if (!mobile || !mobileOpen) return;
    const first = sidebar.current?.querySelector<HTMLButtonElement>('nav button');
    first?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = [
        toggle.current!,
        ...sidebar.current!.querySelectorAll<HTMLButtonElement>('button'),
      ].filter((button) => !button.disabled);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        buttons.at(-1)?.focus();
      } else if (!event.shiftKey && index === buttons.length - 1) {
        event.preventDefault();
        buttons[0].focus();
      }
    };
    addEventListener('keydown', trap);
    return () => {
      removeEventListener('keydown', trap);
      toggle.current?.focus();
    };
  }, [mobile, mobileOpen]);
  function listPath(cursor = 0) {
    const query = new URLSearchParams({ limit: '25', search });
    if (cursor) query.set('cursor', String(cursor));
    if (status === 'overdue' && route.resource === 'invoices') query.set('overdue', 'true');
    else if (route.resource === 'staff' && status) query.set('active', String(status === 'active'));
    else if (status) query.set('status', status);
    return `${route.resource}?${query}`;
  }
  useEffect(() => {
    if (
      !user ||
      ['overview', 'reports', 'account'].includes(route.resource) ||
      !visible.some((item) => item.id === route.resource)
    )
      return;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    setRows([]);
    setNextCursor(null);
    const timer = setTimeout(
      () =>
        request(listPath(), token, { signal: controller.signal })
          .then((result) => {
            setRows(result.data);
            setNextCursor(result.next_cursor ?? null);
          })
          .catch((cause) => {
            if (cause.name !== 'AbortError') setError(cause.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setBusy(false);
          }),
      search ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [route.resource, user, token, search, status, revision]);
  useEffect(() => {
    setSelected(null);
    setDetailError('');
    if (!route.id || !user) return;
    const controller = new AbortController();
    setSelectedBusy(true);
    request(`${route.resource}/${route.id}`, token, { signal: controller.signal })
      .then(setSelected)
      .catch((cause) => {
        if (cause.name !== 'AbortError') setDetailError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSelectedBusy(false);
      });
    return () => controller.abort();
  }, [route.resource, route.id, token, user, revision]);
  async function more() {
    if (!nextCursor) return;
    setBusy(true);
    setError('');
    try {
      const result = await request(listPath(nextCursor), token);
      setRows((current) => [...current, ...result.data]);
      setNextCursor(result.next_cursor ?? null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function act(name: string) {
    if (!selected || !user) return;
    if (name === 'payment') {
      setPayment(true);
      return;
    }
    if (name === 'retry') {
      setBilling({ retry: selected });
      return;
    }
    if (route.resource === 'subscriptions' && user.role === 'customer') {
      setChange(name);
      return;
    }
    const title = `${label(name)} ${route.resource === 'requests' ? 'request' : route.resource === 'invoices' ? 'invoice' : 'subscription'}`;
    setReview({
      title,
      path: `${route.resource}/${selected.id}/${name}`,
      version: selected.version,
      summary: `${selected.number}${route.resource === 'invoices' ? ` · ${amount(selected.total, selected.currency)}` : route.resource === 'requests' && name === 'approve' ? ' · Applies at the next billing boundary' : ''}`,
    });
  }
  async function pdf() {
    if (!selected) return;
    setDetailError('');
    try {
      await downloadInvoice(selected.id, token, `${selected.number}.pdf`);
    } catch (cause) {
      setDetailError((cause as Error).message);
    }
  }
  if (checking)
    return (
      <div className="auth">
        <Loading />
      </div>
    );
  if (!user) return <Auth onLogin={loggedIn} />;
  const tableColumns = columns(route.resource);
  const expanded = mobile ? mobileOpen : !collapsed;
  return (
    <div
      className={`app-shell ${collapsed ? 'nav-collapsed' : ''} ${mobileOpen ? 'nav-open' : ''}`}
    >
      <button
        ref={toggle}
        className={`nav-toggle ${expanded ? 'is-open' : ''}`}
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-controls="sidebar"
        aria-expanded={expanded}
        onClick={() => {
          if (mobile) setMobileOpen(!mobileOpen);
          else {
            localStorage.setItem('brightloop-nav-collapsed', String(!collapsed));
            setCollapsed(!collapsed);
          }
        }}
      >
        <span />
        <span />
        <span />
      </button>
      {mobile && mobileOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="sidebar"
        className="sidebar"
        aria-label="Main navigation"
        role={mobile && mobileOpen ? 'dialog' : undefined}
        aria-modal={mobile && mobileOpen ? true : undefined}
      >
        <div className="brand">
          <span className="brand-symbol">b·</span>
          <strong>brightloop</strong>
        </div>
        <div className="workspace">Brightloop Software</div>
        <nav>
          {[...new Set(visible.map((item) => item.group))].map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-heading">
                {user.role === 'customer' && group === 'Billing operations'
                  ? 'My workspace'
                  : group}
              </span>
              {visible
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    key={item.id}
                    aria-current={route.resource === item.id ? 'page' : undefined}
                    onClick={() => navigate(item.id)}
                  >
                    <Icon name={item.icon} />
                    <span>
                      {user.role === 'customer' && item.id === 'subscriptions'
                        ? 'My subscriptions'
                        : user.role === 'customer' && item.id === 'invoices'
                          ? 'My invoices'
                          : item.title}
                    </span>
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-account">
          <span>{user.name}</span>
          <small>{label(user.role)}</small>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div className="workspace-main" inert={mobile && mobileOpen}>
        <header className="topbar">
          <span>
            Workspace <i>/</i> {resource?.title || 'Overview'}
          </span>
          <span className="account-badge" aria-label={`${user.name}, ${user.role}`}>
            {user.name
              .split(' ')
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </span>
        </header>
        <main className="canvas" id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">Brightloop Software</span>
              <h1>{resource?.title || 'Overview'}</h1>
            </div>
            {canCreate && (
              <button className="primary" onClick={() => setEditor({ kind: route.resource })}>
                New {singular[route.resource]}
              </button>
            )}
            {route.resource === 'billing-runs' && (
              <button className="primary" onClick={() => setBilling({})}>
                Run billing
              </button>
            )}
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}>
                ×
              </button>
            </div>
          )}
          {['overview', 'reports'].includes(route.resource) ? (
            <Reports
              token={token}
              overview={route.resource === 'overview'}
              revision={revision}
              onOpen={navigate}
            />
          ) : route.resource === 'account' ? (
            <Account
              user={user}
              token={token}
              onSaved={(account) => {
                setUser(account);
                completed('Account updated');
              }}
            />
          ) : (
            <>
              <div className="list-toolbar">
                <Field name="Search">
                  <input
                    type="search"
                    placeholder="Search records"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </Field>
                {statusOptions[route.resource] && (
                  <Field name="Status">
                    <select value={status} onChange={(event) => setStatus(event.target.value)}>
                      <option value="">All statuses</option>
                      {statusOptions[route.resource].map((value) => (
                        <option key={value} value={value}>
                          {label(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              <ErrorBox error={error} />
              {error && <button onClick={() => setRevision((value) => value + 1)}>Retry</button>}
              <section className="panel list-panel" aria-busy={busy}>
                {busy && <Loading />}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {tableColumns.map((column) => (
                          <th key={column.title} className={column.numeric ? 'numeric' : ''}>
                            {column.title}
                          </th>
                        ))}
                        <th>
                          <span className="sr-only">Open record</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          {tableColumns.map((column) => (
                            <td key={column.title} className={column.numeric ? 'numeric' : ''}>
                              {column.value(row)}
                            </td>
                          ))}
                          <td>
                            <button
                              className="row-open"
                              aria-label={`Open ${row.number || row.name || row.id}`}
                              onClick={() => navigate(route.resource, row.id)}
                            >
                              Open <span aria-hidden="true">→</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!busy && !rows.length && (
                  <Empty>
                    {search || status ? 'No records match these filters.' : 'No records yet.'}
                  </Empty>
                )}
                {nextCursor && (
                  <div className="table-footer">
                    <button disabled={busy} onClick={more}>
                      Load more
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
      {route.id && (
        <Dialog
          title={selected?.number || selected?.name || 'Record details'}
          wide
          onClose={() => navigate(route.resource)}
        >
          {selectedBusy ? (
            <Loading />
          ) : (
            <>
              <ErrorBox error={detailError} />
              {selected && (
                <Detail
                  kind={route.resource}
                  row={selected}
                  user={user}
                  token={token}
                  onAction={act}
                  onEdit={() => setEditor({ kind: route.resource, initial: selected })}
                  onOpen={navigate}
                  onDownload={pdf}
                />
              )}
              {!selected && detailError && (
                <button onClick={() => setRevision((value) => value + 1)}>Retry</button>
              )}
            </>
          )}
        </Dialog>
      )}
      {editor && (
        <Editor
          key={`${editor.kind}:${editor.initial?.id || 'new'}`}
          token={token}
          kind={editor.kind}
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSaved={(row) => {
            const kind = editor.kind;
            setEditor(null);
            completed('Saved');
            navigate(kind, row.id);
          }}
        />
      )}
      {review && (
        <Review
          command={review}
          token={token}
          onClose={() => setReview(null)}
          onDone={() => completed('Action completed')}
          onReload={() => {
            setReview(null);
            setRevision((value) => value + 1);
          }}
        />
      )}
      {payment && selected && (
        <PaymentDialog
          invoice={selected}
          token={token}
          onClose={() => setPayment(false)}
          onDone={() => completed('Payment recorded')}
        />
      )}
      {change && selected && (
        <ChangeDialog
          subscription={selected}
          action={change}
          token={token}
          onClose={() => setChange(null)}
          onDone={() => completed('Request sent for approval')}
        />
      )}
      {billing && (
        <BillingDialog
          token={token}
          retry={billing.retry}
          onClose={() => setBilling(null)}
          onDone={(row) => {
            completed(
              `Billing complete: ${row.created_count} created, ${row.skipped_count} skipped, ${row.failed_count} failed`,
            );
            navigate('billing-runs', row.id);
          }}
        />
      )}
    </div>
  );
}
