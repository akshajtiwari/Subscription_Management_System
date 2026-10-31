# Brightloop Subscription Management

A React and FastAPI application for managing customers, products, recurring plans,
subscriptions, invoices, payments, discounts, and reports. Records persist in a local
database. Payments and message delivery are fictional: invoice emails and password
reset links go to the **Demo outbox** instead of an external service.

## 1. Install prerequisites

Use Linux, macOS, or Ubuntu inside Windows Subsystem for Linux (WSL). The commands
below use Bash or Zsh. On Windows, install WSL from an administrator PowerShell:

```powershell
wsl --install
```

Restart if prompted, open Ubuntu, and complete the Linux steps there. Keep the
checkout inside your Linux home directory. See Microsoft's [WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install).

You need Git, Make, **pyenv**, **Python 3.12.0**, and **Node.js 24 with npm**. Docker
with Compose is optional and is needed only for the PostgreSQL instructions below.

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

### Enable pyenv in your shell

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
If you use nvm, run `nvm install 24` and `nvm use 24`. In WSL, install Node inside
Ubuntu rather than using a Windows Node executable.

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
pyenv install -s 3.12.0
pyenv exec python --version
make setup
```

Run all following commands from this repository root unless a step says otherwise.
The committed `.python-version` selects Python 3.12.0 for this checkout.

`make setup` creates `backend/.venv`, installs the locked Python dependencies with
pip, installs the backend in editable mode, and installs frontend dependencies with
`npm ci`. You do not need to activate the virtual environment. The first setup
requires internet access and may take several minutes while Python compiles.

## 3. Start the app

```bash
make dev
```

This command applies database migrations, seeds an empty database, and starts all
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

### Run in the background

After setup, start the same supervisor directly from the repository root:

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
make verify
```

This runs formatting checks, Python lint, backend tests, frontend type checks, and the production
frontend build. The generated frontend files are in `frontend/dist`. Backend tests
use isolated databases; they do not modify your development records. The PostgreSQL
concurrency check is skipped unless `TEST_DATABASE_URL` is configured.

| Command                                                                               | Purpose                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `make test`                                                                           | Python lint, backend tests, and frontend type checks |
| `make build`                                                                          | Type-check and build the frontend                    |
| `make format`                                                                         | Format Python and frontend source                    |
| `make format-check`                                                                   | Check formatting without changing files              |
| `backend/.venv/bin/python -m ruff check backend/app backend/migrations backend/tests` | Check Python lint rules                              |

### Browser tests

Install Playwright's Chromium once after `make setup`:

```bash
cd frontend
npx playwright install chromium
cd ..
make test-e2e
```

On Linux or WSL, if Playwright reports missing system libraries, run
`npx playwright install --with-deps chromium` from `frontend` instead; installing
system packages may ask for sudo access.

The browser suite starts its own API and frontend on **8003** and **5175**, with a
fresh temporary SQLite database. Leave those ports free. It covers the desktop
billing workflow, role boundaries, password reset, form retries, and mobile
navigation/focus. Results are written to `frontend/playwright-report` and
`frontend/test-results`. Open the report with:

```bash
cd frontend
npx playwright show-report
```

## 5. Optional: use PostgreSQL

The SQLite path above is sufficient to run the app. To use the provided
PostgreSQL 16 configuration, first install Docker and its Compose plugin, then run:

```bash
docker compose up -d postgres
docker compose exec postgres pg_isready -U brightloop -d brightloop
```

Wait until the readiness command succeeds, then start the app from the same root:

```bash
export DATABASE_URL='postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop'
make dev
```

This creates and seeds a separate PostgreSQL database; existing SQLite records are
not copied. Compose persists PostgreSQL data in the `brightloop_data` volume.
`docker compose down` stops the database and retains that volume.

To include the PostgreSQL concurrency test in a separate terminal:

```bash
export TEST_DATABASE_URL='postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop'
make test
```

Use a database that permits creating and dropping test schemas. The test creates a
unique schema and removes it afterward. To switch the development app back to
SQLite, stop it, run `unset DATABASE_URL`, and start `make dev` again.

## Configuration

Export variables in the terminal before starting the app. `.env` files are **not
loaded automatically**. No external email provider, payment key, or GitHub token is
required to run locally.

| Variable               | Default                                           | Purpose                                                       |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`         | SQLite at `backend/brightloop.db` with `make dev` | Development database                                          |
| `DEMO_SECRET`          | Local demo value                                  | Signs login tokens; changing it invalidates existing sessions |
| `FRONTEND_ORIGIN`      | `http://localhost:5173`                           | API CORS origin                                               |
| `BILLING_POLL_SECONDS` | `3600`                                            | Worker polling interval, minimum 60 seconds                   |
| `TEST_DATABASE_URL`    | Unset                                             | Enables the PostgreSQL concurrency test                       |

The bundled accounts, signing default, and Compose credentials are for local demo
use. Keep personal credentials and payment secrets out of Git.

## Troubleshooting

- **`pyenv: command not found`**: finish shell initialization and open a new terminal.
- **Python version is not installed**: run `pyenv install -s 3.12.0` from the root.
- **Python compilation fails**: install the OS build libraries above and retry.
  An OpenSSL or SQLite import error usually means a build dependency was missing.
- **`make: command not found`**: install Make or finish the macOS command line tools
  installation; on Windows, run the commands inside WSL.
- **Missing Python or npm packages**: run `make setup` again. Do not reuse a virtual
  environment or `node_modules` copied from another computer.
- **Address already in use**: stop the old preview process, or the service using
  5173/8001. Browser tests separately require 5175/8003.
- **PostgreSQL connection refused**: start Docker, check `docker compose ps`, and
  wait for `pg_isready` to succeed.
- **Demo password no longer works**: existing databases retain account changes.
  Use password reset and the admin outbox. For a fresh SQLite demo, stop all app
  processes, move `backend/brightloop.db` to a backup location, and run `make dev`.
  This starts a new database; your records remain only in the backup.
- **Preview cannot reach the API**: start with `make dev`, check both services'
  terminal output, and use the frontend URL on port 5173.

## Code layout

- `backend/app`: accounts and roles, catalog, subscription lifecycle, billing,
  invoices, payments, discount/tax calculations, reporting, and development runners.
- `backend/migrations`: database migrations.
- `backend/tests`: API, domain, scale, and concurrency tests.
- `frontend/src`: React screens, forms, shared controls, and application styles.
- `frontend/tests`: desktop/mobile browser tests and their development proxy.
- `Makefile`, `.python-version`, and dependency lockfiles: repeatable local commands
  and dependency setup.
- `compose.yaml`: optional PostgreSQL service.
