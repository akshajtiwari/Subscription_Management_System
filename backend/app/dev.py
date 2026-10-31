"""Run local development services with the current virtual environment."""

import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def npm_command(*args):
    if os.name == "nt":
        return [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", "npm.cmd", *args]
    return ["npm", *args]


def stop_processes(processes):
    for process in processes:
        if os.name == "nt" and process.poll() is not None:
            continue
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for process in processes:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                process.kill()
            else:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-only", action="store_true")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    backend = root / "backend"
    environment = os.environ.copy()
    environment.setdefault("DATABASE_URL", f"sqlite:///{(backend / 'brightloop.db').as_posix()}")
    for command in [
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        [sys.executable, "-m", "app.seed"],
    ]:
        subprocess.run(command, cwd=backend, env=environment, check=True)
    processes = []

    def stop(signum=None, frame=None):
        stop_processes(processes)
        if signum:
            raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)

    def launch(command, cwd):
        processes.append(
            subprocess.Popen(
                command,
                cwd=cwd,
                env=environment,
                start_new_session=os.name != "nt",
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            )
        )

    try:
        launch(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(args.port),
                *([] if args.api_only else ["--reload"]),
            ],
            backend,
        )
        if not args.api_only:
            launch([sys.executable, "-m", "app.worker"], backend)
            launch(
                npm_command(
                    "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"
                ),
                root / "frontend",
            )
            print("Brightloop frontend: http://localhost:5173", flush=True)
            print("Brightloop billing worker started", flush=True)
        print(f"Brightloop API: http://localhost:{args.port}", flush=True)
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
