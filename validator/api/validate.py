"""Vercel Python function: POST /api/validate (same contract as validator/cli.py)."""
import json
from http.server import BaseHTTPRequestHandler

from _common import MAX_BODY, authorized, send  # noqa: E402
from mathdle_validator import validate_batch  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not authorized(self):
            return send(self, 401, {"error": "unauthorized"})
        n = int(self.headers.get("Content-Length", "0"))
        if n <= 0 or n > MAX_BODY:
            return send(self, 413, {"error": "bad body size"})
        try:
            payload = json.loads(self.rfile.read(n))
        except json.JSONDecodeError:
            return send(self, 400, {"error": "invalid json"})
        send(self, 200, validate_batch(payload))

    def do_GET(self):
        send(self, 405, {"error": "use POST"})
