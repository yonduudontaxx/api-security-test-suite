from collections.abc import Callable

import httpx
import pytest

from apisec_suite.client import Account, bearer

pytestmark = pytest.mark.api5


def test_an_admin_can_list_users(client: httpx.Client, admin_token: str) -> None:
    assert client.get("/api/v1/admin/users", headers=bearer(admin_token)).status_code == 200


def test_a_regular_user_cannot_list_users_through_the_admin_api(client: httpx.Client, user: Account) -> None:
    assert client.get("/api/v1/admin/users", headers=user.headers).status_code == 403


def test_a_regular_user_cannot_delete_accounts_through_the_admin_api(
    client: httpx.Client, new_user: Callable[..., Account]
) -> None:
    attacker, victim = new_user("mallory"), new_user("victim")

    response = client.delete(f"/api/v1/admin/users/{victim.id}", headers=attacker.headers)
    victim_profile = client.get("/api/v1/users/me", headers=victim.headers)

    assert response.status_code == 403
    assert victim_profile.status_code == 200


def test_admin_functions_are_not_reachable_through_a_method_override_header(
    client: httpx.Client, user: Account
) -> None:
    response = client.get("/api/v1/admin/users", headers=user.headers_with({"x-http-method-override": "DELETE"}))

    assert response.status_code == 403
