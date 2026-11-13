"""CLI entry: reads a batch JSON on stdin, writes results JSON on stdout."""
import json
import sys

from mathdle_validator import validate_batch

if __name__ == "__main__":
    payload = json.load(sys.stdin)
    json.dump(validate_batch(payload), sys.stdout)
