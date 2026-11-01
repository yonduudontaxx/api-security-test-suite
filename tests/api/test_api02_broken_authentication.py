import base64
import json
import secrets
import uuid

import httpx
import pytest

from apisec_suite.client import SPRAY_FAILURES_PER_ADDRESS, Account, bearer, claims, now, sign_hs256, unsigned_token
from apisec_suite.secret import Secret
from apisec_suite.settings import Settings

pytestmark = pytest.mark.api2

ME = "/api/v1/users/me"
LOGIN = "/api/v1/auth/login"


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

    assert client.get(ME, headers=bearer(Secret(f"{header}.{forged}.{signature}"))).status_code == 401


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


def test_failed_logins_from_another_address_do_not_lock_the_admin_out(
    client: httpx.Client, client_from_new_address: httpx.Client, settings: Settings
) -> None:
    attacker = client_from_new_address
    for attempt in range(5):
        response = attacker.post(LOGIN, json={"username": "admin", "password": f"wrong-{attempt}"})
        assert response.status_code == 401

    admin = client.post(LOGIN, json={"username": "admin", "password": settings.admin_password})
    attacker_retry = attacker.post(LOGIN, json={"username": "admin", "password": settings.admin_password})

    assert admin.status_code == 200
    assert attacker_retry.status_code == 429


def test_repeated_failed_logins_from_one_address_are_throttled_across_accounts(
    client: httpx.Client, client_from_new_address: httpx.Client, settings: Settings, user: Account
) -> None:
    sprayer = client_from_new_address
    for _ in range(settings.login_failure_limit):
        response = sprayer.post(LOGIN, json={"username": f"ghost-{uuid.uuid4().hex[:8]}", "password": "x" * 16})
        assert response.status_code == 401

    throttled = sprayer.post(LOGIN, json={"username": user.username, "password": user.password})
    elsewhere = client.post(LOGIN, json={"username": user.username, "password": user.password})

    assert throttled.status_code == 429
    assert throttled.json()["error"] == "rate_limited"
    assert int(throttled.headers.get("retry-after", "0")) > 0
    assert elsewhere.status_code == 200


def test_failures_spread_across_addresses_throttle_the_account_for_new_addresses_only(
    client: httpx.Client,
    account_ceiling_sprayers: list[httpx.Client],
    client_from_new_address: httpx.Client,
    settings: Settings,
    user: Account,
) -> None:
    for index in range(settings.account_failure_limit):
        sprayer = account_ceiling_sprayers[index // SPRAY_FAILURES_PER_ADDRESS]
        response = sprayer.post(LOGIN, json={"username": user.username, "password": f"wrong-{index}"})
        assert response.status_code == 401

    from_new_address = client_from_new_address.post(LOGIN, json={"username": user.username, "password": user.password})
    from_known_address = client.post(LOGIN, json={"username": user.username, "password": user.password})

    assert from_new_address.status_code == 429
    assert from_new_address.json()["error"] == "account_throttled"
    assert 0 < int(from_new_address.headers.get("retry-after", "0")) <= 3600
    assert from_known_address.status_code == 200


def test_login_errors_do_not_reveal_whether_the_account_exists(client: httpx.Client, user: Account) -> None:
    unknown_user = client.post("/api/v1/auth/login", json={"username": f"ghost-{user.username}", "password": "x" * 16})
    wrong_password = client.post("/api/v1/auth/login", json={"username": user.username, "password": "x" * 16})

    assert unknown_user.status_code == 401
    assert wrong_password.status_code == 401
    assert unknown_user.json() == wrong_password.json()
