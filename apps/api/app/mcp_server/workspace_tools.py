"""Generic MCP tools: create, read, update, delete, organize and connect every kind of entry.

Together with the specific tools in server.py, an AI client can build the whole knowledge network:
notes in folders, tasks and events in projects, tags, links/backlinks, archive and attachments.
"""

import uuid
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy import or_, select

from app.mcp_server.server import contains, mcp, session
from app.models import EntityLink, EntityTag, Folder, Note, Project, StoredFile, Tag
from app.schemas.event import EventCreate, EventRead, EventUpdate
from app.schemas.idea import IdeaCreate, IdeaRead, IdeaUpdate
from app.schemas.knowledge import KnowledgeCreate, KnowledgeRead, KnowledgeUpdate
from app.schemas.meeting import MeetingCreate, MeetingRead, MeetingUpdate
from app.schemas.note import NoteCreate, NoteRead, NoteUpdate
from app.schemas.organization import FileRead, FileUpdate, FolderCreate, FolderRead, FolderUpdate
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services import crud
from app.services import organization as org
from app.services.registry import ENTITY_MODELS, PROJECT_SCOPED, preview_of, title_of

TYPES = "note|task|event|meeting|project|knowledge|idea|folder|file"

SCHEMAS: dict[str, tuple[type[BaseModel] | None, type[BaseModel], type[BaseModel]]] = {
    "note": (NoteCreate, NoteUpdate, NoteRead),
    "task": (TaskCreate, TaskUpdate, TaskRead),
    "event": (EventCreate, EventUpdate, EventRead),
    "meeting": (MeetingCreate, MeetingUpdate, MeetingRead),
    "project": (ProjectCreate, ProjectUpdate, ProjectRead),
    "knowledge": (KnowledgeCreate, KnowledgeUpdate, KnowledgeRead),
    "idea": (IdeaCreate, IdeaUpdate, IdeaRead),
    "folder": (FolderCreate, FolderUpdate, FolderRead),
    "file": (None, FileUpdate, FileRead),
}

SEARCH_FIELDS = {
    "note": ("title", "content"), "task": ("title", "description"), "event": ("title", "description", "location"),
    "meeting": ("title", "agenda", "notes", "attendees"), "project": ("name", "description"), "knowledge": ("title", "content", "category"),
    "idea": ("title", "description"), "folder": ("name",), "file": ("name", "description"),
}


def _schemas(entity_type: str) -> tuple[type[BaseModel] | None, type[BaseModel], type[BaseModel]]:
    if entity_type not in SCHEMAS:
        raise ValueError(f"Unknown entity_type '{entity_type}'. Use one of: {TYPES}")
    return SCHEMAS[entity_type]


def _load(db: Any, entity_type: str, entity_id: str) -> Any:
    _schemas(entity_type)
    try:
        return org.load(db, entity_type, entity_id)
    except org.UnknownEntityError as exc:
        raise ValueError(str(exc)) from exc


def _dump(entity_type: str, entity: Any) -> dict[str, Any]:
    return _schemas(entity_type)[2].model_validate(entity).model_dump(mode="json")


def _ref(entity_type: str, entity: Any) -> dict[str, Any]:
    return {"type": entity_type, "id": str(entity.id), "title": title_of(entity)}


def _validate(schema: type[BaseModel], fields: dict[str, Any]) -> BaseModel:
    try:
        return schema.model_validate(fields)
    except ValidationError as exc:
        raise ValueError(f"Invalid fields: {exc.errors(include_url=False)}") from exc


def _tags_of(db: Any, entity_type: str, entity_id: uuid.UUID) -> list[str]:
    return list(db.scalars(select(Tag.name).join(EntityTag, EntityTag.tag_id == Tag.id)
                           .where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id).order_by(Tag.name)))


def _relations(db: Any, entity_type: str, entity_id: uuid.UUID) -> dict[str, list[dict[str, Any]]]:
    outgoing, incoming = [], []
    links = db.scalars(select(EntityLink).where(or_(
        (EntityLink.source_type == entity_type) & (EntityLink.source_id == entity_id),
        (EntityLink.target_type == entity_type) & (EntityLink.target_id == entity_id),
    )))
    for link in links:
        is_source = link.source_type == entity_type and link.source_id == entity_id
        other_type, other_id = (link.target_type, link.target_id) if is_source else (link.source_type, link.source_id)
        other = db.get(ENTITY_MODELS[other_type], other_id) if other_type in ENTITY_MODELS else None
        if other is None:
            continue
        (outgoing if is_source else incoming).append({**_ref(other_type, other), "link_id": str(link.id)})
    return {"outgoing": outgoing, "incoming": incoming}


# --- Generic CRUD -------------------------------------------------------------------------------


@mcp.tool(description=f"Create any entry. entity_type: {TYPES} (files are uploaded in the app). fields are the same as in the app, "
          "e.g. note {{title, content (Markdown), folder_id, project_id}}, task {{title, description, status, priority, due_date, project_id}}, "
          "event {{title, date, time, location, project_id}}, folder {{name, parent_id}}. Optional tags are added right away.")
def create_item(entity_type: str, fields: dict[str, Any], tags: list[str] | None = None) -> dict[str, Any]:
    create_schema = _schemas(entity_type)[0]
    if create_schema is None:
        raise ValueError("Files are uploaded in the app; use attach_file to connect them.")
    payload = _validate(create_schema, fields)
    with session() as db:
        entity = crud.create_entity(db, ENTITY_MODELS[entity_type], payload)
        if tags:
            org.add_entity_tags(db, entity_type, entity.id, tags)
        return {**_dump(entity_type, entity), "tags": _tags_of(db, entity_type, entity.id)}


@mcp.tool(description=f"Get one entry with its tags, links (outgoing and backlinks) and project. entity_type: {TYPES}")
def get_item(entity_type: str, entity_id: str) -> dict[str, Any]:
    with session() as db:
        entity = _load(db, entity_type, entity_id)
        project_id = getattr(entity, "project_id", None)
        project = db.get(Project, project_id) if project_id else None
        return {
            "type": entity_type,
            **_dump(entity_type, entity),
            "tags": _tags_of(db, entity_type, entity.id),
            "links": _relations(db, entity_type, entity.id),
            "project": _ref("project", project) if project else None,
        }


@mcp.tool(description=f"Update an entry; only the given fields change. entity_type: {TYPES}. "
          "Set a field to null to clear it (e.g. project_id or folder_id).")
def update_item(entity_type: str, entity_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    payload = _validate(_schemas(entity_type)[1], fields)
    with session() as db:
        return _dump(entity_type, crud.update_entity(db, _load(db, entity_type, entity_id), payload))


@mcp.tool(description=f"Permanently delete an entry (prefer archive_item to keep it restorable). entity_type: {TYPES}")
def delete_item(entity_type: str, entity_id: str) -> str:
    with session() as db:
        entity = _load(db, entity_type, entity_id)
        title = title_of(entity)
        crud.delete_entity(db, entity)
    return f"Deleted {entity_type} '{title}'"


@mcp.tool(description=f"List entries of one type, optionally filtered by project, tag, folder (notes) or a text query. entity_type: {TYPES}. "
          "Archived entries are excluded unless include_archived is true.")
def list_items(entity_type: str, project_id: str | None = None, tag: str | None = None, folder_id: str | None = None,
               query: str | None = None, include_archived: bool = False, limit: int = 100) -> list[dict[str, Any]]:
    _schemas(entity_type)
    model = ENTITY_MODELS[entity_type]
    statement = select(model)
    if not include_archived:
        statement = statement.where(model.archived_at.is_(None))  # type: ignore[attr-defined]
    if project_id:
        if model not in PROJECT_SCOPED:
            raise ValueError(f"{entity_type} entries cannot belong to a project")
        statement = statement.where(model.project_id == uuid.UUID(project_id))  # type: ignore[attr-defined]
    if folder_id:
        if model is not Note:
            raise ValueError("folder_id only applies to notes")
        statement = statement.where(Note.folder_id == uuid.UUID(folder_id))
    if query:
        statement = statement.where(contains(query, *(getattr(model, field) for field in SEARCH_FIELDS[entity_type])))
    if tag:
        statement = statement.join(EntityTag, (EntityTag.entity_id == model.id) & (EntityTag.entity_type == entity_type)) \
            .join(Tag, Tag.id == EntityTag.tag_id).where(Tag.name == tag.strip().lstrip("#").lower())  # type: ignore[attr-defined]
    with session() as db:
        entities = db.scalars(statement.order_by(model.updated_at.desc()).limit(max(1, min(limit, 500)))).all()  # type: ignore[attr-defined]
        return [_dump(entity_type, entity) for entity in entities]


@mcp.tool(description="Search the whole workspace (notes, tasks, events, meetings, projects, documents, ideas, folders, files) by text. "
          "Returns type, id, title and a short preview for each hit.")
def search_workspace(query: str, types: list[str] | None = None, limit: int = 30) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    with session() as db:
        for entity_type, model in ENTITY_MODELS.items():
            if types and entity_type not in types:
                continue
            statement = select(model).where(model.archived_at.is_(None), contains(query, *(getattr(model, field) for field in SEARCH_FIELDS[entity_type])))  # type: ignore[attr-defined]
            for entity in db.scalars(statement.order_by(model.updated_at.desc()).limit(limit)):  # type: ignore[attr-defined]
                hits.append({**_ref(entity_type, entity), "preview": preview_of(entity_type, entity), "updated_at": entity.updated_at.isoformat()})
    return sorted(hits, key=lambda hit: hit["updated_at"], reverse=True)[:limit]


# --- Connections --------------------------------------------------------------------------------


@mcp.tool(description=f"All connections of an entry: outgoing links, backlinks (incoming), tags, project, and for notes the folder. entity_type: {TYPES}")
def get_relations(entity_type: str, entity_id: str) -> dict[str, Any]:
    with session() as db:
        entity = _load(db, entity_type, entity_id)
        result: dict[str, Any] = {"item": _ref(entity_type, entity), "tags": _tags_of(db, entity_type, entity.id), **_relations(db, entity_type, entity.id)}
        project_id = getattr(entity, "project_id", None)
        if project_id and (project := db.get(Project, project_id)):
            result["project"] = _ref("project", project)
        if isinstance(entity, Note) and entity.folder_id and (folder := db.get(Folder, entity.folder_id)):
            result["folder"] = _ref("folder", folder)
        return result


@mcp.tool(description=f"Remove the link between two entries (in either direction). entity_type: {TYPES}")
def unlink_items(source_type: str, source_id: str, target_type: str, target_id: str) -> str:
    with session() as db:
        source = _load(db, source_type, source_id)
        target = _load(db, target_type, target_id)
        links = db.scalars(select(EntityLink).where(or_(
            (EntityLink.source_type == source_type) & (EntityLink.source_id == source.id) & (EntityLink.target_type == target_type) & (EntityLink.target_id == target.id),
            (EntityLink.source_type == target_type) & (EntityLink.source_id == target.id) & (EntityLink.target_type == source_type) & (EntityLink.target_id == source.id),
        ))).all()
        for link in links:
            db.delete(link)
        db.commit()
    return f"Removed {len(links)} link(s)"


@mcp.tool(description=f"Replace all tags of an entry (an empty list removes them). entity_type: {TYPES}")
def set_tags(entity_type: str, entity_id: str, tags: list[str]) -> list[str]:
    with session() as db:
        entity = _load(db, entity_type, entity_id)
        org.set_entity_tags(db, entity_type, entity.id, tags)
        return _tags_of(db, entity_type, entity.id)


@mcp.tool(description=f"Remove some tags from an entry. entity_type: {TYPES}")
def remove_tags(entity_type: str, entity_id: str, tags: list[str]) -> list[str]:
    drop = {tag.strip().lstrip("#").lower() for tag in tags}
    with session() as db:
        entity = _load(db, entity_type, entity_id)
        org.set_entity_tags(db, entity_type, entity.id, [tag for tag in _tags_of(db, entity_type, entity.id) if tag not in drop])
        return _tags_of(db, entity_type, entity.id)


@mcp.tool(description="List all entries that carry a tag, across all types.")
def find_by_tag(tag: str) -> list[dict[str, Any]]:
    name = tag.strip().lstrip("#").lower()
    with session() as db:
        result = []
        for assignment in db.scalars(select(EntityTag).join(Tag, Tag.id == EntityTag.tag_id).where(Tag.name == name)):
            model = ENTITY_MODELS.get(assignment.entity_type)
            entity = db.get(model, assignment.entity_id) if model else None
            if entity is not None and getattr(entity, "archived_at", None) is None:
                result.append(_ref(assignment.entity_type, entity))
        return result


@mcp.tool(description=f"Assign an entry to a project (project_id null removes it). entity_type: note|task|event|meeting|knowledge|idea|file")
def assign_to_project(entity_type: str, entity_id: str, project_id: str | None) -> dict[str, Any]:
    with session() as db:
        entity = _load(db, entity_type, entity_id)
        if type(entity) not in PROJECT_SCOPED:
            raise ValueError(f"{entity_type} entries cannot belong to a project")
        project = _load(db, "project", project_id) if project_id else None
        entity.project_id = project.id if project else None
        db.commit()
        return {"item": _ref(entity_type, entity), "project": _ref("project", project) if project else None}


@mcp.tool(description="Everything in a project: open and done tasks, notes, events, meetings, documents, ideas, files and recent links.")
def get_project_overview(project_id: str) -> dict[str, Any]:
    with session() as db:
        project = _load(db, "project", project_id)
        result: dict[str, Any] = {"project": _dump("project", project), "tags": _tags_of(db, "project", project.id)}
        for entity_type, model in ENTITY_MODELS.items():
            if model not in PROJECT_SCOPED:
                continue
            entries = db.scalars(select(model).where(model.project_id == project.id, model.archived_at.is_(None)).order_by(model.updated_at.desc())).all()  # type: ignore[attr-defined]
            result[f"{entity_type}s"] = [{**_ref(entity_type, entry), **({"status": entry.status} if hasattr(entry, "status") else {})} for entry in entries]
        tasks = result.get("tasks", [])
        result["progress"] = {"done": sum(1 for task in tasks if task.get("status") == "done"), "total": len(tasks)}
        result["links"] = _relations(db, "project", project.id)
        return result


# --- Folders, archive, files --------------------------------------------------------------------


@mcp.tool(description="The note folder tree with note counts. Use the ids as folder_id for notes or parent_id for subfolders.")
def list_folders() -> list[dict[str, Any]]:
    with session() as db:
        folders = db.scalars(select(Folder).where(Folder.archived_at.is_(None)).order_by(Folder.position, Folder.name)).all()
        counts: dict[uuid.UUID, int] = {}
        for note in db.scalars(select(Note).where(Note.archived_at.is_(None), Note.folder_id.is_not(None))):
            counts[note.folder_id] = counts.get(note.folder_id, 0) + 1  # type: ignore[index]

        def tree(parent: uuid.UUID | None) -> list[dict[str, Any]]:
            return [{"id": str(folder.id), "name": folder.name, "notes": counts.get(folder.id, 0), "children": tree(folder.id)}
                    for folder in folders if folder.parent_id == parent]

        return tree(None)


@mcp.tool(description="Move a note into a folder (folder_id null moves it to the top level).")
def move_note(note_id: str, folder_id: str | None) -> dict[str, Any]:
    with session() as db:
        note = _load(db, "note", note_id)
        folder = _load(db, "folder", folder_id) if folder_id else None
        note.folder_id = folder.id if folder else None
        db.commit()
        return {"note": _ref("note", note), "folder": _ref("folder", folder) if folder else None}


@mcp.tool(description=f"Restore an archived entry. entity_type: {TYPES}")
def restore_item(entity_type: str, entity_id: str) -> dict[str, Any]:
    with session() as db:
        entity = _load(db, entity_type, entity_id)
        org.restore(db, entity_type, entity.id)
        return _ref(entity_type, entity)


@mcp.tool(description="List archived entries, optionally filtered by text and entity_type.")
def list_archive(query: str = "", entity_type: str | None = None) -> list[dict[str, Any]]:
    with session() as db:
        return [item.model_dump(mode="json") for item in org.archived_items(db, query, entity_type)]


@mcp.tool(description="List uploaded files. kind: image|pdf|document|spreadsheet|presentation")
def list_files(kind: str | None = None) -> list[dict[str, Any]]:
    with session() as db:
        statement = select(StoredFile).where(StoredFile.archived_at.is_(None)).order_by(StoredFile.created_at.desc())
        if kind:
            statement = statement.where(StoredFile.kind == kind)
        return [{**_dump("file", stored), "url": f"/api/v1/files/{stored.id}/content"} for stored in db.scalars(statement)]


@mcp.tool(description=f"Attach an uploaded file to an entry (note, task, project, ...). entity_type: {TYPES}")
def attach_file(file_id: str, entity_type: str, entity_id: str) -> str:
    with session() as db:
        stored = _load(db, "file", file_id)
        entity = _load(db, entity_type, entity_id)
        org.create_link(db, entity_type, entity.id, "file", stored.id)
    return f"Attached '{stored.name}' to {entity_type} '{title_of(entity)}'"
