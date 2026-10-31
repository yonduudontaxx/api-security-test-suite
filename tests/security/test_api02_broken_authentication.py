import base64
import json
import secrets

import httpx
import pytest

from apisec_suite.client import Account, bearer, claims, now, sign_hs256, unsigned_token
from apisec_suite.settings import Settings

pytestmark = pytest.mark.api2

ME = "/api/v1/users/me"


def test_requests_without_a_token_are_rejected(client: httpx.Client) -> None:
    assert client.get(ME).status_code == 401


def test_a_valid_token_is_accepted(client: httpx.Client, user: Account) -> None:
    assert client.get(ME, headers=user.headers).status_code == 200


@pytest.mark.parametrize("alg", ["none", "None", "NONE"])
def test_an_unsigned_token_is_rejected(client: httpx.Client, user: Account, alg: str) -> None:
    token = unsigned_token(claims(user.id, role="admin"), alg=alg)

    assert client.get(ME, headers=bearer(token)).status_code == 401


def test_a_token_signed_with_a_different_key_is_rejected(client: httpx.Client, user: Account) -> None:
    token = sign_hs256(claims(user.id, role="admin"), secrets.token_hex(32))

    assert client.get(ME, headers=bearer(token)).status_code == 401


def test_a_token_whose_payload_was_edited_after_signing_is_rejected(client: httpx.Client, user: Account) -> None:
    header, _, signature = user.token.split(".")
    forged = base64.urlsafe_b64encode(json.dumps(claims(user.id, role="admin")).encode()).rstrip(b"=").decode()

    assert client.get(ME, headers=bearer(f"{header}.{forged}.{signature}")).status_code == 401


def test_an_expired_token_is_rejected_even_with_a_valid_signature(
    client: httpx.Client, user: Account, settings: Settings
) -> None:
    token = sign_hs256(claims(user.id, issued=now() - 7200, ttl=3600), settings.jwt_secret)

    assert client.get(ME, headers=bearer(token)).status_code == 401


def test_repeated_failed_logins_lock_the_account(client: httpx.Client, user: Account) -> None:
    for attempt in range(5):
        response = client.post("/api/v1/auth/login", json={"username": user.username, "password": f"wrong-{attempt}"})
        assert response.status_code == 401

    locked = client.post("/api/v1/auth/login", json={"username": user.username, "password": user.password})

    assert locked.status_code == 429
    assert locked.headers.get("retry-after")


def test_login_errors_do_not_reveal_whether_the_account_exists(client: httpx.Client, user: Account) -> None:
    unknown_user = client.post("/api/v1/auth/login", json={"username": f"ghost-{user.username}", "password": "x" * 16})
    wrong_password = client.post("/api/v1/auth/login", json={"username": user.username, "password": "x" * 16})

    assert unknown_user.status_code == 401
    assert wrong_password.status_code == 401
    assert unknown_user.json() == wrong_password.json()
