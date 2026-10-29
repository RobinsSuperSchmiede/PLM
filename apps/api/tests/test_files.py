import io

from fastapi.testclient import TestClient

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


def test_upload_attach_serve_and_delete(client: TestClient) -> None:
    note = client.post("/api/v1/notes", json={"title": "Mit Bild"}).json()
    response = client.post(
        "/api/v1/files",
        files={"file": ("foto.png", io.BytesIO(PNG), "image/png")},
        data={"attach_type": "note", "attach_id": note["id"]},
    )
    assert response.status_code == 201, response.text
    stored = response.json()
    assert stored["kind"] == "image" and stored["size"] == len(PNG) and stored["content_type"] == "image/png"
    assert any(link["target_id"] == stored["id"] and link["source_id"] == note["id"] for link in client.get("/api/v1/links").json())

    content = client.get(f"/api/v1/files/{stored['id']}/content")
    assert content.status_code == 200 and content.content == PNG
    assert content.headers["content-disposition"].startswith("inline")
    assert client.get(f"/api/v1/files/{stored['id']}/content", params={"download": True}).headers["content-disposition"].startswith("attachment")
    assert [item["id"] for item in client.get("/api/v1/files", params={"kind": "image"}).json()] == [stored["id"]]

    assert client.delete(f"/api/v1/files/{stored['id']}").status_code == 204
    assert client.get(f"/api/v1/files/{stored['id']}/content").status_code == 404


def test_rejects_unsupported_types(client: TestClient) -> None:
    for name in ("page.html", "logo.svg", "script.js", "noextension"):
        response = client.post("/api/v1/files", files={"file": (name, io.BytesIO(b"<script>alert(1)</script>"), "text/html")})
        assert response.status_code == 422, name
