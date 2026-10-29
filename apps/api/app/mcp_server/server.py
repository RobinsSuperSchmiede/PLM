"""MCP server exposing the Anamnesies workspace as tools for AI clients (Streamable HTTP at /mcp)."""

import smtplib
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from typing import Any, TypeVar

from mcp.server.mcpserver import MCPServer
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import Event, Idea, KnowledgeArticle, ListItem, Meeting, Note, Project, Reminder, Task, WorkspaceList
from app.models.base import Base
from app.schemas.event import EventCreate, EventRead
from app.schemas.idea import IdeaCreate, IdeaRead
from app.schemas.knowledge import KnowledgeCreate, KnowledgeRead
from app.schemas.meeting import MeetingCreate, MeetingRead
from app.schemas.note import NoteCreate, NoteRead, NoteUpdate
from app.schemas.notification import ReminderCreate, ReminderRead
from app.schemas.project import ProjectCreate, ProjectRead
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.schemas.workspace_list import ListCreate, ListItemCreate, ListItemUpdate, ListRead
from app.services import activity, crud, notifications
from app.services import organization as org
from app.services.app_settings import get_app_settings
from app.services.email import EmailNotConfiguredError, send_email as deliver_email
from app.services.telegram import TelegramError

ModelT = TypeVar("ModelT", bound=Base)

mcp = MCPServer(
    name="Anamnesies",
    title="Anamnesies",
    instructions=(
        "Tools for the user's local Anamnesies workspace: tasks, projects, calendar events, meetings, notes, "
        "lists, ideas, knowledge articles and reminders, plus sending Telegram messages and emails to the user. "
        "Everything is connected: use create_item/update_item/get_item/list_items/search_workspace for any entry type, "
        "link_items/unlink_items/get_relations for links and backlinks, set_tags/find_by_tag for tags, assign_to_project and "
        "get_project_overview for projects, list_folders/move_note for the note folder tree, and archive_item/restore_item. "
        "Dates use ISO format (YYYY-MM-DD), times use HH:MM in the user's local timezone."
    ),
)


@contextmanager
def session() -> Iterator[Session]:
    db = SessionLocal()
    try:
        with activity.source("mcp"):
            yield db
    finally:
        db.close()


def dump(schema: type[BaseModel], entities: list[Any]) -> list[dict[str, Any]]:
    return [schema.model_validate(entity).model_dump(mode="json") for entity in entities]


def require(db: Session, model: type[ModelT], entity_id: str, label: str) -> ModelT:
    entity = crud.get_entity(db, model, entity_id)
    if entity is None:
        raise ValueError(f"{label} {entity_id} not found")
    return entity


def contains(term: str, *columns: Any) -> Any:
    pattern = f"%{term.lower()}%"
    return or_(*(func.lower(column).like(pattern) for column in columns))


# --- Overview -----------------------------------------------------------------------------------


@mcp.tool(description="Summary of the workspace: open tasks, today's and upcoming events, recent notes.")
def get_workspace_overview() -> dict[str, Any]:
    today = date.today()
    with session() as db:
        open_tasks = crud.list_entities(db, Task, Task.due_date, where=[Task.status != "done"])
        events = crud.list_entities(db, Event, Event.date, Event.time, where=[Event.date >= today])[:10]
        notes = crud.list_entities(db, Note, Note.updated_at.desc())[:5]
        return {
            "today": today.isoformat(),
            "open_tasks": dump(TaskRead, open_tasks),
            "upcoming_events": dump(EventRead, events),
            "recent_notes": [{"id": str(note.id), "title": note.title} for note in notes],
        }


# --- Tasks & projects ---------------------------------------------------------------------------


@mcp.tool(description="List tasks. Optional status filter: todo, in-progress or done.")
def list_tasks(status: str | None = None) -> list[dict[str, Any]]:
    with session() as db:
        where = [Task.status == status] if status else None
        return dump(TaskRead, crud.list_entities(db, Task, Task.created_at.desc(), where=where))


@mcp.tool(description="Create a task. priority: low|medium|high, due_date: YYYY-MM-DD.")
def create_task(
    title: str,
    description: str | None = None,
    priority: str = "medium",
    due_date: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any]:
    payload = TaskCreate.model_validate(
        {"title": title, "description": description, "priority": priority, "due_date": due_date, "project_id": project_id}
    )
    with session() as db:
        return TaskRead.model_validate(crud.create_entity(db, Task, payload)).model_dump(mode="json")


@mcp.tool(description="Update a task. Only the provided fields change. status: todo|in-progress|done.")
def update_task(
    task_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    priority: str | None = None,
    due_date: str | None = None,
) -> dict[str, Any]:
    changes = {key: value for key, value in {
        "title": title, "description": description, "status": status, "priority": priority, "due_date": due_date,
    }.items() if value is not None}
    payload = TaskUpdate.model_validate(changes)
    with session() as db:
        task = require(db, Task, task_id, "Task")
        return TaskRead.model_validate(crud.update_entity(db, task, payload)).model_dump(mode="json")


@mcp.tool(description="Delete a task by id.")
def delete_task(task_id: str) -> str:
    with session() as db:
        crud.delete_entity(db, require(db, Task, task_id, "Task"))
    return f"Task {task_id} deleted"


@mcp.tool(description="List projects.")
def list_projects() -> list[dict[str, Any]]:
    with session() as db:
        return dump(ProjectRead, crud.list_entities(db, Project, Project.created_at.desc()))


@mcp.tool(description="Create a project. status: active|on_hold|completed.")
def create_project(name: str, description: str | None = None, status: str = "active") -> dict[str, Any]:
    payload = ProjectCreate.model_validate({"name": name, "description": description, "status": status})
    with session() as db:
        return ProjectRead.model_validate(crud.create_entity(db, Project, payload)).model_dump(mode="json")


# --- Calendar & meetings ------------------------------------------------------------------------


@mcp.tool(description="List calendar events, optionally between start_date and end_date (YYYY-MM-DD, inclusive).")
def list_events(start_date: str | None = None, end_date: str | None = None) -> list[dict[str, Any]]:
    where = []
    if start_date:
        where.append(Event.date >= date.fromisoformat(start_date))
    if end_date:
        where.append(Event.date <= date.fromisoformat(end_date))
    with session() as db:
        return dump(EventRead, crud.list_entities(db, Event, Event.date, Event.time, where=where))


@mcp.tool(description="Create a calendar event. date: YYYY-MM-DD, time: HH:MM.")
def create_event(
    title: str,
    date: str,
    time: str | None = None,
    location: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    payload = EventCreate.model_validate(
        {"title": title, "date": date, "time": time, "location": location, "description": description}
    )
    with session() as db:
        return EventRead.model_validate(crud.create_entity(db, Event, payload)).model_dump(mode="json")


@mcp.tool(description="Delete a calendar event by id.")
def delete_event(event_id: str) -> str:
    with session() as db:
        crud.delete_entity(db, require(db, Event, event_id, "Event"))
    return f"Event {event_id} deleted"


@mcp.tool(description="List meetings with agenda and notes.")
def list_meetings() -> list[dict[str, Any]]:
    with session() as db:
        return dump(MeetingRead, crud.list_entities(db, Meeting, Meeting.date.desc(), Meeting.time))


@mcp.tool(description="Create a meeting. date: YYYY-MM-DD, time: HH:MM, attendees: comma separated.")
def create_meeting(
    title: str,
    date: str,
    time: str | None = None,
    attendees: str | None = None,
    agenda: str | None = None,
) -> dict[str, Any]:
    payload = MeetingCreate.model_validate(
        {"title": title, "date": date, "time": time, "attendees": attendees, "agenda": agenda}
    )
    with session() as db:
        return MeetingRead.model_validate(crud.create_entity(db, Meeting, payload)).model_dump(mode="json")


# --- Notes, lists, ideas, knowledge -------------------------------------------------------------


@mcp.tool(description="Search notes by title or content. Empty query returns all notes.")
def search_notes(query: str = "") -> list[dict[str, Any]]:
    with session() as db:
        where = [contains(query, Note.title, Note.content)] if query else None
        return dump(NoteRead, crud.list_entities(db, Note, Note.updated_at.desc(), where=where))


@mcp.tool(description="Create a note.")
def create_note(title: str, content: str | None = None) -> dict[str, Any]:
    payload = NoteCreate.model_validate({"title": title, "content": content})
    with session() as db:
        return NoteRead.model_validate(crud.create_entity(db, Note, payload)).model_dump(mode="json")


@mcp.tool(description="Update the title and/or content of a note.")
def update_note(note_id: str, title: str | None = None, content: str | None = None) -> dict[str, Any]:
    changes = {key: value for key, value in {"title": title, "content": content}.items() if value is not None}
    with session() as db:
        note = require(db, Note, note_id, "Note")
        return NoteRead.model_validate(crud.update_entity(db, note, NoteUpdate.model_validate(changes))).model_dump(mode="json")


@mcp.tool(description="List all lists with their items.")
def list_lists() -> list[dict[str, Any]]:
    with session() as db:
        return dump(ListRead, crud.list_entities(db, WorkspaceList, WorkspaceList.created_at.desc()))


@mcp.tool(description="Create a new list (e.g. a checklist or shopping list).")
def create_list(title: str, category: str = "General") -> dict[str, Any]:
    payload = ListCreate.model_validate({"title": title, "category": category})
    with session() as db:
        return ListRead.model_validate(crud.create_entity(db, WorkspaceList, payload)).model_dump(mode="json")


@mcp.tool(description="Add an item to a list.")
def add_list_item(list_id: str, text: str) -> dict[str, Any]:
    with session() as db:
        workspace_list = require(db, WorkspaceList, list_id, "List")
        position = max((item.position for item in workspace_list.items), default=-1) + 1
        crud.create_entity(db, ListItem, ListItemCreate(text=text), list_id=workspace_list.id, position=position)
        db.refresh(workspace_list)
        return ListRead.model_validate(workspace_list).model_dump(mode="json")


@mcp.tool(description="Check or uncheck a list item.")
def set_list_item_done(list_id: str, item_id: str, done: bool) -> dict[str, Any]:
    with session() as db:
        item = require(db, ListItem, item_id, "List item")
        if str(item.list_id) != list_id:
            raise ValueError(f"Item {item_id} does not belong to list {list_id}")
        crud.update_entity(db, item, ListItemUpdate(done=done))
        workspace_list = require(db, WorkspaceList, list_id, "List")
        db.refresh(workspace_list)
        return ListRead.model_validate(workspace_list).model_dump(mode="json")


@mcp.tool(description="List ideas. Optional status filter: new|exploring|planned|archived.")
def list_ideas(status: str | None = None) -> list[dict[str, Any]]:
    with session() as db:
        where = [Idea.status == status] if status else None
        return dump(IdeaRead, crud.list_entities(db, Idea, Idea.created_at.desc(), where=where))


@mcp.tool(description="Capture a new idea. tags: comma separated.")
def create_idea(title: str, description: str | None = None, tags: str | None = None) -> dict[str, Any]:
    payload = IdeaCreate.model_validate({"title": title, "description": description, "tags": tags})
    with session() as db:
        return IdeaRead.model_validate(crud.create_entity(db, Idea, payload)).model_dump(mode="json")


@mcp.tool(description="Search the knowledge base by title, content or category.")
def search_knowledge(query: str = "") -> list[dict[str, Any]]:
    with session() as db:
        where = [contains(query, KnowledgeArticle.title, KnowledgeArticle.content, KnowledgeArticle.category)] if query else None
        return dump(KnowledgeRead, crud.list_entities(db, KnowledgeArticle, KnowledgeArticle.updated_at.desc(), where=where))


@mcp.tool(description="Add an article to the knowledge base.")
def create_knowledge_article(
    title: str,
    content: str | None = None,
    category: str | None = None,
    source_url: str | None = None,
) -> dict[str, Any]:
    payload = KnowledgeCreate.model_validate(
        {"title": title, "content": content, "category": category, "source_url": source_url}
    )
    with session() as db:
        return KnowledgeRead.model_validate(crud.create_entity(db, KnowledgeArticle, payload)).model_dump(mode="json")


# --- Email --------------------------------------------------------------------------------------


@mcp.tool(description="Send a plain-text email from the workspace's configured sender address.")
def send_email(to: str, subject: str, body: str) -> str:
    with session() as db:
        row = get_app_settings(db)
    try:
        deliver_email(row, to=to, subject=subject, body=body)
    except EmailNotConfiguredError as exc:
        raise ValueError(str(exc)) from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise ValueError(f"SMTP error: {exc}") from exc
    return f"Email sent to {to}"



# --- Reminders & Telegram -----------------------------------------------------------------------


@mcp.tool(description="List reminders. By default only pending ones; set include_done to also get sent ones.")
def list_reminders(include_done: bool = False) -> list[dict[str, Any]]:
    with session() as db:
        where = None if include_done else [Reminder.done.is_(False)]
        return dump(ReminderRead, crud.list_entities(db, Reminder, Reminder.remind_at, where=where))


@mcp.tool(
    description=(
        "Create a reminder that is sent to the user via Telegram. remind_at: local time as YYYY-MM-DDTHH:MM. "
        "repeat: none|daily|weekdays|weekly|monthly."
    )
)
def create_reminder(text: str, remind_at: str, repeat: str = "none") -> dict[str, Any]:
    payload = ReminderCreate.model_validate({"text": text, "remind_at": remind_at, "repeat": repeat})
    with session() as db:
        return ReminderRead.model_validate(crud.create_entity(db, Reminder, payload)).model_dump(mode="json")


@mcp.tool(description="Delete a reminder.")
def delete_reminder(reminder_id: str) -> str:
    with session() as db:
        crud.delete_entity(db, require(db, Reminder, reminder_id, "Reminder"))
    return f"Reminder {reminder_id} deleted"


@mcp.tool(description="Send a message to the user's linked Telegram chat right now. Supports basic HTML (<b>, <i>, <code>).")
def send_telegram_message(text: str) -> str:
    with session() as db:
        row = notifications.get_telegram_settings(db)
        try:
            notifications.sender(row, db)(text)
        except TelegramError as exc:
            raise ValueError(str(exc)) from exc
    return "Message sent via Telegram"


# --- Tags, links, archive -----------------------------------------------------------------------

ENTITY_TYPES_HINT = "entity_type: note|task|event|meeting|project|knowledge|idea|folder"


@mcp.tool(description="List all tags with how many entries use them.")
def list_tags() -> list[dict[str, Any]]:
    with session() as db:
        return [tag.model_dump(mode="json") for tag in org.list_tags(db)]


@mcp.tool(description=f"Add tags to an entry (existing tags are kept). {ENTITY_TYPES_HINT}")
def tag_item(entity_type: str, entity_id: str, tags: list[str]) -> str:
    with session() as db:
        try:
            org.add_entity_tags(db, entity_type, org.load(db, entity_type, entity_id).id, tags)
        except org.UnknownEntityError as exc:
            raise ValueError(str(exc)) from exc
    return f"Tagged {entity_type} {entity_id} with {', '.join(tags)}"


@mcp.tool(description=f"Link two entries, e.g. a note to a task or a meeting to a project. {ENTITY_TYPES_HINT}")
def link_items(source_type: str, source_id: str, target_type: str, target_id: str) -> str:
    with session() as db:
        try:
            source = org.load(db, source_type, source_id)
            target = org.load(db, target_type, target_id)
            org.create_link(db, source_type, source.id, target_type, target.id)
        except (org.UnknownEntityError, ValueError) as exc:
            raise ValueError(str(exc)) from exc
    return f"Linked {source_type} {source_id} to {target_type} {target_id}"


@mcp.tool(description=f"Move an entry to the archive (it can be restored later). {ENTITY_TYPES_HINT}")
def archive_item(entity_type: str, entity_id: str) -> str:
    with session() as db:
        try:
            org.archive(db, entity_type, org.load(db, entity_type, entity_id).id)
        except org.UnknownEntityError as exc:
            raise ValueError(str(exc)) from exc
    return f"Archived {entity_type} {entity_id}"


# Generic tools for all entry types and their connections.
from app.mcp_server import workspace_tools  # noqa: E402,F401
