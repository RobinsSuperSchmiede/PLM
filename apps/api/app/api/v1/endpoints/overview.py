from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import database_label, get_db
from app.mcp_server.server import mcp
from app.models import Event, Idea, KnowledgeArticle, ListItem, Meeting, Note, Project, Record, Reminder, Task, WorkspaceList

router = APIRouter()

TABLES = {
    "projects": Project,
    "tasks": Task,
    "events": Event,
    "meetings": Meeting,
    "notes": Note,
    "lists": WorkspaceList,
    "list_items": ListItem,
    "ideas": Idea,
    "knowledge": KnowledgeArticle,
    "records": Record,
    "reminders": Reminder,
}


@router.get("/overview")
def overview(db: Session = Depends(get_db)) -> dict[str, object]:
    counts = {name: db.scalar(select(func.count()).select_from(model)) or 0 for name, model in TABLES.items()}
    return {"database": database_label(), "tables": counts}


@router.get("/mcp/tools")
async def mcp_tools() -> list[dict[str, str | None]]:
    return [{"name": tool.name, "description": tool.description} for tool in await mcp.list_tools()]
