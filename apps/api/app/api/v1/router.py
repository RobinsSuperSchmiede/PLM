from fastapi import APIRouter

from app.api.v1.endpoints import health, notes, projects, tasks

api_router = APIRouter()
api_router.include_router(health.router, prefix="", tags=["health"])
api_router.include_router(projects.router, prefix="", tags=["projects"])
api_router.include_router(tasks.router, prefix="", tags=["tasks"])
api_router.include_router(notes.router, prefix="", tags=["notes"])
