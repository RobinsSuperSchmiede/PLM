import uuid

from fastapi import APIRouter, status

from app.schemas.task import TaskCreate, TaskRead

router = APIRouter()
_tasks: list[dict[str, object]] = []


@router.get("/tasks", response_model=list[TaskRead])
def list_tasks() -> list[TaskRead]:
    return [
        TaskRead(
            id=str(task["id"]),
            title=str(task["title"]),
            description=task.get("description"),
            status=str(task.get("status", "todo")),
        )
        for task in _tasks
    ]


@router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(task: TaskCreate) -> TaskRead:
    payload = {
        "id": uuid.uuid4(),
        "title": task.title,
        "description": task.description,
        "status": task.status,
    }
    _tasks.append(payload)
    return TaskRead(
        id=str(payload["id"]),
        title=str(payload["title"]),
        description=payload.get("description"),
        status=str(payload.get("status", "todo")),
    )
