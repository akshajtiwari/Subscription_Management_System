import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Auth } from './Auth';
import { request, downloadInvoice, type Row, type User } from './api';
import { BillingDialog, ChangeDialog, PaymentDialog, Review, type Command } from './Actions';
import { Editor } from './Editor';
import { Reports } from './Reports';
import { Empty, ErrorBox, Field, Loading, SearchInput, Status, amount, day, label } from './ui';
import { Icon } from './Icon';
import { Overview } from './Overview';
import { RecordPage } from './RecordPage';
import { Notes } from './Notes';

const resources = [
  { id: 'overview', title: 'Overview', group: 'Billing operations', icon: 'grid' },
  { id: 'customers', title: 'Customers', group: 'Billing operations', icon: 'users' },
  { id: 'subscriptions', title: 'Subscriptions', group: 'Billing operations', icon: 'repeat' },
  { id: 'invoices', title: 'Invoices', group: 'Billing operations', icon: 'receipt' },
  { id: 'payments', title: 'Payments', group: 'Billing operations', icon: 'card' },
  { id: 'billing-runs', title: 'Billing runs', group: 'Billing operations', icon: 'repeat' },
  { id: 'reports', title: 'Reports', group: 'Billing operations', icon: 'chart' },
  { id: 'requests', title: 'Customer requests', group: 'Billing operations', icon: 'file' },
  { id: 'products', title: 'Products', group: 'Catalog & pricing', icon: 'box' },
  { id: 'plans', title: 'Plans', group: 'Catalog & pricing', icon: 'calendar' },
  { id: 'tax-rules', title: 'Tax rules', group: 'Catalog & pricing', icon: 'percent' },
  { id: 'discount-rules', title: 'Discount rules', group: 'Catalog & pricing', icon: 'tag' },
  {
    id: 'quotation-templates',
    title: 'Quote templates',
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
const navigate = (resource: string, id?: number, filter?: string) => {
  const previous = routeFromHash();
  const status = filter ?? (previous.resource === resource ? previous.status : '');
  location.hash = `${resource}${id ? `/${id}` : ''}${status ? `?status=${encodeURIComponent(status)}` : ''}`;
};
const routeFromHash = () => {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const [resource, id] = path.split('/');
  return {
    resource: resource || 'overview',
    id: /^\d+$/.test(id || '') ? Number(id) : null,
    status: new URLSearchParams(query).get('status') || '',
  };
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
  const generic = ['Name / reference', 'Type / customer', 'Value / date'];
  const fields: Record<string, ((row: Row) => any)[]> = {
    customers: [
      (row) => row.name,
      (row) => row.email,
      (row) => `${row.active_subscription_count || 0} active`,
    ],
    products: [
      (row) => row.name,
      (row) => label(row.type || 'software'),
      (row) => amount(row.sales_price, row.currency),
    ],
    plans: [
      (row) => row.name,
      (row) => label(row.billing_interval),
      (row) => amount(row.price, row.currency),
    ],
    'tax-rules': [(row) => row.name, (row) => `${row.rate_percent}%`, (row) => row.effective_from],
    'discount-rules': [
      (row) => row.name,
      (row) => label(row.kind),
      (row) =>
        row.ends_on && row.ends_on < new Date().toISOString().slice(0, 10)
          ? 'Expired'
          : row.usage_limit
            ? `${Math.max(0, row.usage_limit - (row.usage_count || 0))} uses left`
            : 'Unlimited',
    ],
    'quotation-templates': [
      (row) => row.name,
      (row) =>
        row.plan?.billing_interval === 'yearly'
          ? 'Annual'
          : label(row.plan?.billing_interval || 'monthly'),
      (row) => `${row.validity_days} days`,
    ],
    subscriptions: [(row) => row.number, (row) => row.customer?.name, (row) => row.plan?.name],
    requests: [
      (row) => row.number,
      (row) => label(row.action),
      (row) => `Subscription ${row.subscription_id}`,
    ],
  };
  if (fields[kind])
    return [
      ...fields[kind].map((value, index) => ({ title: generic[index], value })),
      kind === 'customers' ? { title: 'Status', value: () => 'Open' } : status,
    ];
  if (kind === 'staff')
    return [
      { title: 'Name', value: (row) => row.name },
      { title: 'Email', value: (row) => row.email },
      { title: 'Role', value: (row) => label(row.role) },
      status,
    ];
  if (kind === 'invoices')
    return [
      { title: 'Reference', value: (row) => row.number },
      { title: 'Customer / date', value: (row) => row.customer?.name },
      { title: 'Due date', value: (row) => row.due_on },
      status,
    ];
  if (kind === 'payments')
    return [
      { title: generic[0], value: (row) => `PAY-${row.id}` },
      { title: generic[1], value: (row) => row.invoice_number },
      { title: generic[2], value: (row) => label(row.method) },
      { title: 'Status', value: (row) => amount(row.amount, row.currency) },
    ];
  if (kind === 'billing-runs')
    return [
      { title: 'Run', value: (row) => row.number },
      { title: 'Billing date', value: (row) => day(row.due_on) },
      { title: 'Created', value: (row) => row.created_count },
      { title: 'Skipped', value: (row) => row.skipped_count },
      { title: 'Failed', value: (row) => row.failed_count },
    ];
  if (kind === 'outbox')
    return [
      { title: 'Message', value: (row) => label(row.action) },
      { title: 'Recipient', value: (row) => row.recipient },
      { title: 'Date', value: (row) => day(row.created_at) },
    ];
  return [{ title: 'Reference', value: (row) => row.number || row.name }, status];
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
    [status, setStatus] = useState(route.status),
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
    setNotes(false);
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
      }
      setStatus(next.status);
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
    toggle.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = [
        toggle.current!,
        ...sidebar.current!.querySelectorAll<HTMLElement>('button, summary'),
      ].filter((button) => !button.matches(':disabled') && button.getClientRects().length > 0);
      const index = buttons.indexOf(document.activeElement as HTMLElement);
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
    if (route.resource === 'subscriptions') query.set('sort', 'newest');
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
            if (controller.signal.aborted) return;
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
  const inPageEditor = editor && !['staff', 'tax-rules'].includes(editor.kind);
  const pageName = inPageEditor
    ? {
        products: 'Product editor',
        plans: 'Plan editor',
        'discount-rules': 'Discount editor',
        'quotation-templates': 'Template editor',
        subscriptions: 'New subscription',
      }[editor.kind] || 'Editor'
    : route.id
      ? route.resource === 'invoices'
        ? user?.role === 'customer'
          ? 'My invoice detail'
          : 'Invoice detail'
        : route.resource === 'subscriptions'
          ? user?.role === 'customer'
            ? 'My subscription detail'
            : 'Subscription detail'
          : route.resource === 'customers'
            ? 'Customer account'
            : selected?.name || selected?.number || 'Record details'
      : user?.role === 'customer' && route.resource === 'overview'
        ? 'My account'
        : resource?.title || 'Overview';
  useEffect(() => {
    if (user) document.title = `${pageName} · Brightloop`;
  }, [pageName, user]);
  useEffect(() => {
    if (!user || mobileOpen || notes) return;
    const frame = requestAnimationFrame(() => {
      if (!document.querySelector('dialog[open]'))
        document.getElementById('main-content')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [route.resource, route.id, editor, user?.id]);
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
  const navOrder = [
    'overview',
    'subscriptions',
    'invoices',
    'billing-runs',
    'customers',
    'payments',
    'reports',
    'products',
    'plans',
    'quotation-templates',
    'discount-rules',
    'tax-rules',
    'staff',
  ];
  const navItems = visible
    .filter((item) => item.id !== 'account' && item.id !== 'outbox' && item.id !== 'requests')
    .sort((a, b) => navOrder.indexOf(a.id) - navOrder.indexOf(b.id));
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
      className={`app app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'nav-open' : ''} ${notes ? 'notes-open' : ''}`}
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
        inert={!expanded || notes}
        aria-hidden={!expanded}
      >
        <div className="brand-row">
          <div className="brand-copy">
            <strong>brightloop</strong>
          </div>
        </div>
        <div className="workspace">
          <span className="workspace-icon">B</span>
          <span>
            <strong>Brightloop Software</strong>
          </span>
        </div>
        <nav className="navs" aria-label="Screens">
          {[
            ...new Set(
              navItems.map((item) => (user.role === 'customer' ? 'Customer portal' : item.group)),
            ),
          ].map((group) => (
            <details
              className="nav-group-wrap"
              key={group}
              open={group === (user.role === 'customer' ? 'Customer portal' : resource?.group)}
            >
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
                            : 'receipt'
                    }
                  />
                  {group}
                </span>
                <Icon name="chevron" />
              </summary>
              <div className="nav-items">
                {navItems
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
                              overview: 'Portal overview',
                              subscriptions: 'My subscriptions',
                              invoices: 'My invoices',
                              requests: 'My requests',
                            }[item.id] || item.title
                          : item.id === 'plans'
                            ? 'Billing plans'
                            : item.title}
                      </span>
                    </button>
                  ))}
              </div>
            </details>
          ))}
        </nav>
      </aside>
      <div className="main workspace-main" inert={(mobile && mobileOpen) || notes}>
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
              <span className="crumb-section">
                {user.role === 'customer'
                  ? 'Customer portal'
                  : resource?.group || 'Billing operations'}
              </span>
              <span className="crumb-divider">/</span>
              <span className="crumb-page">{pageName}</span>
            </div>
          </div>
          <div className="top-right">
            <button
              className="notes-trigger"
              aria-label="Notes"
              onClick={() => setNotes(true)}
              aria-controls="motion"
              aria-expanded={notes}
            >
              <Icon name="info" />
              <span>Notes</span>
            </button>
            <span className="top-divider" />
            <button
              className="avatar"
              aria-label={`${user.name}, ${user.role}`}
              onClick={() => navigate('account')}
            >
              {user.role.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>
        <main className="canvas" id="main-content" tabIndex={-1}>
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
                      navigate(
                        user.role === 'customer' ? 'subscriptions' : 'invoices',
                        undefined,
                        user.role === 'customer' ? '' : 'overdue',
                      )
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
                      navigate('invoices', undefined, 'overdue');
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
                  {user.role === 'admin' && (
                    <button className="btn" onClick={() => navigate('outbox')}>
                      Demo outbox
                    </button>
                  )}
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
                        <select
                          value={status}
                          onChange={(event) => {
                            const value = event.target.value;
                            setStatus(value);
                            const url = new URL(location.href);
                            url.hash = `${route.resource}${route.id ? `/${route.id}` : ''}${value ? `?status=${encodeURIComponent(value)}` : ''}`;
                            history.replaceState(null, '', url);
                          }}
                        >
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
                                    aria-label={`Open ${row.name || row.number || row.id}`}
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
        <Notes
          screen={
            inPageEditor
              ? {
                  products: 'product-editor',
                  plans: 'plan-editor',
                  'discount-rules': 'discount-editor',
                  'quotation-templates': 'template-editor',
                  subscriptions: 'subscription-editor',
                }[editor.kind] || route.resource
              : route.id
                ? {
                    subscriptions: 'subscription-detail',
                    invoices: 'invoice-detail',
                    customers: 'customer-detail',
                  }[route.resource] || route.resource
                : route.resource
          }
          title={pageName}
          onClose={() => setNotes(false)}
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
