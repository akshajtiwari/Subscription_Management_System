const directions = [
  {
    name: 'Porcelain · Copper',
    accent: '#a34f2d',
    tint: '#f6ece5',
    description: 'Warm and grounded. Useful when the interface should feel a little more human.',
  },
  {
    name: 'Porcelain · Mulberry',
    accent: '#8b3e58',
    tint: '#f5e9ee',
    description: 'Deep and reserved. Adds character without brightening the whole workspace.',
  },
  {
    name: 'Porcelain · Graphite',
    applied: true,
    accent: '#49514d',
    tint: '#eaf0ec',
    description: 'The most neutral option. Keeps attention on amounts, dates, and status.',
  },
];

let view = 'overview';
const comparison = document.querySelector('#comparison');

const lineChart = `<svg class="chart" viewBox="0 0 320 126" role="img" aria-label="Sample collections trend rising from May through October">
  <path class="gridline" d="M0 24H320M0 66H320M0 108H320"/>
  <path class="chart-fill" d="M0 103 C36 94 55 95 75 85 S120 73 145 76 S190 53 220 57 S280 31 320 29 V126 H0Z"/>
  <path class="chart-stroke" d="M0 103 C36 94 55 95 75 85 S120 73 145 76 S190 53 220 57 S280 31 320 29"/>
  <circle cx="320" cy="29" r="4" class="chart-point"/>
</svg>`;

function overview() {
  return `<div class="preview-top"><span>Overview</span><small>October 2026</small></div>
    <div class="page-title"><h3>Billing overview</h3><p>Your subscriptions and collections at a glance.</p></div>
    <div class="figures"><div><small>Active subscriptions</small><strong>1,284</strong></div><div><small>Collected</small><strong>248,600</strong></div></div>
    <div class="surface chart-surface"><div class="surface-head"><span>Collections</span><small>Last 6 months</small></div>${lineChart}<div class="months"><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div></div>
    <div class="surface work"><div class="surface-head"><span>Needs attention</span><small>View all →</small></div><div class="work-row"><span class="status-dot"></span><span>INV-2047 · 16 days overdue</span><b>1,200.00</b></div><div class="work-row"><span class="status-dot"></span><span>SUB-1024 · Renews tomorrow</span><b>Review</b></div></div>`;
}

function invoice() {
  return `<div class="preview-top"><span>Invoices / INV-2048</span><small>October 2026</small></div>
    <div class="page-title"><h3>Invoice INV-2048</h3><p>Northstar Labs · Due 15 Nov 2026</p></div>
    <div class="invoice-bar"><span class="badge">Confirmed</span><button type="button" class="primary-action" data-preview-action="Record payment">Record payment</button></div>
    <div class="surface invoice-summary"><div class="summary-row"><span>Amount due</span><strong>1,200.00</strong></div><div class="summary-row"><span>Billing period</span><b>01–31 Oct 2026</b></div><div class="summary-row"><span>Payment terms</span><b>14 days</b></div></div>
    <div class="surface"><div class="surface-head"><span>Invoice lines</span><small>2 items</small></div><div class="line-item"><span>Growth monthly plan</span><b>1,000.00</b></div><div class="line-item"><span>Additional seats</span><b>200.00</b></div><div class="total"><span>Total</span><strong>1,200.00</strong></div></div>`;
}

function render() {
  comparison.innerHTML = directions.map((direction, index) => `<section class="direction" style="--accent:${direction.accent};--tint:${direction.tint}" aria-labelledby="direction-${index}">
    <div class="direction-head"><div><p class="eyebrow">Option ${String(index + 1).padStart(2, '0')}${direction.applied?' · Applied to mockup':''}</p><h2 id="direction-${index}">${direction.name}</h2></div><div class="palette" aria-label="Porcelain, ink, and ${direction.name.split(' · ')[1]} swatches"><i></i><i></i><i></i></div></div>
    <p class="direction-description">${direction.description}</p>
    <div class="app-preview"><aside class="mini-nav"><div class="mini-brand">b.</div><span class="mini-nav-item selected">Overview</span><span class="mini-nav-item">Subscriptions</span><span class="mini-nav-item">Invoices</span><span class="mini-nav-item">Reports</span></aside><div class="mini-main">${view === 'overview' ? overview() : invoice()}</div></div>
    <div class="color-values"><span><i style="background:#f7f9fc"></i>Porcelain <code>#F7F9FC</code></span><span><i style="background:#212b40"></i>Ink <code>#212B40</code></span><span><i style="background:${direction.accent}"></i>Accent <code>${direction.accent.toUpperCase()}</code></span></div>${direction.applied?'<a class="full-preview" href="../../wireframes/index.html">Open full mockup →</a>':''}
  </section>`).join('');
}

function setView(nextView) {
  view = nextView;
  document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.view === view)));
  render();
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-preview-action]')) {
    const button = event.target.closest('[data-preview-action]');
    button.textContent = 'No changes made';
    window.setTimeout(() => { if (button.isConnected) button.textContent = 'Record payment'; }, 1800);
  }
});

render();
