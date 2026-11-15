"""
Deterministic SymPy -> Lean 4 term export for Mathdle's formal-verification path.

The expression is parsed WITHOUT evaluation, so `Rational(3,4) + Rational(5,6)`
becomes `((3 : ℚ) / 4 + (5 : ℚ) / 6)` and Lean must do the arithmetic itself.
Only closed terms (no free variables) built from supported operations are
exported; anything else returns ok=False with a reason, and the pipeline falls
back to the AI formalizer or marks the question unsupported.
"""
from __future__ import annotations

from typing import Any

import sympy as sp
from sympy.parsing.sympy_parser import convert_xor, parse_expr, standard_transformations

from mathdle_validator import UnsafeExpression, _namespace, check_expression_safety, time_limit

RANK = {"ℤ": 0, "ℚ": 1, "ℝ": 2}


class Unsupported(Exception):
    pass


def _parse(src: str) -> Any:
    bound = check_expression_safety(src)
    ns = _namespace()
    # parse_expr(evaluate=False) emits Add/Mul/Pow(...) calls in generated code
    # (the user text itself already passed the AST allow-list above).
    ns.update({"Add": sp.Add, "Mul": sp.Mul, "Pow": sp.Pow})
    # Keep every function unevaluated so the exported claim still contains the
    # computation (otherwise Mod(7**2026, 10) would collapse to the literal 9).
    def lazy(f):
        return lambda *a, **_kw: f(*a, evaluate=False)
    for name, f in {"Mod": sp.Mod, "Max": sp.Max, "Min": sp.Min, "Abs": sp.Abs, "floor": sp.floor, "ceiling": sp.ceiling,
                    "factorial": sp.factorial, "binomial": sp.binomial, "sin": sp.sin, "cos": sp.cos, "tan": sp.tan,
                    "log": sp.log, "ln": sp.log, "exp": sp.exp}.items():
        ns[name] = lazy(f)
    ns["sqrt"] = lambda a, **_kw: sp.Pow(a, sp.Rational(1, 2), evaluate=False)
    local = dict(ns)
    for name in bound:
        local[name] = None
    with time_limit(6):
        return parse_expr(
            src,
            local_dict=local,
            global_dict={"__builtins__": {}, **ns},
            transformations=standard_transformations + (convert_xor,),
            evaluate=False,
        )


def required_type(e: Any) -> str:
    """Smallest of ℤ ⊂ ℚ ⊂ ℝ in which the term can be stated faithfully."""
    t = "ℤ"
    for node in sp.preorder_traversal(e):
        if isinstance(node, sp.Symbol):
            raise Unsupported(f"free variable {node} (only closed terms are exported)")
        if node in (sp.pi, sp.E) or isinstance(node, (sp.sin, sp.cos, sp.tan, sp.log, sp.exp, sp.asin, sp.acos, sp.atan)):
            t = "ℝ"
        elif isinstance(node, sp.Pow) and not (node.exp.is_Integer and node.exp >= 0):
            if node.exp.is_Integer:
                t = max(t, "ℚ", key=RANK.get)
            elif node.exp == sp.Rational(1, 2):
                t = "ℝ"
            else:
                raise Unsupported(f"non-integer exponent {node.exp}")
        elif isinstance(node, sp.Rational) and not node.is_Integer:
            t = max(t, "ℚ", key=RANK.get)
        elif isinstance(node, sp.Float):
            raise Unsupported("floating-point literal")
    return t


class LeanPrinter:
    def __init__(self, ty: str):
        self.ty = ty

    def lit(self, n: int) -> str:
        return f"({n} : {self.ty})" if n >= 0 else f"(-{-n} : {self.ty})"

    def p(self, e: Any) -> str:  # noqa: C901
        ty = self.ty
        if e is sp.pi:
            return "Real.pi"
        if e is sp.E:
            return "(Real.exp 1)"
        if isinstance(e, sp.Integer):
            return self.lit(int(e))
        if isinstance(e, sp.Rational):
            if ty == "ℤ":
                raise Unsupported("fraction in an integer term")
            return f"({self.lit(int(e.p))} / {int(e.q)})"
        if isinstance(e, sp.Add):
            return "(" + " + ".join(self.p(a) for a in e.args) + ")"
        if isinstance(e, sp.Mul) and e.args and e.args[0] == -1 and len(e.args) > 1:
            rest = sp.Mul(*e.args[1:], evaluate=False)
            return f"(-{self.p(rest)})"
        if isinstance(e, sp.Mul):
            num, den = [], []
            for a in e.args:
                if isinstance(a, sp.Pow) and a.exp.is_Integer and a.exp < 0:
                    den.append(self.p(a.base) if a.exp == -1 else f"{self.p(a.base)} ^ {int(-a.exp)}")
                else:
                    num.append(self.p(a))
            n = " * ".join(num) if num else self.lit(1)
            if not den:
                return f"({n})"
            if ty == "ℤ":
                raise Unsupported("division in an integer term (Lean's ℤ division truncates)")
            return f"(({n}) / ({' * '.join(den)}))"
        if isinstance(e, sp.Pow):
            b, x = e.base, e.exp
            if x.is_Integer and x >= 0:
                return f"({self.p(b)} ^ {int(x)})"
            if x.is_Integer and x < 0:
                if ty == "ℤ":
                    raise Unsupported("negative power in an integer term")
                return f"(1 / {self.p(b)} ^ {int(-x)})"
            if x == sp.Rational(1, 2):
                return f"(Real.sqrt {self.p(b)})"
            raise Unsupported(f"exponent {x}")
        if isinstance(e, sp.Mod):
            if ty != "ℤ":
                raise Unsupported("Mod outside integers")
            return f"({self.p(e.args[0])} % {self.p(e.args[1])})"
        if isinstance(e, (sp.Max, sp.Min)):
            fn = "max" if isinstance(e, sp.Max) else "min"
            args = [self.p(a) for a in e.args]
            out = args[-1]
            for a in reversed(args[:-1]):
                out = f"({fn} {a} {out})"
            return out
        if isinstance(e, sp.Abs):
            return f"|{self.p(e.args[0])}|"
        if isinstance(e, sp.floor):
            return f"(⌊{self.p(e.args[0])}⌋ : {ty})" if ty != "ℤ" else f"⌊{self.p(e.args[0])}⌋"
        if isinstance(e, sp.ceiling):
            return f"(⌈{self.p(e.args[0])}⌉ : {ty})" if ty != "ℤ" else f"⌈{self.p(e.args[0])}⌉"
        if isinstance(e, sp.factorial):
            a = e.args[0]
            if not a.is_Integer or a < 0:
                raise Unsupported("factorial of a non-literal")
            return f"((Nat.factorial {int(a)} : ℕ) : {ty})"
        if isinstance(e, sp.binomial):
            a, b = e.args
            if not (a.is_Integer and b.is_Integer and a >= 0 and b >= 0):
                raise Unsupported("binomial of non-literals")
            return f"((Nat.choose {int(a)} {int(b)} : ℕ) : {ty})"
        fnmap = {sp.sin: "Real.sin", sp.cos: "Real.cos", sp.tan: "Real.tan", sp.log: "Real.log", sp.exp: "Real.exp"}
        for cls, name in fnmap.items():
            if isinstance(e, cls):
                return f"({name} {self.p(e.args[0])})"
        raise Unsupported(f"unsupported construct {type(e).__name__}")


def export(expression: str, option_values: list[str]) -> dict:
    """Export the verification expression and the four option values to Lean terms of one common type."""
    try:
        expr = _parse(expression)
        opts = [_parse(v) for v in option_values]
        if isinstance(expr, (list, tuple, sp.Tuple, sp.Set, dict)):
            raise Unsupported("expression is not a single number")
        types = [required_type(expr)] + [required_type(o) for o in opts]
        ty = max(types, key=RANK.get)
        if ty == "ℤ" and any(isinstance(n, sp.Mod) for n in sp.preorder_traversal(expr)):
            pass  # integer % is fine in ℤ
        elif any(isinstance(n, sp.Mod) for n in sp.preorder_traversal(expr)):
            raise Unsupported("Mod mixed with non-integer values")
        pr = LeanPrinter(ty)
        return {"ok": True, "type": ty, "expression": pr.p(expr), "options": [pr.p(o) for o in opts]}
    except (Unsupported, UnsafeExpression) as e:
        return {"ok": False, "reason": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "reason": f"{type(e).__name__}: {e}"}


def export_batch(payload: dict) -> dict:
    return {"results": [{"id": it.get("id"), **export(it.get("expression", ""), it.get("options", []))} for it in payload.get("items", [])]}
