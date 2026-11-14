"""Vercel Python function: GET /api/health."""
from http.server import BaseHTTPRequestHandler

from _common import send  # noqa: E402
import sympy  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        send(self, 200, {"ok": True, "engine": f"sympy-{sympy.__version__}"})
