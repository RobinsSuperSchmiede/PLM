from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "plm-api"}


@router.get("/ready")
def ready() -> dict[str, str]:
    return {"status": "ready", "service": "plm-api"}
