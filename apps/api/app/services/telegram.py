"""Minimal client for the Telegram Bot API (https://core.telegram.org/bots/api)."""

from typing import Any

import httpx

API_BASE = "https://api.telegram.org"
MAX_MESSAGE_LENGTH = 4096


class TelegramError(Exception):
    pass


class TelegramNotConfiguredError(TelegramError):
    pass


def _result(response: httpx.Response) -> Any:
    try:
        payload = response.json()
    except ValueError as exc:
        raise TelegramError(f"Unexpected response from Telegram (HTTP {response.status_code})") from exc
    if not payload.get("ok"):
        raise TelegramError(payload.get("description") or f"Telegram error (HTTP {response.status_code})")
    return payload["result"]


def call(token: str, method: str, **params: Any) -> Any:
    try:
        response = httpx.post(f"{API_BASE}/bot{token}/{method}", json=params, timeout=15)
    except httpx.HTTPError as exc:
        raise TelegramError(f"Telegram not reachable: {exc}") from exc
    return _result(response)


async def acall(client: httpx.AsyncClient, token: str, method: str, request_timeout: float = 15, **params: Any) -> Any:
    try:
        response = await client.post(f"{API_BASE}/bot{token}/{method}", json=params, timeout=request_timeout)
    except httpx.HTTPError as exc:
        raise TelegramError(f"Telegram not reachable: {exc}") from exc
    return _result(response)


def get_me(token: str) -> dict[str, Any]:
    return call(token, "getMe")


def send_message(token: str, chat_id: str, text: str) -> None:
    """Send an HTML-formatted message, split into chunks if it exceeds Telegram's limit."""
    for start in range(0, len(text), MAX_MESSAGE_LENGTH):
        call(
            token,
            "sendMessage",
            chat_id=chat_id,
            text=text[start : start + MAX_MESSAGE_LENGTH],
            parse_mode="HTML",
            link_preview_options={"is_disabled": True},
        )
