import os
import secrets
from dataclasses import dataclass
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    base_url: str
    upstream_url: str
    jwt_secret: str
    admin_password: str
    mode: str
    login_failure_limit: int = 20
    account_failure_limit: int = 50
    registration_limit: int = 500
    allowed_cors_origin: str = "https://app.example.test"
    launch_stack: bool = True

    @property
    def api_port(self) -> int:
        return urlsplit(self.base_url).port or 80

    @property
    def upstream_port(self) -> int:
        return urlsplit(self.upstream_url).port or 80

    @property
    def upstream_host(self) -> str:
        return urlsplit(self.upstream_url).netloc


def load_settings(env: dict[str, str] | None = None) -> Settings:
    source = dict(os.environ if env is None else env)
    external = "BASE_URL" in source
    if external and not ("JWT_SECRET" in source and "ADMIN_PASSWORD" in source):
        raise RuntimeError("BASE_URL points at an external target: set JWT_SECRET and ADMIN_PASSWORD to match it")
    return Settings(
        base_url=source.get("BASE_URL", "http://127.0.0.1:3000"),
        upstream_url=source.get("UPSTREAM_URL", "http://127.0.0.1:4010"),
        jwt_secret=source.get("JWT_SECRET", secrets.token_hex(32)),
        admin_password=source.get("ADMIN_PASSWORD", secrets.token_urlsafe(18)),
        mode=source.get("SECURITY_MODE", "hardened"),
        login_failure_limit=int(source.get("LOGIN_FAILURE_LIMIT_PER_MINUTE", "20")),
        account_failure_limit=int(source.get("ACCOUNT_FAILURE_LIMIT_PER_HOUR", "50")),
        registration_limit=int(source.get("REGISTRATION_LIMIT_PER_HOUR", "500")),
        launch_stack=not external,
    )
