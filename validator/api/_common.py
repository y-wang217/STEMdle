"""Shared helpers for the Vercel Python functions (files starting with _ are not routed)."""
import hmac
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

MAX_BODY = 2_000_000


def send(handler, code, obj):
    body = json.dumps(obj).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def authorized(handler) -> bool:
    token = os.environ.get("VALIDATOR_TOKEN", "")
    auth = handler.headers.get("Authorization", "")
    return bool(token) and hmac.compare_digest(auth, f"Bearer {token}")
