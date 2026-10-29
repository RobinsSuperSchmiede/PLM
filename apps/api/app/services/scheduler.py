"""Background loops started with the API: notification ticks and Telegram long polling."""

import asyncio
import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services import notifications, telegram, usage

logger = logging.getLogger(__name__)

POLL_TIMEOUT_SECONDS = 25


def _notification_tick() -> None:
    with SessionLocal() as db:
        usage.flush(db)
        notifications.run_notifications(db)


async def notification_loop() -> None:
    interval = get_settings().scheduler_interval_seconds
    while True:
        try:
            await asyncio.to_thread(_notification_tick)
        except Exception:  # noqa: BLE001 - keep the loop alive, e.g. when Telegram is unreachable
            logger.exception("Notification tick failed")
        await asyncio.sleep(interval)


def _polling_target() -> tuple[str, int] | None:
    """Token and offset if the bot should listen for messages (to link a chat or answer commands)."""
    with SessionLocal() as db:
        row = notifications.get_telegram_settings(db)
        if not (row.enabled and row.bot_token):
            return None
        if row.chat_id and not row.commands_enabled:
            return None
        return row.bot_token, row.update_offset


def _process_updates(token: str, updates: list[dict[str, Any]]) -> None:
    with SessionLocal() as db:
        row = notifications.get_telegram_settings(db)
        if row.bot_token != token:
            return
        for update in updates:
            row.update_offset = max(row.update_offset, int(update["update_id"]) + 1)
            db.commit()
            try:
                reply = notifications.handle_update(db, row, update)
                if reply:
                    telegram.send_message(token, *reply)
            except Exception:  # noqa: BLE001 - one bad message must not block the others
                db.rollback()
                logger.exception("Failed to handle Telegram update %s", update.get("update_id"))


async def telegram_loop() -> None:
    async with httpx.AsyncClient() as client:
        while True:
            target = await asyncio.to_thread(_polling_target)
            if target is None:
                await asyncio.sleep(10)
                continue
            token, offset = target
            try:
                updates = await telegram.acall(
                    client,
                    token,
                    "getUpdates",
                    request_timeout=POLL_TIMEOUT_SECONDS + 10,
                    offset=offset,
                    timeout=POLL_TIMEOUT_SECONDS,
                    allowed_updates=["message", "edited_message"],
                )
            except telegram.TelegramError as exc:
                logger.warning("Telegram polling failed: %s", exc)
                await asyncio.sleep(30)
                continue
            if updates:
                await asyncio.to_thread(_process_updates, token, updates)


def start_background_tasks() -> list[asyncio.Task[None]]:
    if not get_settings().scheduler_enabled:
        return []
    return [asyncio.create_task(notification_loop()), asyncio.create_task(telegram_loop())]
