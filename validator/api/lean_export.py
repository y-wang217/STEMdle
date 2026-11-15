"""Vercel Python function: POST /api/lean_export (SymPy -> Lean term export)."""
import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lean_export import export_batch  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        token = os.environ.get("VALIDATOR_TOKEN", "")
        if not token or not hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {token}"):
            return self._send(401, {"error": "unauthorized"})
        n = int(self.headers.get("Content-Length", "0") or 0)
        if n <= 0 or n > 1_000_000:
            return self._send(413, {"error": "bad body size"})
        try:
            payload = json.loads(self.rfile.read(n))
        except json.JSONDecodeError:
            return self._send(400, {"error": "invalid json"})
        self._send(200, export_batch(payload))
