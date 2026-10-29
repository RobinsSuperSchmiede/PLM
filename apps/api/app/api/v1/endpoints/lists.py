import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import ListItem, WorkspaceList
from app.schemas.workspace_list import ListCreate, ListItemCreate, ListItemUpdate, ListRead, ListUpdate
from app.services import crud

router = APIRouter(prefix="/lists")


def _load_list(db: Session, list_id: uuid.UUID) -> WorkspaceList:
    entity = crud.get_entity(db, WorkspaceList, list_id)
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    return entity


def _load_item(db: Session, list_id: uuid.UUID, item_id: uuid.UUID) -> ListItem:
    item = crud.get_entity(db, ListItem, item_id)
    if item is None or item.list_id != list_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List item not found")
    return item


def add_item(db: Session, workspace_list: WorkspaceList, payload: ListItemCreate) -> ListItem:
    position = max((item.position for item in workspace_list.items), default=-1) + 1
    return crud.create_entity(db, ListItem, payload, list_id=workspace_list.id, position=position)


@router.get("", response_model=list[ListRead])
def list_lists(db: Session = Depends(get_db)) -> list[WorkspaceList]:
    return crud.list_entities(db, WorkspaceList, WorkspaceList.created_at.desc())


@router.post("", response_model=ListRead, status_code=status.HTTP_201_CREATED)
def create_list(payload: ListCreate, db: Session = Depends(get_db)) -> WorkspaceList:
    return crud.create_entity(db, WorkspaceList, payload)


@router.patch("/{list_id}", response_model=ListRead)
def update_list(list_id: uuid.UUID, payload: ListUpdate, db: Session = Depends(get_db)) -> WorkspaceList:
    return crud.update_entity(db, _load_list(db, list_id), payload)


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_list(list_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    crud.delete_entity(db, _load_list(db, list_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{list_id}/items", response_model=ListRead, status_code=status.HTTP_201_CREATED)
def create_item(list_id: uuid.UUID, payload: ListItemCreate, db: Session = Depends(get_db)) -> WorkspaceList:
    workspace_list = _load_list(db, list_id)
    add_item(db, workspace_list, payload)
    db.refresh(workspace_list)
    return workspace_list


@router.patch("/{list_id}/items/{item_id}", response_model=ListRead)
def update_item(list_id: uuid.UUID, item_id: uuid.UUID, payload: ListItemUpdate, db: Session = Depends(get_db)) -> WorkspaceList:
    crud.update_entity(db, _load_item(db, list_id, item_id), payload)
    workspace_list = _load_list(db, list_id)
    db.refresh(workspace_list)
    return workspace_list


@router.delete("/{list_id}/items/{item_id}", response_model=ListRead)
def delete_item(list_id: uuid.UUID, item_id: uuid.UUID, db: Session = Depends(get_db)) -> WorkspaceList:
    crud.delete_entity(db, _load_item(db, list_id, item_id))
    workspace_list = _load_list(db, list_id)
    db.refresh(workspace_list)
    return workspace_list
