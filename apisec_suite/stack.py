"""Starts the upstream stub and the TypeScript target API for a test session."""

import os
import signal
import subprocess
import tempfile
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import IO

import httpx

from apisec_suite.settings import Settings
from apisec_suite.upstream_stub import start_in_thread

REPO_ROOT = Path(__file__).resolve().parents[1]
STARTUP_TIMEOUT_SECONDS = 30


def _wait_for_health(url: str, process: subprocess.Popen[bytes], log: IO[bytes]) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if process.poll() is not None:
            log.seek(0)
            raise RuntimeError(f"Target API exited during startup:\n{log.read().decode()}")
        try:
            if httpx.get(f"{url}/health", timeout=1).status_code == 200:
                return
        except httpx.TransportError:
            pass
        time.sleep(0.25)
    raise RuntimeError(f"Target API did not become healthy at {url}")


@contextmanager
def running_stack(settings: Settings) -> Iterator[None]:
    upstream = start_in_thread(settings.upstream_port, settings.base_url)
    env = {
        **os.environ,
        "SECURITY_MODE": settings.mode,
        "PORT": str(settings.api_port),
        "JWT_SECRET": settings.jwt_secret,
        "ADMIN_PASSWORD": settings.admin_password,
        "UPSTREAM_URL": settings.upstream_url,
        "CORS_ALLOWED_ORIGINS": settings.allowed_cors_origin,
        "LOGIN_FAILURE_LIMIT_PER_MINUTE": str(settings.login_failure_limit),
    }
    try:
        with tempfile.TemporaryFile() as log:
            target = subprocess.Popen(
                ["npx", "tsx", "src/server.ts"],  # noqa: S607
                cwd=REPO_ROOT,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            try:
                _wait_for_health(settings.base_url, target, log)
                yield
            finally:
                os.killpg(target.pid, signal.SIGTERM)
                target.wait(timeout=10)
    finally:
        upstream.shutdown()
        upstream.server_close()
