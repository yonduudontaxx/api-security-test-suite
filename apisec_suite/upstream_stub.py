"""Hostile upstream used by the API7 and API10 tests: tampered data, redirects, oversized and slow responses."""

import argparse
import json
import re
import threading
import time
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlsplit

SLOW_RESPONSE_SECONDS = 10


def _partner(partner_id: str, name: str, website: str, discount: int, **extra: Any) -> dict[str, Any]:
    return {"id": partner_id, "name": name, "website": website, "discountPercent": discount, **extra}


class UpstreamHandler(BaseHTTPRequestHandler):
    api_origin = "http://127.0.0.1:3000"

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _json(self, body: object, status: int = 200) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _redirect(self, location: str) -> None:
        self.send_response(302)
        self.send_header("location", location)
        self.send_header("content-length", "0")
        self.end_headers()

    def _partners(self) -> dict[str, Callable[[], None]]:
        return {
            "acme": lambda: self._json(_partner("acme", "Acme Logistics", "https://acme.example.test", 5)),
            "tampered": lambda: self._json(
                _partner(
                    "tampered",
                    "<img src=x onerror=alert(document.cookie)>",
                    "javascript:alert(1)",
                    250,
                    role="admin",
                )
            ),
            "redirect": lambda: self._redirect(f"{self.api_origin}/debug/config"),
            "oversized": lambda: self._json(
                _partner("oversized", "Bulk", "https://bulk.example.test", 1, blob="x" * (2 * 1024 * 1024))
            ),
            "slow": self._slow,
        }

    def _slow(self) -> None:
        time.sleep(SLOW_RESPONSE_SECONDS)
        self._json(_partner("slow", "Slow", "https://slow.example.test", 1))

    def do_GET(self) -> None:
        url = urlsplit(self.path)
        if url.path == "/health":
            return self._json({"status": "ok"})
        if url.path == "/files/report.txt":
            body = b"quarterly report: all systems nominal\n"
            self.send_response(200)
            self.send_header("content-type", "text/plain")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        if url.path == "/redirect":
            return self._redirect(parse_qs(url.query).get("to", ["/"])[0])
        match = re.fullmatch(r"/partners/([a-z0-9-]+)", url.path)
        handler = self._partners().get(match.group(1)) if match else None
        if handler:
            return handler()
        return self._json({"error": "not_found"}, status=404)


def build_server(port: int, api_origin: str) -> ThreadingHTTPServer:
    handler = type("ConfiguredUpstreamHandler", (UpstreamHandler,), {"api_origin": api_origin})
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True
    return server


def start_in_thread(port: int, api_origin: str) -> ThreadingHTTPServer:
    server = build_server(port, api_origin)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4010)
    parser.add_argument("--api-origin", default="http://127.0.0.1:3000")
    args = parser.parse_args()
    server = build_server(args.port, args.api_origin)
    print(f"Upstream stub on http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
