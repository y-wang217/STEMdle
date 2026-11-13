import copy
import unittest

from mathdle_validator import (
    UnsafeExpression, check_expression_safety, equivalent, safe_eval, validate_candidate,
)


def base():
    return {
        "statement": "What is $\\frac{3}{4} + \\frac{5}{6}$?",
        "options": [
            {"tex": "$\\frac{19}{12}$", "value": "Rational(19,12)", "is_correct": True, "misconception": "", "rationale": "Common denominator 12.", "derivation": None},
            {"tex": "$\\frac{8}{10}$", "value": "Rational(8,10)", "is_correct": False, "misconception": "Added numerators and denominators", "rationale": "Adding across", "derivation": "Rational(3+5, 4+6)"},
            {"tex": "$\\frac{15}{24}$", "value": "Rational(15,24)", "is_correct": False, "misconception": "Multiplied instead of adding", "rationale": "Product", "derivation": "Rational(3,4)*Rational(5,6)"},
            {"tex": "$\\frac{8}{12}$", "value": "Rational(8,12)", "is_correct": False, "misconception": "Converted denominators but kept numerators", "rationale": "Forgot to scale numerators", "derivation": "Rational(3+5,12)"},
        ],
        "solution": "...", "key_insight": "...", "tags": [], "techniques": [],
        "estimated_difficulty": 1, "estimated_solve_seconds": 20,
        "verification": {"kind": "sympy", "expression": "Rational(3,4) + Rational(5,6)", "checks": [], "precision_dp": None, "notes": ""},
        "diagram": None, "template_id": None,
    }


def status_of(r, name):
    return [c["status"] for c in r["checks"] if c["name"] == name]


class TestValidator(unittest.TestCase):
    def test_valid_question_passes(self):
        r = validate_candidate(base())
        self.assertEqual(r["status"], "passed", r)
        self.assertIn("pass", status_of(r, "exactly_one_correct"))
        self.assertIn("pass", status_of(r, "tex_matches_value"))

    def test_wrong_declared_answer_fails(self):
        q = base()
        q["options"][0]["is_correct"] = False
        q["options"][1]["is_correct"] = True
        r = validate_candidate(q)
        self.assertEqual(r["status"], "failed")
        self.assertIn("fail", status_of(r, "exactly_one_correct"))

    def test_no_option_matches_truth(self):
        q = base()
        q["verification"]["expression"] = "Rational(3,4) - Rational(5,6)"
        self.assertEqual(validate_candidate(q)["status"], "failed")

    def test_equivalent_options_fail(self):
        q = base()
        q["options"][3]["value"] = "Rational(38,24)"
        q["options"][3]["tex"] = "$\\frac{38}{24}$"
        r = validate_candidate(q)
        self.assertEqual(r["status"], "failed")
        self.assertTrue(any(c["name"] in ("distinct_options", "exactly_one_correct") and c["status"] == "fail" for c in r["checks"]))

    def test_tex_value_mismatch_fails(self):
        q = base()
        q["options"][2]["tex"] = "$\\frac{5}{8}$"  # equals 15/24 -> still fine
        self.assertEqual(validate_candidate(q)["status"], "passed")
        q["options"][2]["tex"] = "$\\frac{5}{9}$"
        r = validate_candidate(q)
        self.assertEqual(r["status"], "failed")
        self.assertIn("fail", status_of(r, "tex_matches_value"))

    def test_bad_derivation_fails(self):
        q = base()
        q["options"][1]["derivation"] = "Rational(1,2)"
        self.assertIn("fail", status_of(validate_candidate(q), "distractor_derivation"))

    def test_missing_rationale_fails(self):
        q = base()
        q["options"][2]["misconception"] = ""
        self.assertEqual(validate_candidate(q)["status"], "failed")

    def test_ambiguous_multiple_solutions(self):
        q = base()
        q["verification"]["expression"] = "solve(x**2 - 5*x + 6, x)"
        q["options"][0]["value"] = "2"
        r = validate_candidate(q)
        self.assertIn("fail", status_of(r, "unique_answer"))

    def test_domain_check_fails(self):
        q = base()
        q["verification"]["checks"] = ["Rational(1,2) > 1"]
        self.assertEqual(validate_candidate(q)["status"], "failed")

    def test_manual_needs_review(self):
        q = base()
        q["verification"]["kind"] = "manual"
        q["verification"]["expression"] = ""
        self.assertEqual(validate_candidate(q)["status"], "needs_review")

    def test_precision(self):
        q = base()
        q["statement"] = "Find $\\sqrt{2}$ to 2 decimal places."
        q["verification"] = {"kind": "sympy", "expression": "sqrt(2)", "checks": [], "precision_dp": 2, "notes": ""}
        for o, v in zip(q["options"], ["1.41", "1.42", "1.40", "2.00"]):
            o["value"], o["tex"], o["derivation"] = v, f"${v}$", None
        # equivalence uses exact values, so rounded correct answer will not equal sqrt(2)
        r = validate_candidate(q)
        self.assertIn("pass", status_of(r, "precision"))

    def test_unsafe_expressions_rejected(self):
        for src in ["__import__('os').system('ls')", "().__class__", "open('x')", "x.__dict__",
                    "eval('1')", "lambda: 1", "9**9**9999", "x.func"]:
            with self.assertRaises(UnsafeExpression, msg=src):
                check_expression_safety(src)
        with self.assertRaises(UnsafeExpression):
            safe_eval("len(range(10**9))")

    def test_unsafe_in_candidate_fails(self):
        q = base()
        q["verification"]["expression"] = "__import__('os')"
        r = validate_candidate(q)
        self.assertEqual(r["status"], "failed")
        self.assertIn("fail", status_of(r, "expression_safety"))

    def test_unknown_symbol_in_verification_fails(self):
        q = base()
        q["verification"]["expression"] = "Rational(3,4) + Rational(5,6) + typo"
        r = validate_candidate(q)
        self.assertEqual(r["status"], "failed")

    def test_enumeration_expression(self):
        self.assertEqual(safe_eval("sum([d for d in range(1, 13) if 12 % d == 0])"), 28)
        self.assertEqual(safe_eval("1/3"), safe_eval("Rational(1,3)"))

    def test_equivalence(self):
        self.assertTrue(equivalent(safe_eval("sqrt(12)"), safe_eval("2*sqrt(3)")))
        self.assertTrue(equivalent(safe_eval("sin(pi/6)"), safe_eval("Rational(1,2)")))
        self.assertFalse(equivalent(safe_eval("sqrt(2)"), safe_eval("Rational(141,100)")))
        self.assertTrue(equivalent(safe_eval("FiniteSet(2,3)"), safe_eval("FiniteSet(3,2)")))

    def test_plot_grammar_matches_renderer(self):
        from mathdle_validator import plot_expr_to_sympy
        x = safe_eval("x")
        for src, val in [("x^2 - 4x + 3", 0), ("2(x+1)", 8), ("(x-1)(x+1)", 8), ("3x^2", 27), ("-x^2", -9)]:
            self.assertEqual(safe_eval(plot_expr_to_sympy(src)).subs(x, 3), val, src)

    def test_diagram_checks(self):
        q = base()
        q["diagram"] = {
            "type": "geometry", "x_min": -1, "x_max": 5, "y_min": -1, "y_max": 4, "axes": False, "grid": False,
            "to_scale": True, "essential": True, "alt_text": "right triangle",
            "elements": [
                {"kind": "point", "id": "A", "x": 0, "y": 0, "label": None, "show": True},
                {"kind": "point", "id": "B", "x": 4, "y": 0, "label": None, "show": True},
                {"kind": "point", "id": "C", "x": 0, "y": 3, "label": None, "show": True},
                {"kind": "segment", "from": "A", "to": "B", "label": "4", "length": 4, "dashed": False, "ticks": 0, "arrows": 0},
                {"kind": "segment", "from": "A", "to": "C", "label": "3", "length": 3, "dashed": False, "ticks": 0, "arrows": 0},
                {"kind": "angle", "a": "B", "vertex": "A", "b": "C", "label": None, "right": True, "measure_deg": 90},
            ],
        }
        self.assertEqual(validate_candidate(q)["status"], "passed")
        bad = copy.deepcopy(q)
        bad["diagram"]["elements"][4]["length"] = 5  # mislabelled
        self.assertEqual(validate_candidate(bad)["status"], "failed")
        bad2 = copy.deepcopy(q)
        bad2["diagram"]["elements"].append({"kind": "segment", "from": "A", "to": "Z", "label": None, "length": None, "dashed": False, "ticks": 0, "arrows": 0})
        self.assertEqual(validate_candidate(bad2)["status"], "failed")
        bad3 = copy.deepcopy(q)
        bad3["diagram"]["to_scale"] = False
        self.assertEqual(validate_candidate(bad3)["status"], "failed")


if __name__ == "__main__":
    unittest.main()
