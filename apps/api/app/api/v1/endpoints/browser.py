"""Endpoints of the browser extension (Anamnesies Web Notes).

The extension keeps its sticky notes and the websites it attaches to projects in the workspace database.
It signs in with the browser token from the settings (header ``X-Anamnesies-Token``), which only opens
the paths of this router (see AccessGuardMiddleware). The web app reaches websites through /websites.
"""

import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Project, StoredFile, WebNote, Website
from app.models.base import utcnow
from app.schemas.web import (
    BrowserStatus,
    PageNotesSave,
    WebNoteIn,
    WebNoteRead,
    WebNoteRestore,
    WebNoteUpdate,
    WebsiteCreate,
    WebsiteRead,
    WebsiteUpdate,
)
from app.services import crud, files

router = APIRouter(prefix="/browser", tags=["browser"])
websites_router = APIRouter(prefix="/websites", tags=["websites"])

SCREENSHOT_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


# --- Helpers ------------------------------------------------------------------------------------


def origin_of(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme == "file":
        return "file://"
    if not parts.scheme or not parts.netloc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid URL")
    return f"{parts.scheme}://{parts.netloc}".lower()


def page_key(url: str) -> str:
    """origin + path + query; the #hash is ignored, like in the extension."""
    parts = urlsplit(url.strip())
    if parts.scheme == "file":
        return f"file://{parts.path}"
    return f"{origin_of(url)}{parts.path or '/'}{'?' + parts.query if parts.query else ''}"


def site_key(origin: str) -> str:
    return f"{origin}/*"


def _project_or_none(db: Session, project_id: uuid.UUID | None) -> uuid.UUID | None:
    if project_id is None:
        return None
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project_id


def _notes_of(db: Session, url: str) -> list[WebNote]:
    key, origin = page_key(url), origin_of(url)
    statement = select(WebNote).where(or_(
        (WebNote.scope == "page") & (WebNote.url == key),
        (WebNote.scope == "site") & (WebNote.origin == origin),
    )).order_by(WebNote.created_at)
    return list(db.scalars(statement))


def _apply(note: WebNote, incoming: WebNoteIn) -> None:
    for field in ("text", "color", "x", "y", "w", "h", "minimized", "pinned", "project_id"):
        value = getattr(incoming, field)
        if getattr(note, field) != value:
            setattr(note, field, value)


def _load_note(db: Session, note_id: uuid.UUID) -> WebNote:
    note = db.get(WebNote, note_id)
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return note


def _load_website(db: Session, website_id: uuid.UUID) -> Website:
    website = db.get(Website, website_id)
    if website is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Website not found")
    return website


def _store_screenshot(db: Session, website: Website, upload: UploadFile) -> None:
    extension = SCREENSHOT_TYPES.get((upload.content_type or "").split(";")[0].strip().lower())
    if extension is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Screenshot must be PNG, JPEG or WebP")
    host = urlsplit(website.url).hostname or "website"
    name = f"Screenshot {host} {utcnow().strftime('%Y-%m-%d %H-%M')}{extension}"
    try:
        stored = files.save(db, name, upload.file, project_id=website.project_id, description=website.url)
    except files.UploadRejectedError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    old = db.get(StoredFile, website.screenshot_id) if website.screenshot_id else None
    website.screenshot_id = stored.id
    db.commit()
    if old is not None:
        crud.delete_entity(db, old)


def delete_website(db: Session, website: Website) -> None:
    screenshot = db.get(StoredFile, website.screenshot_id) if website.screenshot_id else None
    db.delete(website)
    db.commit()
    if screenshot is not None:
        crud.delete_entity(db, screenshot)


def _screenshot_response(db: Session, website: Website, size: int | None) -> FileResponse:
    stored = db.get(StoredFile, website.screenshot_id) if website.screenshot_id else None
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No screenshot")
    if size:
        path = files.thumbnail_path(stored, size)
        if path is not None:
            return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "private, max-age=2592000, immutable"})
    path = files.path_of(stored)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screenshot missing")
    return FileResponse(path, media_type=stored.content_type, headers={"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"})


# --- Extension: status and projects ----------------------------------------------------------------


@router.get("/status", response_model=BrowserStatus)
def browser_status(db: Session = Depends(get_db)) -> BrowserStatus:
    """Connection check of the extension; also returns the projects to attach websites to."""
    projects = db.scalars(select(Project).where(Project.archived_at.is_(None)).order_by(Project.pinned.desc(), Project.updated_at.desc()))
    return BrowserStatus.model_validate({"projects": list(projects)})


# --- Extension: sticky notes ---------------------------------------------------------------------


@router.get("/notes", response_model=list[WebNoteRead])
def page_notes(url: str = Query(..., max_length=8000), db: Session = Depends(get_db)) -> list[WebNote]:
    """Notes of one page plus the notes of its whole site."""
    return _notes_of(db, url)


@router.put("/notes", response_model=list[WebNoteRead])
def save_page_notes(payload: PageNotesSave, db: Session = Depends(get_db)) -> list[WebNote]:
    """Store the notes of a page as the tab shows them: new ones are added, missing ones deleted."""
    key, origin = page_key(payload.url), origin_of(payload.url)
    title = (payload.title or "").strip()[:255] or None
    existing = {note.id: note for note in _notes_of(db, payload.url)}
    wanted: set[uuid.UUID] = set()
    for scope, items in (("page", payload.page), ("site", payload.site)):
        url = key if scope == "page" else site_key(origin)
        for incoming in items:
            if incoming.id in wanted:
                continue
            wanted.add(incoming.id)
            incoming.project_id = _project_or_none(db, incoming.project_id) if incoming.project_id else None
            note = existing.get(incoming.id) or db.get(WebNote, incoming.id)
            if note is None:
                note = WebNote(id=incoming.id, url=url, origin=origin, scope=scope)
                db.add(note)
            elif note.url != url or note.scope != scope:
                note.url, note.origin, note.scope = url, origin, scope
            _apply(note, incoming)
            if scope == "page" and title and note.page_title != title:
                note.page_title = title
            if scope == "site" and note.page_title != origin:
                note.page_title = urlsplit(origin).hostname or origin
    deletable = set(existing) if payload.known is None else set(existing) & set(payload.known)
    for note_id in deletable - wanted:
        db.delete(existing[note_id])
    db.commit()
    return _notes_of(db, payload.url)


@router.get("/notes/all", response_model=list[WebNoteRead])
def all_notes(db: Session = Depends(get_db)) -> list[WebNote]:
    return list(db.scalars(select(WebNote).order_by(WebNote.updated_at.desc())))


@router.patch("/notes/{note_id}", response_model=WebNoteRead)
def update_note(note_id: uuid.UUID, payload: WebNoteUpdate, db: Session = Depends(get_db)) -> WebNote:
    note = _load_note(db, note_id)
    if payload.project_id is not None:
        _project_or_none(db, payload.project_id)
    return crud.update_entity(db, note, payload)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    db.delete(_load_note(db, note_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/notes/restore", response_model=list[WebNoteRead])
def restore_notes(payload: list[WebNoteRestore], db: Session = Depends(get_db)) -> list[WebNote]:
    """Put notes back (undo in the manager, JSON import). Ids that already exist are skipped."""
    restored: list[WebNote] = []
    for item in payload[:2000]:
        if db.get(WebNote, item.id) is not None:
            continue
        origin = origin_of(item.url.removesuffix("/*") if item.scope == "site" else item.url)
        note = WebNote(
            id=item.id,
            url=site_key(origin) if item.scope == "site" else page_key(item.url),
            origin=origin,
            scope=item.scope,
            page_title=(item.page_title or "").strip()[:255] or None,
        )
        item.project_id = _project_or_none(db, item.project_id) if item.project_id else None
        _apply(note, item)
        db.add(note)
        restored.append(note)
    db.commit()
    return restored


# --- Extension: websites ----------------------------------------------------------------------------


@router.get("/websites", response_model=list[WebsiteRead])
def browser_websites(url: str | None = Query(None, max_length=8000), db: Session = Depends(get_db)) -> list[Website]:
    """All websites, or with ``url`` those attached for this page (any project)."""
    statement = select(Website).where(Website.archived_at.is_(None)).order_by(Website.created_at.desc())
    if url:
        key = page_key(url)
        statement = statement.where(or_(Website.url == url.strip(), Website.url == key))
    return list(db.scalars(statement))


@router.post("/websites", response_model=WebsiteRead, status_code=status.HTTP_201_CREATED)
def attach_website(
    url: str = Form(..., max_length=8000),
    project_id: uuid.UUID = Form(...),
    title: str = Form("", max_length=500),
    description: str | None = Form(None, max_length=20_000),
    favicon_url: str | None = Form(None, max_length=8000),
    screenshot: UploadFile | None = File(None),
    db: Session = Depends(get_db),
) -> Website:
    """Attach the open page to a project, optionally with a screenshot of the visible area.

    The same URL in the same project is updated (new title, note and screenshot) instead of added twice.
    """
    payload = WebsiteCreate(url=url, title=title.strip()[:255], description=(description or "").strip() or None,
                            favicon_url=favicon_url if favicon_url and favicon_url.startswith(("http://", "https://", "data:image/")) else None,
                            project_id=_project_or_none(db, project_id))
    website = db.scalars(select(Website).where(Website.project_id == project_id, Website.url == payload.url, Website.archived_at.is_(None))).first()
    if website is None:
        website = crud.create_entity(db, Website, payload)
    else:
        website.title = payload.title or website.title
        website.description = payload.description or website.description
        website.favicon_url = payload.favicon_url or website.favicon_url
        db.commit()
    if screenshot is not None and screenshot.filename:
        _store_screenshot(db, website, screenshot)
        db.refresh(website)
    return website


@router.post("/websites/{website_id}/screenshot", response_model=WebsiteRead)
def browser_replace_screenshot(website_id: uuid.UUID, screenshot: UploadFile = File(...), db: Session = Depends(get_db)) -> Website:
    website = _load_website(db, website_id)
    _store_screenshot(db, website, screenshot)
    db.refresh(website)
    return website


@router.delete("/websites/{website_id}", status_code=status.HTTP_204_NO_CONTENT)
def browser_delete_website(website_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    delete_website(db, _load_website(db, website_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/websites/{website_id}/screenshot")
def browser_screenshot(website_id: uuid.UUID, size: int | None = Query(None, ge=16, le=4096), db: Session = Depends(get_db)) -> FileResponse:
    return _screenshot_response(db, _load_website(db, website_id), size)


# --- Web app: websites ---------------------------------------------------------------------------------


@websites_router.get("", response_model=list[WebsiteRead])
def list_websites(project_id: uuid.UUID | None = None, db: Session = Depends(get_db)) -> list[Website]:
    statement = select(Website).where(Website.archived_at.is_(None)).order_by(Website.created_at.desc())
    if project_id:
        statement = statement.where(Website.project_id == project_id)
    return list(db.scalars(statement))


@websites_router.post("", response_model=WebsiteRead, status_code=status.HTTP_201_CREATED)
def create_website(payload: WebsiteCreate, db: Session = Depends(get_db)) -> Website:
    _project_or_none(db, payload.project_id)
    return crud.create_entity(db, Website, payload)


@websites_router.get("/{website_id}", response_model=WebsiteRead)
def get_website(website_id: uuid.UUID, db: Session = Depends(get_db)) -> Website:
    return _load_website(db, website_id)


@websites_router.patch("/{website_id}", response_model=WebsiteRead)
def update_website(website_id: uuid.UUID, payload: WebsiteUpdate, db: Session = Depends(get_db)) -> Website:
    website = _load_website(db, website_id)
    if payload.project_id is not None:
        _project_or_none(db, payload.project_id)
    return crud.update_entity(db, website, payload)


@websites_router.delete("/{website_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_website(website_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    delete_website(db, _load_website(db, website_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@websites_router.post("/{website_id}/screenshot", response_model=WebsiteRead)
def replace_screenshot(website_id: uuid.UUID, screenshot: UploadFile = File(...), db: Session = Depends(get_db)) -> Website:
    website = _load_website(db, website_id)
    _store_screenshot(db, website, screenshot)
    db.refresh(website)
    return website


@websites_router.get("/{website_id}/screenshot")
def website_screenshot(website_id: uuid.UUID, size: int | None = Query(None, ge=16, le=4096), db: Session = Depends(get_db)) -> FileResponse:
    return _screenshot_response(db, _load_website(db, website_id), size)


@websites_router.get("/{website_id}/notes", response_model=list[WebNoteRead])
def website_notes(website_id: uuid.UUID, db: Session = Depends(get_db)) -> list[WebNote]:
    """Sticky notes the extension shows on this website's page."""
    return _notes_of(db, _load_website(db, website_id).url)

