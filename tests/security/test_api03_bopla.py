import uuid
from collections.abc import Callable

import httpx
import pytest

from apisec_suite.client import Account

pytestmark = pytest.mark.api3

SENSITIVE_FIELDS = {"passwordHash", "resetToken", "mfaSecret"}


def test_own_profile_does_not_expose_credential_material(client: httpx.Client, user: Account) -> None:
    response = client.get("/api/v1/users/me", headers=user.headers)

    assert response.status_code == 200
    assert SENSITIVE_FIELDS.isdisjoint(response.json())


def test_another_users_profile_exposes_only_public_fields(
    client: httpx.Client, new_user: Callable[..., Account]
) -> None:
    alice, bob = new_user("alice"), new_user("bob")

    response = client.get(f"/api/v1/users/{alice.id}", headers=bob.headers)

    assert response.status_code == 200
    assert sorted(response.json()) == ["displayName", "id", "username"]


def test_profile_update_cannot_escalate_role_or_credit_balance(client: httpx.Client, user: Account) -> None:
    client.patch(
        "/api/v1/users/me",
        headers=user.headers,
        json={"displayName": "Mallory", "role": "admin", "balanceCents": 1_000_000},
    )
    me = client.get("/api/v1/users/me", headers=user.headers).json()

    assert me["role"] == "user"
    assert me["balanceCents"] == 0


def test_legitimate_profile_fields_can_still_be_updated(client: httpx.Client, user: Account) -> None:
    response = client.patch("/api/v1/users/me", headers=user.headers, json={"displayName": "Alice Example"})

    assert response.status_code == 200
    assert response.json()["displayName"] == "Alice Example"


def test_registration_rejects_a_client_supplied_role(client: httpx.Client) -> None:
    username = f"reg-{uuid.uuid4().hex[:8]}"
    body = {
        "username": username,
        "email": f"{username}@example.test",
        "password": f"Pw-{uuid.uuid4()}",
        "role": "admin",
    }

    response = client.post("/api/v1/auth/register", json=body)

    assert response.status_code == 400
