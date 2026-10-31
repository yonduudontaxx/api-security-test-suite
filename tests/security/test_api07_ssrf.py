from urllib.parse import quote

import httpx
import pytest

from apisec_suite.client import Account
from apisec_suite.settings import Settings

pytestmark = pytest.mark.api7

IMPORT = "/api/v1/files/import"


BLOCKED_TARGETS = {
    "cloud-metadata": "http://169.254.169.254/latest/meta-data/",
    "api-loopback": "http://127.0.0.1:{api_port}/health",
    "localhost-hostname": "http://localhost:{api_port}/health",
    "ipv6-loopback": "http://[::1]:{api_port}/health",
    "decimal-loopback": "http://2130706433:{api_port}/health",
    "file-scheme": "file:///etc/passwd",
    "credentials-in-allowed-origin": "http://admin:secret@{upstream_host}/files/report.txt",
}


def test_a_file_on_the_allowlisted_file_service_can_be_imported(
    client: httpx.Client, user: Account, settings: Settings
) -> None:
    response = client.post(IMPORT, headers=user.headers, json={"url": f"{settings.upstream_url}/files/report.txt"})

    assert response.status_code == 201
    assert "quarterly report" in response.json()["preview"]


@pytest.mark.parametrize("target", list(BLOCKED_TARGETS))
def test_import_from_a_disallowed_destination_is_refused(
    client: httpx.Client, user: Account, settings: Settings, target: str
) -> None:
    url = BLOCKED_TARGETS[target].format(api_port=settings.api_port, upstream_host=settings.upstream_host)

    response = client.post(IMPORT, headers=user.headers, json={"url": url})

    assert response.status_code == 400
    assert response.json()["error"] == "url_not_allowed"


def test_a_redirect_from_an_allowlisted_origin_to_an_internal_address_is_not_followed(
    client: httpx.Client, user: Account, settings: Settings
) -> None:
    internal = f"{settings.base_url}/health"

    response = client.post(
        IMPORT, headers=user.headers, json={"url": f"{settings.upstream_url}/redirect?to={quote(internal, safe='')}"}
    )

    assert response.status_code == 400
    assert '"status"' not in response.text
