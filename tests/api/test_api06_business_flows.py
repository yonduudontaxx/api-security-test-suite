import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx
import pytest

from apisec_suite.client import Account, bearer, create_order
from apisec_suite.settings import Settings

pytestmark = pytest.mark.api6

COUPON = {"code": "WELCOME10"}


def test_a_single_use_coupon_applies_a_discount_once(client: httpx.Client, user: Account) -> None:
    order = create_order(client, user)

    response = client.post(f"/api/v1/orders/{order['id']}/coupon", headers=user.headers, json=COUPON)

    assert response.status_code == 200
    assert response.json()["totalCents"] == round(order["subtotalCents"] * 0.9)


def test_a_single_use_coupon_cannot_be_redeemed_on_a_second_order(client: httpx.Client, user: Account) -> None:
    first, second = create_order(client, user), create_order(client, user)

    client.post(f"/api/v1/orders/{first['id']}/coupon", headers=user.headers, json=COUPON)
    reuse = client.post(f"/api/v1/orders/{second['id']}/coupon", headers=user.headers, json=COUPON)

    assert reuse.status_code == 409


def test_a_single_use_coupon_cannot_be_redeemed_again_for_the_same_user_by_an_admin(
    client: httpx.Client, user: Account, admin_token: str
) -> None:
    first, second = create_order(client, user), create_order(client, user)

    client.post(f"/api/v1/orders/{first['id']}/coupon", headers=user.headers, json=COUPON)
    reuse = client.post(f"/api/v1/orders/{second['id']}/coupon", headers=bearer(admin_token), json=COUPON)

    assert reuse.status_code == 409


def test_concurrent_redemptions_of_a_single_use_coupon_succeed_exactly_once(
    client: httpx.Client, user: Account
) -> None:
    orders = [create_order(client, user) for _ in range(8)]

    def redeem(order: dict[str, Any]) -> int:
        return client.post(f"/api/v1/orders/{order['id']}/coupon", headers=user.headers, json=COUPON).status_code

    with ThreadPoolExecutor(max_workers=len(orders)) as pool:
        statuses = list(pool.map(redeem, orders))

    assert statuses.count(200) == 1
    assert statuses.count(409) == len(orders) - 1


def test_one_address_cannot_register_accounts_without_limit(
    client: httpx.Client, client_from_new_address: httpx.Client, settings: Settings
) -> None:
    farmer = client_from_new_address

    def attempt(_: int) -> int:
        return farmer.post("/api/v1/auth/register", json={}).status_code

    with ThreadPoolExecutor(max_workers=16) as pool:
        statuses = list(pool.map(attempt, range(settings.registration_limit)))
    username = f"farm-{uuid.uuid4().hex[:8]}"
    farmed = farmer.post(
        "/api/v1/auth/register",
        json={"username": username, "email": f"{username}@example.test", "password": f"Pw-{uuid.uuid4()}"},
    )

    assert set(statuses) == {400}
    assert farmed.status_code == 429
    assert int(farmed.headers.get("retry-after", "0")) > 0


@pytest.mark.parametrize("quantity", [-5, 0, 1_000_000])
def test_an_order_with_an_abusive_quantity_is_rejected(client: httpx.Client, user: Account, quantity: int) -> None:
    response = client.post(
        "/api/v1/orders", headers=user.headers, json={"items": [{"sku": "SKU-LAPTOP", "quantity": quantity}]}
    )

    assert response.status_code == 400
