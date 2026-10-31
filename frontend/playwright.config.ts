import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const python =
  process.env.E2E_PYTHON ||
  join(root, 'backend/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const quote = (value: string) =>
  process.platform === 'win32'
    ? `"${value.replaceAll('"', '""')}"`
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
const database = `sqlite:///${join(tmpdir(), `brightloop-e2e-${randomUUID()}.db`).replaceAll('\\', '/')}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      },
    },
  ],
  webServer: [
    {
      command: `${quote(python)} -m app.dev --api-only --port 8003`,
      cwd: join(root, 'backend'),
      url: 'http://127.0.0.1:8003/api/v1/health',
      env: { DATABASE_URL: database, DEMO_SECRET: 'fictional-e2e-only' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --config tests/vite.config.ts',
      cwd: join(root, 'frontend'),
      url: 'http://127.0.0.1:5175',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
