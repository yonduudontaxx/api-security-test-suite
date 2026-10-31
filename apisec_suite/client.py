"""Request helpers shared by the category test modules."""

import base64
import json
import socket
import time
import uuid
from dataclasses import dataclass
from typing import Any

import httpx
import jwt


@dataclass(frozen=True)
class Account:
    id: str
    username: str
    password: str
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return bearer(self.token)


def _local_ipv4_addresses() -> list[str]:
    try:
        return [str(info[4][0]) for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)]
    except OSError:
        return []


def _reaches(source: str, target: tuple[str, int]) -> bool:
    try:
        with socket.create_connection(target, timeout=1, source_address=(source, 0)):
            return True
    except OSError:
        return False


def alternate_source_addresses(host: str, port: int) -> list[str]:
    candidates = dict.fromkeys(["127.0.0.2", "127.0.0.3", *_local_ipv4_addresses()])
    reachable = [address for address in candidates if address != host and _reaches(address, (host, port))]
    if not reachable:
        raise RuntimeError(f"No source address other than {host} can reach {host}:{port} to simulate a second client")
    return reachable[:2]


def bearer(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


def login(client: httpx.Client, username: str, password: str) -> str:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, f"login as {username}: {response.status_code} {response.text}"
    token: str = response.json()["token"]
    return token


def create_user(client: httpx.Client, prefix: str = "user") -> Account:
    username = f"{prefix}-{uuid.uuid4().hex[:8]}"
    password = f"Pw-{uuid.uuid4()}"
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": f"{username}@example.test", "password": password},
    )
    assert response.status_code == 201, f"register {username}: {response.status_code} {response.text}"
    return Account(response.json()["id"], username, password, login(client, username, password))


def create_order(client: httpx.Client, user: Account, items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    response = client.post(
        "/api/v1/orders",
        headers=user.headers,
        json={"items": items or [{"sku": "SKU-BOOK", "quantity": 2}]},
    )
    assert response.status_code == 201, response.text
    order: dict[str, Any] = response.json()
    return order


def now() -> int:
    return int(time.time())


def claims(sub: str, role: str = "user", issued: int | None = None, ttl: int = 600) -> dict[str, Any]:
    iat = now() if issued is None else issued
    return {"sub": sub, "role": role, "iat": iat, "exp": iat + ttl}


def sign_hs256(payload: dict[str, Any], key: str) -> str:
    return jwt.encode(payload, key, algorithm="HS256")


def unsigned_token(payload: dict[str, Any], alg: str = "none") -> str:
    if alg == "none":
        return jwt.encode(payload, None, algorithm="none")

    def segment(value: dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b"=").decode()

    return f"{segment({'alg': alg, 'typ': 'JWT'})}.{segment(payload)}."
