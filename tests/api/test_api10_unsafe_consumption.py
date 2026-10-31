import time

import httpx
import pytest

from apisec_suite.client import Account

pytestmark = pytest.mark.api10


def partner(client: httpx.Client, user: Account, partner_id: str) -> httpx.Response:
    return client.get(f"/api/v1/partners/{partner_id}", headers=user.headers, timeout=8)


def test_a_well_formed_upstream_partner_profile_is_relayed(client: httpx.Client, user: Account) -> None:
    response = partner(client, user, "acme")

    assert response.status_code == 200
    assert response.json() == {
        "id": "acme",
        "name": "Acme Logistics",
        "website": "https://acme.example.test",
        "discountPercent": 5,
    }


def test_an_upstream_error_is_not_relayed_as_a_successful_response(client: httpx.Client, user: Account) -> None:
    assert partner(client, user, "unknown-partner").status_code == 404


def test_upstream_data_failing_validation_is_not_relayed_to_clients(client: httpx.Client, user: Account) -> None:
    response = partner(client, user, "tampered")

    assert response.status_code == 502
    assert "onerror" not in response.text
    assert "javascript:" not in response.text


def test_upstream_redirects_are_not_followed(client: httpx.Client, user: Account) -> None:
    response = partner(client, user, "redirect")

    assert response.status_code == 502
    assert "jwtSecret" not in response.text


def test_oversized_upstream_responses_are_refused(client: httpx.Client, user: Account) -> None:
    assert partner(client, user, "oversized").status_code == 502


def test_a_slow_upstream_is_cut_off_by_a_timeout(client: httpx.Client, user: Account) -> None:
    started = time.monotonic()

    try:
        status = partner(client, user, "slow").status_code
    except httpx.TimeoutException:
        status = None

    assert status == 504
    assert time.monotonic() - started < 5
