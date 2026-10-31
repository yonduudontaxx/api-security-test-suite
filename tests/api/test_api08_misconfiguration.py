import re

import httpx
import pytest

from apisec_suite.client import Account
from apisec_suite.settings import Settings

pytestmark = pytest.mark.api8


def test_responses_carry_defensive_security_headers(client: httpx.Client, user: Account) -> None:
    headers = client.get("/api/v1/users/me", headers=user.headers).headers

    assert headers.get("x-content-type-options") == "nosniff"
    assert "no-store" in headers.get("cache-control", "")
    assert "frame-ancestors 'none'" in headers.get("content-security-policy", "")
    assert headers.get("x-frame-options") == "DENY"


def test_responses_do_not_disclose_server_technology_or_versions(client: httpx.Client) -> None:
    headers = client.get("/health").headers

    assert "x-powered-by" not in headers
    assert not re.search(r"\d", headers.get("server", ""))


def test_cors_does_not_trust_an_arbitrary_origin(client: httpx.Client) -> None:
    headers = client.get("/health", headers={"origin": "https://evil.example"}).headers

    assert "access-control-allow-origin" not in headers
    assert "access-control-allow-credentials" not in headers


def test_cors_preflight_from_the_allowlisted_origin_is_granted(client: httpx.Client, settings: Settings) -> None:
    response = client.options(
        "/api/v1/users/me",
        headers={"origin": settings.allowed_cors_origin, "access-control-request-method": "GET"},
    )

    assert response.status_code == 204
    assert response.headers.get("access-control-allow-origin") == settings.allowed_cors_origin


def test_malformed_json_produces_a_generic_error_without_internals(client: httpx.Client, user: Account) -> None:
    response = client.post(
        "/api/v1/orders",
        headers={**user.headers, "content-type": "application/json"},
        content=b'{"items": [',
    )

    assert response.status_code == 400
    assert "stack" not in response.text
    assert not re.search(r"node_modules|\.ts:\d+|at \w+ \(", response.text)


def test_unknown_routes_do_not_echo_the_request_back(client: httpx.Client) -> None:
    response = client.get("/api/v1/%3Cscript%3Ealert(1)%3C%2Fscript%3E")

    assert response.status_code == 404
    assert "<script>" not in response.text
