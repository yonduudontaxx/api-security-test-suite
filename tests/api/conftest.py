import os
from collections.abc import Callable, Iterator
from contextlib import nullcontext
from typing import Any
from urllib.parse import urlsplit

import httpx
import pytest

from apisec_suite import CATEGORIES, CATEGORY_PROPERTY
from apisec_suite.client import Account, alternate_source_addresses, create_user, login
from apisec_suite.settings import Settings, load_settings
from apisec_suite.stack import running_stack

CATEGORY_MARKERS = {key.lower(): key for key in CATEGORIES}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        categories = [CATEGORY_MARKERS[mark.name] for mark in item.iter_markers() if mark.name in CATEGORY_MARKERS]
        if len(categories) != 1:
            raise pytest.UsageError(f"{item.nodeid} needs exactly one OWASP category marker, found {categories}")
        item.user_properties.append((CATEGORY_PROPERTY, categories[0]))


def pytest_html_report_title(report: Any) -> None:
    report.title = f"OWASP API Top 10 suite ({os.environ.get('SECURITY_MODE', 'hardened')} target)"


@pytest.fixture(scope="session")
def settings() -> Settings:
    return load_settings()


@pytest.fixture(scope="session")
def client(settings: Settings) -> Iterator[httpx.Client]:
    target = running_stack(settings) if settings.launch_stack else nullcontext()
    with target, httpx.Client(base_url=settings.base_url, timeout=10) as session:
        yield session


@pytest.fixture(scope="session")
def client_from(settings: Settings) -> Iterator[Callable[[str], httpx.Client]]:
    opened: list[httpx.Client] = []

    def factory(address: str) -> httpx.Client:
        transport = httpx.HTTPTransport(local_address=address)
        session = httpx.Client(base_url=settings.base_url, timeout=10, transport=transport)
        opened.append(session)
        return session

    yield factory
    for session in opened:
        session.close()


@pytest.fixture(scope="session")
def other_addresses(client: httpx.Client, settings: Settings) -> list[str]:
    return alternate_source_addresses(urlsplit(settings.base_url).hostname or "127.0.0.1", settings.api_port)


@pytest.fixture
def new_user(client: httpx.Client) -> Callable[..., Account]:
    def factory(prefix: str = "user") -> Account:
        return create_user(client, prefix)

    return factory


@pytest.fixture
def user(new_user: Callable[..., Account]) -> Account:
    return new_user()


@pytest.fixture
def admin_token(client: httpx.Client, settings: Settings) -> str:
    return login(client, "admin", settings.admin_password)
