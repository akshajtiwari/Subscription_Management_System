"""Cross-platform project commands. Run with the Python selected by pyenv."""

import argparse
import os
from pathlib import Path
import subprocess
import venv

from backend.app.dev import npm_command

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
PYTHON = BACKEND / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(command, cwd=ROOT):
    subprocess.run([str(part) for part in command], cwd=cwd, check=True)


def python(*args):
    if not PYTHON.exists():
        raise SystemExit("Run 'pyenv exec python manage.py setup' first.")
    run([PYTHON, *args], cwd=BACKEND)


def npm(*args):
    run(npm_command(*args), cwd=FRONTEND)


def execute(command):
    if command in {"python-env", "setup"}:
        venv.EnvBuilder(with_pip=True).create(BACKEND / ".venv")
        if command == "setup":
            python("-m", "pip", "install", "-r", "requirements.lock", "-e", ".[test]")
            npm("ci")
    elif command == "dev":
        python("-m", "app.dev")
    elif command == "dev-api":
        python("-m", "app.dev", "--api-only")
    elif command == "dev-web":
        npm("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort")
    elif command == "worker":
        python("-m", "app.worker")
    elif command == "seed":
        python("-m", "alembic", "upgrade", "head")
        python("-m", "app.seed")
    elif command == "test":
        python(
            "-m",
            "ruff",
            "check",
            "--config",
            "pyproject.toml",
            "../manage.py",
            "app",
            "migrations",
            "tests",
        )
        python("-m", "pytest")
        npm("run", "lint")
    elif command == "build":
        npm("run", "build")
    elif command in {"format", "format-check"}:
        args = ["-m", "ruff", "format", "--config", "pyproject.toml"]
        if command == "format-check":
            args.append("--check")
        python(*args, "../manage.py", "app", "migrations", "tests")
        npm("run", "format:check" if command == "format-check" else "format")
    elif command == "install-browser":
        npm("exec", "--", "playwright", "install", "chromium")
    elif command == "test-e2e":
        npm("run", "test:e2e")
    elif command in {"verify", "verify-all"}:
        if command == "verify-all" and not os.getenv("TEST_DATABASE_URL"):
            raise SystemExit(
                "Set TEST_DATABASE_URL to a PostgreSQL test database before verify-all."
            )
        for check in ["format-check", "test", "build"]:
            execute(check)
        if command == "verify-all":
            execute("test-e2e")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=[
            "python-env",
            "setup",
            "dev",
            "dev-api",
            "dev-web",
            "worker",
            "seed",
            "test",
            "build",
            "format",
            "format-check",
            "install-browser",
            "test-e2e",
            "verify",
            "verify-all",
        ],
    )
    args = parser.parse_args()
    try:
        execute(args.command)
    except subprocess.CalledProcessError as exc:
        raise SystemExit(exc.returncode) from exc
    except KeyboardInterrupt:
        raise SystemExit(130) from None
    except FileNotFoundError as exc:
        raise SystemExit(
            f"Required executable unavailable: {exc.filename}. Check the README prerequisites."
        ) from exc


if __name__ == "__main__":
    main()
