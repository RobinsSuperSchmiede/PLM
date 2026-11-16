"""Background loops started with the API: notification ticks and Telegram long polling, for every workspace."""

import asyncio
import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.db.session import SessionLocal, use_workspace
from app.services import accounts, notifications, telegram, usage

logger = logging.getLogger(__name__)

POLL_TIMEOUT_SECONDS = 25
SUPERVISOR_SECONDS = 10


def _notification_tick(workspace: str) -> None:
    with use_workspace(workspace), SessionLocal() as db:
        usage.flush(db)
        notifications.run_notifications(db)


async def notification_loop() -> None:
    interval = get_settings().scheduler_interval_seconds
    while True:
        try:
            workspaces = await asyncio.to_thread(accounts.active_workspaces)
        except Exception:  # noqa: BLE001
            logger.exception("Could not list workspaces")
            workspaces = []
        for workspace in workspaces:
            try:
                await asyncio.to_thread(_notification_tick, workspace)
            except Exception:  # noqa: BLE001 - keep the loop alive, e.g. when Telegram is unreachable
                logger.exception("Notification tick failed for workspace %s", workspace)
        await asyncio.sleep(interval)


def _polling_target(workspace: str) -> tuple[str, int] | None:
    """Token and offset if the bot should listen for messages (to link a chat or answer commands)."""
    with use_workspace(workspace), SessionLocal() as db:
        row = notifications.get_telegram_settings(db)
        if not (row.enabled and row.bot_token):
            return None
        if row.chat_id and not row.commands_enabled:
            return None
        return row.bot_token, row.update_offset


def _process_updates(workspace: str, token: str, updates: list[dict[str, Any]]) -> None:
    with use_workspace(workspace), SessionLocal() as db:
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


async def telegram_loop(workspace: str, client: httpx.AsyncClient) -> None:
    """Long polling for one workspace's bot. Ends when the workspace no longer needs it."""
    while True:
        target = await asyncio.to_thread(_polling_target, workspace)
        if target is None:
            return
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
            logger.warning("Telegram polling failed (workspace %s): %s", workspace, exc)
            await asyncio.sleep(30)
            continue
        if updates:
            await asyncio.to_thread(_process_updates, workspace, token, updates)


async def telegram_supervisor() -> None:
    """Keeps one polling task per workspace that has a bot to listen with."""
    running: dict[str, asyncio.Task[None]] = {}
    async with httpx.AsyncClient() as client:
        try:
            while True:
                try:
                    workspaces = await asyncio.to_thread(accounts.active_workspaces)
                except Exception:  # noqa: BLE001
                    logger.exception("Could not list workspaces")
                    workspaces = list(running)
                for workspace, task in list(running.items()):
                    if task.done() or workspace not in workspaces:
                        task.cancel()
                        del running[workspace]
                for workspace in workspaces:
                    if workspace in running:
                        continue
                    try:
                        needed = await asyncio.to_thread(_polling_target, workspace) is not None
                    except Exception:  # noqa: BLE001
                        logger.exception("Telegram check failed for workspace %s", workspace)
                        continue
                    if needed:
                        running[workspace] = asyncio.create_task(telegram_loop(workspace, client))
                await asyncio.sleep(SUPERVISOR_SECONDS)
        finally:
            for task in running.values():
                task.cancel()


def start_background_tasks() -> list[asyncio.Task[None]]:
    if not get_settings().scheduler_enabled:
        return []
    return [asyncio.create_task(notification_loop()), asyncio.create_task(telegram_supervisor())]
