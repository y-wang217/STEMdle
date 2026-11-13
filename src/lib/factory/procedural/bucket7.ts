/**
 * Bucket 7 — Euclid-style I (very hard; competition reasoning).
 * Each problem hides a structural shortcut; distractors come from named wrong paths.
 */
import {
  type ProceduralTemplate,
  RetryTemplate,
  assertDistinctNumbers,
  fracTex,
  level,
  options,
  sympyVerification,
} from "./types";
import { $, frac, polyTex, rat, reduce, surd } from "./bucket2";

const base = (slot = 7) => ({ slot, tags: ["euclid"], diagram: null });
type Q = [number, number];
const val = (q: Q) => q[0] / q[1];
const qmul = (a: Q, b: Q): Q => reduce(a[0] * b[0], a[1] * b[1]);
const qadd = (a: Q, b: Q): Q => reduce(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const qsub = (a: Q, b: Q): Q => qadd(a, [-b[0], b[1]]);
const qdiv = (a: Q, b: Q): Q => reduce(a[0] * b[1], a[1] * b[0]);
const sv = (q: Q) => (q[1] === 1 ? `${q[0]}` : `Rational(${q[0]},${q[1]})`);
const par = (s: string) => (s.startsWith("-") ? `\\left(${s}\\right)` : s);
/** TeX for the Gaussian integer p + qi. */
const cplx = (p: number, q: number) => {
  if (q === 0) return `${p}`;
  const qi = Math.abs(q) === 1 ? "i" : `${Math.abs(q)}i`;
  if (p === 0) return `${q < 0 ? "-" : ""}${qi}`;
  return `${p} ${q < 0 ? "-" : "+"} ${qi}`;
};
const argTex =(q: Q) => (q[1] === 1 ? `(${q[0]})` : `\\left(${frac(...q)}\\right)`);

// ---------------------------------------------------- functional equation ----

export const functionalSwap: ProceduralTemplate = {
  id: "b7.functional_swap",
  slot: 7,
  title: "Functional equation solved by a substitution swap",
  techniques: ["substitution x → 1/x or x → 1 − x", "solving a 2×2 linear system"],
  range: [7, 8],
  generate(rng, difficulty) {
    const t = level(difficulty, 7, 8);
    const form = t < 0.5 ? "recip" : rng.pick(["recip", "shift"] as const);
    const a = rng.pick([2, 3, -2, -3, 4]);
    const b = rng.pick([1, 2, 3, 4, 5, 6, -2, -3]);
    const c = form === "shift" && t > 0.6 ? rng.int(-4, 4) : 0;
    let k: Q;
    let kp: Q;
    let g: (q: Q) => Q;
    let gTex: string;
    let gPy: string;
    let swapTex: string;
    let domain: string;
    let partnerPy: string;
    if (form === "recip") {
      k = rng.pick([[2, 1], [3, 1], [4, 1], [5, 1], [-2, 1], [1, 2], [1, 3], [2, 3]] as Q[]);
      kp = reduce(k[1], k[0]);
      g = (q) => qmul([b, 1], q);
      gTex = polyTex([b, 0]);
      gPy = `${b}*x`;
      swapTex = "f\\left(\\frac{1}{x}\\right)";
      domain = "every nonzero real number $x$";
      partnerPy = `1/(${sv(k)})`;
    } else {
      k = rng.pick([[2, 1], [3, 1], [4, 1], [-1, 1], [-2, 1], [5, 1], [1, 3]] as Q[]);
      kp = qsub([1, 1], k);
      g = (q) => qadd(qmul([b, 1], qmul(q, q)), [c, 1]);
      gTex = polyTex([b, 0, c]);
      gPy = `${b}*x**2 + (${c})`;
      swapTex = "f(1 - x)";
      domain = "every real number $x$";
      partnerPy = `1 - (${sv(k)})`;
    }
    const den = a * a - 1;
    const u = qdiv(qsub(qmul([a, 1], g(kp)), g(k)), [den, 1]);
    const v = qdiv(qsub(qmul([a, 1], g(k)), g(kp)), [den, 1]);
    if (u[0] === 0 || g(k)[0] === 0 || g(kp)[0] === 0) throw new RetryTemplate("zero values make weak traps");
    const C = u;
    const D1 = qdiv(g(k), [1 + a, 1]);
    const D2: Q = [-u[0], u[1]];
    const D3 = v;
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    const eq = `f(x) ${a < 0 ? "-" : "+"} ${Math.abs(a) === 1 ? "" : Math.abs(a)}${swapTex} = ${gTex}`;
    const fk = `f${argTex(k)}`;
    const fkp = `f${argTex(kp)}`;
    const Gk = g(k);
    const Gkp = g(kp);
    const plain = (q: Q) => `f(${q[1] === 1 ? q[0] : `${q[0]}/${q[1]}`})`;
    return {
      ...base(),
      statement: `A function $f$ satisfies $$${eq}$$ for ${domain}. What is the value of $${fk}$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `Substituting $x = ${frac(...k)}$ and $x = ${frac(...kp)}$ gives two linear equations in $${fk}$ and $${fkp}$.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: `Assumed ${plain(kp)} = ${plain(k)} and solved one equation`,
          rationale: `With a single substitution there are two unknowns; treating them as equal gives $(1 + ${a})${fk} = ${frac(...Gk)}$, which is unjustified.`,
          derivation: `solve(Eq((1 + (${a}))*u, (${gPy}).subs(x, ${sv(k)})), u)[0]`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Subtracted the equations in the wrong order during elimination",
          rationale: "After scaling one equation, subtracting in the opposite order flips the sign of the result.",
          derivation: `((${gPy}).subs(x, ${sv(k)}) - (${a})*(${gPy}).subs(x, ${partnerPy}))/(${den})`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: `Solved the system correctly but reported the partner value ${plain(kp)}`,
          rationale: "The system has two unknowns; it is easy to box the wrong one.",
          derivation: `solve([Eq(u + (${a})*v, (${gPy}).subs(x, ${sv(k)})), Eq(v + (${a})*u, (${gPy}).subs(x, ${partnerPy}))], [u, v])[v]`,
        },
      ),
      solution: `Put $x = ${frac(...k)}$: $${fk} ${a < 0 ? "-" : "+"} ${Math.abs(a)}${fkp} = ${frac(...Gk)}$. Put $x = ${frac(...kp)}$: $${fkp} ${a < 0 ? "-" : "+"} ${Math.abs(a)}${fk} = ${frac(...Gkp)}$. Multiply the second equation by $${par(`${a}`)}$ and subtract the first: $\\left((${a})^2 - 1\\right)${fk} = ${par(`${a}`)} \\cdot ${par(frac(...Gkp))} - ${par(frac(...Gk))}$, so $${fk} = ${frac(...C)}$.`,
      key_insight: `The substitution ${form === "recip" ? "$x \\to \\frac{1}{x}$" : "$x \\to 1 - x$"} maps the equation to a partner equation; together they form a solvable linear system.`,
      techniques: this.techniques,
      estimated_difficulty: 7 + t,
      estimated_solve_seconds: Math.round(120 + 80 * t),
      verification: sympyVerification(
        `solve([Eq(u + (${a})*v, (${gPy}).subs(x, ${sv(k)})), Eq(v + (${a})*u, (${gPy}).subs(x, ${partnerPy}))], [u, v])[u]`,
        [],
        "u = f(k), v = f(partner of k); both equations come from substituting into the functional equation.",
      ),
      template_id: this.id,
    };
  },
};

// ------------------------------------------------------ root telescoping -----

export const rootTelescope: ProceduralTemplate = {
  id: "b7.root_telescope",
  slot: 7,
  title: "Telescoping sum of reciprocal root sums",
  techniques: ["rationalizing denominators", "telescoping"],
  range: [7, 8],
  generate(rng, difficulty) {
    const t = level(difficulty, 7, 8);
    const d = t < 0.45 ? 1 : rng.pick([1, 2, 2, 3]);
    const a = rng.int(1, 5);
    const b = rng.int(a + 3, 12);
    if ((b * b - a * a) % d !== 0) throw new RetryTemplate("range does not close");
    const A = a * a;
    const B = b * b - d;
    const N = (B - A) / d + 1;
    if (N < 4) throw new RetryTemplate("too few terms");
    const C = reduce(b - a, d);
    type O = { tex: string; value: string; num: number; misconception: string; rationale: string; derivation: string };
    let D: O[];
    if (d === 1) {
      const e = surd(1, 1, b * b - 1);
      const s = surd(1, 1, a * a + 1);
      D = [
        {
          tex: $(`${e.tex} - ${a}`),
          value: `sqrt(${b * b - 1}) - ${a}`,
          num: e.num - a,
          misconception: "Off by one at the top: stopped the telescoping at the last n instead of n + 1",
          rationale: `The last term contributes $\\sqrt{${B + 1}} - \\sqrt{${B}}$, so $\\sqrt{${B + 1}}$ survives, not $\\sqrt{${B}}$.`,
          derivation: `sqrt(${B}) - sqrt(${A})`,
        },
        {
          tex: $(`${a - b}`),
          value: `${a - b}`,
          num: a - b,
          misconception: "Rationalized with the sign reversed",
          rationale: "$\\frac{1}{\\sqrt{n} + \\sqrt{n+1}} = \\sqrt{n+1} - \\sqrt{n}$, which is positive.",
          derivation: `sum([sqrt(nn) - sqrt(nn + 1) for nn in range(${A}, ${B + 1})])`,
        },
        {
          tex: $(`${b} - ${s.tex}`),
          value: `${b} - sqrt(${a * a + 1})`,
          num: b - s.num,
          misconception: "Off by one at the bottom: cancelled the first term's √n as well",
          rationale: `Nothing cancels $-\\sqrt{${A}}$ from the first term, so it survives.`,
          derivation: `sqrt(${B + 1}) - sqrt(${A + 1})`,
        },
      ];
    } else {
      const e = surd(1, 1, b * b - d);
      D = [
        {
          tex: $(`${b - a}`),
          value: `${b - a}`,
          num: b - a,
          misconception: `Forgot to divide by ${d} when rationalizing`,
          rationale: `$(\\sqrt{n+${d}} + \\sqrt{n})(\\sqrt{n+${d}} - \\sqrt{n}) = ${d}$, not $1$.`,
          derivation: `sqrt(${B + d}) - sqrt(${A})`,
        },
        {
          tex: fracTex(a - b, d),
          value: rat(a - b, d),
          num: (a - b) / d,
          misconception: "Rationalized with the sign reversed",
          rationale: `Each term is positive, so the sum cannot be negative: $\\frac{1}{\\sqrt{n} + \\sqrt{n+${d}}} = \\frac{\\sqrt{n+${d}} - \\sqrt{n}}{${d}}$.`,
          derivation: `sum([(sqrt(nn) - sqrt(nn + ${d}))/${d} for nn in range(${A}, ${B + 1}, ${d})])`,
        },
        {
          tex: $(`\\frac{${e.tex} - ${a}}{${d}}`),
          value: `(sqrt(${b * b - d}) - ${a})/${d}`,
          num: (e.num - a) / d,
          misconception: "Off by one at the top: kept √(last n) instead of √(last n + step)",
          rationale: `The last term contributes $\\sqrt{${B + d}} - \\sqrt{${B}}$, so $\\sqrt{${B + d}}$ survives.`,
          derivation: `(sqrt(${B}) - sqrt(${A}))/${d}`,
        },
      ];
    }
    assertDistinctNumbers(val(C), ...D.map((o) => o.num));
    const term = (n: number) => `\\frac{1}{\\sqrt{${n}} + \\sqrt{${n + d}}}`;
    const sumTex = `${term(A)} + ${term(A + d)} + ${term(A + 2 * d)} + \\cdots + ${term(B)}`;
    return {
      ...base(),
      statement: `Evaluate $$${sumTex}$$${d === 1 ? "" : ` where the numbers under the square roots increase by $${d}$ from each term to the next.`}`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `Rationalize each term to $\\frac{\\sqrt{n+${d}} - \\sqrt{n}}{${d}}$; everything cancels except $\\frac{\\sqrt{${B + d}} - \\sqrt{${A}}}{${d}}$.` },
        D[0],
        D[1],
        D[2],
      ),
      solution:
        d === 1
          ? `Multiply each term by its conjugate: $\\frac{1}{\\sqrt{n} + \\sqrt{n+1}} = \\frac{\\sqrt{n+1} - \\sqrt{n}}{(n + 1) - n} = \\sqrt{n+1} - \\sqrt{n}$. Summing over $n = ${A}, ${A + 1}, \\ldots, ${B}$, each $\\sqrt{n+1}$ cancels the $-\\sqrt{n}$ of the next term, leaving $\\sqrt{${B + 1}} - \\sqrt{${A}} = ${b} - ${a} = ${frac(...C)}$.`
          : `Multiply each term by its conjugate: $\\frac{1}{\\sqrt{n} + \\sqrt{n+${d}}} = \\frac{\\sqrt{n+${d}} - \\sqrt{n}}{(n + ${d}) - n} = \\frac{\\sqrt{n+${d}} - \\sqrt{n}}{${d}}$. Summing over $n = ${A}, ${A + d}, \\ldots, ${B}$, each $\\sqrt{n+${d}}$ cancels the $-\\sqrt{n}$ of the next term, leaving $\\frac{\\sqrt{${B + d}} - \\sqrt{${A}}}{${d}} = \\frac{${b} - ${a}}{${d}} = ${frac(...C)}$.`,
      key_insight: "Rationalizing turns each term into a difference of consecutive square roots, so the sum telescopes.",
      techniques: this.techniques,
      estimated_difficulty: 7 + t,
      estimated_solve_seconds: Math.round(100 + 60 * t),
      verification: sympyVerification(
        `nsimplify(N(sum([1/(sqrt(nn) + sqrt(nn + ${d})) for nn in range(${A}, ${B + 1}, ${d})]), 60), tolerance=Rational(1, 10**40))`,
        [],
        `The ${N} terms are summed numerically to 60 digits from the definition, then identified exactly.`,
      ),
      template_id: this.id,
    };
  },
};

// ------------------------------------------------------ cubic, Vieta -----

export const cubicSymmetric: ProceduralTemplate = {
  id: "b7.cubic_symmetric",
  slot: 7,
  title: "Symmetric product of the roots of a cubic",
  techniques: ["Vieta's formulas", "evaluating the polynomial at a clever point"],
  range: [7.5, 8.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 7.5, 8.5);
    const variant = t < 0.5 ? "pairsums" : rng.pick(["pairsums", "squaresplus1"] as const);
    const a = rng.pick([1, 2, 3, 4, 5, 6, 7, -2, -3]);
    const b = rng.int(-6, 9);
    const c = rng.pick([-9, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 9]);
    const P = (x: number) => x ** 3 - a * x * x + b * x - c;
    for (let dv = 1; dv <= Math.abs(c); dv++) if (Math.abs(c) % dv === 0 && (P(dv) === 0 || P(-dv) === 0)) throw new RetryTemplate("has an integer root");
    const poly = polyTex([1, -a, b, -c]);
    const Ppy = `x**3 - (${a})*x**2 + (${b})*x - (${c})`;
    let ask: string;
    let C: number, D1: number, D2: number, D3: number;
    let opts: [string, string, string, string, string, string];
    let ders: [string, string, string];
    let sol: string;
    let ver: string;
    if (variant === "pairsums") {
      ask = "(r + s)(s + t)(t + r)";
      C = a * b - c;
      D1 = c - a * b;
      D2 = a * b;
      D3 = a * b + c;
      opts = [
        "Sign slip: wrote (a − r)(a − s)(a − t) as −P(a)",
        "$P(x) = (x - r)(x - s)(x - t)$, so $(a - r)(a - s)(a - t) = P(a)$ exactly, with no extra sign for a monic cubic.",
        "Used (r + s)(s + t)(t + r) = (r + s + t)(rs + st + tr), dropping the −rst term",
        "The full identity is $(r+s)(s+t)(t+r) = (r+s+t)(rs+st+tr) - rst$.",
        "Added rst instead of subtracting it",
        "Expanding gives $(r+s+t)(rs+st+tr) - rst$; the sign of $rst$ is easy to flip.",
      ];
      ders = [`-((${a})**3 - (${a})*(${a})**2 + (${b})*(${a}) - (${c}))`, `(${a})*(${b})`, `(${a})*(${b}) + (${c})`];
      sol = `By Vieta, $r + s + t = ${a}$, $rs + st + tr = ${b}$, $rst = ${c}$. Since $r + s = ${a} - t$ and so on, the product is $(${a} - r)(${a} - s)(${a} - t) = P(${a})$ where $P(x) = (x - r)(x - s)(x - t) = ${poly}$. So the answer is $P(${a}) = ${a}^3 - ${a} \\cdot ${a}^2 + (${b})(${a}) - (${c}) = ${C}$.`;
      ver = `[int(round(re((R[0] + R[1])*(R[1] + R[2])*(R[2] + R[0])))) for R in [nroots(${Ppy}, n=30)]][0]`;
    } else {
      ask = "(r^2 + 1)(s^2 + 1)(t^2 + 1)";
      C = (a - c) ** 2 + (b - 1) ** 2;
      D1 = a * a + b * b + c * c + 1;
      D2 = (a - c) ** 2 - (b - 1) ** 2;
      D3 = (a - c) ** 2 + (b + 1) ** 2;
      opts = [
        "Expanded and used Σr² = a², Σr²s² = b² (dropped the −2b and −2ac corrections)",
        "$r^2 + s^2 + t^2 = (r+s+t)^2 - 2(rs+st+tr)$ and $\\sum r^2s^2 = (rs+st+tr)^2 - 2rst(r+s+t)$; both need corrections.",
        "Multiplied P(i)·P(−i) as if (p + qi)(p − qi) = p² − q²",
        "For a complex number, $(p + qi)(p - qi) = p^2 + q^2$ because $i^2 = -1$.",
        "Took i³ = i when evaluating P(i)",
        "$i^3 = i^2 \\cdot i = -i$.",
      ];
      ders = [`(${c})**2 + (${b})**2 + (${a})**2 + 1`, `(${a} - (${c}))**2 - (${b} - 1)**2`, `re((I + (${b})*I - (${a})*I**2 - (${c}))*(-I - (${b})*I - (${a})*I**2 - (${c})))`];
      sol = `Factor $r^2 + 1 = (r - i)(r + i)$. Since $P(x) = (x - r)(x - s)(x - t)$, we get $(r - i)(s - i)(t - i) = -P(i)$ and $(r + i)(s + i)(t + i) = -P(-i)$, so the product is $P(i)P(-i) = |P(i)|^2$. Now $P(i) = i^3 - (${a})i^2 + (${b})i - (${c}) = -i + ${a} + (${b})i - (${c}) = ${cplx(a - c, b - 1)}$, giving $(${a - c})^2 + (${b - 1})^2 = ${C}$.`;
      ver = `[int(round(re((R[0]**2 + 1)*(R[1]**2 + 1)*(R[2]**2 + 1)))) for R in [nroots(${Ppy}, n=30)]][0]`;
    }
    assertDistinctNumbers(C, D1, D2, D3);
    return {
      ...base(),
      statement: `The equation $${poly} = 0$ has roots $r$, $s$ and $t$. What is the value of $${ask}$?`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: variant === "pairsums" ? "Write $r + s = a - t$ and recognise the product as $P(a)$." : "Factor over the complex numbers and recognise the product as $P(i)P(-i)$." },
        { tex: `$${D1}$`, value: `${D1}`, misconception: opts[0], rationale: opts[1], derivation: ders[0] },
        { tex: `$${D2}$`, value: `${D2}`, misconception: opts[2], rationale: opts[3], derivation: ders[1] },
        { tex: `$${D3}$`, value: `${D3}`, misconception: opts[4], rationale: opts[5], derivation: ders[2] },
      ),
      solution: sol,
      key_insight: variant === "pairsums" ? "$r + s = (r + s + t) - t$, so the product is the polynomial evaluated at $r + s + t$." : "$r^2 + 1 = (r - i)(r + i)$, so the product is $|P(i)|^2$.",
      techniques: this.techniques,
      estimated_difficulty: variant === "pairsums" ? 7.5 + 0.5 * t : 8 + 0.5 * t,
      estimated_solve_seconds: Math.round(120 + 90 * t),
      verification: sympyVerification(
        ver,
        [`all([(${Ppy}).subs(x, e) != 0 and (${Ppy}).subs(x, -e) != 0 for e in divisors(${Math.abs(c)})])`],
        "Roots computed numerically (30 digits) and the product rounded; the check confirms there is no integer root to guess.",
      ),
      template_id: this.id,
    };
  },
};

// ------------------------------------------------------ log product ------

export const logProduct: ProceduralTemplate = {
  id: "b7.log_product",
  slot: 7,
  title: "Product of the solutions of a logarithmic equation",
  techniques: ["change of base", "substitution", "Vieta's formulas"],
  range: [7, 8],
  generate(rng, difficulty) {
    const t = level(difficulty, 7, 8);
    const cb = rng.pick([2, 3]);
    const alpha = t < 0.5 ? 1 : rng.pick([1, 2]);
    const beta = rng.pick([1, 2, 3]);
    const A = cb ** alpha;
    const B = cb ** beta;
    const k = rng.pick([1, 2, 3, -1, -2]);
    const m = rng.int(2, 6);
    if (alpha * m * m <= 4 * k * beta) throw new RetryTemplate("no real solutions");
    if (A === B && t > 0.5) throw new RetryTemplate("prefer different bases at higher difficulty");
    const P: Q = reduce(k * beta, alpha); // product of the roots in w = log_A x
    const C = A ** m;
    const D1 = m;
    const kb = k * beta;
    const D2: Q = kb >= 0 ? [cb ** kb, 1] : [1, cb ** -kb];
    const D3 = P;
    assertDistinctNumbers(C, D1, val(D2), val(D3));
    const cTex = C <= 100000 ? `${C}` : `${A}^{${m}}`;
    const kTerm = `${k < 0 ? "-" : "+"} ${Math.abs(k) === 1 ? "" : Math.abs(k)}\\log_{x} ${B}`;
    const eq = `\\log_{${A}} x ${kTerm} = ${m}`;
    const solveExpr = `solve(Eq(log(x, ${A}) + (${k})*log(${B}, x), ${m}), x)`;
    return {
      ...base(),
      statement: `What is the product of all real solutions $x$ of the equation $$${eq}?$$`,
      options: options(
        { tex: $(cTex), value: `Integer(${A})**${m}`, rationale: `With $w = \\log_{${A}} x$ the equation becomes a quadratic whose roots sum to $${m}$, so the product of the $x$-values is $${A}^{${m}}$.` },
        {
          tex: `$${D1}$`,
          value: `${D1}`,
          misconception: "Reported the sum of the logarithms instead of the product of the solutions",
          rationale: `The roots $w_1 + w_2 = ${m}$ are logarithms; the solutions are $x = ${A}^{w}$.`,
          derivation: `sum(solve(Eq(w + Rational(${k * beta}, ${alpha})/w, ${m}), w))`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Used the product of the w-roots as the exponent",
          rationale: `Multiplying $x_1 x_2 = ${A}^{w_1} \\cdot ${A}^{w_2}$ adds the exponents; it does not multiply them.`,
          derivation: `Integer(${A})**Rational(${P[0]}, ${P[1]})`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Stopped at the product of the roots of the quadratic in w",
          rationale: "Vieta's product $w_1 w_2$ multiplies the logarithms, not the solutions.",
          derivation: `[W[0]*W[1] for W in [solve(Eq(w + Rational(${k * beta}, ${alpha})/w, ${m}), w)]][0]`,
        },
      ),
      solution: `Let $w = \\log_{${A}} x$ (so $x > 0$, $x \\ne 1$, $w \\ne 0$). Then $\\log_x ${B} = \\frac{\\log_{${A}} ${B}}{\\log_{${A}} x} = \\frac{${frac(beta, alpha)}}{w}$, and the equation becomes $w ${k < 0 ? "-" : "+"} \\frac{${frac(Math.abs(k) * beta, alpha)}}{w} = ${m}$, i.e. $${polyTex([alpha, -alpha * m, k * beta], "w")} = 0$. Its discriminant is positive, so there are two real roots $w_1, w_2$ with $w_1 + w_2 = ${m}$. The solutions are $x_i = ${A}^{w_i}$, and their product is $${A}^{w_1 + w_2} = ${A}^{${m}} = ${C}$.`,
      key_insight: "After substituting $w = \\log x$, the product of the solutions is $A^{w_1 + w_2}$, and Vieta gives the sum of the roots without solving.",
      techniques: this.techniques,
      estimated_difficulty: 7 + t,
      estimated_solve_seconds: Math.round(110 + 80 * t),
      verification: sympyVerification(
        `[simplify(S[0]*S[1]) for S in [${solveExpr}]][0]`,
        [`len(${solveExpr}) == 2`, `all([s0.is_positive and s0 != 1 for s0 in ${solveExpr}])`],
        "SymPy solves the logarithmic equation directly; checks confirm exactly two admissible solutions.",
      ),
      template_id: this.id,
    };
  },
};

// ----------------------------------------------------- divisibility count ----

const RICH = [36, 48, 60, 72, 80, 84, 90, 96, 100, 108, 120, 144, 168, 180];
const divisorsOf = (n: number) => {
  const out: number[] = [];
  for (let d = 1; d <= n; d++) if (n % d === 0) out.push(d);
  return out;
};

export const divisibilityCount: ProceduralTemplate = {
  id: "b7.divisibility_count",
  slot: 7,
  title: "Counting n with (n² + k)/(n + d) an integer",
  techniques: ["polynomial remainder", "divisor counting"],
  range: [7, 8.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 7, 8.5);
    const M = rng.pick(t < 0.5 ? RICH.slice(0, 7) : RICH);
    const ds = divisorsOf(M).filter((d) => d >= 2 && d * d < M);
    const d = rng.pick(ds);
    const k = M - d * d;
    if (k === d * d) throw new RetryTemplate("degenerate sign trap");
    const divM = divisorsOf(M);
    const C = divM.filter((e) => e > d).length;
    const D1 = divM.length;
    const D2 = divM.filter((e) => e >= d).length;
    const D3 = divisorsOf(Math.abs(k - d * d)).filter((e) => e > d).length;
    assertDistinctNumbers(C, D1, D2, D3);
    return {
      ...base(),
      statement: `For how many positive integers $n$ is $\\dfrac{n^2 + ${k}}{n + ${d}}$ an integer?`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: `$n + ${d}$ must divide $${M}$ and exceed $${d}$.` },
        {
          tex: `$${D1}$`,
          value: `${D1}`,
          misconception: `Counted every divisor of ${M}, forgetting that n + ${d} > ${d}`,
          rationale: `Small divisors of $${M}$ would need $n \\le 0$.`,
          derivation: `divisor_count(${M})`,
        },
        {
          tex: `$${D2}$`,
          value: `${D2}`,
          misconception: `Allowed n = 0 (included the divisor n + ${d} = ${d})`,
          rationale: "$n$ must be a positive integer.",
          derivation: `len([e for e in divisors(${M}) if e >= ${d}])`,
        },
        {
          tex: `$${D3}$`,
          value: `${D3}`,
          misconception: `Sign error in the remainder: wrote n² + ${k} = (n + ${d})(n − ${d}) + (${k} − ${d * d})`,
          rationale: `$(n + ${d})(n - ${d}) = n^2 - ${d * d}$, so the remainder is $${k} + ${d * d} = ${M}$.`,
          derivation: `len([e for e in divisors(Abs(${k} - ${d * d})) if e > ${d}])`,
        },
      ),
      solution: `Divide: $n^2 + ${k} = (n + ${d})(n - ${d}) + ${M}$. So $n + ${d}$ divides $n^2 + ${k}$ exactly when it divides $${M}$. Since $n \\ge 1$, $n + ${d}$ is a divisor of $${M}$ greater than $${d}$. The divisors of $${M}$ greater than $${d}$ are $${divM.filter((e) => e > d).join(", ")}$, giving $${C}$ values of $n$.`,
      key_insight: `Replace $n$ by $-${d}$: the remainder of $n^2 + ${k}$ on division by $n + ${d}$ is the constant $${M}$, so only divisors of $${M}$ matter.`,
      techniques: this.techniques,
      estimated_difficulty: 7 + 1.5 * t,
      estimated_solve_seconds: Math.round(100 + 80 * t),
      verification: sympyVerification(`len([nn for nn in range(1, ${M + 1}) if Mod(nn**2 + ${k}, nn + ${d}) == 0])`, [], "Brute force over every n with n + d ≤ the largest possible divisor."),
      template_id: this.id,
    };
  },
};

export const bucket7Templates: ProceduralTemplate[] = [functionalSwap, rootTelescope, cubicSymmetric, logProduct, divisibilityCount];
