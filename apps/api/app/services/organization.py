"""Tags, links, folders and the archive: the pieces that connect workspace entities to each other."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.models import EntityLink, EntityTag, Folder, Project, StoredFile, Tag
from app.models.base import Base, utcnow
from app.schemas.organization import ArchivedItem, TagRead, normalize_tag
from app.services.registry import ENTITY_MODELS, FOLDER_SCOPED, PROJECT_SCOPED, preview_of, title_of, type_of


class UnknownEntityError(LookupError):
    pass


def load(db: Session, entity_type: str, entity_id: uuid.UUID | str) -> Any:
    model = ENTITY_MODELS.get(entity_type)
    try:
        key = entity_id if isinstance(entity_id, uuid.UUID) else uuid.UUID(str(entity_id))
    except ValueError:
        key = None
    entity = db.get(model, key) if model and key else None
    if entity is None:
        raise UnknownEntityError(f"{entity_type} {entity_id} not found")
    return entity


def clear_references(db: Session, entity: Base) -> None:
    """Remove tags and links of an entity that is about to be deleted, and detach things that point to it."""
    entity_type = type_of(entity)
    if entity_type is None:
        return
    entity_id = entity.id  # type: ignore[attr-defined]
    db.execute(delete(EntityTag).where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id))
    db.execute(delete(EntityLink).where(or_(
        (EntityLink.source_type == entity_type) & (EntityLink.source_id == entity_id),
        (EntityLink.target_type == entity_type) & (EntityLink.target_id == entity_id),
    )))
    if isinstance(entity, Project):
        for model in PROJECT_SCOPED:
            db.execute(update(model).where(model.project_id == entity_id).values(project_id=None))  # type: ignore[attr-defined]
    if isinstance(entity, StoredFile):
        from app.services.files import remove_content

        remove_content(entity)
    if isinstance(entity, Folder):
        # Contents move up one level instead of being deleted with the folder.
        db.execute(update(Folder).where(Folder.parent_id == entity_id).values(parent_id=entity.parent_id))
        for model in FOLDER_SCOPED:
            db.execute(update(model).where(model.folder_id == entity_id).values(folder_id=entity.parent_id))  # type: ignore[attr-defined]


# --- Tags ---------------------------------------------------------------------------------------


def list_tags(db: Session) -> list[TagRead]:
    counts = dict(db.execute(select(EntityTag.tag_id, func.count()).group_by(EntityTag.tag_id)).all())
    tags = db.scalars(select(Tag).order_by(Tag.name)).all()
    return [TagRead(id=tag.id, name=tag.name, color=tag.color, count=counts.get(tag.id, 0)) for tag in tags]


def get_or_create_tag(db: Session, name: str) -> Tag:
    name = normalize_tag(name)
    tag = db.scalar(select(Tag).where(Tag.name == name))
    if tag is None:
        tag = Tag(name=name)
        db.add(tag)
        db.flush()
    return tag


def set_entity_tags(db: Session, entity_type: str, entity_id: uuid.UUID, names: list[str]) -> list[Tag]:
    load(db, entity_type, entity_id)
    tags = [get_or_create_tag(db, name) for name in names if normalize_tag(name)]
    db.execute(delete(EntityTag).where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id))
    for tag in tags:
        db.add(EntityTag(tag_id=tag.id, entity_type=entity_type, entity_id=entity_id))
    db.commit()
    return tags


def add_entity_tags(db: Session, entity_type: str, entity_id: uuid.UUID, names: list[str]) -> None:
    current = db.scalars(
        select(Tag.name).join(EntityTag, EntityTag.tag_id == Tag.id).where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id)
    ).all()
    set_entity_tags(db, entity_type, entity_id, [*current, *names])


# --- Links --------------------------------------------------------------------------------------


def create_link(db: Session, source_type: str, source_id: uuid.UUID, target_type: str, target_id: uuid.UUID) -> EntityLink:
    if source_type == target_type and source_id == target_id:
        raise ValueError("An entry cannot be linked to itself")
    load(db, source_type, source_id)
    load(db, target_type, target_id)
    existing = db.scalar(select(EntityLink).where(or_(
        (EntityLink.source_type == source_type) & (EntityLink.source_id == source_id) & (EntityLink.target_type == target_type) & (EntityLink.target_id == target_id),
        (EntityLink.source_type == target_type) & (EntityLink.source_id == target_id) & (EntityLink.target_type == source_type) & (EntityLink.target_id == source_id),
    )))
    if existing:
        return existing
    link = EntityLink(source_type=source_type, source_id=source_id, target_type=target_type, target_id=target_id)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


# --- Archive ------------------------------------------------------------------------------------


def _folder_tree(db: Session, folder: Folder) -> list[Folder]:
    folders, queue = [], [folder]
    while queue:
        current = queue.pop()
        folders.append(current)
        queue.extend(db.scalars(select(Folder).where(Folder.parent_id == current.id)).all())
    return folders


def archive(db: Session, entity_type: str, entity_id: uuid.UUID) -> Any:
    entity = load(db, entity_type, entity_id)
    now = utcnow()
    entity.archived_at = now
    if isinstance(entity, Folder):
        # Archive the folder with everything inside it, using the same timestamp so it can be restored together.
        for folder in _folder_tree(db, entity):
            if folder.archived_at is None:
                folder.archived_at = now
            for model in FOLDER_SCOPED:
                for entry in db.scalars(select(model).where(model.folder_id == folder.id, model.archived_at.is_(None))):  # type: ignore[attr-defined]
                    entry.archived_at = now
    db.commit()
    db.refresh(entity)
    return entity


def restore(db: Session, entity_type: str, entity_id: uuid.UUID) -> Any:
    entity = load(db, entity_type, entity_id)
    archived_at: datetime | None = entity.archived_at
    entity.archived_at = None
    if isinstance(entity, Folder) and archived_at is not None:
        for folder in _folder_tree(db, entity):
            if folder.archived_at == archived_at:
                folder.archived_at = None
            for model in FOLDER_SCOPED:
                for entry in db.scalars(select(model).where(model.folder_id == folder.id, model.archived_at == archived_at)):  # type: ignore[attr-defined]
                    entry.archived_at = None
    # Restoring into an archived (or missing) folder would hide the entry, so move it to the parent level.
    parent_attr = "parent_id" if isinstance(entity, Folder) else "folder_id" if isinstance(entity, FOLDER_SCOPED) else None
    if parent_attr and getattr(entity, parent_attr):
        parent = db.get(Folder, getattr(entity, parent_attr))
        if parent is None or parent.archived_at is not None:
            setattr(entity, parent_attr, None)
    db.commit()
    db.refresh(entity)
    return entity


def archived_items(db: Session, query: str = "", entity_type: str | None = None) -> list[ArchivedItem]:
    items: list[ArchivedItem] = []
    term = query.strip().lower()
    for name, model in ENTITY_MODELS.items():
        if entity_type and name != entity_type:
            continue
        for entity in db.scalars(select(model).where(model.archived_at.is_not(None))):  # type: ignore[attr-defined]
            title, preview = title_of(entity), preview_of(name, entity)
            if term and term not in f"{title} {preview or ''}".lower():
                continue
            items.append(ArchivedItem(
                type=name,  # type: ignore[arg-type]
                id=entity.id,
                title=title,
                preview=preview,
                archived_at=entity.archived_at,
                project_id=getattr(entity, "project_id", None),
            ))
    return sorted(items, key=lambda item: item.archived_at, reverse=True)
