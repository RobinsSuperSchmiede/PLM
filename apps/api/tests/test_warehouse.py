from fastapi.testclient import TestClient


def test_everything_can_be_filed_in_a_folder(client: TestClient) -> None:
    folder = client.post("/api/v1/folders", json={"name": "Kunde B"}).json()
    task = client.post("/api/v1/tasks", json={"title": "Angebot", "folder_id": folder["id"]}).json()
    idea = client.post("/api/v1/ideas", json={"title": "Newsletter"}).json()
    project = client.post("/api/v1/projects", json={"name": "Relaunch", "folder_id": folder["id"]}).json()
    assert task["folder_id"] == folder["id"] and project["folder_id"] == folder["id"] and idea["folder_id"] is None
    assert client.patch(f"/api/v1/ideas/{idea['id']}", json={"folder_id": folder["id"]}).json()["folder_id"] == folder["id"]

    # Archiving the folder takes every kind of entry along; deleting it moves them up.
    client.post(f"/api/v1/archive/folder/{folder['id']}")
    assert all(item["id"] != task["id"] for item in client.get("/api/v1/tasks").json())
    client.post(f"/api/v1/archive/folder/{folder['id']}/restore")
    assert any(item["id"] == idea["id"] for item in client.get("/api/v1/ideas").json())
    client.delete(f"/api/v1/folders/{folder['id']}")
    assert client.get(f"/api/v1/tasks/{task['id']}").json()["folder_id"] is None


def test_warehouse_keeps_versions_and_restores_deleted_entries(client: TestClient) -> None:
    note = client.post("/api/v1/notes", json={"title": "Protokoll", "content": "erste Fassung"}).json()
    task = client.post("/api/v1/tasks", json={"title": "Rechnung pruefen"}).json()
    client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "done"})
    client.patch(f"/api/v1/notes/{note['id']}", json={"content": "zweite Fassung mit Einhornwort"})

    history = client.get(f"/api/v1/warehouse/entities/task/{task['id']}").json()
    assert history["state"] == "active" and [entry["action"] for entry in history["timeline"]] == ["update", "create"]
    assert history["timeline"][0]["changes"] == {"status": ["todo", "done"]}
    assert history["timeline"][1]["snapshot"]["status"] == "todo"

    # Going back to the first version of the task.
    first = history["timeline"][1]["id"]
    assert client.post(f"/api/v1/warehouse/entities/task/{task['id']}/restore", params={"event_id": first}).status_code == 200
    assert client.get(f"/api/v1/tasks/{task['id']}").json()["status"] == "todo"

    # A deleted note stays searchable by its content and comes back with the same id.
    client.delete(f"/api/v1/notes/{note['id']}")
    assert client.get(f"/api/v1/notes/{note['id']}").status_code == 404
    deleted = client.get("/api/v1/warehouse/deleted", params={"q": "einhornwort"}).json()
    assert [entry["entity_id"] for entry in deleted] == [note["id"]] and deleted[0]["restorable"]
    found = client.get("/api/v1/warehouse/events", params={"q": "einhornwort", "action": "delete"}).json()
    assert found["total"] == 1 and found["items"][0]["entity_id"] == note["id"]
    restored = client.post(f"/api/v1/warehouse/entities/note/{note['id']}/restore").json()
    assert restored["state"] == "active"
    assert client.get(f"/api/v1/notes/{note['id']}").json()["content"] == "zweite Fassung mit Einhornwort"
    assert client.post(f"/api/v1/warehouse/entities/note/{note['id']}/restore").status_code == 409

    summary = client.get("/api/v1/warehouse/summary").json()
    assert summary["events"] > 0 and summary["by_type"]["note"]["active"] >= 1 and summary["by_action"]["delete"] >= 1
    export = client.get("/api/v1/warehouse/export", params={"format": "csv", "type": "task"})
    assert export.status_code == 200 and export.text.startswith("id,at,action") and task["id"] in export.text
    assert client.get("/api/v1/warehouse/export", params={"type": "note", "entity_id": note["id"], "action": "create"}).json()[0]["snapshot"]["title"] == "Protokoll"
