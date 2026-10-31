import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
from types import SimpleNamespace

import pytest

from app import dev


def test_windows_launcher_uses_cmd_without_powershell_script_policy(monkeypatch):
    monkeypatch.setattr(dev, "os", SimpleNamespace(name="nt", environ={"COMSPEC": "cmd.exe"}))
    assert dev.npm_command("run", "dev") == ["cmd.exe", "/d", "/c", "npm.cmd", "run", "dev"]


@pytest.mark.skipif(os.name == "nt", reason="POSIX process groups")
def test_shutdown_stops_a_child_process_group_after_its_parent_exits(tmp_path):
    child_file = tmp_path / "child.pid"
    program = (
        "import pathlib,subprocess,sys; "
        "child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']); "
        "pathlib.Path(sys.argv[1]).write_text(str(child.pid))"
    )
    parent = subprocess.Popen(
        [sys.executable, "-c", program, str(child_file)], start_new_session=True
    )
    try:
        assert parent.wait(timeout=10) == 0
        dev.stop_processes([parent])
        child = int(child_file.read_text())
        # A terminated orphan may briefly remain a zombie until the host reaps it.
        state = Path(f"/proc/{child}/stat")
        if state.exists():
            import time

            for _ in range(100):
                if not state.exists() or state.read_text().split()[2] == "Z":
                    break
                time.sleep(0.01)
            assert not state.exists() or state.read_text().split()[2] == "Z"
    finally:
        try:
            os.killpg(parent.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def test_complete_verification_requires_postgres_instead_of_silently_skipping(monkeypatch):
    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location("brightloop_manage", root / "manage.py")
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(root))
    try:
        spec.loader.exec_module(module)
        monkeypatch.delenv("TEST_DATABASE_URL", raising=False)
        with pytest.raises(SystemExit, match="Set TEST_DATABASE_URL"):
            module.execute("verify-all")
    finally:
        sys.path.remove(str(root))
