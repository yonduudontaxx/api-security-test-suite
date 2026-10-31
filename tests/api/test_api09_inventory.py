import re
from typing import Any

import httpx
import pytest

pytestmark = pytest.mark.api9

HTTP_METHODS = {"get", "post", "put", "patch", "delete"}
PUBLIC_PATHS = {"/health", "/openapi.json"}
SHADOW_PATHS = [
    "/debug/config",
    "/debug/routes",
    "/debug/env",
    "/actuator/env",
    "/.env",
    "/internal/metrics",
    "/swagger.json",
    "/api/swagger.json",
]
SHADOW_VERSIONS = ["v0", "v2", "beta", "internal"]


@pytest.fixture(scope="module")
def spec(client: httpx.Client) -> dict[str, Any]:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    document: dict[str, Any] = response.json()
    return document


def concrete(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "00000000-0000-4000-8000-000000000000", path)


def test_every_documented_operation_is_served(client: httpx.Client, spec: dict[str, Any]) -> None:
    missing = [
        f"{method.upper()} {path}"
        for path, operations in spec["paths"].items()
        for method in operations
        if method in HTTP_METHODS and client.request(method.upper(), concrete(path)).status_code == 404
    ]

    assert missing == []


def test_every_non_public_operation_declares_bearer_security(spec: dict[str, Any]) -> None:
    unprotected = [
        f"{method.upper()} {path}"
        for path, operations in spec["paths"].items()
        for method, operation in operations.items()
        if path not in PUBLIC_PATHS
        and not path.startswith("/api/v1/auth/")
        and not operation.get("security", spec.get("security", []))
    ]

    assert unprotected == []


def test_undocumented_api_versions_are_not_served(client: httpx.Client, spec: dict[str, Any]) -> None:
    documented = [path.removeprefix("/api/v1") for path in spec["paths"] if path.startswith("/api/v1/")]
    resources = sorted({candidate for path in documented for candidate in (path, path.rsplit("/", 1)[0]) if candidate})

    exposed: list[str] = []
    for resource in resources:
        for version in SHADOW_VERSIONS:
            shadow = concrete(f"/api/{version}{resource}")
            status = client.get(shadow).status_code
            if status != 404:
                exposed.append(f"{shadow} -> {status}")

    assert exposed == []


def test_debug_and_framework_endpoints_are_not_exposed(client: httpx.Client) -> None:
    exposed = [f"{path} -> {status}" for path in SHADOW_PATHS if (status := client.get(path).status_code) != 404]

    assert exposed == []
