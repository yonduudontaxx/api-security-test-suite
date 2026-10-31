from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from apisec_suite.client import Account

pytestmark = pytest.mark.api4


def test_a_reasonable_page_size_is_served(client: httpx.Client, user: Account) -> None:
    assert client.get("/api/v1/orders", headers=user.headers, params={"limit": 50}).status_code == 200


@pytest.mark.parametrize("limit", ["1000000", "-1", "0", "NaN"])
def test_an_out_of_range_page_size_is_rejected(client: httpx.Client, user: Account, limit: str) -> None:
    assert client.get("/api/v1/orders", headers=user.headers, params={"limit": limit}).status_code == 400


def test_an_oversized_request_body_is_rejected_before_processing(client: httpx.Client, user: Account) -> None:
    items = [{"sku": "SKU-PEN", "quantity": 1}] * 20_000

    response = client.post("/api/v1/orders", headers=user.headers, json={"items": items})

    assert response.status_code == 413


def test_an_order_with_an_excessive_number_of_line_items_is_rejected(client: httpx.Client, user: Account) -> None:
    items = [{"sku": "SKU-PEN", "quantity": 1}] * 200

    response = client.post("/api/v1/orders", headers=user.headers, json={"items": items})

    assert response.status_code == 400


def test_a_burst_of_requests_from_one_user_is_rate_limited(client: httpx.Client, user: Account) -> None:
    def fetch_profile(_: int) -> int:
        return client.get("/api/v1/users/me", headers=user.headers).status_code

    with ThreadPoolExecutor(max_workers=16) as pool:
        statuses = list(pool.map(fetch_profile, range(150)))
    limited = client.get("/api/v1/users/me", headers=user.headers)

    assert 429 in statuses
    assert limited.status_code == 429
    assert int(limited.headers.get("retry-after", "0")) > 0
