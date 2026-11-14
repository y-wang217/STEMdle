"""
Mathdle mathematical validation core (SymPy).

Input: a candidate question dict matching src/lib/schemas/question.ts.
Output: {"status": "passed"|"failed"|"needs_review", "checks": [...], "computed": {...}}

Design rules
------------
* A generator's prose solution is never trusted. The candidate must carry an
  independent SymPy `verification.expression` that is evaluated here and
  compared with every option value.
* All AI-supplied expressions pass an AST allow-list before evaluation and are
  evaluated with no Python builtins, inside a per-expression time limit.
* Anything that cannot be checked automatically yields `needs_review`, never
  `passed`.
"""
from __future__ import annotations

import ast
import math
import re
import signal
from contextlib import contextmanager
from typing import Any

import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    convert_xor,
)

EXPR_TIMEOUT_S = 6
MAX_EXPR_LEN = 2000

# ---------------------------------------------------------------- safe eval --

_SAFE_FUNCS = {
    # sympy constructors / functions
    "Rational", "Integer", "Float", "Symbol", "symbols", "sqrt", "cbrt", "root", "Abs", "sign",
    "sin", "cos", "tan", "cot", "sec", "csc", "asin", "acos", "atan", "atan2",
    "exp", "log", "ln", "floor", "ceiling", "factorial", "binomial", "gcd", "lcm",
    "Min", "Max", "Sum", "Product", "solve", "solveset", "nsolve", "simplify", "nsimplify",
    "expand", "factor", "trigsimp", "Eq", "Ne", "Lt", "Le", "Gt", "Ge", "And", "Or", "Not",
    "FiniteSet", "Interval", "Union", "Intersection", "Tuple", "Matrix", "Poly", "degree",
    "divisors", "divisor_count", "totient", "isprime", "primefactors", "factorint", "prime",
    "mod_inverse", "diff", "integrate", "limit", "Piecewise", "re", "im", "N", "pi", "E", "I",
    "oo", "Mod", "real_roots", "roots", "discriminant", "rad", "deg", "S", "Point", "Triangle",
    "Polygon", "Circle", "Segment", "Line", "atan2", "linsolve", "nroots", "Reals",
    # safe python builtins (re-exposed explicitly)
    "range", "len", "sum", "min", "max", "abs", "sorted", "list", "set", "tuple", "all", "any",
    "int", "round", "reversed", "enumerate", "zip", "str", "bool",
}
_SAFE_METHODS = {
    "subs", "evalf", "expand", "factor", "simplify", "rewrite", "is_integer", "is_positive",
    "is_negative", "is_real", "is_rational", "is_zero", "doit", "args", "coeff", "as_numer_denom",
    "free_symbols", "area", "perimeter", "distance", "length", "midpoint", "circumradius",
    "inradius", "angles", "is_prime", "lhs", "rhs", "count", "index", "p", "q", "x", "y",
    "radius", "center", "intersection", "real_roots", "all_coeffs", "is_finite_set", "sup", "inf",
}
_ALLOWED_NODES = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.Call, ast.Name, ast.Load,
    ast.Constant, ast.List, ast.Tuple, ast.Set, ast.ListComp, ast.SetComp, ast.GeneratorExp,
    ast.comprehension, ast.IfExp, ast.Subscript, ast.Slice, ast.Attribute, ast.keyword, ast.Store,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow, ast.USub, ast.UAdd,
    ast.Not, ast.And, ast.Or, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.BitXor, ast.Dict,
)
_SYMBOL_RE = re.compile(r"^[A-Za-z]{1,2}[0-9]?$|^(theta|alpha|beta|gamma|phi)$")


class UnsafeExpression(ValueError):
    pass


class EvalTimeout(Exception):
    pass


def check_expression_safety(src: str) -> set[str]:
    if not isinstance(src, str) or not src.strip():
        raise UnsafeExpression("empty expression")
    if len(src) > MAX_EXPR_LEN:
        raise UnsafeExpression("expression too long")
    if "__" in src:
        raise UnsafeExpression("dunder access is not allowed")
    try:
        tree = ast.parse(src.replace("^", "**"), mode="eval")
    except SyntaxError as e:
        raise UnsafeExpression(f"syntax error: {e.msg}")
    bound: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.comprehension):
            for t in ast.walk(node.target):
                if isinstance(t, ast.Name):
                    bound.add(t.id)
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise UnsafeExpression(f"disallowed syntax: {type(node).__name__}")
        if isinstance(node, ast.Attribute) and node.attr not in _SAFE_METHODS:
            raise UnsafeExpression(f"attribute '{node.attr}' is not allowed")
        if isinstance(node, ast.Name):
            n = node.id
            if n.startswith("_"):
                raise UnsafeExpression(f"name '{n}' is not allowed")
            if n in _SAFE_FUNCS or n in bound or _SYMBOL_RE.match(n):
                continue
            raise UnsafeExpression(f"name '{n}' is not allowed")
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            if isinstance(node.value, int) and abs(node.value) > 10**60:
                raise UnsafeExpression("integer literal too large")
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Pow):
            # guard against 9**9**9 style blowups
            r = node.right
            if isinstance(r, ast.Constant) and isinstance(r.value, (int, float)) and abs(r.value) > 4000:
                raise UnsafeExpression("exponent too large")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "range":
            for a in node.args:
                if isinstance(a, ast.Constant) and isinstance(a.value, int) and abs(a.value) > 2_000_000:
                    raise UnsafeExpression("range too large")
    return bound


def _capped_range(*args):
    r = range(*[int(a) for a in args])
    if len(r) > 2_000_000:
        raise UnsafeExpression("range too large")
    return r


def _namespace() -> dict[str, Any]:
    ns: dict[str, Any] = {}
    for name in _SAFE_FUNCS:
        if hasattr(sp, name):
            ns[name] = getattr(sp, name)
    ns.update({
        "ln": sp.log, "cbrt": sp.cbrt, "rad": sp.rad, "deg": sp.deg, "S": sp.S,
        "range": _capped_range, "len": len, "sum": sum, "min": min, "max": max, "abs": abs,
        "sorted": sorted, "list": list, "set": set, "tuple": tuple, "all": all, "any": any,
        "int": int, "round": round, "reversed": reversed, "enumerate": enumerate, "zip": zip,
        "str": str, "bool": bool,
        "divisor_count": sp.divisor_count, "totient": sp.totient, "isprime": sp.isprime,
        "primefactors": sp.primefactors, "factorint": sp.factorint, "prime": sp.prime,
        "divisors": sp.divisors, "mod_inverse": sp.mod_inverse,
        "Integer": sp.Integer, "Float": sp.Float, "Rational": sp.Rational, "Symbol": sp.Symbol,
    })
    for s in ["x", "y", "z", "t", "n", "k", "a", "b", "c", "m", "r", "theta"]:
        ns[s] = sp.Symbol(s)
    return ns


@contextmanager
def time_limit(seconds: int):
    import threading

    if threading.current_thread() is not threading.main_thread():
        # Signals only work on the main thread (some serverless runtimes use
        # worker threads); the platform's function timeout is the backstop.
        yield
        return

    def handler(signum, frame):
        raise EvalTimeout(f"evaluation exceeded {seconds}s")

    old = signal.signal(signal.SIGALRM, handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)


def safe_eval(src: str) -> Any:
    bound = check_expression_safety(src)
    ns = _namespace()
    local = dict(ns)
    for name in bound:  # keep comprehension variables as plain Python names
        local[name] = None
    with time_limit(EXPR_TIMEOUT_S):
        return parse_expr(
            src,
            local_dict=local,
            global_dict={"__builtins__": {}, **ns},
            transformations=standard_transformations + (convert_xor,),
            evaluate=True,
        )


# ------------------------------------------------------------- equivalence --

def _as_comparable(v: Any) -> Any:
    if isinstance(v, (list, tuple)) and not isinstance(v, sp.Tuple):
        return sp.Tuple(*[_as_comparable(e) for e in v])
    if isinstance(v, set):
        return sp.FiniteSet(*v)
    if isinstance(v, bool):
        return sp.true if v else sp.false
    if isinstance(v, (int, float)):
        return sp.nsimplify(v) if isinstance(v, float) else sp.Integer(v)
    return v


def equivalent(a: Any, b: Any) -> bool:
    a, b = _as_comparable(a), _as_comparable(b)
    with time_limit(EXPR_TIMEOUT_S):
        if isinstance(a, sp.Tuple) or isinstance(b, sp.Tuple):
            if not (isinstance(a, sp.Tuple) and isinstance(b, sp.Tuple)) or len(a) != len(b):
                return False
            return all(equivalent(x, y) for x, y in zip(a, b))
        if isinstance(a, sp.Set) or isinstance(b, sp.Set):
            if not (isinstance(a, sp.Set) and isinstance(b, sp.Set)):
                return False
            if isinstance(a, sp.FiniteSet) and isinstance(b, sp.FiniteSet):
                if len(a) != len(b):
                    return False
                return all(any(equivalent(x, y) for y in b.args) for x in a.args)
            return sp.simplify(a.symmetric_difference(b)) == sp.EmptySet
        boolish = (sp.logic.boolalg.BooleanAtom, sp.core.relational.Relational, sp.And, sp.Or, sp.Not)
        if isinstance(a, boolish) or isinstance(b, boolish):
            return bool(a == b)
        # Fast path: values that differ numerically by a clear margin are not equal,
        # so skip the (potentially very slow) symbolic simplification.
        try:
            na, nb = complex(sp.N(a, 30)), complex(sp.N(b, 30))
            if abs(na - nb) > 1e-9 * max(1.0, abs(na), abs(nb)):
                return False
        except Exception:
            pass
        try:
            diff = sp.simplify(a - b)
            if diff == 0:
                return True
        except Exception:
            pass
        try:
            d = sp.N(a - b, 60)
            if d.is_number:
                return abs(complex(d)) < 1e-40
        except Exception:
            pass
        return False


def numeric(v: Any) -> complex | None:
    try:
        n = complex(sp.N(_as_comparable(v), 30))
        if math.isfinite(n.real) and math.isfinite(n.imag):
            return n
    except Exception:
        return None
    return None


# ---------------------------------------------------------- TeX cross-check --

def tex_to_value(tex: str) -> Any:
    """Best-effort: parse an option's TeX to a SymPy value. Returns None if unsupported."""
    from sympy.parsing.latex import parse_latex

    s = tex.strip()
    m = re.fullmatch(r"\$+(.*?)\$+", s, flags=re.S)
    if m:
        s = m.group(1)
    elif "$" in s:
        return None  # mixed prose and math
    s = re.sub(r"\\(text|mathrm|textrm)\{[^}]*\}", "", s)
    s = re.sub(r"\^\{?\\circ\}?", "", s)
    s = s.replace("\\left", "").replace("\\right", "").replace("\\,", "").replace("\\!", "")
    s = s.replace("\\dfrac", "\\frac").replace("\\tfrac", "\\frac").replace("\\cdot", "*")
    s = s.replace("\\times", "*").replace("\\%", "")
    s = re.sub(r"\\pi\b", " P ", s)
    s = s.strip()
    if not s or "\\{" in s or "," in s or "\\le" in s or "\\ge" in s or "<" in s or ">" in s:
        return None
    if re.search(r"(^|[^\\a-zA-Z])[a-zA-OQ-Z]", s):
        return None  # contains a free variable other than our pi placeholder
    try:
        with time_limit(EXPR_TIMEOUT_S):
            v = parse_latex(s, backend="lark")
            return v.subs(sp.Symbol("P"), sp.pi)
    except Exception:
        return None


# ----------------------------------------------------------------- diagrams --

def _angle_deg(a, v, b) -> float:
    ax, ay = a[0] - v[0], a[1] - v[1]
    bx, by = b[0] - v[0], b[1] - v[1]
    na, nb = math.hypot(ax, ay), math.hypot(bx, by)
    if na == 0 or nb == 0:
        return float("nan")
    c = max(-1.0, min(1.0, (ax * bx + ay * by) / (na * nb)))
    return math.degrees(math.acos(c))


def plot_expr_to_sympy(src: str) -> str:
    """Normalize the diagram plot grammar (see src/lib/math/expr.ts) to SymPy syntax:
    implicit multiplication (2x, 3(x+1), )(), ln, pi."""
    s = src.replace("^", "**")
    s = re.sub(r"(\d)\s*([A-Za-z(])", r"\1*\2", s)
    s = re.sub(r"\)\s*([A-Za-z\d(])", r")*\1", s)
    s = re.sub(r"\bx\s*\(", "x*(", s)
    return s


def check_diagram(d: dict) -> list[dict]:
    out: list[dict] = []

    def add(name, status, detail):
        out.append({"name": name, "status": status, "detail": detail})

    pts: dict[str, tuple[float, float]] = {}
    for el in d.get("elements", []):
        if el.get("kind") == "point":
            if el["id"] in pts:
                add("diagram_ids", "fail", f"duplicate point id {el['id']}")
            if not (math.isfinite(el["x"]) and math.isfinite(el["y"])):
                add("diagram_coords", "fail", f"non-finite coordinates for {el['id']}")
            pts[el["id"]] = (float(el["x"]), float(el["y"]))
    if not (d["x_min"] < d["x_max"] and d["y_min"] < d["y_max"]):
        add("diagram_bbox", "fail", "bounding box is empty or inverted")
    for pid, (x, y) in pts.items():
        if not (d["x_min"] <= x <= d["x_max"] and d["y_min"] <= y <= d["y_max"]):
            add("diagram_bbox", "warn", f"point {pid} lies outside the visible window")

    refs = []
    for el in d.get("elements", []):
        k = el.get("kind")
        if k == "segment":
            refs += [el["from"], el["to"]]
        elif k == "line":
            refs += el["through"]
        elif k == "polygon":
            refs += el["vertices"]
        elif k == "circle":
            refs += [el["center"]] + ([el["through"]] if el.get("through") else []) + el.get("points_on", [])
        elif k == "arc":
            refs += [el["center"], el["from"], el["to"]]
        elif k == "angle":
            refs += [el["a"], el["vertex"], el["b"]]
    missing = sorted({r for r in refs if r not in pts})
    if missing:
        add("diagram_refs", "fail", f"elements reference undefined points: {', '.join(missing)}")
        return out
    add("diagram_refs", "pass", f"{len(pts)} points, all references resolve")

    to_scale = bool(d.get("to_scale"))
    if d.get("essential") and not to_scale:
        add("diagram_essential", "fail", "an essential diagram must be an accurate (to_scale) construction")

    # lengths: all declared lengths must share one scale factor
    ratios = []
    for el in d.get("elements", []):
        if el.get("kind") == "segment" and el.get("length") is not None:
            a, b = pts[el["from"]], pts[el["to"]]
            actual = math.dist(a, b)
            if el["length"] <= 0:
                add("diagram_lengths", "fail", f"segment {el['from']}{el['to']} has non-positive length")
            else:
                ratios.append((f"{el['from']}{el['to']}", actual / el["length"]))
    if to_scale and ratios:
        base = ratios[0][1]
        bad = [n for n, r in ratios if abs(r - base) / base > 0.02]
        if bad:
            add("diagram_lengths", "fail", f"labelled lengths not drawn to a common scale: {', '.join(bad)}")
        else:
            add("diagram_lengths", "pass", f"{len(ratios)} labelled lengths consistent")

    for el in d.get("elements", []):
        if el.get("kind") != "angle":
            continue
        name = f"∠{el['a']}{el['vertex']}{el['b']}"
        ang = _angle_deg(pts[el["a"]], pts[el["vertex"]], pts[el["b"]])
        if el.get("right") and abs(ang - 90) > 1.0:
            add("diagram_angles", "fail" if to_scale else "warn", f"{name} is marked right but measures {ang:.1f}°")
        if el.get("measure_deg") is not None and to_scale and abs(ang - el["measure_deg"]) > 1.5:
            add("diagram_angles", "fail", f"{name} is labelled {el['measure_deg']}° but measures {ang:.1f}°")

    for el in d.get("elements", []):
        if el.get("kind") != "circle":
            continue
        c = pts[el["center"]]
        r = el.get("radius")
        if r is None and el.get("through"):
            r = math.dist(c, pts[el["through"]])
        if r is None:
            add("diagram_circles", "fail", f"circle at {el['center']} has neither radius nor through-point")
            continue
        for p in el.get("points_on", []):
            if abs(math.dist(c, pts[p]) - r) > 0.02 * max(r, 1e-9):
                add("diagram_circles", "fail" if to_scale else "warn", f"point {p} is claimed on circle {el['center']} but is not")

    x = sp.Symbol("x")
    for el in d.get("elements", []):
        if el.get("kind") != "function":
            continue
        try:
            f = safe_eval(plot_expr_to_sympy(el["expr"]))
            bad = 0
            for i in range(21):
                xv = el["x_min"] + (el["x_max"] - el["x_min"]) * i / 20
                val = numeric(f.subs(x, xv)) if hasattr(f, "subs") else numeric(f)
                if val is None or abs(val.imag) > 1e-9:
                    bad += 1
            if bad > 2:
                add("diagram_functions", "fail", f"function '{el['expr']}' is undefined on much of its plotted domain")
        except Exception as e:  # noqa: BLE001
            add("diagram_functions", "fail", f"function '{el['expr']}' could not be parsed: {e}")

    if not any(c["name"].startswith("diagram") and c["status"] == "fail" for c in out):
        add("diagram_consistency", "pass", "diagram geometry consistent with its labels")
    return out


# --------------------------------------------------------------- validator --

def validate_candidate(q: dict) -> dict:
    checks: list[dict] = []
    computed: dict[str, Any] = {}

    def add(name, status, detail=""):
        checks.append({"name": name, "status": status, "detail": detail})

    options = q.get("options", [])
    ver = q.get("verification", {})

    if len(options) != 4:
        add("four_options", "fail", f"expected 4 options, got {len(options)}")
    declared = [i for i, o in enumerate(options) if o.get("is_correct")]
    if len(declared) != 1:
        add("one_declared_correct", "fail", f"{len(declared)} options are marked correct")

    manual = ver.get("kind") == "manual"

    # Parse option values
    values: list[Any] = []
    for i, o in enumerate(options):
        src = (o.get("value") or "").strip()
        if not src:
            values.append(None)
            if not manual:
                add("option_values", "fail", f"option {i + 1} has no machine-checkable value")
            continue
        try:
            values.append(safe_eval(src))
        except UnsafeExpression as e:
            values.append(None)
            add("expression_safety", "fail", f"option {i + 1} value rejected: {e}")
        except Exception as e:  # noqa: BLE001
            values.append(None)
            add("option_values", "fail", f"option {i + 1} value '{src}' failed to evaluate: {type(e).__name__}: {e}")

    # Independent verification
    truth = None
    if manual:
        add("independent_verification", "warn", "verification marked manual: requires explicit mathematical review")
    else:
        try:
            truth = safe_eval(ver.get("expression", ""))
            if isinstance(truth, (list, tuple)) and len(truth) == 1:
                truth = truth[0]
            if isinstance(truth, dict):
                raise ValueError("verification returned a dict; select the requested quantity explicitly")
            if isinstance(truth, (list, tuple, sp.FiniteSet)) and len(truth) > 1 and not any(
                isinstance(v, (sp.Tuple, sp.FiniteSet, list, tuple, set)) for v in values if v is not None
            ):
                add(
                    "unique_answer",
                    "fail",
                    f"verification produced {len(truth)} candidate answers ({truth}); the question is ambiguous or a domain restriction is missing",
                )
                truth = None
            elif getattr(truth, "free_symbols", None) and not any(getattr(v, "free_symbols", None) for v in values if v is not None):
                add("independent_verification", "fail", f"verification still contains unknown symbols {sorted(map(str, truth.free_symbols))} (typo or unsolved variable?)")
                truth = None
            else:
                computed["verified_answer"] = sp.sstr(truth)
                add("independent_verification", "pass", f"SymPy computes {sp.sstr(truth)}")
        except UnsafeExpression as e:
            add("expression_safety", "fail", f"verification expression rejected: {e}")
        except Exception as e:  # noqa: BLE001
            add("independent_verification", "fail", f"verification failed to evaluate: {type(e).__name__}: {e}")

    # Exactly one option equals the verified answer, and it is the declared one
    if truth is not None and all(v is not None for v in values) and len(values) == 4:
        matches = []
        for i, v in enumerate(values):
            try:
                if equivalent(v, truth):
                    matches.append(i)
            except Exception:  # noqa: BLE001
                pass
        if len(matches) == 0:
            add("exactly_one_correct", "fail", "no option equals the independently verified answer")
        elif len(matches) > 1:
            add("exactly_one_correct", "fail", f"options {[m + 1 for m in matches]} all equal the verified answer")
        elif declared and matches[0] != declared[0]:
            add("exactly_one_correct", "fail", f"declared correct option {declared[0] + 1} but option {matches[0] + 1} equals the verified answer")
        else:
            add("exactly_one_correct", "pass", f"option {matches[0] + 1} is the unique verified answer")

    # Distinct options
    if all(v is not None for v in values) and len(values) == 4:
        dupes = []
        for i in range(4):
            for j in range(i + 1, 4):
                try:
                    if equivalent(values[i], values[j]):
                        dupes.append((i + 1, j + 1))
                except Exception:  # noqa: BLE001
                    pass
        if dupes:
            add("distinct_options", "fail", f"mathematically equivalent options: {dupes}")
        else:
            add("distinct_options", "pass", "all four options are mathematically distinct")
        nums = [numeric(v) for v in values]
        if all(n is not None for n in nums):
            close = [(i + 1, j + 1) for i in range(4) for j in range(i + 1, 4)
                     if abs(nums[i] - nums[j]) < 1e-6 * max(1.0, abs(nums[i]))]
            if close:
                add("distinct_options", "fail", f"options numerically indistinguishable: {close}")
            if any(abs(n.imag) > 1e-12 for n in nums):
                add("real_values", "warn", "an option has a non-real value")

    # TeX ↔ value cross-check
    tex_ok, tex_skipped = 0, 0
    for i, (o, v) in enumerate(zip(options, values)):
        if v is None:
            continue
        tv = tex_to_value(o.get("tex", ""))
        if tv is None:
            tex_skipped += 1
            continue
        try:
            if equivalent(tv, v):
                tex_ok += 1
            else:
                add("tex_matches_value", "fail", f"option {i + 1} displays {o.get('tex')} but its value is {sp.sstr(v)}")
        except Exception:  # noqa: BLE001
            tex_skipped += 1
    if not any(c["name"] == "tex_matches_value" and c["status"] == "fail" for c in checks):
        if tex_ok:
            add("tex_matches_value", "pass", f"{tex_ok} option(s) cross-checked TeX vs value" + (f", {tex_skipped} not parseable" if tex_skipped else ""))
        elif values and any(v is not None for v in values):
            add("tex_matches_value", "warn", "option TeX could not be machine-parsed; displayed answers not cross-checked")

    # Precision / rounding
    dp = ver.get("precision_dp")
    if dp is not None and truth is not None:
        tn = numeric(truth)
        if tn is not None:
            rounded = round(tn.real, dp)
            ok = any(numeric(v) is not None and abs(numeric(v).real - rounded) < 10 ** (-dp - 3) for v in values if v is not None)
            add("precision", "pass" if ok else "fail", f"true value {tn.real:.10g} rounds to {rounded} at {dp} dp")
            stmt = q.get("statement", "").lower()
            if not any(w in stmt for w in ["nearest", "decimal", "round", "approximately"]):
                add("precision", "fail", "answers are rounded but the statement does not say how")
    elif truth is not None:
        for i, o in enumerate(options):
            if re.search(r"\d\.\d", o.get("tex", "")) and not re.search(r"\d\.\d", q.get("statement", "")):
                add("precision", "warn", f"option {i + 1} shows a decimal but precision_dp is not set")
                break

    # Extra checks (domain restrictions, uniqueness, extraneous roots)
    for src in ver.get("checks", []) or []:
        try:
            r = safe_eval(src)
            truthy = bool(r) if not isinstance(r, sp.Basic) else (r == sp.true or (r.is_number and r != 0))
            add("domain_checks", "pass" if truthy else "fail", f"{src} → {sp.sstr(r)}")
        except UnsafeExpression as e:
            add("expression_safety", "fail", f"check '{src}' rejected: {e}")
        except Exception as e:  # noqa: BLE001
            add("domain_checks", "fail", f"check '{src}' failed: {type(e).__name__}: {e}")

    # Distractor rationale + trap derivations
    for i, (o, v) in enumerate(zip(options, values)):
        if o.get("is_correct"):
            continue
        if not (o.get("misconception") or "").strip() or not (o.get("rationale") or "").strip():
            add("distractor_rationale", "fail", f"option {i + 1} is missing its misconception/rationale")
            continue
        der = o.get("derivation")
        if not der:
            add("distractor_derivation", "warn", f"option {i + 1} has no derivation reproducing the trap")
            continue
        try:
            dv = safe_eval(der)
            if v is not None and equivalent(dv, v):
                add("distractor_derivation", "pass", f"option {i + 1}: mistaken path reproduces {sp.sstr(v)}")
            else:
                add("distractor_derivation", "fail", f"option {i + 1}: derivation gives {sp.sstr(dv)}, not the option value")
        except UnsafeExpression as e:
            add("expression_safety", "fail", f"option {i + 1} derivation rejected: {e}")
        except Exception as e:  # noqa: BLE001
            add("distractor_derivation", "warn", f"option {i + 1}: derivation failed to evaluate ({type(e).__name__})")

    # Diagram
    if q.get("diagram"):
        try:
            checks.extend(check_diagram(q["diagram"]))
        except Exception as e:  # noqa: BLE001
            add("diagram_consistency", "fail", f"diagram check crashed: {type(e).__name__}: {e}")

    if any(c["status"] == "fail" for c in checks):
        status = "failed"
    elif manual:
        status = "needs_review"
    elif q.get("diagram") and q["diagram"].get("essential") and not any(
        c["name"] == "diagram_consistency" and c["status"] == "pass" for c in checks
    ):
        status = "needs_review"
    else:
        status = "passed"
    return {"status": status, "checks": checks, "computed": computed}


def validate_batch(payload: dict) -> dict:
    results = []
    for item in payload.get("questions", []):
        try:
            r = validate_candidate(item["candidate"])
        except Exception as e:  # noqa: BLE001
            r = {"status": "failed", "checks": [{"name": "validator_error", "status": "fail", "detail": f"{type(e).__name__}: {e}"}], "computed": {}}
        r["id"] = item.get("id")
        results.append(r)
    return {"results": results, "engine": f"sympy-{sp.__version__}"}
