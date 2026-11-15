import unittest

from lean_export import export


class TestLeanExport(unittest.TestCase):
    def test_keeps_computation_unevaluated(self):
        r = export("Mod(Integer(7)**2026, 10)", ["9", "1", "3", "7"])
        self.assertTrue(r["ok"])
        self.assertEqual(r["type"], "ℤ")
        self.assertIn("^ 2026", r["expression"])  # not collapsed to 9
        r = export("Max(Integer(2)**50, Integer(3)**30)", ["Integer(2)**50", "Integer(3)**30", "1", "2"])
        self.assertIn("max", r["expression"])

    def test_types(self):
        self.assertEqual(export("Rational(3,4)+Rational(5,6)", ["1", "2", "3", "4"])["type"], "ℚ")
        self.assertEqual(export("sqrt(12)", ["2*sqrt(3)", "1", "2", "3"])["type"], "ℝ")
        self.assertEqual(export("12*3 - 5**2", ["11", "1", "2", "3"])["type"], "ℤ")

    def test_sum_product_not_pre_evaluated(self):
        r = export("Product(1 + 1/k, (k, 2, 9)).doit()", ["5", "10", "Rational(9,2)", "Rational(11,2)"])
        self.assertTrue(r["ok"], r)
        self.assertIn("∏ k ∈ Finset.Icc (2 : ℕ) 9", r["expression"])
        self.assertIn("(k : ℚ)", r["expression"])
        r = export("Sum(k**2, (k, 1, 10))", ["385", "1", "2", "3"])
        self.assertIn("∑ k ∈ Finset.Icc (1 : ℕ) 10", r["expression"])

    def test_bare_literal_is_not_a_claim(self):
        self.assertFalse(export("5", ["5", "1", "2", "3"])["ok"])
        self.assertFalse(export("Rational(19,12)", ["1", "2", "3", "4"])["ok"])

    def test_rejects_unexportable(self):
        for expr in ["solve(x**2-1, x)", "x + 1", "Sum(k, (k, 1, 1000))", "1.5 + 2"]:
            self.assertFalse(export(expr, ["1", "2", "3", "4"])["ok"], expr)

    def test_rejects_unsafe(self):
        self.assertFalse(export("__import__('os')", ["1", "2", "3", "4"])["ok"])


if __name__ == "__main__":
    unittest.main()
