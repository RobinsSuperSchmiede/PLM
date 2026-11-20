import io
import uuid

from fastapi.testclient import TestClient

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000" "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


def _note(**extra: object) -> dict[str, object]:
    return {"id": str(uuid.uuid4()), "text": "Hallo", "color": "yellow", "x": 10, "y": 20, "w": 240, "h": 200, **extra}


def test_page_and_site_notes_are_saved_and_replaced(client: TestClient) -> None:
    page, site = _note(text="Seite"), _note(text="Ganze Website", color="blue")
    url = "https://example.com/docs/intro?x=1#abschnitt"
    saved = client.put("/api/v1/browser/notes", json={"url": url, "title": "Intro", "page": [page], "site": [site]})
    assert saved.status_code == 200, saved.text
    by_id = {note["id"]: note for note in saved.json()}
    assert by_id[page["id"]]["url"] == "https://example.com/docs/intro?x=1" and by_id[page["id"]]["page_title"] == "Intro"
    assert by_id[site["id"]]["url"] == "https://example.com/*" and by_id[site["id"]]["scope"] == "site"

    # Site notes show up on other pages of the same origin, page notes do not.
    other = client.get("/api/v1/browser/notes", params={"url": "https://example.com/other"}).json()
    assert [note["id"] for note in other] == [site["id"]]

    # Saving the page without the page note deletes it; moving a note to the site scope keeps its id.
    moved = {**page, "text": "jetzt überall"}
    client.put("/api/v1/browser/notes", json={"url": url, "page": [], "site": [site, moved]})
    notes = client.get("/api/v1/browser/notes", params={"url": "https://example.com/somewhere"}).json()
    assert {note["id"] for note in notes} == {site["id"], page["id"]}
    assert all(note["scope"] == "site" for note in notes)

    # A tab that never saw a note does not delete it.
    other_tab = _note(text="anderer Tab")
    client.put("/api/v1/browser/notes", json={"url": url, "page": [other_tab], "site": [], "known": []})
    still = client.put("/api/v1/browser/notes", json={"url": url, "page": [], "site": [site, moved], "known": [site["id"], page["id"]]}).json()
    assert other_tab["id"] in {note["id"] for note in still}

    assert client.patch(f"/api/v1/browser/notes/{site['id']}", json={"color": "pink"}).json()["color"] == "pink"
    assert client.delete(f"/api/v1/browser/notes/{site['id']}").status_code == 204
    restored = client.post("/api/v1/browser/notes/restore", json=[{**site, "url": "https://example.com/*", "scope": "site"}]).json()
    assert [note["id"] for note in restored] == [site["id"]]


def test_attach_website_with_screenshot_to_project(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Recherche"}).json()
    status = client.get("/api/v1/browser/status").json()
    assert any(item["id"] == project["id"] for item in status["projects"])

    response = client.post(
        "/api/v1/browser/websites",
        data={"url": "https://example.org/artikel", "title": "Artikel", "project_id": project["id"]},
        files={"screenshot": ("shot.png", io.BytesIO(PNG), "image/png")},
    )
    assert response.status_code == 201, response.text
    website = response.json()
    assert website["project_id"] == project["id"] and website["screenshot_id"]

    # Attaching the same page to the same project again updates it.
    again = client.post("/api/v1/browser/websites", data={"url": "https://example.org/artikel", "title": "Neu", "project_id": project["id"]}).json()
    assert again["id"] == website["id"] and again["title"] == "Neu" and again["screenshot_id"] == website["screenshot_id"]

    shot = client.get(f"/api/v1/websites/{website['id']}/screenshot")
    assert shot.status_code == 200 and shot.content == PNG
    assert [item["id"] for item in client.get("/api/v1/websites", params={"project_id": project["id"]}).json()] == [website["id"]]
    assert client.get("/api/v1/browser/websites", params={"url": "https://example.org/artikel#top"}).json()[0]["id"] == website["id"]
    assert any(item["id"] == website["id"] for item in client.get("/api/v1/bootstrap").json()["data"]["websites"])

    assert client.delete(f"/api/v1/websites/{website['id']}").status_code == 204
    assert client.get(f"/api/v1/files/{website['screenshot_id']}").status_code == 404


def test_browser_token(client: TestClient) -> None:
    token = client.get("/api/v1/settings").json()["browser_token"]
    assert token
    assert client.get("/api/v1/browser/status", headers={"X-Anamnesies-Token": token}).status_code == 200
    assert client.get("/api/v1/browser/status", headers={"X-Anamnesies-Token": "wrong"}).status_code == 401
    rotated = client.post("/api/v1/settings/browser-token").json()["browser_token"]
    assert rotated and rotated != token


def test_project_cover_image_and_storage_stats(client: TestClient) -> None:
    project = client.post("/api/v1/projects", json={"name": "Mit Titelbild"}).json()
    image = client.post("/api/v1/files", files={"file": ("cover.png", io.BytesIO(PNG), "image/png")}, data={"project_id": project["id"]}).json()
    updated = client.patch(f"/api/v1/projects/{project['id']}", json={"cover_file_id": image["id"]}).json()
    assert updated["cover_file_id"] == image["id"]

    stats = client.get("/api/v1/stats").json()
    assert stats["storage"]["files"] >= len(PNG) and "files_archived" in stats["storage"]
    assert {"task_status", "meeting_status", "created", "web"} <= set(stats)

    # Deleting the image clears the cover.
    assert client.delete(f"/api/v1/files/{image['id']}").status_code == 204
    assert client.get(f"/api/v1/projects/{project['id']}").json()["cover_file_id"] is None
