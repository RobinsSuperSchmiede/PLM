from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text

from app.db import session as db_session
from app.models.base import Base

from tests.test_notifications import command, linked, sent  # noqa: F401 - fixtures


def test_folders_tags_links_and_archive(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Kunde A"}).json()
    parent = client.post("/api/v1/folders", json={"name": "Arbeit"}).json()
    child = client.post("/api/v1/folders", json={"name": "Meetings", "parent_id": parent["id"]}).json()
    note = client.post("/api/v1/notes", json={"title": "Kickoff", "folder_id": child["id"], "project_id": project["id"]}).json()
    task = client.post("/api/v1/tasks", json={"title": "Angebot schreiben", "project_id": project["id"]}).json()
    assert note["folder_id"] == child["id"] and note["project_id"] == project["id"] and note["source"] == "app"

    tagged = client.put(f"/api/v1/tags/entity/note/{note['id']}", json={"tags": ["#Kunde", "kunde", " Planung "]}).json()
    # Only this note's tags; other tests share the database and may have created more.
    assigned = {entry["tag_id"] for entry in tagged["assignments"]}
    assert sorted(tag["name"] for tag in tagged["tags"] if tag["id"] in assigned) == ["kunde", "planung"]
    assert len(tagged["assignments"]) == 2
    assert client.put("/api/v1/tags/entity/note/00000000-0000-0000-0000-000000000000", json={"tags": ["x"]}).status_code == 404

    link = client.post("/api/v1/links", json={"source_type": "note", "source_id": note["id"], "target_type": "task", "target_id": task["id"]})
    assert link.status_code == 201
    # The reverse direction is the same link.
    again = client.post("/api/v1/links", json={"source_type": "task", "source_id": task["id"], "target_type": "note", "target_id": note["id"]}).json()
    assert again["id"] == link.json()["id"]
    assert client.post("/api/v1/links", json={"source_type": "note", "source_id": note["id"], "target_type": "note", "target_id": note["id"]}).status_code == 400

    # Archiving a folder takes its subfolders and notes along, and restoring brings them back.
    archived = client.post(f"/api/v1/archive/folder/{parent['id']}").json()
    assert archived["title"] == "Arbeit"
    assert all(item["id"] != note["id"] for item in client.get("/api/v1/notes").json())
    archive = {item["id"] for item in client.get("/api/v1/archive").json()}
    assert {parent["id"], child["id"], note["id"]} <= archive
    assert [item["id"] for item in client.get("/api/v1/archive", params={"q": "kickoff"}).json()] == [note["id"]]
    assert client.post(f"/api/v1/archive/folder/{parent['id']}/restore").status_code == 204
    assert any(item["id"] == note["id"] for item in client.get("/api/v1/notes").json())

    # Deleting a folder moves its notes up; deleting a project detaches its entries; deleting removes tags/links.
    client.delete(f"/api/v1/folders/{child['id']}")
    assert client.get(f"/api/v1/notes/{note['id']}").json()["folder_id"] == parent["id"]
    client.delete(f"/api/v1/projects/{project['id']}")
    assert client.get(f"/api/v1/tasks/{task['id']}").json()["project_id"] is None
    client.delete(f"/api/v1/archive/note/{note['id']}")
    assert all(item["entity_id"] != note["id"] for item in client.get("/api/v1/tags/assignments").json())
    assert all(item["source_id"] != note["id"] for item in client.get("/api/v1/links").json())

    actions = [(entry["action"], entry["entity_type"]) for entry in client.get("/api/v1/activity", params={"entity_id": note["id"]}).json()]
    assert ("create", "note") in actions and ("archive", "note") in actions and ("restore", "note") in actions and ("delete", "note") in actions


def test_note_autosave_is_one_activity_entry(client: TestClient) -> None:
    note = client.post("/api/v1/notes", json={"title": ""}).json()
    for index in range(5):
        client.patch(f"/api/v1/notes/{note['id']}", json={"content": "x" * index})
    actions = [entry["action"] for entry in client.get("/api/v1/activity", params={"entity_id": note["id"]}).json()]
    assert actions == ["update", "create"]


def test_stats_and_database_explorer(client: TestClient) -> None:
    client.post("/api/v1/notes", json={"title": "Statistik"})
    stats = client.get("/api/v1/stats").json()
    assert stats["counts"]["note"] >= 1
    assert sum(day.get("create", 0) for day in stats["activity"].values()) >= 1
    assert sum(sum(day.values()) for day in stats["api_calls"].values()) > 0

    schema = client.get("/api/v1/db/schema").json()
    tables = {table["name"]: table for table in schema["tables"]}
    assert {"notes", "tags", "entity_links", "activity_log", "folders"} <= set(tables)
    notes = {column["name"]: column for column in tables["notes"]["columns"]}
    assert notes["id"]["primary_key"] and notes["folder_id"]["foreign_key"]["references_table"] == "folders"

    rows = client.get("/api/v1/db/tables/notes/rows", params={"search": "statistik", "sort": "updated_at", "direction": "desc"}).json()
    assert rows["total"] >= 1 and rows["rows"][0]["title"] == "Statistik"
    assert client.get("/api/v1/db/tables/nope/rows").status_code == 404

    client.patch("/api/v1/settings", json={"smtp_password": "geheim"})
    settings_rows = client.get("/api/v1/db/tables/app_settings/rows").json()["rows"]
    assert all(row["smtp_password"] in (None, "••••••") for row in settings_rows)


def test_telegram_captures_notes_events_and_projects(client: TestClient, linked: None) -> None:  # noqa: F811
    assert "Projekt angelegt" in (command("/projekt Kunde B") or "")
    reply = command("Idee für den Workshop #ideen @KundeB\nMit Whiteboard")
    assert reply and "Notiz gespeichert" in reply and "Kunde B" in reply and "#ideen" in reply
    note = next(item for item in client.get("/api/v1/notes").json() if item["title"] == "Idee für den Workshop")
    assert note["content"] == "Mit Whiteboard" and note["source"] == "telegram" and note["project_id"]

    reply = command("/termin morgen 14:00 Physiotherapie #gesundheit")
    assert reply and "Termin angelegt" in reply
    event = next(item for item in client.get("/api/v1/events").json() if item["title"] == "Physiotherapie")
    assert event["time"] == "14:00"

    log = client.get("/api/v1/telegram/messages", params={"project_id": note["project_id"]}).json()
    assert {entry["direction"] for entry in log} == {"in", "out"}
    activity = client.get("/api/v1/activity", params={"entity_id": note["id"]}).json()
    assert activity[0]["source"] == "telegram"


def test_missing_columns_are_added(tmp_path) -> None:  # type: ignore[no-untyped-def]
    engine = create_engine(f"sqlite:///{tmp_path / 'old.sqlite3'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE notes (id CHAR(32) PRIMARY KEY, title VARCHAR(255) NOT NULL, content TEXT, created_at DATETIME, updated_at DATETIME)"))
    original = db_session.engine
    db_session.engine = engine
    try:
        db_session._add_missing_columns(Base.metadata)
    finally:
        db_session.engine = original
    columns = {column["name"] for column in inspect(engine).get_columns("notes")}
    assert {"folder_id", "project_id", "pinned", "source", "archived_at"} <= columns
