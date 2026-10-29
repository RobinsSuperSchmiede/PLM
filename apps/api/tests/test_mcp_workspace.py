import json
from typing import Any

from fastapi.testclient import TestClient

from tests.test_settings_mcp import INITIALIZE, MCP_HEADERS


def _call(client: TestClient, headers: dict[str, str], name: str, **arguments: Any) -> Any:
    response = client.post("/mcp", json={"jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": {"name": name, "arguments": arguments}}, headers=headers).json()
    result = response["result"]
    assert result.get("isError") is not True, (name, result)
    if "structuredContent" in result and result["structuredContent"] is not None:
        content = result["structuredContent"]
        return content.get("result", content) if isinstance(content, dict) and set(content) == {"result"} else content
    return json.loads(result["content"][0]["text"])


def test_mcp_builds_and_reads_connections(client: TestClient) -> None:
    token = client.patch("/api/v1/settings", json={"mcp_enabled": True}).json()["mcp_token"]
    headers = {**MCP_HEADERS, "Authorization": f"Bearer {token}"}
    assert client.post("/mcp", json=INITIALIZE, headers=headers).status_code == 200

    project = _call(client, headers, "create_item", entity_type="project", fields={"name": "MCP Projekt"}, tags=["ki"])
    folder = _call(client, headers, "create_item", entity_type="folder", fields={"name": "MCP Ordner"})
    note = _call(client, headers, "create_item", entity_type="note", fields={"title": "MCP Notiz", "content": "# Hallo", "folder_id": folder["id"]}, tags=["ki", "mcp"])
    task = _call(client, headers, "create_item", entity_type="task", fields={"title": "MCP Aufgabe", "priority": "high"})
    assert note["tags"] == ["ki", "mcp"]

    _call(client, headers, "link_items", source_type="note", source_id=note["id"], target_type="task", target_id=task["id"])
    _call(client, headers, "assign_to_project", entity_type="task", entity_id=task["id"], project_id=project["id"])
    _call(client, headers, "update_item", entity_type="note", entity_id=note["id"], fields={"project_id": project["id"]})

    relations = _call(client, headers, "get_relations", entity_type="task", entity_id=task["id"])
    assert relations["incoming"][0]["id"] == note["id"] and relations["project"]["id"] == project["id"]
    item = _call(client, headers, "get_item", entity_type="note", entity_id=note["id"])
    assert item["links"]["outgoing"][0]["id"] == task["id"] and item["project"]["title"] == "MCP Projekt"

    overview = _call(client, headers, "get_project_overview", project_id=project["id"])
    assert [entry["id"] for entry in overview["tasks"]] == [task["id"]] and [entry["id"] for entry in overview["notes"]] == [note["id"]]
    assert {entry["id"] for entry in _call(client, headers, "find_by_tag", tag="#KI")} >= {project["id"], note["id"]}
    assert [entry["id"] for entry in _call(client, headers, "list_items", entity_type="note", folder_id=folder["id"])] == [note["id"]]
    assert any(hit["id"] == note["id"] for hit in _call(client, headers, "search_workspace", query="mcp notiz"))
    assert any(entry["id"] == folder["id"] and entry["notes"] == 1 for entry in _call(client, headers, "list_folders"))

    _call(client, headers, "move_note", note_id=note["id"], folder_id=None)
    assert _call(client, headers, "remove_tags", entity_type="note", entity_id=note["id"], tags=["mcp"]) == ["ki"]
    _call(client, headers, "unlink_items", source_type="task", source_id=task["id"], target_type="note", target_id=note["id"])
    assert _call(client, headers, "get_relations", entity_type="note", entity_id=note["id"])["outgoing"] == []

    _call(client, headers, "archive_item", entity_type="note", entity_id=note["id"])
    assert any(entry["id"] == note["id"] for entry in _call(client, headers, "list_archive", query="MCP Notiz"))
    _call(client, headers, "restore_item", entity_type="note", entity_id=note["id"])
    _call(client, headers, "delete_item", entity_type="task", entity_id=task["id"])
    assert client.get(f"/api/v1/tasks/{task['id']}").status_code == 404

    # Changes made through MCP are attributed to it in the activity log.
    assert client.get("/api/v1/activity", params={"entity_id": note["id"]}).json()[-1]["source"] == "mcp"


def test_mcp_rejects_unknown_types_and_bad_fields(client: TestClient) -> None:
    token = client.patch("/api/v1/settings", json={"mcp_enabled": True}).json()["mcp_token"]
    headers = {**MCP_HEADERS, "Authorization": f"Bearer {token}"}
    for name, arguments in [
        ("create_item", {"entity_type": "spaceship", "fields": {}}),
        ("create_item", {"entity_type": "task", "fields": {"title": ""}}),
        ("assign_to_project", {"entity_type": "folder", "entity_id": "00000000-0000-0000-0000-000000000000", "project_id": None}),
    ]:
        result = client.post("/mcp", json={"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": name, "arguments": arguments}}, headers=headers).json()["result"]
        assert result.get("isError") is True, (name, result)
