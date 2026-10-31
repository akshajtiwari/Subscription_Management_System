import { expect, test, type Locator, type Page } from '@playwright/test';

const dialog = (page: Page) => page.getByRole('dialog').last();
async function login(page: Page, email = 'admin@brightloop.demo', password = 'DemoAdmin!1') {
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('h1')).not.toHaveText('Sign in');
}
async function nav(page: Page, name: string) {
  if ((page.viewportSize()?.width || 1280) <= 860)
    await page.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
}
async function close(page: Page) {
  await dialog(page).getByRole('button', { name: 'Close dialog', exact: true }).click();
}
async function save(page: Page, name: string) {
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog(page).getByRole('heading', { name, exact: true })).toBeVisible();
  return Number(new URL(page.url()).hash.split('/').at(-1));
}
async function review(page: Page, action: string, title: string) {
  await dialog(page).getByRole('button', { name: action, exact: true }).click();
  await dialog(page).getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Action completed' })).toBeVisible();
}
async function total(page: Page, title: string, expected: string) {
  await expect(
    dialog(page)
      .locator('.invoice-totals>div')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${title}$`) }) })
      .locator('dd'),
  ).toHaveText(expected);
}
async function chooseProduct(page: Page, name: string, variant = '') {
  await dialog(page).getByPlaceholder('Name, SKU, or variant').fill(name);
  await dialog(page)
    .getByRole('checkbox', { name: `Select ${name}${variant ? ` ${variant}` : ''}`, exact: true })
    .check();
  await dialog(page).getByRole('button', { name: 'Add selected', exact: true }).click();
}
async function fill(field: Locator, value: string) {
  await field.fill(value);
}

test('the complete sales, billing, payment, report, and approval workflow', async ({
  page,
  request,
  browser,
  isMobile,
}, testInfo) => {
  test.skip(isMobile, 'The mobile project verifies navigation and focus separately.');
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
  await nav(page, 'Products');
  await page.getByRole('button', { name: 'New product', exact: true }).click();
  await fill(dialog(page).getByLabel('Name', { exact: true }), productName);
  await fill(dialog(page).getByLabel('Sales price', { exact: true }), '20');
  await fill(dialog(page).getByLabel('Cost price', { exact: true }), '8');
  await dialog(page).getByRole('button', { name: 'Add variant' }).click();
  await fill(dialog(page).getByLabel('Variant name', { exact: true }), 'Odoo');
  await fill(dialog(page).getByLabel('Brand', { exact: true }), 'Odoo');
  await fill(dialog(page).getByLabel('Price adjustment', { exact: true }), '560');
  await save(page, productName);
  await expect(dialog(page).getByRole('cell', { name: '$560.00', exact: true })).toBeVisible();
  await close(page);

  await nav(page, 'Plans');
  await page.getByRole('button', { name: 'New plan', exact: true }).click();
  await fill(dialog(page).getByLabel('Name', { exact: true }), planName);
  await fill(dialog(page).getByLabel('Plan fee', { exact: true }), '100');
  await dialog(page).getByLabel('Allow pause and resume').check();
  await dialog(page).getByLabel('Allow early closure').check();
  await dialog(page).getByLabel('Allow renewal', { exact: true }).check();
  await save(page, planName);
  await close(page);

  await nav(page, 'Tax rules');
  await page.getByRole('button', { name: 'New tax rule' }).click();
  await fill(dialog(page).getByLabel('Name', { exact: true }), `Tax ${suffix}`);
  await fill(dialog(page).getByLabel('Rate (%)', { exact: true }), '5');
  await fill(dialog(page).getByLabel('Country code', { exact: true }), 'US');
  await save(page, `Tax ${suffix}`);
  await close(page);

  await nav(page, 'Discount rules');
  await page.getByRole('button', { name: 'New discount rule' }).click();
  await fill(dialog(page).getByLabel('Name', { exact: true }), `Discount ${suffix}`);
  await fill(dialog(page).getByLabel('Percentage', { exact: true }), '10');
  await fill(dialog(page).getByLabel('Usage limit', { exact: true }), '1');
  await dialog(page).getByLabel('Applies to', { exact: true }).selectOption('products');
  await dialog(page).getByRole('button', { name: 'Select products', exact: true }).click();
  await chooseProduct(page, productName);
  await save(page, `Discount ${suffix}`);
  await close(page);

  await nav(page, 'Quotation templates');
  await page.getByRole('button', { name: 'New quotation template' }).click();
  await fill(dialog(page).getByLabel('Name', { exact: true }), offerName);
  await dialog(page)
    .getByLabel('Plan', { exact: true })
    .selectOption({ label: `${planName} · $100.00` });
  await dialog(page).getByRole('button', { name: 'Add product', exact: true }).click();
  await chooseProduct(page, productName, 'Odoo');
  await fill(dialog(page).getByLabel(`Quantity for ${productName}`, { exact: true }), '2');
  await save(page, offerName);
  await close(page);

  await nav(page, 'Subscriptions');
  await page.getByRole('button', { name: 'New subscription', exact: true }).click();
  await dialog(page)
    .getByLabel('Customer', { exact: true })
    .selectOption({ label: `${customerName} · ${email}` });
  await dialog(page)
    .getByLabel('Quotation template', { exact: true })
    .selectOption({ label: offerName });
  await fill(dialog(page).getByLabel('Billing country code', { exact: true }), 'US');
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog(page).locator('.detail-status .status')).toHaveText('Draft');
  const subscriptionId = Number(new URL(page.url()).hash.split('/').at(-1));
  await review(page, 'Quote', 'Quote subscription');
  await expect(dialog(page).locator('.detail-status .status')).toHaveText('Quotation');
  await review(page, 'Confirm', 'Confirm subscription');
  await expect(dialog(page).locator('.detail-status .status')).toHaveText('Confirmed');
  await review(page, 'Activate', 'Activate subscription');
  await expect(dialog(page).locator('.detail-status .status')).toHaveText('Active');
  await expect(dialog(page).locator('.history')).toContainText('Activate');
  await close(page);

  await nav(page, 'Billing runs');
  await page.getByRole('button', { name: 'Run billing', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Run billing', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Billing complete' })).toBeVisible();
  await close(page);
  const invoices = await request.get('/api/v1/invoices?limit=100', { headers: auth });
  const invoice = (await invoices.json()).data.find(
    (row: any) => row.subscription_id === subscriptionId,
  );
  expect(invoice.total).toBe('1201.20');
  await page.goto(`/#invoices/${invoice.id}`);
  await expect(dialog(page).getByRole('heading', { name: invoice.number })).toBeVisible();
  await total(page, 'Amount due', '$1,201.20');
  await review(page, 'Confirm', 'Confirm invoice');
  await expect(dialog(page).locator('.detail-status .status')).toHaveText('Confirmed');
  await review(page, 'Send', 'Send invoice');
  const downloadPromise = page.waitForEvent('download');
  await dialog(page).getByRole('button', { name: 'PDF', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${invoice.number}.pdf`);
  await download.saveAs(testInfo.outputPath('invoice.pdf'));
  for (const [value, due] of [
    ['201.20', '$1,000.00'],
    ['1000', '$0.00'],
  ]) {
    await dialog(page).getByRole('button', { name: 'Record payment', exact: true }).click();
    await fill(dialog(page).getByLabel('Amount (USD)', { exact: true }), value);
    await dialog(page).getByRole('button', { name: 'Record payment', exact: true }).click();
    await total(page, 'Amount due', due);
    await expect(dialog(page).getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
  }
  await expect(dialog(page).locator('.detail-status .status')).toHaveText('Paid');
  await close(page);
  await nav(page, 'Reports');
  await expect(page.locator('.metric-strip')).toContainText('$1,201.20');
  await expect(page.locator('.collection-chart')).toContainText('$1,201.20');

  const customerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:5175' });
  const customer = await customerContext.newPage();
  await login(customer, email, 'CustomerPass!1');
  await customer.goto(`/#subscriptions/${subscriptionId}`);
  await expect(dialog(customer).locator('.detail-status .status')).toHaveText('Active');
  await dialog(customer).getByRole('button', { name: 'Request Pause', exact: true }).click();
  await dialog(customer).getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(dialog(customer).locator('.scheduled-change')).toContainText('Pending');
  const requests = await request.get('/api/v1/requests', { headers: auth });
  const change = (await requests.json()).data.find(
    (row: any) => row.subscription_id === subscriptionId,
  );
  await page.goto(`/#requests/${change.id}`);
  await review(page, 'Approve', 'Approve request');
  const subscription = await request.get(`/api/v1/subscriptions/${subscriptionId}`, {
    headers: auth,
  });
  const due = (await subscription.json()).next_billing_date;
  const applied = await request.post('/api/v1/billing-runs', {
    headers: { ...auth, 'Idempotency-Key': `pause-${suffix}` },
    data: { due_on: due, subscription_ids: [subscriptionId] },
  });
  expect(applied.status()).toBe(202);
  await customer.reload();
  await expect(dialog(customer).locator('.detail-status .status')).toHaveText('Paused');
  await expect(
    dialog(customer).getByRole('button', { name: 'Request Resume', exact: true }),
  ).toBeVisible();
  await customerContext.close();
});

test('staff and customer navigation enforces their roles', async ({ page, request, isMobile }) => {
  test.skip(isMobile);
  await login(page, 'staff@brightloop.demo', 'DemoStaff!1');
  await nav(page, 'Products');
  await expect(page.getByRole('button', { name: 'New product', exact: true })).toHaveCount(0);
  await expect(
    page.locator('.sidebar').getByRole('button', { name: 'Staff members', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
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

test('password reset completes through the demo outbox', async ({ page, request, isMobile }) => {
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
  await page.getByRole('button', { name: 'Request reset', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set new password' })).toBeVisible();
  const outbox = await request.get('/api/v1/outbox', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const entry = (await outbox.json()).data.find((row: any) => row.recipient === email);
  await page.getByLabel('Reset token', { exact: true }).fill(entry.detail.token);
  await page.getByLabel('Password', { exact: true }).fill('ChangedPassword!2');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('Subscriptions');
});

test('mobile navigation keeps the toggle in place and restores keyboard focus', async ({
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
  await nav(page, 'Products');
  const create = page.getByRole('button', { name: 'New product', exact: true });
  await create.click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page)
    .locator('label')
    .filter({ hasText: /^Name$/ })
    .click();
  await expect(dialog(page).getByLabel('Name', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
