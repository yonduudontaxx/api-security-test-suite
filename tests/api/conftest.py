import math
import os
from collections.abc import Callable, Iterator
from contextlib import nullcontext
from typing import Any
from urllib.parse import urlsplit

import httpx
import pytest
from allure_commons.types import LabelType

from apisec_suite import CATEGORIES, CATEGORY_PROPERTY
from apisec_suite.client import SPRAY_FAILURES_PER_ADDRESS, Account, SourceAddressPool, create_user, login
from apisec_suite.settings import Settings, load_settings
from apisec_suite.stack import running_stack

CATEGORY_MARKERS = {key.lower(): key for key in CATEGORIES}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        categories = [CATEGORY_MARKERS[mark.name] for mark in item.iter_markers() if mark.name in CATEGORY_MARKERS]
        if len(categories) != 1:
            raise pytest.UsageError(f"{item.nodeid} needs exactly one OWASP category marker, found {categories}")
        item.user_properties.append((CATEGORY_PROPERTY, categories[0]))
        category = f"{categories[0]} {CATEGORIES[categories[0]]}"
        item.add_marker(pytest.mark.allure_label("OWASP API Security Top 10 (2023)", label_type=LabelType.EPIC))
        item.add_marker(pytest.mark.allure_label(category, label_type=LabelType.FEATURE))
        item.add_marker(pytest.mark.allure_label(category, label_type=LabelType.PARENT_SUITE))


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
def address_pool(client: httpx.Client, settings: Settings) -> SourceAddressPool:
    return SourceAddressPool(urlsplit(settings.base_url).hostname or "127.0.0.1", settings.api_port)


def _clients_from_new_addresses(pool: SourceAddressPool, settings: Settings, count: int) -> list[httpx.Client]:
    addresses = [pool.take() for _ in range(count)]
    return [
        httpx.Client(base_url=settings.base_url, timeout=10, transport=httpx.HTTPTransport(local_address=address))
        for address in addresses
    ]


@pytest.fixture
def client_from_new_address(address_pool: SourceAddressPool, settings: Settings) -> Iterator[httpx.Client]:
    [session] = _clients_from_new_addresses(address_pool, settings, 1)
    with session:
        yield session


@pytest.fixture
def account_ceiling_sprayers(address_pool: SourceAddressPool, settings: Settings) -> Iterator[list[httpx.Client]]:
    count = math.ceil(settings.account_failure_limit / SPRAY_FAILURES_PER_ADDRESS)
    sessions = _clients_from_new_addresses(address_pool, settings, count)
    yield sessions
    for session in sessions:
        session.close()


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
