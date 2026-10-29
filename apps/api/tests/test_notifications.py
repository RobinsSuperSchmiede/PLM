from datetime import date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.models import Event, NotificationLog, Reminder, Task
from app.services import notifications, telegram

NOW = datetime(2026, 10, 28, 20, 0)


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    """Fake Telegram API: records outgoing messages instead of calling the network."""
    messages: list[tuple[str, str]] = []

    def fake_call(token: str, method: str, **params: Any) -> Any:
        if token == "bad":
            raise telegram.TelegramError("Unauthorized")
        if method == "getMe":
            return {"id": 1, "username": "anamnesies_test_bot"}
        if method == "sendMessage":
            messages.append((str(params["chat_id"]), params["text"]))
        return True

    monkeypatch.setattr(telegram, "call", fake_call)
    return messages


@pytest.fixture
def linked(client: TestClient, sent: list[tuple[str, str]]) -> None:
    client.patch("/api/v1/telegram", json={"bot_token": "123:abc", "enabled": True, "commands_enabled": True})
    with SessionLocal() as db:
        row = notifications.get_telegram_settings(db)
        notifications.handle_update(db, row, {"update_id": 1, "message": {"chat": {"id": 42, "first_name": "Robin"}, "text": f"/start {row.link_code}"}})
    sent.clear()


def command(text: str, chat_id: int = 42) -> str | None:
    with SessionLocal() as db:
        row = notifications.get_telegram_settings(db)
        reply = notifications.handle_update(db, row, {"update_id": 2, "message": {"chat": {"id": chat_id, "first_name": "Robin"}, "text": text}})
        return reply[1] if reply else None


def test_token_is_validated_and_hidden(client: TestClient, sent: list[tuple[str, str]]) -> None:
    assert client.patch("/api/v1/telegram", json={"bot_token": "bad"}).status_code == 400

    data = client.patch("/api/v1/telegram", json={"bot_token": "123:abc"}).json()
    assert data["token_set"] is True
    assert data["bot_username"] == "anamnesies_test_bot"
    assert data["link_url"] == f"https://t.me/anamnesies_test_bot?start={data['link_code']}"
    assert "bot_token" not in data
    assert data["linked"] is False

    assert client.patch("/api/v1/telegram", json={"timezone": "Mars/Base"}).status_code == 422


def test_linking_requires_the_code(client: TestClient, sent: list[tuple[str, str]]) -> None:
    client.patch("/api/v1/telegram", json={"bot_token": "123:abc"})
    assert command("/start wrong", chat_id=7) is not None  # explains the code is invalid
    assert command("/heute", chat_id=7) is None  # strangers are ignored
    assert client.get("/api/v1/telegram").json()["linked"] is False

    code = client.get("/api/v1/telegram").json()["link_code"]
    assert "✅" in (command(f"/start {code}", chat_id=42) or "")
    data = client.get("/api/v1/telegram").json()
    assert data["linked"] is True
    assert data["chat_name"]
    assert data["link_code"] != code  # rotated after use


def test_bot_commands_create_entries(client: TestClient, linked: None) -> None:
    assert "Steuer" in (command("/aufgabe Steuer machen") or "")
    assert any(task["title"] == "Steuer machen" for task in client.get("/api/v1/tasks").json())

    assert "Einkaufsliste" in (command("/notiz Einkaufsliste\nMilch, Brot") or "")
    assert any(note["title"] == "Einkaufsliste" and note["content"] == "Milch, Brot" for note in client.get("/api/v1/notes").json())

    assert command("/erinnerung in 30m Tee aufsetzen")
    assert any(reminder["text"] == "Tee aufsetzen" for reminder in client.get("/api/v1/reminders").json())
    assert "/erinnerung" in (command("/erinnerung irgendwann") or "")
    assert "Tee aufsetzen" in (command("/erinnerungen") or "")


def test_due_reminders_are_sent_once_and_repeat(client: TestClient, linked: None, sent: list[tuple[str, str]]) -> None:
    once = client.post("/api/v1/reminders", json={"text": "Müll <raus>", "remind_at": "2026-10-28T19:59"}).json()
    daily = client.post("/api/v1/reminders", json={"text": "Tabletten", "remind_at": "2026-10-27T08:00", "repeat": "daily"}).json()
    client.post("/api/v1/reminders", json={"text": "Später", "remind_at": "2026-10-28T21:00"})

    with SessionLocal() as db:
        send = lambda text: sent.append(("42", text))  # noqa: E731
        assert notifications.process_reminders(db, NOW, send) == 2
        assert notifications.process_reminders(db, NOW, send) == 0

    assert any("Müll &lt;raus&gt;" in text for _, text in sent)
    reminders = {item["id"]: item for item in client.get("/api/v1/reminders").json()}
    assert reminders[once["id"]]["done"] is True
    assert reminders[daily["id"]]["done"] is False
    assert reminders[daily["id"]]["remind_at"].startswith("2026-10-29T08:00")


def test_event_reminder_and_digest(client: TestClient, linked: None, sent: list[tuple[str, str]]) -> None:
    client.patch("/api/v1/telegram", json={"event_reminder_minutes": 15, "daily_digest": True, "digest_time": "19:00"})
    with SessionLocal() as db:
        db.add(Event(title="Zahnarzt", date=NOW.date(), time="20:10", location="Praxis"))
        db.add(Event(title="Später", date=NOW.date(), time="21:00"))
        db.add(Task(title="Überfällig", due_date=date(2026, 10, 1)))
        db.commit()
        row = notifications.get_telegram_settings(db)
        send = lambda text: sent.append(("42", text))  # noqa: E731

        assert notifications.process_event_reminders(db, row, NOW, send) == 1
        assert notifications.process_event_reminders(db, row, NOW, send) == 0
        assert notifications.process_digest(db, row, NOW, send) is True
        assert notifications.process_digest(db, row, NOW, send) is False
        # Late in the night the missed digest of a new day is not sent anymore.
        assert notifications.process_digest(db, row, NOW + timedelta(hours=4), send) is False
        db.query(NotificationLog).delete()
        db.query(Reminder).delete()
        db.commit()

    texts = [text for _, text in sent]
    assert any("Zahnarzt" in text and "20:10" in text for text in texts)
    digest = next(text for text in texts if "Überfällig" in text)
    assert "Zahnarzt" in digest and "Später" in digest


def test_send_endpoints(client: TestClient, linked: None, sent: list[tuple[str, str]]) -> None:
    assert client.post("/api/v1/telegram/test").status_code == 200
    assert client.post("/api/v1/telegram/message", json={"text": "Hallo"}).status_code == 200
    assert sent[-1] == ("42", "Hallo")

    client.post("/api/v1/telegram/unlink")
    assert client.post("/api/v1/telegram/test").status_code == 400


def test_reminder_mcp_tools_are_listed(client: TestClient) -> None:
    names = {tool["name"] for tool in client.get("/api/v1/mcp/tools").json()}
    assert {"create_reminder", "list_reminders", "send_telegram_message"} <= names
