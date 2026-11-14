import io
import time
from urllib.parse import quote

from fastapi.testclient import TestClient
from PIL import Image

from app.api.v1.endpoints import sync as sync_module


def test_bootstrap_returns_everything(client: TestClient) -> None:
    task = client.post("/api/v1/tasks", json={"title": "In bootstrap"}).json()
    body = client.get("/api/v1/bootstrap").json()
    assert set(body["data"]) == {"projects", "tasks", "events", "meetings", "notes", "lists", "ideas", "knowledge", "records", "reminders", "folders", "files"}
    assert any(item["id"] == task["id"] for item in body["data"]["tasks"])
    assert body["data"]["tasks"] == client.get("/api/v1/tasks").json()
    assert body["settings"] == client.get("/api/v1/settings").json()
    assert body["tags"] == client.get("/api/v1/tags").json()
    assert body["links"] == client.get("/api/v1/links").json()
    assert "server_time" in body and "tag_assignments" in body


def test_sync_sends_only_changes(client: TestClient, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(sync_module, "OVERLAP", sync_module.timedelta(0))
    old = client.post("/api/v1/notes", json={"title": "Old note"}).json()
    gone = client.post("/api/v1/notes", json={"title": "Will be archived"}).json()
    deleted = client.post("/api/v1/tasks", json={"title": "Will be deleted"}).json()
    time.sleep(0.05)
    since = client.get("/api/v1/bootstrap").json()["server_time"]
    time.sleep(0.05)

    fresh = client.post("/api/v1/notes", json={"title": "New note"}).json()
    client.post(f"/api/v1/archive/note/{gone['id']}")
    client.delete(f"/api/v1/tasks/{deleted['id']}")

    body = client.get(f"/api/v1/sync?since={quote(since)}").json()
    notes = body["changes"]["notes"]
    assert [item["id"] for item in notes["changed"]] == [fresh["id"]]
    assert old["id"] in notes["ids"] and fresh["id"] in notes["ids"] and gone["id"] not in notes["ids"]
    assert notes["ids"] == [item["id"] for item in client.get("/api/v1/notes").json()]
    assert deleted["id"] not in body["changes"]["tasks"]["ids"]
    assert body["changes"]["tasks"]["changed"] == []
    # Lists are always sent completely (item changes do not touch the list itself).
    assert body["changes"]["lists"]["changed"] == client.get("/api/v1/lists").json()
    assert body["settings"]["language"]

    # Tags and links are left out when the client already has the current version.
    assert body["tags"] == client.get("/api/v1/tags").json() and body["links"] == client.get("/api/v1/links").json()
    known = client.get(f"/api/v1/sync?since={quote(since)}&organization={body['organization_version']}").json()
    assert known["tags"] is None and known["tag_assignments"] is None and known["links"] is None
    client.put(f"/api/v1/tags/entity/note/{fresh['id']}", json={"tags": ["sync"]})
    changed = client.get(f"/api/v1/sync?since={quote(since)}&organization={body['organization_version']}").json()
    assert changed["organization_version"] != body["organization_version"]
    assert any(tag["name"] == "sync" for tag in changed["tags"]) and changed["tag_assignments"]

    assert client.get("/api/v1/sync").status_code == 422


def test_thumbnail(client: TestClient) -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (1200, 600), (200, 30, 30)).save(buffer, "PNG")
    stored = client.post("/api/v1/files", files={"file": ("big.png", io.BytesIO(buffer.getvalue()), "image/png")}).json()

    response = client.get(f"/api/v1/files/{stored['id']}/thumbnail", params={"size": 300})
    assert response.status_code == 200 and response.headers["content-type"] == "image/webp"
    assert "immutable" in response.headers["cache-control"]
    assert Image.open(io.BytesIO(response.content)).size == (320, 160)
    assert len(response.content) < len(buffer.getvalue())

    pdf = client.post("/api/v1/files", files={"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}).json()
    assert client.get(f"/api/v1/files/{pdf['id']}/thumbnail").status_code == 404

    assert client.delete(f"/api/v1/files/{stored['id']}").status_code == 204
    assert client.get(f"/api/v1/files/{stored['id']}/thumbnail").status_code == 404
