import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Auth } from './Auth';
import { request, downloadInvoice, type Row, type User } from './api';
import { BillingDialog, ChangeDialog, PaymentDialog, Review, type Command } from './Actions';
import { Editor } from './Editor';
import { Reports } from './Reports';
import {
  Dialog,
  Empty,
  ErrorBox,
  Field,
  Loading,
  SearchInput,
  Status,
  amount,
  day,
  label,
} from './ui';
import { Icon } from './Icon';
import { Overview } from './Overview';
import { RecordPage } from './RecordPage';

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
      <button className="btn primary" disabled={busy}>
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
  const [token, setToken] = useState(() => {
      try {
        return localStorage.getItem('brightloop-token') || '';
      } catch {
        return '';
      }
    }),
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
  const [notes, setNotes] = useState(false);
  const [mobile, setMobile] = useState(matchMedia('(max-width: 860px)').matches),
    [mobileOpen, setMobileOpen] = useState(false),
    [collapsed, setCollapsed] = useState(
      (() => {
        try {
          return localStorage.getItem('brightloop-nav-collapsed') === 'true';
        } catch {
          return false;
        }
      })(),
    );
  const resourceRef = useRef(route.resource);
  const sidebar = useRef<HTMLElement>(null),
    toggle = useRef<HTMLButtonElement>(null);
  const resource = resources.find((item) => item.id === route.resource);
  const visible = resources.filter((item) =>
    user?.role === 'customer'
      ? ['overview', 'subscriptions', 'invoices', 'requests', 'account'].includes(item.id)
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
    try {
      localStorage.removeItem('brightloop-token');
    } catch {
      /* Storage is optional. */
    }
    setToken('');
    setUser(null);
    setRows([]);
    setSelected(null);
  }
  function loggedIn(nextToken: string, account: User) {
    try {
      localStorage.setItem('brightloop-token', nextToken);
    } catch {
      /* Keep this session in memory. */
    }
    setToken(nextToken);
    setUser(account);
    navigate('overview');
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
      const next = routeFromHash();
      setRoute(next);
      if (next.resource !== resourceRef.current) {
        setSearch('');
        setStatus('');
      }
      resourceRef.current = next.resource;
      setEditor(null);
      setReview(null);
      setMobileOpen(false);
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
      search ? 300 : 0,
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
  useEffect(() => {
    document.title = `${resource?.title || 'Sign in'} · Brightloop`;
  }, [resource?.title, user]);
  const resetToken = new URL(location.href).searchParams.get('reset_token');
  if (resetToken) return <Auth onLogin={loggedIn} initialResetToken={resetToken} />;
  if (checking)
    return (
      <div className="auth">
        <Loading />
      </div>
    );
  if (!user) return <Auth onLogin={loggedIn} />;
  const tableColumns = columns(route.resource);
  const expanded = mobile ? mobileOpen : !collapsed;
  const inPageEditor = editor && !['staff', 'tax-rules'].includes(editor.kind);
  const pageName =
    user.role === 'customer' && route.resource === 'overview'
      ? 'My account'
      : resource?.title || 'Overview';
  const descriptions: Record<string, string> = {
    overview:
      user.role === 'customer'
        ? 'Your plans, invoices, and upcoming billing in one view.'
        : 'Subscriptions, collections, and invoices that need a closer look.',
    customers: 'Find a customer and open their account.',
    products: 'Products, prices, variants and active state.',
    plans: 'Billing intervals, pricing and availability.',
    'tax-rules': 'Admin-managed tax rules and effective dates.',
    'discount-rules': 'Usage limits, eligibility, scope and schedule.',
    'quotation-templates': 'Reusable plan and product line sets.',
    subscriptions: 'Lifecycle, renewal date, customer and plan.',
    invoices: 'Status, due date, amounts and overdue filtering.',
    payments: 'Payment method, date, invoice and amount.',
    reports: 'Revenue, collections, active subscriptions and overdue breakdown.',
    'billing-runs': 'Review invoices created for each due date.',
    staff: 'Admin-only directory of internal users and access status.',
    requests: 'Review customer subscription changes.',
    outbox: 'Invoice messages and password reset links.',
    account: 'Your account details.',
  };
  const editorView = editor && (
    <Editor
      key={`${editor.kind}:${editor.initial?.id || 'new'}`}
      token={token}
      kind={editor.kind}
      initial={editor.initial}
      inline={Boolean(inPageEditor)}
      onClose={() => setEditor(null)}
      onSaved={() => {
        setEditor(null);
        completed('Saved');
        navigate(editor.kind);
      }}
    />
  );
  function openRow(row: Row) {
    if (user?.role === 'admin' && configurations.has(route.resource))
      setEditor({ kind: route.resource, initial: row });
    else navigate(route.resource, row.id);
  }
  return (
    <div
      className={`app app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'nav-open' : ''}`}
    >
      <button
        ref={toggle}
        className={`icon-btn menu-btn mobile-menu-toggle ${expanded ? 'is-open' : ''}`}
        aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
        aria-controls="sidebar"
        aria-expanded={expanded}
        onClick={() => {
          if (mobile) setMobileOpen(!mobileOpen);
          else {
            try {
              localStorage.setItem('brightloop-nav-collapsed', String(!collapsed));
            } catch {
              /* Optional preference. */
            }
            setCollapsed(!collapsed);
          }
        }}
      >
        <span className="menu-lines" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </button>
      {mobile && mobileOpen && (
        <button
          className="nav-scrim"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        ref={sidebar}
        id="sidebar"
        className="sidebar"
        aria-label="Main navigation"
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div className="brand-row">
          <div className="brand-copy">
            <strong>brightloop</strong>
          </div>
        </div>
        <div className="workspace">
          <span>
            <strong>Brightloop Software</strong>
          </span>
        </div>
        <nav className="navs" aria-label="Screens">
          {[
            ...new Set(
              visible
                .filter((item) => item.id !== 'account')
                .map((item) => (user.role === 'customer' ? 'Customer portal' : item.group)),
            ),
          ].map((group) => (
            <details className="nav-group-wrap" key={group} open>
              <summary>
                <span className="section-label">
                  <Icon
                    name={
                      group === 'Catalog & pricing'
                        ? 'box'
                        : group === 'Team access'
                          ? 'users'
                          : group === 'Customer portal'
                            ? 'user'
                            : 'grid'
                    }
                  />
                  {group}
                </span>
                <Icon name="chevron" />
              </summary>
              <div className="nav-items">
                {visible
                  .filter(
                    (item) =>
                      item.id !== 'account' && (user.role === 'customer' || item.group === group),
                  )
                  .map((item) => (
                    <button
                      className={`nav ${route.resource === item.id ? 'active' : ''}`}
                      key={item.id}
                      aria-current={route.resource === item.id ? 'page' : undefined}
                      onClick={() => navigate(item.id)}
                    >
                      <Icon name={item.icon} />
                      <span>
                        {user.role === 'customer'
                          ? {
                              overview: 'My account',
                              subscriptions: 'My subscriptions',
                              invoices: 'My invoices',
                              requests: 'My requests',
                            }[item.id] || item.title
                          : item.title}
                      </span>
                    </button>
                  ))}
              </div>
            </details>
          ))}
        </nav>
      </aside>
      <div className="main workspace-main" inert={mobile && mobileOpen}>
        <header className="topbar">
          <div className="top-left">
            <button
              className="icon-btn menu-btn desktop-menu-toggle"
              aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
              aria-expanded={expanded}
              aria-controls="sidebar"
              onClick={() => {
                setCollapsed(!collapsed);
                try {
                  localStorage.setItem('brightloop-nav-collapsed', String(!collapsed));
                } catch {
                  /* Optional preference. */
                }
              }}
            >
              <span className="menu-lines" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
            <div className="crumbs">
              <span className="crumb-section">Workspace</span>
              <span className="crumb-divider">/</span>
              <strong className="crumb-page">{pageName}</strong>
            </div>
          </div>
          <div className="top-right">
            <button className="notes-trigger" onClick={() => setNotes(true)}>
              <Icon name="info" />
              <span>Notes</span>
            </button>
            <span className="top-divider" />
            <button
              className="avatar"
              aria-label={`${user.name}, ${user.role}`}
              onClick={() => navigate('account')}
            >
              BL
            </button>
          </div>
        </header>
        <main className="canvas" id="main-content">
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                className="icon-btn"
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                ×
              </button>
            </div>
          )}
          {inPageEditor ? (
            editorView
          ) : route.id ? (
            <>
              <ErrorBox error={detailError} />
              {selectedBusy ? (
                <Loading />
              ) : selected ? (
                <RecordPage
                  kind={route.resource}
                  row={selected}
                  user={user}
                  token={token}
                  onAction={act}
                  onEdit={() => setEditor({ kind: route.resource, initial: selected })}
                  onOpen={navigate}
                  onBack={() => navigate(route.resource)}
                  onDownload={pdf}
                />
              ) : (
                <button className="btn" onClick={() => setRevision((value) => value + 1)}>
                  Retry
                </button>
              )}
            </>
          ) : (
            <>
              <div className="pagehead">
                <div>
                  <div className="eyebrow">
                    {route.resource === 'overview'
                      ? 'Operations / dashboard'
                      : route.resource === 'reports' || route.resource === 'billing-runs'
                        ? 'Operations / report'
                        : 'Operations / table'}
                  </div>
                  <h1>{pageName}</h1>
                  <p>{descriptions[route.resource]}</p>
                </div>
                {canCreate && (
                  <button
                    className="btn primary"
                    onClick={() => setEditor({ kind: route.resource })}
                  >
                    Create new <Icon name="arrow" />
                  </button>
                )}
                {route.resource === 'billing-runs' && (
                  <button className="btn primary" onClick={() => setBilling({})}>
                    Run billing
                  </button>
                )}
                {route.resource === 'overview' && (
                  <button
                    className="btn primary"
                    onClick={() =>
                      navigate(user.role === 'customer' ? 'subscriptions' : 'invoices')
                    }
                  >
                    {user.role === 'customer' ? 'View my subscriptions' : 'Review overdue'}
                    <Icon name="arrow" />
                  </button>
                )}
                {route.resource === 'reports' && (
                  <button
                    className="btn primary"
                    onClick={() => {
                      setStatus('overdue');
                      navigate('invoices');
                    }}
                  >
                    View overdue invoices
                    <Icon name="arrow" />
                  </button>
                )}
              </div>
              {route.resource === 'overview' ? (
                <Overview token={token} user={user} revision={revision} onOpen={navigate} />
              ) : route.resource === 'reports' ? (
                <Reports token={token} revision={revision} onOpen={navigate} />
              ) : route.resource === 'account' ? (
                <>
                  <Account
                    user={user}
                    token={token}
                    onSaved={(account) => {
                      setUser(account);
                      completed('Account updated');
                    }}
                  />
                  <button className="btn" onClick={logout}>
                    Sign out
                  </button>
                </>
              ) : (
                <section className="panel list-panel" aria-busy={busy}>
                  <div className="toolbar">
                    <Field name="Search records">
                      <SearchInput
                        placeholder={`Search ${pageName.toLowerCase()}`}
                        value={search}
                        onValueChange={setSearch}
                      />
                    </Field>
                    {statusOptions[route.resource] && (
                      <Field name="Status">
                        <select value={status} onChange={(event) => setStatus(event.target.value)}>
                          <option value="">All records</option>
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
                  {error && (
                    <button className="btn" onClick={() => setRevision((value) => value + 1)}>
                      Retry
                    </button>
                  )}
                  {busy && <Loading />}
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          {tableColumns.map((column) => (
                            <th
                              key={column.title}
                              scope="col"
                              className={column.numeric ? 'numeric' : ''}
                            >
                              {column.title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id} data-go={`${route.resource}/${row.id}`}>
                            {tableColumns.map((column, index) => (
                              <td key={column.title} className={column.numeric ? 'numeric' : ''}>
                                {index === 0 ? (
                                  <button
                                    className="row-link"
                                    aria-label={`Open ${row.number || row.name || row.id}`}
                                    onClick={() => openRow(row)}
                                  >
                                    {column.value(row)}
                                  </button>
                                ) : (
                                  column.value(row)
                                )}
                              </td>
                            ))}
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
                  <div className="hint list-count">
                    {rows.length} records · Select a row to open it.
                  </div>
                  {nextCursor && (
                    <div className="table-footer">
                      <button className="btn" disabled={busy} onClick={more}>
                        Load more
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {editor && !inPageEditor && editorView}
      {notes && (
        <Dialog title="Workspace notes" onClose={() => setNotes(false)}>
          <p>{descriptions[route.resource]}</p>
          <div className="actions">
            <button
              className="btn"
              onClick={() => {
                setNotes(false);
                navigate('outbox');
              }}
            >
              Demo outbox
            </button>
            <button
              className="btn"
              onClick={() => {
                setNotes(false);
                navigate('account');
              }}
            >
              My account
            </button>
            <button className="btn" onClick={logout}>
              Sign out
            </button>
          </div>
        </Dialog>
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
