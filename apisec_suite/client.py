"""Request helpers shared by the category test modules."""

import base64
import json
import socket
import threading
import time
import uuid
from collections.abc import Iterator
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


HOSTNAME_LOOKUP_TIMEOUT_SECONDS = 2
SPRAY_FAILURES_PER_ADDRESS = 4


def _local_ipv4_addresses() -> list[str]:
    found: list[str] = []

    def lookup() -> None:
        try:
            infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        except OSError:
            return
        found.extend(str(info[4][0]) for info in infos)

    worker = threading.Thread(target=lookup, daemon=True)
    worker.start()
    worker.join(HOSTNAME_LOOKUP_TIMEOUT_SECONDS)
    return [] if worker.is_alive() else found


def _reaches(source: str, target: tuple[str, int]) -> bool:
    try:
        with socket.create_connection(target, timeout=1, source_address=(source, 0)):
            return True
    except OSError:
        return False


class SourceAddressPool:
    def __init__(self, host: str, port: int) -> None:
        self._target = (host, port)
        self._loopback = (f"127.0.0.{n}" for n in range(2, 255))
        self._fallback: Iterator[str] | None = None
        self._issued: set[str] = {host}

    def _next_reachable(self, candidates: Iterator[str]) -> str | None:
        for address in candidates:
            if address not in self._issued and _reaches(address, self._target):
                self._issued.add(address)
                return address
        return None

    def take(self) -> str:
        address = self._next_reachable(self._loopback)
        if address is None:
            if self._fallback is None:
                self._fallback = iter(_local_ipv4_addresses())
            address = self._next_reachable(self._fallback)
        if address is not None:
            return address
        raise RuntimeError(
            f"Ran out of distinct source addresses that can reach {self._target[0]}:{self._target[1]}. "
            "Linux routes all of 127.0.0.0/8 to loopback; on macOS add aliases with "
            "`for n in $(seq 2 20); do sudo ifconfig lo0 alias 127.0.0.$n up; done` (see README)."
        )


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
    if response.status_code == 429:
        raise RuntimeError(
            "The target throttled the suite's own registrations. Set REGISTRATION_LIMIT_PER_HOUR on the target "
            "high enough for the suite's sign-ups from one address (the suite assumes 500)."
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
