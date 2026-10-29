import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import ColumnElement
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.base import Base
from app.services import crud


def build_crud_router(
    *,
    path: str,
    model: type[Base],
    create_schema: type[BaseModel],
    update_schema: type[BaseModel],
    read_schema: type[BaseModel],
    order_by: tuple[ColumnElement[Any], ...] = (),
    label: str,
) -> APIRouter:
    """Create list/create/get/update/delete endpoints for a simple workspace entity."""

    router = APIRouter(prefix=path)

    def load(db: Session, entity_id: uuid.UUID) -> Base:
        entity = crud.get_entity(db, model, entity_id)
        if entity is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{label} not found")
        return entity

    @router.get("", response_model=list[read_schema], name=f"list_{label.lower()}s")
    def list_items(db: Session = Depends(get_db)) -> list[Base]:
        # Archived entries only show up in the archive (GET /archive).
        where = [model.archived_at.is_(None)] if hasattr(model, "archived_at") else None
        return crud.list_entities(db, model, *order_by, where=where)

    @router.post("", response_model=read_schema, status_code=status.HTTP_201_CREATED, name=f"create_{label.lower()}")
    def create_item(payload: create_schema, db: Session = Depends(get_db)) -> Base:  # type: ignore[valid-type]
        return crud.create_entity(db, model, payload)

    @router.get("/{entity_id}", response_model=read_schema, name=f"get_{label.lower()}")
    def get_item(entity_id: uuid.UUID, db: Session = Depends(get_db)) -> Base:
        return load(db, entity_id)

    @router.patch("/{entity_id}", response_model=read_schema, name=f"update_{label.lower()}")
    def update_item(entity_id: uuid.UUID, payload: update_schema, db: Session = Depends(get_db)) -> Base:  # type: ignore[valid-type]
        return crud.update_entity(db, load(db, entity_id), payload)

    @router.delete("/{entity_id}", status_code=status.HTTP_204_NO_CONTENT, name=f"delete_{label.lower()}")
    def delete_item(entity_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
        crud.delete_entity(db, load(db, entity_id))
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
