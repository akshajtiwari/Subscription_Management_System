import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('the approved stylesheet remains byte for byte identical', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../../src/workspace.css'));
  expect(createHash('sha256').update(css).digest('hex')).toBe(
    'cf71454018579c1a97c8fc03b00f593d7e0d9258080f6e77c2dfd43b5fa7874a',
  );
});

test('sign-in renders the approved desktop and mobile reference', async ({
  page,
  context,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const actual = await page.screenshot({ animations: 'disabled' });
  const reference = await context.newPage();
  await reference.goto('/tests/fixtures/sign-in.html');
  await reference.evaluate(() => document.fonts.ready);
  const expected = await reference.screenshot({ animations: 'disabled' });
  await testInfo.attach('application', { body: actual, contentType: 'image/png' });
  await testInfo.attach('approved-reference', { body: expected, contentType: 'image/png' });
  expect(actual.equals(expected)).toBe(true);
  await reference.close();
});
