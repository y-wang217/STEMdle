"""Vercel Python function: POST /api/validate (same contract as validator/cli.py)."""
import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mathdle_validator import validate_batch  # noqa: E402

MAX_BODY = 2_000_000


def _send(h, code, obj):
    body = json.dumps(obj).encode()
    h.send_response(code)
    h.send_header("Content-Type", "application/json")
    h.send_header("Cache-Control", "no-store")
    h.send_header("Content-Length", str(len(body)))
    h.end_headers()
    h.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        token = os.environ.get("VALIDATOR_TOKEN", "")
        if not token or not hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {token}"):
            return _send(self, 401, {"error": "unauthorized"})
        n = int(self.headers.get("Content-Length", "0") or 0)
        if n <= 0 or n > MAX_BODY:
            return _send(self, 413, {"error": "bad body size"})
        try:
            payload = json.loads(self.rfile.read(n))
        except json.JSONDecodeError:
            return _send(self, 400, {"error": "invalid json"})
        _send(self, 200, validate_batch(payload))

    def do_GET(self):
        _send(self, 405, {"error": "use POST"})
