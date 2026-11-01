import pytest

from apisec_suite.client import Account, bearer

TOKEN = "eyJ.secret-token-value.sig"


@pytest.mark.parametrize("key", ["authorization", "Authorization", "AUTHORIZATION"])
def test_authorization_headers_mask_the_token_whatever_the_key_case(key: str) -> None:
    account = Account("1", "user", "password", TOKEN)
    headers = account.headers_with({key: f"Bearer {TOKEN}", "x-extra": "visible"})

    text = repr(headers)

    assert f"'{key}': '***'" in text
    assert "'x-extra': 'visible'" in text
    assert TOKEN not in text
    assert headers[key] == f"Bearer {TOKEN}"


def test_bearer_headers_mask_the_token() -> None:
    headers = bearer(TOKEN)

    assert repr(headers) == "{'authorization': '***'}"
    assert headers["authorization"] == f"Bearer {TOKEN}"
