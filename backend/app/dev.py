"""Run both local development services with the current virtual environment."""

import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def main():
    root = Path(__file__).resolve().parents[2]
    backend = root / "backend"
    environment = os.environ.copy()
    environment.setdefault("DATABASE_URL", f"sqlite:///{backend / 'brightloop.db'}")
    for command in [
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        [sys.executable, "-m", "app.seed"],
    ]:
        subprocess.run(command, cwd=backend, env=environment, check=True)
    processes = []

    def stop(signum=None, frame=None):
        for process in processes:
            process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        if signum:
            raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    try:
        processes.append(
            subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "app.main:app", "--reload", "--port", "8001"],
                cwd=backend,
                env=environment,
            )
        )
        processes.append(
            subprocess.Popen(
                [
                    "npm",
                    "run",
                    "dev",
                    "--",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "5173",
                    "--strictPort",
                ],
                cwd=root / "frontend",
                env=environment,
            )
        )
        print("Brightloop frontend: http://localhost:5173", flush=True)
        print("Brightloop API: http://localhost:8001", flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        raise SystemExit(
            next((process.returncode for process in processes if process.returncode), 1)
        )
    except KeyboardInterrupt:
        pass
    finally:
        stop()


if __name__ == "__main__":
    main()
