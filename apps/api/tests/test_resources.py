from fastapi.testclient import TestClient


def test_task_crud(client: TestClient) -> None:
    created = client.post("/api/v1/tasks", json={"title": "Write tests", "priority": "high", "due_date": "2026-11-01"})
    assert created.status_code == 201
    task = created.json()
    assert task["status"] == "todo"

    updated = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "done", "due_date": None})
    assert updated.status_code == 200
    assert updated.json()["status"] == "done"
    assert updated.json()["due_date"] is None

    assert any(item["id"] == task["id"] for item in client.get("/api/v1/tasks").json())
    assert client.delete(f"/api/v1/tasks/{task['id']}").status_code == 204
    assert client.get(f"/api/v1/tasks/{task['id']}").status_code == 404


def test_validation_errors(client: TestClient) -> None:
    assert client.post("/api/v1/tasks", json={"title": ""}).status_code == 422
    assert client.post("/api/v1/events", json={"title": "x", "date": "2026-11-01", "time": "25:00"}).status_code == 422


def test_list_items(client: TestClient) -> None:
    workspace_list = client.post("/api/v1/lists", json={"title": "Groceries"}).json()
    after_add = client.post(f"/api/v1/lists/{workspace_list['id']}/items", json={"text": "Milk"}).json()
    client.post(f"/api/v1/lists/{workspace_list['id']}/items", json={"text": "Bread"})
    item = after_add["items"][0]

    toggled = client.patch(f"/api/v1/lists/{workspace_list['id']}/items/{item['id']}", json={"done": True}).json()
    assert [entry["text"] for entry in toggled["items"]] == ["Milk", "Bread"]
    assert toggled["items"][0]["done"] is True

    remaining = client.delete(f"/api/v1/lists/{workspace_list['id']}/items/{item['id']}").json()
    assert [entry["text"] for entry in remaining["items"]] == ["Bread"]
    assert client.delete(f"/api/v1/lists/{workspace_list['id']}").status_code == 204


def test_overview_counts(client: TestClient) -> None:
    client.post("/api/v1/ideas", json={"title": "Idea"})
    overview = client.get("/api/v1/overview").json()
    assert overview["database"] == "sqlite"
    assert overview["tables"]["ideas"] >= 1
