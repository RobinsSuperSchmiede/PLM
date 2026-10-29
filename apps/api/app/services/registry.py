"""Entity types that can be tagged, linked, archived and shown in the knowledge graph."""

from typing import Any

from app.models import Event, Folder, Idea, KnowledgeArticle, Meeting, Note, Project, StoredFile, Task
from app.models.base import Base

ENTITY_MODELS: dict[str, type[Base]] = {
    "note": Note,
    "task": Task,
    "event": Event,
    "meeting": Meeting,
    "project": Project,
    "knowledge": KnowledgeArticle,
    "idea": Idea,
    "folder": Folder,
    "file": StoredFile,
}

TYPE_OF_MODEL: dict[type[Base], str] = {model: name for name, model in ENTITY_MODELS.items()}

# Models with a project_id column; a project acts as their workspace.
PROJECT_SCOPED: tuple[type[Base], ...] = (Note, Task, Event, Meeting, KnowledgeArticle, Idea, StoredFile)

_PREVIEW_FIELDS = {"note": "content", "task": "description", "event": "description", "meeting": "agenda", "project": "description", "knowledge": "content", "idea": "description", "file": "description"}


def type_of(entity: object) -> str | None:
    return TYPE_OF_MODEL.get(type(entity))  # type: ignore[arg-type]


def title_of(entity: Any) -> str:
    value = getattr(entity, "name", None) if isinstance(entity, (Project, Folder, StoredFile)) else getattr(entity, "title", None)
    return (value or "").strip()[:255]


def preview_of(entity_type: str, entity: Any) -> str | None:
    field = _PREVIEW_FIELDS.get(entity_type)
    value = getattr(entity, field, None) if field else None
    return value[:400] if value else None
