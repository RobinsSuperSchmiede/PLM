import re

from fastapi.testclient import TestClient

from tests.test_notifications import linked, sent  # noqa: F401 - fixtures


def test_two_factor_requires_linked_chat(client: TestClient, sent) -> None:  # noqa: F811
    client.post("/api/v1/telegram/unlink")
    assert client.patch("/api/v1/telegram", json={"login_2fa": True}).status_code == 400
    assert client.get("/api/v1/auth/second-factor").json()["required"] is False
    assert client.post("/api/v1/auth/challenge").status_code == 503


def test_code_is_sent_verified_once_and_not_logged(client: TestClient, linked: None, sent) -> None:  # noqa: F811
    assert client.patch("/api/v1/telegram", json={"login_2fa": True}).json()["login_2fa"] is True
    assert client.get("/api/v1/auth/second-factor").json() == {"required": True, "method": "telegram"}

    challenge = client.post("/api/v1/auth/challenge").json()
    code = re.search(r"<code>(\d{6})</code>", sent[-1][1]).group(1)
    assert all(code not in entry["text"] for entry in client.get("/api/v1/telegram/messages").json())

    wrong = "000000" if code != "000000" else "111111"
    assert client.post("/api/v1/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": wrong}).json() == {"valid": False, "remaining": 4}
    assert client.post("/api/v1/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": code}).json()["valid"] is True
    # A used code cannot be reused.
    assert client.post("/api/v1/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": code}).json()["valid"] is False

    # Unlinking the chat switches the second factor off, so nobody gets locked out.
    assert client.post("/api/v1/telegram/unlink").json()["login_2fa"] is False


def test_attempts_are_limited(client: TestClient, linked: None, sent) -> None:  # noqa: F811
    client.patch("/api/v1/telegram", json={"login_2fa": True})
    challenge = client.post("/api/v1/auth/challenge").json()
    code = re.search(r"<code>(\d{6})</code>", sent[-1][1]).group(1)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        client.post("/api/v1/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": wrong})
    assert client.post("/api/v1/auth/verify", json={"challenge_id": challenge["challenge_id"], "code": code}).json()["valid"] is False
    client.post("/api/v1/telegram/unlink")
