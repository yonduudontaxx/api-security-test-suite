from collections.abc import Callable

import httpx
import pytest

from apisec_suite.client import Account, create_order

pytestmark = pytest.mark.api1


def test_owner_can_read_their_own_order(client: httpx.Client, user: Account) -> None:
    order = create_order(client, user)

    response = client.get(f"/api/v1/orders/{order['id']}", headers=user.headers)

    assert response.status_code == 200
    assert response.json()["id"] == order["id"]


def test_another_user_cannot_read_someone_elses_order(client: httpx.Client, new_user: Callable[..., Account]) -> None:
    alice, bob = new_user("alice"), new_user("bob")
    order = create_order(client, alice)

    response = client.get(f"/api/v1/orders/{order['id']}", headers=bob.headers)

    assert response.status_code == 404
    assert alice.id not in response.text


def test_another_user_cannot_cancel_someone_elses_order(client: httpx.Client, new_user: Callable[..., Account]) -> None:
    alice, bob = new_user("alice"), new_user("bob")
    order = create_order(client, alice)

    attack = client.delete(f"/api/v1/orders/{order['id']}", headers=bob.headers)
    after = client.get(f"/api/v1/orders/{order['id']}", headers=alice.headers)

    assert attack.status_code == 404
    assert after.json()["status"] == "open"


def test_order_listing_ignores_an_owner_id_pointing_at_another_user(
    client: httpx.Client, new_user: Callable[..., Account]
) -> None:
    alice, bob = new_user("alice"), new_user("bob")
    create_order(client, alice)

    response = client.get("/api/v1/orders", headers=bob.headers, params={"ownerId": alice.id})

    assert response.status_code == 200
    assert [order for order in response.json()["items"] if order["ownerId"] == alice.id] == []


def test_a_coupon_cannot_be_applied_to_someone_elses_order(
    client: httpx.Client, new_user: Callable[..., Account]
) -> None:
    alice, bob = new_user("alice"), new_user("bob")
    order = create_order(client, alice)

    response = client.post(f"/api/v1/orders/{order['id']}/coupon", headers=bob.headers, json={"code": "WELCOME10"})

    assert response.status_code == 404
