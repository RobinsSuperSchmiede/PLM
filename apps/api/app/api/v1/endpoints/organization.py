import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import ActivityLog, EntityLink, EntityTag, Tag
from app.schemas.organization import (
    ActivityRead,
    ArchivedItem,
    EntityTagsRead,
    EntityTagsUpdate,
    EntityType,
    LinkCreate,
    LinkRead,
    TagAssignment,
    TagRead,
    TagUpdate,
)
from app.services import crud
from app.services import organization as service

router = APIRouter()


def not_found(exc: Exception) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# --- Tags ---------------------------------------------------------------------------------------


@router.get("/tags", response_model=list[TagRead], tags=["tags"])
def list_tags(db: Session = Depends(get_db)) -> list[TagRead]:
    return service.list_tags(db)


@router.get("/tags/assignments", response_model=list[TagAssignment], tags=["tags"])
def list_assignments(db: Session = Depends(get_db)) -> list[EntityTag]:
    return list(db.scalars(select(EntityTag)).all())


@router.patch("/tags/{tag_id}", response_model=TagRead, tags=["tags"])
def update_tag(tag_id: uuid.UUID, payload: TagUpdate, db: Session = Depends(get_db)) -> TagRead:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    try:
        crud.update_entity(db, tag, payload)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A tag with this name already exists") from exc
    return next(item for item in service.list_tags(db) if item.id == tag.id)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["tags"])
def delete_tag(tag_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    db.execute(delete(EntityTag).where(EntityTag.tag_id == tag_id))
    db.execute(delete(Tag).where(Tag.id == tag_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/tags/entity/{entity_type}/{entity_id}", response_model=EntityTagsRead, tags=["tags"])
def set_entity_tags(entity_type: EntityType, entity_id: uuid.UUID, payload: EntityTagsUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        service.set_entity_tags(db, entity_type, entity_id, payload.tags)
    except service.UnknownEntityError as exc:
        raise not_found(exc) from exc
    assignments = db.scalars(select(EntityTag).where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id)).all()
    return {"tags": service.list_tags(db), "assignments": list(assignments)}


# --- Links --------------------------------------------------------------------------------------


@router.get("/links", response_model=list[LinkRead], tags=["links"])
def list_links(db: Session = Depends(get_db)) -> list[EntityLink]:
    return list(db.scalars(select(EntityLink).order_by(EntityLink.created_at)).all())


@router.post("/links", response_model=LinkRead, status_code=status.HTTP_201_CREATED, tags=["links"])
def create_link(payload: LinkCreate, db: Session = Depends(get_db)) -> EntityLink:
    try:
        return service.create_link(db, payload.source_type, payload.source_id, payload.target_type, payload.target_id)
    except service.UnknownEntityError as exc:
        raise not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["links"])
def delete_link(link_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    db.execute(delete(EntityLink).where(EntityLink.id == link_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Archive ------------------------------------------------------------------------------------


@router.get("/archive", response_model=list[ArchivedItem], tags=["archive"])
def list_archive(q: str = "", type: EntityType | None = None, db: Session = Depends(get_db)) -> list[ArchivedItem]:  # noqa: A002
    return service.archived_items(db, q, type)


@router.post("/archive/{entity_type}/{entity_id}", response_model=ArchivedItem, tags=["archive"])
def archive_entity(entity_type: EntityType, entity_id: uuid.UUID, db: Session = Depends(get_db)) -> ArchivedItem:
    try:
        service.archive(db, entity_type, entity_id)
    except service.UnknownEntityError as exc:
        raise not_found(exc) from exc
    return next(item for item in service.archived_items(db, entity_type=entity_type) if item.id == entity_id)


@router.post("/archive/{entity_type}/{entity_id}/restore", status_code=status.HTTP_204_NO_CONTENT, tags=["archive"])
def restore_entity(entity_type: EntityType, entity_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    try:
        service.restore(db, entity_type, entity_id)
    except service.UnknownEntityError as exc:
        raise not_found(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/archive/{entity_type}/{entity_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["archive"])
def delete_permanently(entity_type: EntityType, entity_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    try:
        crud.delete_entity(db, service.load(db, entity_type, entity_id))
    except service.UnknownEntityError as exc:
        raise not_found(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Activity -----------------------------------------------------------------------------------


@router.get("/activity", response_model=list[ActivityRead], tags=["activity"])
def list_activity(
    project_id: str | None = None,
    entity_id: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[ActivityLog]:
    statement = select(ActivityLog).order_by(ActivityLog.at.desc(), ActivityLog.id.desc()).limit(limit)
    if project_id:
        statement = statement.where(ActivityLog.project_id == project_id)
    if entity_id:
        statement = statement.where(ActivityLog.entity_id == entity_id)
    return list(db.scalars(statement).all())
