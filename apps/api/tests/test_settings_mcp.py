from fastapi.testclient import TestClient

MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
INITIALIZE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "pytest", "version": "1"}},
}


def test_settings_defaults_and_update(client: TestClient) -> None:
    settings = client.get("/api/v1/settings").json()
    assert settings["language"] == "de"
    assert settings["mcp_token"]
    assert "smtp_password" not in settings

    updated = client.patch(
        "/api/v1/settings",
        json={"language": "en", "theme": "light", "custom_domain": "https://PLM.Example.com/", "smtp_password": "secret"},
    ).json()
    assert updated["language"] == "en"
    assert updated["custom_domain"] == "plm.example.com"
    assert updated["mcp_url"] == "https://plm.example.com/mcp"
    assert updated["smtp_password_set"] is True

    # Omitting the password keeps it, an empty string clears it.
    assert client.patch("/api/v1/settings", json={"smtp_host": "smtp.example.com"}).json()["smtp_password_set"] is True
    assert client.patch("/api/v1/settings", json={"smtp_password": ""}).json()["smtp_password_set"] is False

    assert client.patch("/api/v1/settings", json={"custom_domain": "not a domain"}).status_code == 422
    assert client.patch("/api/v1/settings", json={"language": "fr"}).status_code == 422


def test_rest_api_rejects_foreign_hosts(client: TestClient) -> None:
    response = client.get("/api/v1/tasks", headers={"Host": "plm.example.com"})
    assert response.status_code == 403


def test_mcp_requires_token(client: TestClient) -> None:
    response = client.post("/mcp", json=INITIALIZE, headers=MCP_HEADERS)
    assert response.status_code == 401

    wrong = client.post("/mcp", json=INITIALIZE, headers={**MCP_HEADERS, "Authorization": "Bearer nope"})
    assert wrong.status_code == 401


def test_mcp_tools_via_custom_domain(client: TestClient) -> None:
    token = client.patch("/api/v1/settings", json={"custom_domain": "plm.example.com", "mcp_enabled": True}).json()["mcp_token"]
    headers = {**MCP_HEADERS, "Authorization": f"Bearer {token}"}

    assert client.post("/mcp", json=INITIALIZE, headers={**headers, "Host": "evil.example.net"}).status_code == 403

    initialized = client.post("/mcp", json=INITIALIZE, headers={**headers, "Host": "plm.example.com"})
    assert initialized.status_code == 200, initialized.text
    assert initialized.json()["result"]["serverInfo"]["name"] == "Anamnesies"

    tools = client.post("/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, headers=headers).json()
    names = {tool["name"] for tool in tools["result"]["tools"]}
    assert {"create_task", "list_events", "search_notes", "send_email"} <= names

    call = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "create_task", "arguments": {"title": "From MCP"}}},
        headers=headers,
    ).json()
    assert call["result"].get("isError") is not True, call
    assert any(task["title"] == "From MCP" for task in client.get("/api/v1/tasks").json())


def test_mcp_disabled(client: TestClient) -> None:
    token = client.patch("/api/v1/settings", json={"mcp_enabled": False}).json()["mcp_token"]
    response = client.post("/mcp", json=INITIALIZE, headers={**MCP_HEADERS, "Authorization": f"Bearer {token}"})
    assert response.status_code == 503
    client.patch("/api/v1/settings", json={"mcp_enabled": True})


def test_rotate_token(client: TestClient) -> None:
    before = client.get("/api/v1/settings").json()["mcp_token"]
    after = client.post("/api/v1/settings/mcp-token").json()["mcp_token"]
    assert before != after


def test_mcp_tools_listing(client: TestClient) -> None:
    tools = client.get("/api/v1/mcp/tools").json()
    assert any(tool["name"] == "get_workspace_overview" for tool in tools)


def test_mcp_via_web_proxy_uses_forwarded_host(client: TestClient) -> None:
    token = client.patch("/api/v1/settings", json={"custom_domain": "plm.example.com"}).json()["mcp_token"]
    headers = {**MCP_HEADERS, "Authorization": f"Bearer {token}"}
    assert client.post("/mcp", json=INITIALIZE, headers={**headers, "X-Forwarded-Host": "plm.example.com:443"}).status_code == 200
    assert client.post("/mcp", json=INITIALIZE, headers={**headers, "X-Forwarded-Host": "evil.example.net"}).status_code == 403
