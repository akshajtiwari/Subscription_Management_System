# Brightloop Subscription Management

A React and FastAPI application for managing customers, products, recurring plans,
subscriptions, invoices, payments, discounts, and reports. Records persist in a local
database. Payments and message delivery are fictional: invoice emails and password
reset links go to the **Demo outbox** instead of an external service.

## 1. Install prerequisites

Use native Windows with PowerShell, Linux, or macOS. **Windows does not require
Linux, WSL, Docker, or Make.** Python dependencies use pip in a project virtual
environment on every platform.

You need Git, **pyenv** (or **pyenv-win**), **Python 3.12.0**, and **Node.js 24 with
npm**. The Python command runner works on all three platforms. Make is an optional
shortcut on Linux/macOS. PostgreSQL is optional; SQLite needs no server installation.

### Windows: native PowerShell setup

1. Install [Git for Windows](https://git-scm.com/install/windows) and the **24.x Windows
   installer** from the [Node.js downloads](https://nodejs.org/en/download). Include npm
   and allow the installers to add their commands to PATH. Open a new PowerShell.
2. Install [pyenv-win using Git](https://github.com/pyenv-win/pyenv-win/blob/master/docs/installation.md#git-commands).
   Run this once; skip the clone if you already have pyenv-win:

```powershell
git clone https://github.com/pyenv-win/pyenv-win.git "$env:USERPROFILE\.pyenv"
$brightloopPyenvRoot = "$env:USERPROFILE\.pyenv\pyenv-win"
[Environment]::SetEnvironmentVariable("PYENV", "$brightloopPyenvRoot\", "User")
[Environment]::SetEnvironmentVariable("PYENV_ROOT", "$brightloopPyenvRoot\", "User")
[Environment]::SetEnvironmentVariable("PYENV_HOME", "$brightloopPyenvRoot\", "User")
$brightloopUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$brightloopPyenvRoot\bin;$brightloopPyenvRoot\shims;$brightloopUserPath", "User")
```

3. Close and reopen PowerShell (restart VS Code too if using its terminal). Check:

```powershell
git --version
pyenv --version
node --version
npm.cmd --version
```

`node --version` should start with `v24.`. If `python` opens the Microsoft Store,
turn off the App Installer Python aliases under **Manage app execution aliases**.
Continue with step 2 below in this same native PowerShell. No shell activation or
PowerShell execution-policy change is needed for the application commands.

The Ubuntu/macOS prerequisite sections below are for those platforms only.

### Ubuntu / Debian

Install Git, Make, and the libraries needed to compile Python:

```bash
sudo apt update
sudo apt install -y git make build-essential ca-certificates wget \
  libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev \
  libncurses-dev xz-utils tk-dev libffi-dev liblzma-dev
git clone https://github.com/pyenv/pyenv.git "$HOME/.pyenv"
```

Skip the clone if you already have pyenv installed. For other Linux distributions,
use pyenv's [build dependency guide](https://github.com/pyenv/pyenv/wiki#suggested-build-environment).

### macOS

Install Apple's command line tools, then install [Homebrew](https://brew.sh/) if it
is not already available:

```bash
xcode-select --install
```

After that installation finishes:

```bash
brew install git pyenv openssl@3 readline sqlite3 xz zlib
```

Make is included with Apple's command line tools.

### Enable pyenv in Bash / Zsh (Linux and macOS only)

Add these lines once to `~/.bashrc` for Bash or `~/.zshrc` for Zsh:

```bash
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
```

Add the matching initialization line to the same file:

```bash
# Bash
eval "$(pyenv init - bash)"
```

```zsh
# Zsh
eval "$(pyenv init - zsh)"
```

Open a new terminal. On macOS, Homebrew's `bin` directory must also be on your
`PATH`; follow Homebrew's installation output if `brew` or `pyenv` is unavailable.
The [pyenv shell setup guide](https://github.com/pyenv/pyenv#set-up-your-shell-environment-for-pyenv)
covers login shells and other shell configurations.

### Install Node.js

Install **Node.js 24**, including npm, using the [Node.js download page](https://nodejs.org/en/download).
If you use nvm on Linux/macOS, run `nvm install 24` and `nvm use 24`.

Check that your terminal can find the required tools:

```bash
git --version
make --version
pyenv --version
node --version
npm --version
```

`node --version` should start with `v24.`. Python is installed in the next step.

## 2. Clone and install the application

```bash
git clone https://github.com/akshajtiwari/Subscription_Management_System.git
cd Subscription_Management_System
```

Install the pinned Python version (skip installation if already installed):

```text
pyenv install 3.12.0
pyenv exec python --version
pyenv exec python manage.py setup
```

These commands work in PowerShell, Bash, and Zsh. Run all following commands from
this repository root unless a step says otherwise.
The committed `.python-version` selects Python 3.12.0 for this checkout.

`manage.py setup` creates `backend/.venv` (`Scripts/python.exe` on Windows; `bin/python` on Linux/macOS), installs the locked Python dependencies with
pip, installs the backend in editable mode, and installs frontend dependencies with
`npm ci`. You do not need to activate the virtual environment. The first setup
requires internet access and may take several minutes on Linux/macOS while Python compiles. pyenv-win installs a native Windows Python build.

## 3. Start the app

```bash
pyenv exec python manage.py dev
```

This command applies database migrations, adds missing fictional demo records, and starts all
three processes:

| Process           | Address / behavior                                       |
| ----------------- | -------------------------------------------------------- |
| Frontend          | [http://localhost:5173](http://localhost:5173)           |
| API               | [http://localhost:8001](http://localhost:8001)           |
| API documentation | [http://localhost:8001/docs](http://localhost:8001/docs) |
| Billing worker    | Runs immediately, then polls hourly                      |

Keep this terminal open. Press **Ctrl+C** to stop the frontend, API, and worker.
Ports **5173** and **8001** must be free. The development services listen on your
local machine.

SQLite works without installing a database server. Its records are stored in
`backend/brightloop.db` and survive restarts. Seeding does not replace existing
accounts or records. The worker can create draft invoices for seeded subscriptions
as soon as the app starts.

### Demo accounts

| Role     | Email                      | Password         |
| -------- | -------------------------- | ---------------- |
| Admin    | `admin@brightloop.demo`    | `DemoAdmin!1`    |
| Staff    | `staff@brightloop.demo`    | `DemoStaff!1`    |
| Customer | `customer@brightloop.demo` | `DemoCustomer!1` |

Use the admin account to manage catalog and pricing rules or staff access. Staff
can manage operational workflows and approve customer requests. Customers see
their own subscriptions, invoices, payments, and change requests. Test a reset
from **Forgot password**, then open **Demo outbox** as an admin to find its link.
The outbox is available from the admin's account page (the avatar in the top bar).

### Seeded fictional workspace

The first start creates over 1,300 subscriptions across their lifecycle stages,
44 customers, 10 staff accounts, 40 products with variants, 18 plans, quote
templates, discount and tax rules, and a billing ledger with 450+ invoices and
500+ payment entries. The customer demo account has its own subscriptions and
invoice history. Records cover USD, EUR, GBP, and INR.
Invoices include drafts, paid balances, partial payments, and overdue balances.
All names, addresses, transactions, and message deliveries are fictional.

The expanded ledger covers the **last twelve months**, including the current
month, alongside the original May–October 2026 samples. Dashboard and report
charts show six months by default. Change the report dates or currency to explore
the history. Totals come from the invoices and payments and change when records
are added or the worker processes a new billing period.

If an existing checkout looks sparse, pull the latest changes and run this from
the repository root, then refresh the browser:

```text
pyenv exec python manage.py seed
```

The API and seed command use the same default database regardless of the terminal's
working directory. `DATABASE_URL` still selects a custom database when configured.

Restarting adds missing samples without overwriting edits, resetting passwords,
or duplicating the existing ledger. To start with a fresh SQLite dataset, stop
the app, move `backend/brightloop.db` to a backup location, and start it again.
Keep that backup if you need your existing records.

### Run in the background (Linux / macOS)

On Windows, keep the PowerShell development terminal open and use Ctrl+C to stop
all services. On Linux/macOS, you can also start the supervisor in the background
from the repository root:

```bash
nohup backend/.venv/bin/python -m app.dev > /tmp/brightloop-dev.log 2>&1 &
echo $! > /tmp/brightloop-dev.pid
```

Read its startup output with `tail -f /tmp/brightloop-dev.log`. Stop this instance
with the saved supervisor PID:

```bash
kill "$(cat /tmp/brightloop-dev.pid)"
```

Do not start a second instance while another one is using the same ports.

## 4. Run local checks

```bash
pyenv exec python manage.py verify
```

This runs formatting checks, Python lint, backend tests, frontend type checks, and the production
frontend build. The generated frontend files are in `frontend/dist`. Backend tests
use isolated databases; they do not modify your development records. The PostgreSQL
concurrency check is skipped unless `TEST_DATABASE_URL` is configured.

| Command                                                                               | Purpose                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pyenv exec python manage.py test`                                                    | Python lint, backend tests, and frontend type checks |
| `pyenv exec python manage.py build`                                                   | Type-check and build the frontend                    |
| `pyenv exec python manage.py format`                                                  | Format Python and frontend source                    |
| `pyenv exec python manage.py format-check`                                            | Check formatting without changing files              |
| `backend/.venv/bin/python -m ruff check backend/app backend/migrations backend/tests` | Check Python lint rules                              |

### Browser tests

Install Playwright's Chromium once after `pyenv exec python manage.py setup`:

```bash
cd frontend
npx playwright install chromium
cd ..
pyenv exec python manage.py test-e2e
```

On Linux, if Playwright reports missing system libraries, run
`npx playwright install --with-deps chromium` from `frontend` instead; installing
system packages may ask for sudo access.

The browser suite starts its own API and frontend on **8003** and **5175**, with a
fresh temporary SQLite database. Leave those ports free. It covers the desktop
billing workflow, role boundaries, password reset, form retries, and mobile
navigation/focus. Visual checks preserve the approved stylesheet's SHA-256 and
compare sign-in with the approved reference at desktop and mobile sizes. The
Adwaita fonts are bundled so a fresh device uses the same typography; their
license is in `frontend/public/fonts/LICENSE`.
Results are written to `frontend/playwright-report` and
`frontend/test-results`. Open the report with:

```bash
cd frontend
npx playwright show-report
```

### Run every check in one command

After installing Chromium and configuring a PostgreSQL test database, run:

```text
pyenv exec python manage.py verify-all
```

This runs formatting, lint, backend tests (including PostgreSQL concurrency), the
frontend build, and desktop/mobile browser tests. It stops on the first failure
and refuses to run without `TEST_DATABASE_URL`, so it cannot silently skip the
PostgreSQL check. `verify` runs the regular checks without requiring PostgreSQL.
`make <command>` remains an equivalent shortcut on Linux/macOS.

## 5. Optional: use PostgreSQL

### Native Windows PostgreSQL (no Linux or Docker)

Install PostgreSQL 16 from the official [Windows installer page](https://www.postgresql.org/download/windows/).
Use port 5432 and remember the `postgres` administrator password. In pgAdmin, create
an ordinary login role named `brightloop` with password `demo_only`, then create a
`brightloop` database owned by that role. Its owner can create the isolated test schemas.

In PowerShell, set the connection strings and start the app:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
pyenv exec python manage.py dev
```

Stop with Ctrl+C before running `pyenv exec python manage.py verify-all`. To switch
back to SQLite, run `Remove-Item Env:DATABASE_URL` and start the app again.
The native PostgreSQL server is managed by Windows Services. No database server is
needed at all for the default SQLite setup.

### Docker Compose (optional Linux / macOS alternative)

The SQLite path above is sufficient to run the app. To use the provided
PostgreSQL 16 configuration, first install Docker and its Compose plugin, then run:

```bash
docker compose up -d postgres
docker compose exec postgres pg_isready -U brightloop -d brightloop
```

Wait until the readiness command succeeds, then start the app from the same root:

```bash
export DATABASE_URL='postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop'
pyenv exec python manage.py dev
```

This creates and seeds a separate PostgreSQL database; existing SQLite records are
not copied. Compose persists PostgreSQL data in the `brightloop_data` volume.
`docker compose down` stops the database and retains that volume.

To include the PostgreSQL concurrency test in a separate terminal:

```bash
export TEST_DATABASE_URL='postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop'
pyenv exec python manage.py test
```

Use a database that permits creating and dropping test schemas. The test creates a
unique schema and removes it afterward. To switch the development app back to
SQLite, stop it, run `unset DATABASE_URL`, and start `pyenv exec python manage.py dev` again.

## Configuration

Set environment variables in the terminal before starting the app. Use
`$env:DATABASE_URL = "..."` in PowerShell or `export DATABASE_URL='...'` in Bash/Zsh. `.env` files are **not
loaded automatically**. No external email provider, payment key, or GitHub token is
required to run locally.

| Variable               | Default                                                                  | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `DATABASE_URL`         | SQLite at `backend/brightloop.db` with `pyenv exec python manage.py dev` | Development database                                          |
| `DEMO_SECRET`          | Local demo value                                                         | Signs login tokens; changing it invalidates existing sessions |
| `FRONTEND_ORIGIN`      | `http://localhost:5173`                                                  | API CORS origin                                               |
| `BILLING_POLL_SECONDS` | `3600`                                                                   | Worker polling interval, minimum 60 seconds                   |
| `TEST_DATABASE_URL`    | Unset                                                                    | Enables the PostgreSQL concurrency test                       |

The bundled accounts, signing default, and Compose credentials are for local demo
use. Keep personal credentials and payment secrets out of Git.

## Troubleshooting

- **`pyenv: command not found`**: finish shell initialization and open a new terminal.
- **Python version is not installed**: run `pyenv install 3.12.0` from the root.
- **Python compilation fails**: install the OS build libraries above and retry.
  An OpenSSL or SQLite import error usually means a build dependency was missing.
- **`make: command not found`**: install Make or finish the macOS command line tools
  installation; use the Python command runner on Windows; Make is optional.
- **Missing Python or npm packages**: run `pyenv exec python manage.py setup` again. Do not reuse a virtual
  environment or `node_modules` copied from another computer.
- **Address already in use**: stop the old preview process, or the service using
  5173/8001. Browser tests separately require 5175/8003.
- **PostgreSQL connection refused**: on Windows, start the PostgreSQL service in
  Windows Services. With Docker, check `docker compose ps` and wait for
  `pg_isready` to succeed.
- **Demo password no longer works**: existing databases retain account changes.
  Use password reset and the admin outbox. For a fresh SQLite demo, stop all app
  processes, move `backend/brightloop.db` to a backup location, and run `pyenv exec python manage.py dev`.
  This starts a new database; your records remain only in the backup.
- **Preview cannot reach the API**: start with `pyenv exec python manage.py dev`, check both services'
  terminal output, and use the frontend URL on port 5173.

## Code layout

- `backend/app`: accounts and roles, catalog, subscription lifecycle, billing,
  invoices, payments, discount/tax calculations, reporting, and development runners.
- `backend/migrations`: database migrations.
- `backend/tests`: API, domain, scale, and concurrency tests.
- `frontend/src`: React screens, forms, shared controls, and application styles.
- `frontend/tests`: desktop/mobile browser tests and their development proxy.
- `manage.py`, `Makefile`, `.python-version`, and dependency lockfiles: repeatable local commands
  and dependency setup.
- `compose.yaml`: optional PostgreSQL service.
