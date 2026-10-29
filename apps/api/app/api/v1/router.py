from fastapi import APIRouter

from app.api.v1.crud_router import build_crud_router
from app.api.v1.endpoints import auth, files, health, insights, lists, organization, overview, settings, telegram
from app.models import Event, Folder, Idea, KnowledgeArticle, Meeting, Note, Project, Record, Reminder, Task
from app.schemas.event import EventCreate, EventRead, EventUpdate
from app.schemas.idea import IdeaCreate, IdeaRead, IdeaUpdate
from app.schemas.knowledge import KnowledgeCreate, KnowledgeRead, KnowledgeUpdate
from app.schemas.meeting import MeetingCreate, MeetingRead, MeetingUpdate
from app.schemas.note import NoteCreate, NoteRead, NoteUpdate
from app.schemas.organization import FolderCreate, FolderRead, FolderUpdate
from app.schemas.notification import ReminderCreate, ReminderRead, ReminderUpdate
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.schemas.record import RecordCreate, RecordRead, RecordUpdate
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(overview.router, tags=["overview"])
api_router.include_router(settings.router, tags=["settings"])
api_router.include_router(lists.router, tags=["lists"])
api_router.include_router(telegram.router, tags=["telegram"])
api_router.include_router(organization.router)
api_router.include_router(insights.router)
api_router.include_router(files.router)
api_router.include_router(auth.router)

crud_resources = [
    ("/projects", Project, ProjectCreate, ProjectUpdate, ProjectRead, (Project.created_at.desc(),), "Project"),
    ("/tasks", Task, TaskCreate, TaskUpdate, TaskRead, (Task.created_at.desc(),), "Task"),
    ("/notes", Note, NoteCreate, NoteUpdate, NoteRead, (Note.updated_at.desc(),), "Note"),
    ("/events", Event, EventCreate, EventUpdate, EventRead, (Event.date, Event.time), "Event"),
    ("/meetings", Meeting, MeetingCreate, MeetingUpdate, MeetingRead, (Meeting.date.desc(), Meeting.time), "Meeting"),
    ("/ideas", Idea, IdeaCreate, IdeaUpdate, IdeaRead, (Idea.created_at.desc(),), "Idea"),
    ("/knowledge", KnowledgeArticle, KnowledgeCreate, KnowledgeUpdate, KnowledgeRead, (KnowledgeArticle.updated_at.desc(),), "Knowledge"),
    ("/reminders", Reminder, ReminderCreate, ReminderUpdate, ReminderRead, (Reminder.done, Reminder.remind_at), "Reminder"),
    ("/folders", Folder, FolderCreate, FolderUpdate, FolderRead, (Folder.position, Folder.name), "Folder"),
    ("/records", Record, RecordCreate, RecordUpdate, RecordRead, (Record.created_at.desc(),), "Record"),
]

for path, model, create_schema, update_schema, read_schema, order_by, label in crud_resources:
    api_router.include_router(
        build_crud_router(
            path=path,
            model=model,
            create_schema=create_schema,
            update_schema=update_schema,
            read_schema=read_schema,
            order_by=order_by,
            label=label,
        ),
        tags=[path.strip("/")],
    )
