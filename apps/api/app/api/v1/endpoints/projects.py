import uuid

from fastapi import APIRouter, HTTPException, status

from app.schemas.project import ProjectCreate, ProjectRead

router = APIRouter()
_projects: list[dict[str, object]] = []


@router.get("/projects", response_model=list[ProjectRead])
def list_projects() -> list[ProjectRead]:
    return [
        ProjectRead(
            id=str(project["id"]),
            name=str(project["name"]),
            description=project.get("description"),
            status=str(project.get("status", "active")),
        )
        for project in _projects
    ]


@router.post("/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(project: ProjectCreate) -> ProjectRead:
    payload = {
        "id": uuid.uuid4(),
        "name": project.name,
        "description": project.description,
        "status": project.status,
    }
    _projects.append(payload)
    return ProjectRead(
        id=str(payload["id"]),
        name=str(payload["name"]),
        description=payload.get("description"),
        status=str(payload.get("status", "active")),
    )
