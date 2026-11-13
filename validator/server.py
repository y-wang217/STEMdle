"""
Minimal HTTP wrapper for the validator (stdlib only), for deployments where the
Next.js runtime cannot spawn Python (e.g. Vercel). POST /validate with the same
JSON the CLI accepts. Requires header `Authorization: Bearer $VALIDATOR_TOKEN`.

    VALIDATOR_TOKEN=... python3 validator/server.py  # listens on $PORT (default 8787)
"""
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from mathdle_validator import validate_batch

TOKEN = os.environ.get("VALIDATOR_TOKEN", "")
MAX_BODY = 2_000_000


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/validate":
            return self._send(404, {"error": "not found"})
        auth = self.headers.get("Authorization", "")
        if not TOKEN or not hmac.compare_digest(auth, f"Bearer {TOKEN}"):
            return self._send(401, {"error": "unauthorized"})
        n = int(self.headers.get("Content-Length", "0"))
        if n <= 0 or n > MAX_BODY:
            return self._send(413, {"error": "bad body size"})
        try:
            payload = json.loads(self.rfile.read(n))
        except json.JSONDecodeError:
            return self._send(400, {"error": "invalid json"})
        self._send(200, validate_batch(payload))


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("VALIDATOR_TOKEN must be set")
    port = int(os.environ.get("PORT", "8787"))
    print(f"mathdle validator listening on :{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
