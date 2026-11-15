import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Uuid, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, EntityMixin


class WorkspaceList(EntityMixin, Base):
    __tablename__ = "lists"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(64), default="General")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    items: Mapped[list["ListItem"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="ListItem.position",
        lazy="selectin",
    )


class ListItem(EntityMixin, Base):
    __tablename__ = "list_items"

    list_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("lists.id", ondelete="CASCADE"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(String(500), nullable=False)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    parent: Mapped[WorkspaceList] = relationship(back_populates="items")
