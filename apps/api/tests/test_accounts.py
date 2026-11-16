"""Multi-user mode: setup, sign-in, sessions, separate workspaces, admin functions and MCP per account."""

import re
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db.session import SessionLocal, use_workspace, workspace_dir
from app.services import accounts, notifications
from tests.test_files import PNG
from tests.test_notifications import sent  # noqa: F401 - fixture
from tests.test_settings_mcp import INITIALIZE, MCP_HEADERS

ADMIN = {"username": "Admin", "password": "admin-password-1", "display_name": "Admin"}


@pytest.fixture
def multi(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, str]]:
    """Multi-user mode with the admin account; yields headers of a signed-in admin."""
    monkeypatch.setattr(get_settings(), "auth_mode", "multi")
    accounts.reset_rate_limits()
    if accounts.user_count() == 0:
        assert client.get("/api/v1/auth/status").json()["setup_required"] is True
        response = client.post("/api/v1/auth/setup", json=ADMIN)
        assert response.status_code == 200, response.text
    token = client.post("/api/v1/auth/login", json=ADMIN).json()["token"]
    yield {"Authorization": f"Bearer {token}"}
    accounts.reset_rate_limits()


def _user(client: TestClient, admin: dict[str, str], username: str, password: str = "user-password-1", **extra: object) -> dict[str, str]:
    existing = {user["username"]: user for user in client.get("/api/v1/users", headers=admin).json()}
    if username not in existing:
        response = client.post("/api/v1/users", json={"username": username, "password": password, **extra}, headers=admin)
        assert response.status_code == 201, response.text
    token = client.post("/api/v1/auth/login", json={"username": username, "password": password}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_single_mode_needs_no_sign_in(client: TestClient) -> None:
    assert client.get("/api/v1/auth/status").json() == {"mode": "single", "setup_required": False, "user": None}
    assert client.get("/api/v1/projects").status_code == 200
    assert client.get("/api/v1/account").status_code == 404
    assert client.post("/api/v1/auth/login", json=ADMIN).status_code == 400


def test_api_requires_a_session(client: TestClient, multi: dict[str, str]) -> None:
    assert client.get("/api/v1/projects").status_code == 401
    assert client.get("/api/v1/projects", headers={"Authorization": "Bearer nonsense"}).status_code == 401
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/api/v1/projects", headers=multi).status_code == 200

    status = client.get("/api/v1/auth/status", headers=multi).json()
    assert status["mode"] == "multi" and status["setup_required"] is False
    assert status["user"]["username"] == "admin" and status["user"]["is_admin"] is True
    # Setup is only possible once.
    assert client.post("/api/v1/auth/setup", json={"username": "intruder", "password": "intruder-pass"}).status_code == 409


def test_wrong_password_and_rate_limit(client: TestClient, multi: dict[str, str]) -> None:
    assert client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong-password"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "nobody", "password": "wrong-password"}).status_code == 401
    for _ in range(accounts.MAX_FAILURES):
        client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong-password"})
    # Even the right password is refused while the account is throttled.
    assert client.post("/api/v1/auth/login", json=ADMIN).status_code == 429


def test_password_hash_is_not_plain() -> None:
    stored = accounts.hash_password("geheim-passwort")
    assert "geheim" not in stored and stored.startswith("scrypt$")
    assert accounts.verify_password("geheim-passwort", stored) and not accounts.verify_password("falsch", stored)


def test_workspaces_are_separate(client: TestClient, multi: dict[str, str]) -> None:
    alice = _user(client, multi, "alice")
    bob = _user(client, multi, "bob")

    project = client.post("/api/v1/projects", json={"name": "Alice geheim"}, headers=alice).json()
    assert client.post("/api/v1/notes", json={"title": "Bob Notiz", "content": "x"}, headers=bob).status_code == 201

    assert [p["name"] for p in client.get("/api/v1/projects", headers=alice).json()] == ["Alice geheim"]
    assert "Alice geheim" not in {p["name"] for p in client.get("/api/v1/projects", headers=bob).json()}
    assert "Alice geheim" not in {p["name"] for p in client.get("/api/v1/projects", headers=multi).json()}
    assert client.get(f"/api/v1/projects/{project['id']}", headers=bob).status_code == 404

    # Settings are per account, too.
    client.patch("/api/v1/settings", json={"language": "ja"}, headers=alice)
    assert client.get("/api/v1/settings", headers=alice).json()["language"] == "ja"
    assert client.get("/api/v1/settings", headers=bob).json()["language"] != "ja"

    upload = client.post("/api/v1/files", files={"file": ("a.png", PNG, "image/png")}, headers=alice)
    assert upload.status_code == 201, upload.text
    file_id = upload.json()["id"]
    assert client.get(f"/api/v1/files/{file_id}/content", headers=alice).content == PNG
    assert client.get(f"/api/v1/files/{file_id}/content", headers=bob).status_code == 404
    # Alice's upload is stored in her workspace folder, not in the default upload folder.
    assert list((workspace_dir(accounts.find_user("alice").workspace) / "uploads").glob("*.png"))


def test_non_admins_cannot_manage_accounts(client: TestClient, multi: dict[str, str]) -> None:
    carol = _user(client, multi, "carol")
    assert client.get("/api/v1/users", headers=carol).status_code == 403
    assert client.post("/api/v1/users", json={"username": "x1", "password": "password-123"}, headers=carol).status_code == 403
    assert client.get("/api/v1/account", headers=carol).json()["username"] == "carol"


def test_password_change_and_sessions(client: TestClient, multi: dict[str, str]) -> None:
    first = _user(client, multi, "dave", "dave-password-1")
    second = {"Authorization": "Bearer " + client.post("/api/v1/auth/login", json={"username": "dave", "password": "dave-password-1"}).json()["token"]}
    sessions = client.get("/api/v1/account/sessions", headers=first).json()
    assert len(sessions) == 2 and sum(entry["current"] for entry in sessions) == 1

    assert client.post("/api/v1/account/password", json={"current_password": "wrong", "new_password": "dave-password-2"}, headers=first).status_code == 400
    assert client.post("/api/v1/account/password", json={"current_password": "dave-password-1", "new_password": "short"}, headers=first).status_code == 400
    assert client.post("/api/v1/account/password", json={"current_password": "dave-password-1", "new_password": "dave-password-2"}, headers=first).status_code == 204
    # The other browser is signed out, this one stays signed in.
    accounts._clear_cache()
    assert client.get("/api/v1/projects", headers=second).status_code == 401
    assert client.get("/api/v1/projects", headers=first).status_code == 200

    client.post("/api/v1/auth/logout", headers=first)
    assert client.get("/api/v1/projects", headers=first).status_code == 401


def test_admin_rules(client: TestClient, multi: dict[str, str]) -> None:
    users = {user["username"]: user for user in client.get("/api/v1/users", headers=multi).json()}
    admin_id = users["admin"]["id"]
    assert client.delete(f"/api/v1/users/{admin_id}", headers=multi).status_code == 400
    assert client.patch(f"/api/v1/users/{admin_id}", json={"is_admin": False}, headers=multi).status_code == 400
    assert client.post("/api/v1/users", json={"username": "admin", "password": "another-pass"}, headers=multi).status_code == 400
    assert client.post("/api/v1/users", json={"username": "bad name!", "password": "another-pass"}, headers=multi).status_code == 400

    erin = _user(client, multi, "erin")
    erin_id = next(user["id"] for user in client.get("/api/v1/users", headers=multi).json() if user["username"] == "erin")
    client.post("/api/v1/projects", json={"name": "Erin"}, headers=erin)
    assert client.patch(f"/api/v1/users/{erin_id}", json={"disabled": True}, headers=multi).json()["disabled"] is True
    assert client.get("/api/v1/projects", headers=erin).status_code == 401
    assert client.post("/api/v1/auth/login", json={"username": "erin", "password": "user-password-1"}).status_code == 401
    assert client.delete(f"/api/v1/users/{erin_id}", headers=multi).status_code == 204
    assert "erin" not in {user["username"] for user in client.get("/api/v1/users", headers=multi).json()}


def test_mcp_token_selects_the_workspace(client: TestClient, multi: dict[str, str]) -> None:
    frank = _user(client, multi, "frank")
    client.post("/api/v1/projects", json={"name": "Frank MCP"}, headers=frank)
    token = client.get("/api/v1/settings", headers=frank).json()["mcp_token"]

    assert client.post("/mcp", json=INITIALIZE, headers=MCP_HEADERS).status_code == 401
    headers = {**MCP_HEADERS, "Authorization": f"Bearer {token}"}
    assert client.post("/mcp", json=INITIALIZE, headers=headers).status_code == 200
    response = client.post("/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "list_items", "arguments": {"entity_type": "project"}}}, headers=headers)
    text = response.text
    assert "Frank MCP" in text
    assert "Alice geheim" not in text


def test_telegram_second_factor(client: TestClient, multi: dict[str, str], sent) -> None:  # noqa: F811
    grace = _user(client, multi, "grace", "grace-password")
    assert client.patch("/api/v1/telegram", json={"login_2fa": True}, headers=grace).status_code == 400

    client.patch("/api/v1/telegram", json={"bot_token": "123:abc", "enabled": True, "commands_enabled": True}, headers=grace)
    workspace = accounts.find_user("grace").workspace
    with use_workspace(workspace), SessionLocal() as db:
        row = notifications.get_telegram_settings(db)
        notifications.handle_update(db, row, {"update_id": 1, "message": {"chat": {"id": 77, "first_name": "Grace"}, "text": f"/start {row.link_code}"}})
    assert client.patch("/api/v1/telegram", json={"login_2fa": True}, headers=grace).json()["login_2fa"] is True
    sent.clear()

    step = client.post("/api/v1/auth/login", json={"username": "grace", "password": "grace-password"}).json()
    assert step["token"] is None and step["second_factor"] == "telegram" and step["pending_token"]
    assert sent and sent[-1][0] == "77"
    code = re.search(r"<code>(\d{6})</code>", sent[-1][1]).group(1)
    # The code is not written to the message log.
    assert all(code not in entry["text"] for entry in client.get("/api/v1/telegram/messages", headers=grace).json())

    wrong = "000000" if code != "000000" else "111111"
    assert client.post("/api/v1/auth/verify", json={"pending_token": step["pending_token"], "code": wrong}).json() == {"valid": False, "remaining": 4}
    result = client.post("/api/v1/auth/verify", json={"pending_token": step["pending_token"], "code": code}).json()
    assert result["valid"] is True and result["token"]
    assert client.get("/api/v1/account", headers={"Authorization": f"Bearer {result['token']}"}).json()["username"] == "grace"
    # Pending sign-ins can be used once.
    assert client.post("/api/v1/auth/verify", json={"pending_token": step["pending_token"], "code": code}).json()["valid"] is False

    # Attempts are limited.
    step = client.post("/api/v1/auth/login", json={"username": "grace", "password": "grace-password"}).json()
    code = re.search(r"<code>(\d{6})</code>", sent[-1][1]).group(1)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        client.post("/api/v1/auth/verify", json={"pending_token": step["pending_token"], "code": wrong})
    assert client.post("/api/v1/auth/verify", json={"pending_token": step["pending_token"], "code": code}).json()["valid"] is False

    # Unlinking the chat switches the second factor off, so nobody gets locked out.
    assert client.post("/api/v1/telegram/unlink", headers=grace).json()["login_2fa"] is False
    assert client.post("/api/v1/auth/login", json={"username": "grace", "password": "grace-password"}).json()["token"]
