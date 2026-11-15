"""Data warehouse: history of every entry, earlier versions, deleted entries and exports."""

import json
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.organization import EntityType
from app.services import warehouse

router = APIRouter(prefix="/warehouse", tags=["warehouse"])

Action = Literal["create", "update", "archive", "restore", "delete", "snapshot"]


def _filters(
    type: EntityType | None = None,  # noqa: A002
    action: Action | None = None,
    source: str | None = None,
    project_id: str | None = None,
    entity_id: str | None = None,
    start: date | None = Query(None, alias="from"),
    end: date | None = Query(None, alias="to"),
    q: str = "",
) -> dict[str, Any]:
    return {"entity_type": type, "action": action, "source": source, "project_id": project_id, "entity_id": entity_id, "start": start, "end": end, "query": q}


@router.get("/summary")
def summary(db: Session = Depends(get_db)) -> dict[str, Any]:
    return warehouse.summary(db)


@router.get("/events")
def list_events(
    filters: dict[str, Any] = Depends(_filters),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return warehouse.events(db, limit=limit, offset=offset, **filters)


@router.get("/deleted")
def list_deleted(q: str = "", type: EntityType | None = None, db: Session = Depends(get_db)) -> list[dict[str, Any]]:  # noqa: A002
    return warehouse.deleted(db, q, type)


@router.get("/entities/{entity_type}/{entity_id}")
def entity_history(entity_type: EntityType, entity_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    try:
        return warehouse.entity_history(db, entity_type, entity_id)
    except warehouse.WarehouseError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/entities/{entity_type}/{entity_id}/restore")
def restore(entity_type: EntityType, entity_id: str, event_id: int | None = None, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Bring back a deleted entry, or with event_id set an existing entry back to that version."""
    try:
        warehouse.restore(db, entity_type, entity_id, event_id)
    except warehouse.WarehouseError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return warehouse.entity_history(db, entity_type, entity_id)


@router.get("/export")
def export(
    filters: dict[str, Any] = Depends(_filters),
    format: Literal["json", "csv"] = "json",  # noqa: A002
    db: Session = Depends(get_db),
) -> Response:
    """Everything the warehouse holds (or the filtered part of it) as one file."""
    rows = warehouse.events(db, limit=1_000_000, full=True, baseline=True, **filters)["items"]
    name = f"anamnesies-warehouse-{date.today().isoformat()}.{format}"
    headers = {"Content-Disposition": f'attachment; filename="{name}"'}
    if format == "csv":
        return Response(warehouse.export_csv(rows), media_type="text/csv; charset=utf-8", headers=headers)
    return Response(json.dumps(rows, ensure_ascii=False), media_type="application/json", headers=headers)
