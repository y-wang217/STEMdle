"""CLI entry: reads JSON on stdin, writes JSON on stdout.
  python3 cli.py            -> SymPy validation batch
  python3 cli.py lean-export -> SymPy -> Lean term export batch
"""
import json
import sys

from mathdle_validator import validate_batch

if __name__ == "__main__":
    payload = json.load(sys.stdin)
    if len(sys.argv) > 1 and sys.argv[1] == "lean-export":
        from lean_export import export_batch

        json.dump(export_batch(payload), sys.stdout, ensure_ascii=False)
    else:
        json.dump(validate_batch(payload), sys.stdout)
