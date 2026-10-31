import hashlib
from pathlib import Path


def test_the_approved_workspace_stylesheet_is_unchanged():
    path = Path(__file__).resolve().parents[2] / "frontend/src/workspace.css"
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest()
        == "cf71454018579c1a97c8fc03b00f593d7e0d9258080f6e77c2dfd43b5fa7874a"
    )
