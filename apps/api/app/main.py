from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from mcp.server.transport_security import TransportSecuritySettings

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.session import init_db
from app.mcp_server.guard import AccessGuardMiddleware
from app.mcp_server.server import mcp
from app.services.scheduler import start_background_tasks

settings = get_settings()

# Host/origin validation for /mcp is handled by AccessGuardMiddleware, because the allowed
# custom domains are configured at runtime in the settings.
mcp_app = mcp.streamable_http_app(
    streamable_http_path="/mcp",
    stateless_http=True,
    json_response=True,
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    async with mcp.session_manager.run():
        tasks = start_background_tasks()
        try:
            yield
        finally:
            for task in tasks:
                task.cancel()


app = FastAPI(
    title="Anamnesies API",
    version="0.2.0",
    description="Local-first personal life manager API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(origin) for origin in settings.cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AccessGuardMiddleware)
# Large JSON lists (hundreds of notes and tasks) shrink a lot when compressed.
app.add_middleware(GZipMiddleware, minimum_size=2048)


app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Anamnesies API is running"}


# Mounted last so the API routes above take precedence; serves the MCP endpoint at /mcp.
app.mount("/", mcp_app)
