import { expect, test, type Page } from '@playwright/test';

const main = (page: Page) => page.locator('#main-content');
const surface = (page: Page) => page.locator('#main-content, dialog[open]').last();
const status = (page: Page) => main(page).locator('.record-main .panelhead .status').first();
async function login(page: Page, email = 'admin@brightloop.demo', password = 'DemoAdmin!1') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(main(page).locator('h1')).toBeVisible();
}
async function nav(page: Page, name: string) {
  if ((page.viewportSize()?.width || 1280) <= 860)
    await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  const label =
    name === 'Plans' ? 'Billing plans' : name === 'Quotation templates' ? 'Quote templates' : name;
  const button = page
    .locator('.sidebar')
    .getByRole('button', { name: label, exact: true, includeHidden: true });
  if (!(await button.isVisible()))
    await button.locator('xpath=ancestor::details[1]').locator('summary').click();
  await button.click();
}
async function close(page: Page) {
  if (await page.locator('dialog[open]').count())
    await surface(page).getByRole('button', { name: 'Close dialog', exact: true }).click();
  else
    await main(page)
      .getByRole('button', { name: /^← Back/ })
      .click();
}
async function save(page: Page, name: string) {
  await surface(page).getByRole('button', { name: 'Save', exact: true }).click();
  const open = main(page).getByRole('button', { name: `Open ${name}`, exact: true });
  await expect(open).toBeVisible();
  await open.click();
}
async function review(page: Page, action: string, title: string) {
  await surface(page).getByRole('button', { name: action, exact: true }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: title, exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Action completed' })).toBeVisible();
}
async function total(page: Page, title: string, expected: string) {
  await expect(
    main(page)
      .locator('.invoice-totals>div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${title}$`) }) })
      .locator('dd'),
  ).toHaveText(expected);
}
async function chooseProduct(page: Page, name: string, variant = '') {
  await surface(page).getByPlaceholder('Name, SKU, or variant').fill(name);
  await surface(page)
    .getByRole('checkbox', { name: `Select ${name}${variant ? ` ${variant}` : ''}`, exact: true })
    .check();
  await surface(page).getByRole('button', { name: 'Add selected', exact: true }).click();
}
async function create(page: Page, resource: string) {
  await nav(page, resource);
  await main(page).getByRole('button', { name: 'Create new', exact: true }).click();
}

test('sales through billing, partial payment, collection reporting, and customer approval', async ({
  page,
  request,
  browser,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, 'The mobile project verifies navigation, forms, and focus separately.');
  const suffix = Date.now().toString(36);
  const productName = `Seats ${suffix}`,
    planName = `Monthly ${suffix}`,
    offerName = `Offer ${suffix}`;
  const email = `customer-${suffix}@example.test`,
    customerName = `Customer ${suffix}`;
  const signup = await request.post('/api/v1/auth/register', {
    data: { name: customerName, email, password: 'CustomerPass!1' },
  });
  expect(signup.status()).toBe(201);
  await login(page);
  const token = await page.evaluate(() => localStorage.getItem('brightloop-token'));
  const auth = { Authorization: `Bearer ${token}` };
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const initialReport = await request.get(
    `/api/v1/reports/summary?start=${monthStart}&end=${new Date().toISOString().slice(0, 10)}`,
    { headers: auth },
  );
  const initialCollections = Number(
    (await initialReport.json()).overview.currencies.USD?.collections || 0,
  );

  await create(page, 'Products');
  await surface(page).getByLabel('Product name', { exact: true }).fill(productName);
  await surface(page).getByLabel('Sales price', { exact: true }).fill('20');
  await surface(page).getByLabel('Cost price', { exact: true }).fill('8');
  await surface(page).getByRole('button', { name: 'Add variant' }).click();
  await surface(page).getByLabel('Variant name', { exact: true }).fill('Odoo');
  await surface(page).getByLabel('Brand', { exact: true }).fill('Odoo');
  await surface(page).getByLabel('Price adjustment', { exact: true }).fill('560');
  await save(page, productName);
  await expect(surface(page).getByLabel('Price adjustment', { exact: true })).toHaveValue('560');
  await close(page);

  await create(page, 'Plans');
  await surface(page).getByLabel('Plan name', { exact: true }).fill(planName);
  await surface(page).getByLabel('Plan fee', { exact: true }).fill('100');
  await surface(page).getByLabel('Allow pause and resume').check();
  await surface(page).getByLabel('Allow early closure').check();
  await surface(page).getByLabel('Allow renewal', { exact: true }).check();
  await save(page, planName);
  await close(page);

  await create(page, 'Tax rules');
  await surface(page).getByLabel('Rule name', { exact: true }).fill(`Tax ${suffix}`);
  await surface(page).getByLabel('Rate (%)', { exact: true }).fill('5');
  await surface(page).getByLabel('Country code', { exact: true }).fill('CA');
  await save(page, `Tax ${suffix}`);
  await close(page);

  await create(page, 'Discount rules');
  await surface(page).getByLabel('Rule name', { exact: true }).fill(`Discount ${suffix}`);
  await surface(page).getByLabel('Percentage', { exact: true }).fill('10');
  await surface(page).getByLabel('Usage limit', { exact: true }).fill('1');
  await surface(page).getByLabel('Applies to', { exact: true }).selectOption('products');
  await surface(page).getByRole('button', { name: 'Select products', exact: true }).click();
  await chooseProduct(page, productName);
  await save(page, `Discount ${suffix}`);
  await close(page);

  await create(page, 'Quotation templates');
  await surface(page).getByLabel('Template name', { exact: true }).fill(offerName);
  await surface(page)
    .getByLabel('Plan', { exact: true })
    .selectOption({ label: `${planName} · 100.00` });
  await surface(page).getByRole('button', { name: 'Add product', exact: true }).click();
  await chooseProduct(page, productName, 'Odoo');
  await surface(page).getByLabel(`Quantity for ${productName}`, { exact: true }).fill('2');
  await save(page, offerName);
  await close(page);

  await create(page, 'Subscriptions');
  await surface(page)
    .getByLabel('Customer', { exact: true })
    .selectOption({ label: `${customerName} · ${email}` });
  await surface(page)
    .getByLabel('Quotation template', { exact: true })
    .selectOption({ label: offerName });
  await surface(page).getByLabel('Billing country code', { exact: true }).fill('CA');
  await surface(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    main(page).getByRole('heading', { name: 'Subscriptions', exact: true }),
  ).toBeVisible();
  const subscriptions = await request.get(
    `/api/v1/subscriptions?search=${encodeURIComponent(customerName)}&sort=newest`,
    { headers: auth },
  );
  // The owning list must refresh before opening its newly saved subscription.
  const subscriptionId = (await subscriptions.json()).data[0].id;
  await main(page).getByRole('row').filter({ hasText: customerName }).getByRole('button').click();
  await expect(status(page)).toHaveText('Draft');
  await review(page, 'Quote', 'Quote subscription');
  await expect(status(page)).toHaveText('Quotation');
  await review(page, 'Confirm', 'Confirm subscription');
  await expect(status(page)).toHaveText('Confirmed');
  await review(page, 'Activate', 'Activate subscription');
  await expect(status(page)).toHaveText('Active');
  await expect(main(page).locator('.history')).toContainText('Activated');
  await close(page);

  await nav(page, 'Billing runs');
  await main(page).getByRole('button', { name: 'Run billing', exact: true }).click();
  await surface(page).getByRole('button', { name: 'Run billing', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Billing complete' })).toBeVisible();
  const bills = await request.get('/api/v1/invoices?limit=100', { headers: auth });
  const invoice = (await bills.json()).data.find(
    (row: any) => row.subscription_id === subscriptionId,
  );
  expect(invoice.total).toBe('1201.20');
  await page.goto(`/#invoices/${invoice.id}`);
  await total(page, 'Amount due', '1,201.20');
  await review(page, 'Confirm', 'Confirm invoice');
  await expect(status(page)).toHaveText('Confirmed');
  await review(page, 'Send', 'Send invoice');
  const downloadPromise = page.waitForEvent('download');
  await main(page).getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${invoice.number}.pdf`);
  await download.saveAs(testInfo.outputPath('invoice.pdf'));
  for (const [value, due] of [
    ['201.20', '1,000.00'],
    ['1000', '0.00'],
  ]) {
    await main(page).getByRole('button', { name: 'Record payment', exact: true }).click();
    await surface(page).getByLabel('Amount (USD)', { exact: true }).fill(value);
    await surface(page).getByRole('button', { name: 'Record payment', exact: true }).click();
    await total(page, 'Amount due', due);
    await expect(main(page).getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  }
  await expect(status(page)).toHaveText('Paid');
  await close(page);
  await nav(page, 'Reports');
  const collectionTotal = (initialCollections + 1201.2).toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  await expect(main(page).locator('.metric-strip')).toContainText(collectionTotal);
  await expect(main(page).locator('.collection-chart')).toContainText(collectionTotal);
  await main(page).getByRole('button', { name: 'Outstanding', exact: true }).click();
  await expect(main(page).getByRole('heading', { name: 'Outstanding over time' })).toBeVisible();
  await main(page).getByRole('button', { name: 'Overdue invoices', exact: true }).click();
  await expect(
    main(page).getByRole('heading', { name: 'Overdue invoices over time' }),
  ).toBeVisible();

  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5175' });
  const customer = await context.newPage();
  await login(customer, email, 'CustomerPass!1');
  await customer.goto(`/#subscriptions/${subscriptionId}`);
  await expect(status(customer)).toHaveText('Active');
  await main(customer).getByRole('button', { name: 'Pause', exact: true }).click();
  await surface(customer).getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(main(customer).locator('.scheduled-change')).toContainText('Pending');
  const requests = await request.get('/api/v1/requests?limit=100', { headers: auth });
  const change = (await requests.json()).data.find(
    (row: any) => row.subscription_id === subscriptionId,
  );
  await page.goto(`/#requests/${change.id}`);
  await review(page, 'Approve', 'Approve request');
  const subscription = await request.get(`/api/v1/subscriptions/${subscriptionId}`, {
    headers: auth,
  });
  const applied = await request.post('/api/v1/billing-runs', {
    headers: { ...auth, 'Idempotency-Key': `pause-${suffix}` },
    data: {
      due_on: (await subscription.json()).next_billing_date,
      subscription_ids: [subscriptionId],
    },
  });
  expect(applied.status()).toBe(202);
  await customer.reload();
  await expect(status(customer)).toHaveText('Paused');
  await expect(main(customer).getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await context.close();
});

test('staff and customer navigation enforces roles', async ({ page, request, isMobile }) => {
  test.skip(isMobile);
  await login(page, 'staff@brightloop.demo', 'DemoStaff!1');
  await nav(page, 'Products');
  await expect(main(page).getByRole('button', { name: 'Create new', exact: true })).toHaveCount(0);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Staff members', exact: true }),
  ).toHaveCount(0);
  await page.locator('.avatar').click();
  await main(page).getByRole('button', { name: 'Sign out', exact: true }).click();
  await login(page, 'customer@brightloop.demo', 'DemoCustomer!1');
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'My subscriptions', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Products', exact: true }),
  ).toHaveCount(0);
  const token = await page.evaluate(() => localStorage.getItem('brightloop-token'));
  expect(
    (
      await request.get('/api/v1/staff', { headers: { Authorization: `Bearer ${token}` } })
    ).status(),
  ).toBe(403);
});

test('password reset shows a neutral confirmation and accepts its outbox link', async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(isMobile);
  const email = `reset-${Date.now()}@example.test`;
  await request.post('/api/v1/auth/register', {
    data: { name: 'Reset customer', email, password: 'CustomerPass!1' },
  });
  const admin = await request.post('/api/v1/auth/login', {
    data: { email: 'admin@brightloop.demo', password: 'DemoAdmin!1' },
  });
  const token = (await admin.json()).access_token;
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const outbox = await request.get('/api/v1/outbox', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const entry = (await outbox.json()).data.find((row: any) => row.recipient === email);
  await page.goto(`/?reset_token=${encodeURIComponent(entry.detail.token)}`);
  await page.getByLabel('New password', { exact: true }).fill('ChangedPassword!2');
  await page.getByLabel('Confirm password', { exact: true }).fill('DifferentPassword!2');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Passwords do not match');
  await page.getByLabel('Confirm password', { exact: true }).fill('ChangedPassword!2');
  await page.getByRole('button', { name: 'Set password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Password set' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('ChangedPassword!2');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(main(page).locator('h1')).toHaveText('My account');
});

test('mobile menu keeps its toggle in place and forms preserve keyboard focus', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile);
  await login(page);
  const toggle = page.getByRole('button', { name: 'Expand navigation', exact: true });
  const before = await toggle.boundingBox();
  await toggle.click();
  const opened = page.getByRole('button', { name: 'Collapse navigation', exact: true });
  const after = await opened.boundingBox();
  expect(after?.x).toBe(before?.x);
  expect(after?.y).toBe(before?.y);
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await create(page, 'Products');
  await main(page)
    .locator('label')
    .filter({ hasText: /^Product name$/ })
    .click();
  await expect(main(page).getByLabel('Product name', { exact: true })).toBeFocused();
  await close(page);
  await expect(main(page).getByRole('button', { name: 'Create new', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Interaction notes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Notes', exact: true })).toBeFocused();
});

test('failed saves keep the entered values available for retry', async ({ page, isMobile }) => {
  test.skip(isMobile);
  await login(page);
  await create(page, 'Products');
  let attempts = 0;
  await page.route('**/api/v1/products', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts += 1;
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: { code: 'temporarily_unavailable' } }),
      });
    return route.continue();
  });
  const name = `Retry product ${Date.now()}`;
  await main(page).getByLabel('Product name', { exact: true }).fill(name);
  await main(page).getByLabel('Sales price', { exact: true }).fill('20');
  await main(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(main(page).getByRole('alert')).toBeVisible();
  await expect(main(page).getByLabel('Product name', { exact: true })).toHaveValue(name);
  await save(page, name);
  expect(attempts).toBe(2);
});
