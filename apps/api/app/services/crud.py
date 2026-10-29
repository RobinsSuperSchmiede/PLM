import uuid
from typing import Any, TypeVar

from pydantic import BaseModel
from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import Session

from app.models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


def list_entities(db: Session, model: type[ModelT], *order_by: ColumnElement[Any], where: list[ColumnElement[bool]] | None = None) -> list[ModelT]:
    statement = select(model)
    if where:
        statement = statement.where(*where)
    if order_by:
        statement = statement.order_by(*order_by)
    return list(db.scalars(statement).all())


def get_entity(db: Session, model: type[ModelT], entity_id: uuid.UUID | str) -> ModelT | None:
    try:
        key = entity_id if isinstance(entity_id, uuid.UUID) else uuid.UUID(str(entity_id))
    except ValueError:
        return None
    return db.get(model, key)


def create_entity(db: Session, model: type[ModelT], payload: BaseModel, **extra: Any) -> ModelT:
    entity = model(**payload.model_dump(), **extra)
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


def update_entity(db: Session, entity: ModelT, payload: BaseModel) -> ModelT:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entity, field, value)
    db.commit()
    db.refresh(entity)
    return entity


def delete_entity(db: Session, entity: Base) -> None:
    from app.services.organization import clear_references

    clear_references(db, entity)
    db.delete(entity)
    db.commit()
