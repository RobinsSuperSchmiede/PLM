"""Workspace loading for the web app: everything in one request, and afterwards only what changed.

- GET /bootstrap returns all collections, settings, tags and links in a single response.
- GET /sync?since=<server_time> returns, per collection, the ids that currently exist (in list order)
  and only the entries modified since that time. The client keeps its cached copy of everything else
  and drops entries whose id is no longer listed (deleted or archived). Tags and links are only sent
  when they differ from the version the client reports (organization=<organization_version>).
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import EntityLink, EntityTag
from app.models.base import Base, utcnow
from app.schemas.organization import LinkRead, TagAssignment
from app.services import app_settings
from app.services import organization as org

# Entries changed shortly before the last sync are sent again, so a write that was still being
# committed while the previous response was built is not missed.
OVERLAP = timedelta(seconds=10)


@dataclass(frozen=True)
class SyncResource:
    name: str
    model: type[Base]
    read_schema: type[BaseModel]
    order_by: tuple[ColumnElement[Any], ...] = ()
    # False for collections whose entries change without their own updated_at moving
    # (lists: adding or removing an item); these are always sent completely.
    incremental: bool = True


def _visible(resource: SyncResource) -> list[ColumnElement[bool]]:
    model = resource.model
    return [model.archived_at.is_(None)] if hasattr(model, "archived_at") else []  # type: ignore[attr-defined]


def _dump(resource: SyncResource, entities: list[Any]) -> list[dict[str, Any]]:
    return [resource.read_schema.model_validate(entity).model_dump(mode="json") for entity in entities]


def _organization(db: Session, known_version: str | None = None) -> dict[str, Any]:
    """Settings, tags, tag assignments and links.

    Tags and links have no modification time, so they are compared as a whole: the response carries a
    fingerprint (`organization_version`), and when the client already has that version the three lists
    are left out (null) instead of being sent again.
    """
    organization: dict[str, Any] = {
        "tags": [tag.model_dump(mode="json") for tag in org.list_tags(db)],
        "tag_assignments": [TagAssignment.model_validate(row).model_dump(mode="json") for row in db.scalars(select(EntityTag))],
        "links": [LinkRead.model_validate(row).model_dump(mode="json") for row in db.scalars(select(EntityLink).order_by(EntityLink.created_at))],
    }
    version = hashlib.sha1(json.dumps(organization, sort_keys=True).encode()).hexdigest()
    if known_version == version:
        organization = dict.fromkeys(organization)
    return {
        "settings": app_settings.to_read(app_settings.get_app_settings(db)).model_dump(mode="json"),
        "organization_version": version,
        **organization,
    }


def build_sync_router(resources: list[SyncResource]) -> APIRouter:
    router = APIRouter(tags=["sync"])

    @router.get("/bootstrap")
    def bootstrap(db: Session = Depends(get_db)) -> dict[str, Any]:
        server_time = utcnow()
        data = {
            resource.name: _dump(resource, list(db.scalars(select(resource.model).where(*_visible(resource)).order_by(*resource.order_by))))
            for resource in resources
        }
        return {"server_time": server_time.isoformat(), "data": data, **_organization(db)}

    @router.get("/sync")
    def sync(since: datetime, organization: str | None = None, db: Session = Depends(get_db)) -> dict[str, Any]:
        server_time = utcnow()
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)
        threshold = since.astimezone(timezone.utc) - OVERLAP
        changes: dict[str, Any] = {}
        for resource in resources:
            model = resource.model
            visible = _visible(resource)
            ids = db.scalars(select(model.id).where(*visible).order_by(*resource.order_by)).all()  # type: ignore[attr-defined]
            modified = [model.updated_at > threshold] if resource.incremental else []  # type: ignore[attr-defined]
            changed = list(db.scalars(select(model).where(*visible, *modified)))
            changes[resource.name] = {"ids": [str(entity_id) for entity_id in ids], "changed": _dump(resource, changed)}
        return {"server_time": server_time.isoformat(), "changes": changes, **_organization(db, organization)}

    return router
