import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EntityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
