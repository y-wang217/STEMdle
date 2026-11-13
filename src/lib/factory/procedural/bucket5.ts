/**
 * Bucket 5 — Trigonometry (medium; ratios, identities, exact values).
 * Every distractor is produced by a named wrong solving path.
 */
import {
  type ProceduralTemplate,
  RetryTemplate,
  assertDistinctNumbers,
  fracTex,
  gcd,
  level,
  options,
  sympyVerification,
} from "./types";
import { $, ang, diagram, frac, piTex, polyTex, pt, rat, reduce, seg, sqrtRat, sqrtSplit, surd } from "./bucket2";

const base = (slot = 5) => ({ slot, tags: ["trigonometry"] });
type Q = [number, number];
const val = (q: Q) => q[0] / q[1];
const qmul = (a: Q, b: Q): Q => reduce(a[0] * b[0], a[1] * b[1]);
const qadd = (a: Q, b: Q): Q => reduce(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const qneg = (a: Q): Q => [-a[0], a[1]];
const sv = (q: Q) => (q[1] === 1 ? `${q[0]}` : `Rational(${q[0]},${q[1]})`);

// ------------------------------------------------------------ quadrant ratio --

const TRIPLES: [number, number, number][] = [
  [3, 4, 5],
  [4, 3, 5],
  [5, 12, 13],
  [12, 5, 13],
  [8, 15, 17],
  [15, 8, 17],
  [7, 24, 25],
  [24, 7, 25],
];
const SURD_PAIRS: [number, number][] = [
  [1, 3],
  [2, 3],
  [1, 4],
  [3, 4],
  [2, 5],
  [1, 5],
];

export const quadrantTangent: ProceduralTemplate = {
  id: "b5.quadrant_tangent",
  slot: 5,
  title: "Tangent from sine or cosine in a given quadrant",
  techniques: ["reference triangle", "CAST signs"],
  range: [4.5, 5.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 4.5, 5.5);
    const quad = rng.pick([2, 3, 4]);
    const sx = quad === 4 ? 1 : -1;
    const sy = quad === 2 ? 1 : -1;
    const G = rng.pick(["sin", "cos"] as const);
    // |given| = u / r; the other leg is w (as coef·√rad)
    let u: number, r: number, wCoef: number, wRad: number;
    if (t > 0.5 && rng.bool(0.6)) {
      [u, r] = rng.pick(SURD_PAIRS);
      [wCoef, wRad] = sqrtSplit(r * r - u * u);
    } else {
      [u, , r] = rng.pick(TRIPLES);
      wCoef = Math.sqrt(r * r - u * u);
      wRad = 1;
    }
    // |y| and |x| as [coef, rad]
    const yAbs: Q = G === "sin" ? [u, 1] : [wCoef, wRad];
    const xAbs: Q = G === "sin" ? [wCoef, wRad] : [u, 1];
    const sT = sx * sy;
    const ratio = (n: Q, d: Q, s: number) => surd(s * n[0], d[0] * d[1], n[1] * d[1]);
    const C = ratio(yAbs, xAbs, sT);
    const D1 = ratio(yAbs, xAbs, -sT);
    const D2 = ratio(xAbs, yAbs, sT);
    const D3 = ratio(yAbs, [r, 1], sT);
    assertDistinctNumbers(C.num, D1.num, D2.num, D3.num);
    const gSign = G === "sin" ? sy : sx;
    const gTex = `${gSign < 0 ? "-" : ""}\\frac{${u}}{${r}}`;
    const gVal = `Rational(${gSign * u},${r})`;
    const lo = 90 * (quad - 1);
    const other = G === "sin" ? "cos" : "sin";
    const otherSign = G === "sin" ? sx : sy;
    const wTex = wRad === 1 ? `${wCoef}` : `${wCoef === 1 ? "" : wCoef}\\sqrt{${wRad}}`;
    const quadSigns = `In quadrant ${["", "I", "II", "III", "IV"][quad]}, $x ${sx > 0 ? ">" : "<"} 0$ and $y ${sy > 0 ? ">" : "<"} 0$`;
    return {
      ...base(),
      diagram: null,
      statement: `If $\\${G}\\theta = ${gTex}$ and $${lo}^\\circ < \\theta < ${lo + 90}^\\circ$, what is $\\tan\\theta$?`,
      options: options(
        { tex: $(C.tex), value: C.value, rationale: `Reference triangle with sides ${u}, $${wTex}$, ${r}; tangent is ${sT > 0 ? "positive" : "negative"} in quadrant ${["", "I", "II", "III", "IV"][quad]}.` },
        {
          tex: $(D1.tex),
          value: D1.value,
          misconception: sT < 0 ? "Ignored the quadrant and gave the acute-angle (positive) value" : "Assumed tan must be negative because the given ratio is negative",
          rationale: sT < 0 ? "The size is right, but tangent is negative in this quadrant." : "In quadrant III both sine and cosine are negative, so their quotient is positive.",
          derivation: `${-sT}*tan(a${G}(Rational(${u},${r})))`,
        },
        {
          tex: $(D2.tex),
          value: D2.value,
          misconception: "Computed adjacent over opposite (the cotangent)",
          rationale: "Tangent is opposite over adjacent; swapping them gives $\\cot\\theta$.",
          derivation: `1/(${C.value})`,
        },
        {
          tex: $(D3.tex),
          value: D3.value,
          misconception: "Divided by the hypotenuse instead of the adjacent side",
          rationale: `Opposite over hypotenuse is $\\sin\\theta$ (in size), not $\\tan\\theta$.`,
          derivation: `${sT}*${yAbs[0]}*sqrt(${yAbs[1]})/${r}`,
        },
      ),
      solution: `Draw the reference triangle: hypotenuse ${r}, one leg ${u}, so the other leg is $\\sqrt{${r}^2 - ${u}^2} = ${wTex}$. ${quadSigns}, so $\\${other}\\theta$ is ${otherSign > 0 ? "positive" : "negative"}. With $x = ${sx < 0 ? "-" : ""}${G === "sin" ? wTex : u}$ and $y = ${sy < 0 ? "-" : ""}${G === "sin" ? u : wTex}$, $\\tan\\theta = \\frac{y}{x} = ${C.tex}$.`,
      key_insight: "Find the size from the reference triangle, then fix the sign from the quadrant.",
      techniques: this.techniques,
      estimated_difficulty: 4.5 + t,
      estimated_solve_seconds: Math.round(50 + 40 * t),
      verification: sympyVerification(`[simplify(tan(t0)) for t0 in solve(Eq(${G}(theta), ${gVal}), theta) if ${otherSign > 0 ? `${other}(t0) > 0` : `${other}(t0) < 0`}]`),
      template_id: this.id,
    };
  },
};

// -------------------------------------------------------- sin + cos = k ------

const K_VALUES: Q[] = [
  [1, 2], [1, 3], [2, 3], [3, 4], [4, 3], [5, 4], [7, 5], [1, 5], [7, 13], [17, 13], [23, 17], [7, 17],
  [-1, 2], [-1, 3], [-7, 5], [-1, 5], [-4, 3], [-2, 3],
];

export const sumSinCos: ProceduralTemplate = {
  id: "b5.sum_sin_cos",
  slot: 5,
  title: "Symmetric expressions from sin θ + cos θ",
  techniques: ["squaring", "Pythagorean identity", "sum of cubes"],
  range: [5, 6.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 5, 6.5);
    const variant = t < 0.35 ? "prod" : t < 0.7 ? rng.pick(["prod", "cubes"]) : rng.pick(["cubes", "fourth"]);
    // keep the higher-power variants free of huge denominators
    const k = rng.pick(variant === "prod" ? K_VALUES : K_VALUES.filter((q) => q[1] <= 5));
    const k2 = qmul(k, k);
    const P = qmul(qadd(k2, [-1, 1]), [1, 2]); // sin·cos
    let ask: string;
    let target: string;
    let C: Q, D1: Q, D2: Q, D3: Q;
    let mis: [string, string, string, string, string, string];
    let ders: [string, string, string];
    let sol: string;
    const kS = sv(k);
    const kT = frac(...k);
    const head = `Square: $(\\sin\\theta + \\cos\\theta)^2 = 1 + 2\\sin\\theta\\cos\\theta = ${frac(...k2)}$, so $\\sin\\theta\\cos\\theta = ${frac(...P)}$.`;
    if (variant === "prod") {
      ask = "\\sin\\theta\\cos\\theta";
      target = "S[0]*S[1]";
      C = P;
      D1 = qmul(P, [2, 1]);
      D2 = qneg(P);
      D3 = qmul(k2, [1, 4]);
      mis = [
        "Forgot to divide by 2 (found sin 2θ instead)",
        "$(\\sin\\theta + \\cos\\theta)^2 - 1$ equals $2\\sin\\theta\\cos\\theta$, twice the requested product.",
        "Sign error moving the 1 across",
        "From $1 + 2P = k^2$ the result is $P = \\frac{k^2 - 1}{2}$, not $\\frac{1 - k^2}{2}$.",
        "Assumed sin θ = cos θ = k/2",
        "Nothing forces the two values to be equal; the condition only fixes their sum.",
      ];
      ders = [`${kS}**2 - 1`, `(1 - ${kS}**2)/2`, `(${kS}/2)**2`];
      sol = head;
    } else if (variant === "cubes") {
      ask = "\\sin^3\\theta + \\cos^3\\theta";
      target = "S[0]**3 + S[1]**3";
      C = qmul(k, qadd([1, 1], qneg(P)));
      D1 = qmul(k2, k);
      D2 = qmul(k, qadd([1, 1], P));
      D3 = qmul(k, qadd([1, 1], qneg(qmul(P, [2, 1]))));
      mis = [
        "Cubed each term separately",
        "$(\\sin\\theta + \\cos\\theta)^3 \\ne \\sin^3\\theta + \\cos^3\\theta$.",
        "Used a³ + b³ = (a + b)(a² + ab + b²)",
        "The middle term of the sum-of-cubes factor is $-ab$, not $+ab$.",
        "Took sin θ cos θ = k² − 1 (forgot to halve)",
        "Squaring gives $1 + 2\\sin\\theta\\cos\\theta$, so the product is half of $k^2 - 1$.",
      ];
      ders = [`${kS}**3`, `${kS}*(1 + (${kS}**2 - 1)/2)`, `${kS}*(1 - (${kS}**2 - 1))`];
      sol = `${head} Then $\\sin^3\\theta + \\cos^3\\theta = (\\sin\\theta + \\cos\\theta)(\\sin^2\\theta - \\sin\\theta\\cos\\theta + \\cos^2\\theta) = ${kT}\\left(1 - ${frac(...P).startsWith("-") ? `\\left(${frac(...P)}\\right)` : frac(...P)}\\right) = ${frac(...C)}$.`;
    } else {
      ask = "\\sin^4\\theta + \\cos^4\\theta";
      target = "S[0]**4 + S[1]**4";
      const P2 = qmul(P, P);
      C = qadd([1, 1], qneg(qmul(P2, [2, 1])));
      D1 = qadd([1, 1], qneg(qmul(P, [2, 1])));
      D2 = [1, 1];
      D3 = qmul(k2, k2);
      mis = [
        "Forgot to square sin θ cos θ",
        "$(\\sin^2\\theta + \\cos^2\\theta)^2 = \\sin^4\\theta + \\cos^4\\theta + 2\\sin^2\\theta\\cos^2\\theta$: the cross term is $2P^2$, not $2P$.",
        "Assumed (sin²θ + cos²θ)² = sin⁴θ + cos⁴θ",
        "Squaring a sum produces a cross term, which must be subtracted.",
        "Raised each term of the given sum to the fourth power",
        "$(\\sin\\theta + \\cos\\theta)^4 \\ne \\sin^4\\theta + \\cos^4\\theta$.",
      ];
      ders = [`1 - 2*((${kS}**2 - 1)/2)`, `(sin(x)**2 + cos(x)**2)**2`, `${kS}**4`];
      sol = `${head} Then $\\sin^4\\theta + \\cos^4\\theta = (\\sin^2\\theta + \\cos^2\\theta)^2 - 2\\sin^2\\theta\\cos^2\\theta = 1 - 2\\left(${frac(...P)}\\right)^2 = ${frac(...C)}$.`;
    }
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    const sys = `solve([Eq(x + y, ${kS}), Eq(x**2 + y**2, 1)], [x, y])`;
    return {
      ...base(),
      diagram: null,
      statement: `If $\\sin\\theta + \\cos\\theta = ${kT}$, what is the value of $${ask}$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: "Square the given equation and use $\\sin^2\\theta + \\cos^2\\theta = 1$ to get the product; then build the requested symmetric expression." },
        { tex: fracTex(...D1), value: rat(...D1), misconception: mis[0], rationale: mis[1], derivation: ders[0] },
        { tex: fracTex(...D2), value: rat(...D2), misconception: mis[2], rationale: mis[3], derivation: ders[1] },
        { tex: fracTex(...D3), value: rat(...D3), misconception: mis[4], rationale: mis[5], derivation: ders[2] },
      ),
      solution: sol,
      key_insight: "Squaring $\\sin\\theta + \\cos\\theta$ produces $1 + 2\\sin\\theta\\cos\\theta$; every symmetric expression follows from the sum and the product.",
      techniques: this.techniques,
      estimated_difficulty: variant === "prod" ? 5 + 0.5 * t : 5.5 + t,
      estimated_solve_seconds: Math.round(60 + 70 * t),
      verification: sympyVerification(
        `[simplify(${target}) for S in ${sys}][0]`,
        [`all([im(S[0]) == 0 and im(S[1]) == 0 for S in ${sys}])`, `[simplify(${target}) for S in ${sys}][0] == [simplify(${target}) for S in ${sys}][1]`],
        "Solves sinθ = x, cosθ = y directly; checks that real solutions exist and that both give the same value.",
      ),
      template_id: this.id,
    };
  },
};

// ---------------------------------------------------- trig equation, sum ------

type Root = Q;
const key = (q: Q) => `${q[0]}/${q[1]}`;
// solutions in [0, 2π), principal value, and "unwrapped general pair", in sixths of π
const SIN: Record<string, { sol: number[]; prin: number; gen: number[] }> = {
  "1/1": { sol: [3], prin: 3, gen: [3] },
  "-1/1": { sol: [9], prin: -3, gen: [-3] },
  "0/1": { sol: [0, 6], prin: 0, gen: [0, 6] },
  "1/2": { sol: [1, 5], prin: 1, gen: [1, 5] },
  "-1/2": { sol: [7, 11], prin: -1, gen: [-1, 7] },
};
const COS: Record<string, { sol: number[]; prin: number; gen: number[] }> = {
  "1/1": { sol: [0], prin: 0, gen: [0] },
  "-1/1": { sol: [6], prin: 6, gen: [6] },
  "0/1": { sol: [3, 9], prin: 3, gen: [3, -3] },
  "1/2": { sol: [2, 10], prin: 2, gen: [2, -2] },
  "-1/2": { sol: [4, 8], prin: 4, gen: [4, -4] },
};
const VALID: Root[] = [[1, 1], [-1, 1], [0, 1], [1, 2], [-1, 2]];
const INNER: Root[] = [[0, 1], [1, 2], [-1, 2]];
const EXTRANEOUS: Root[] = [[2, 1], [-2, 1], [3, 2], [-3, 2], [3, 1]];

export const trigEquationSum: ProceduralTemplate = {
  id: "b5.trig_equation_sum",
  slot: 5,
  title: "Sum of the solutions of a quadratic trig equation",
  techniques: ["quadratic in sin or cos", "solutions on a full period"],
  range: [5, 6.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 5, 6.5);
    const f = t < 0.4 ? "sin" : rng.pick(["sin", "cos"] as const);
    const tab = f === "sin" ? SIN : COS;
    const u = rng.pick(INNER);
    let v: Root;
    if (t > 0.5 && rng.bool(0.5)) v = rng.pick(EXTRANEOUS);
    else v = rng.pick(VALID.filter((w) => key(w) !== key(u)));
    const roots = [u, v];
    const sumOf = (rs: Root[], pick: (e: { sol: number[]; prin: number; gen: number[] }) => number[]) =>
      rs.reduce((acc, r0) => acc + (tab[key(r0)] ? pick(tab[key(r0)]).reduce((a, b) => a + b, 0) : 0), 0);
    const C = sumOf(roots, (e) => e.sol);
    const neg = roots.map((r0) => [r0[0] === 0 ? 0 : -r0[0], r0[1]] as Root);
    const [a1, b1] = u;
    const [a2, b2] = v;
    let A = b1 * b2;
    let B = -(b1 * a2 + a1 * b2);
    let Cc = a1 * a2;
    const g = gcd(gcd(A, B), Cc) || 1;
    A /= g;
    B /= g;
    Cc /= g;
    const term = (c: number, body: string, first: boolean) => {
      if (c === 0) return "";
      const abs = Math.abs(c);
      const s = first ? (c < 0 ? "-" : "") : c < 0 ? " - " : " + ";
      return `${s}${abs === 1 && body ? "" : abs}${body}`;
    };
    const eqTex = `${term(A, `\\${f}^2 x`, true)}${term(B, `\\${f} x`, false)}${term(Cc, "", false)} = 0`;
    const eqPy = `${A}*y**2 + (${B})*y + (${Cc})`;
    const valid = roots.filter((r0) => tab[key(r0)]);
    const bad = roots.filter((r0) => !tab[key(r0)]);
    const solList = valid.flatMap((r0) => tab[key(r0)].sol);
    const ivl = "Interval(0, 2*pi, False, True)";
    const pis = (n: number) => $(piTex(n, 6));
    const roots_ = `solve(${eqPy}, y)`;
    // Candidate traps in priority order; the first three distinct values are used.
    const cands: { n: number; misconception: string; rationale: string; derivation: string }[] = [
      {
        n: sumOf(roots, (e) => [e.prin]),
        misconception: `Used only the principal value of arc${f} for each root`,
        rationale: `Each value of $\\${f} x$ strictly between $-1$ and $1$ is taken twice per period, and principal values may lie outside $[0, 2\\pi)$.`,
        derivation: `sum([a${f}(w) for w in ${roots_} if Abs(w) <= 1])`,
      },
      {
        n: sumOf(neg, (e) => e.sol),
        misconception: "Sign error in the factorization (roots with the wrong signs)",
        rationale: "Reading the roots off the factors with flipped signs solves a different equation.",
        derivation: `sum([sum(solveset(Eq(${f}(x), -w), x, ${ivl})) for w in ${roots_}])`,
      },
      {
        n: sumOf(roots, (e) => (e.sol.length === 1 ? e.sol : [f === "sin" ? 12 : 6])),
        misconception: f === "sin" ? "Paired solutions as x and 2π − x (the cosine symmetry) for a sine equation" : "Paired solutions as x and π − x (the sine symmetry) for a cosine equation",
        rationale: f === "sin" ? "Sine takes equal values at $x$ and $\\pi - x$; it is cosine that is symmetric about $x = \\pi$." : "Cosine takes equal values at $x$ and $2\\pi - x$; it is sine that is symmetric about $x = \\frac{\\pi}{2}$.",
        derivation:
          f === "sin"
            ? `sum([(2*pi if Abs(w) < 1 else asin(w) + (2*pi if w < 0 else 0)) for w in ${roots_} if Abs(w) <= 1])`
            : `sum([(pi if Abs(w) < 1 else acos(w)) for w in ${roots_} if Abs(w) <= 1])`,
      },
      {
        n: sumOf(roots, (e) => e.gen),
        misconception: "Wrote the general solutions but did not shift negative angles into [0, 2π)",
        rationale: f === "sin" ? "From $x = \\alpha$ and $x = \\pi - \\alpha$ with a negative $\\alpha$, one must add $2\\pi$ to land in the interval." : "From $x = \\pm\\alpha$, the solution $-\\alpha$ must be replaced by $2\\pi - \\alpha$.",
        derivation:
          f === "sin"
            ? `sum([(asin(w) + pi - asin(w) if Abs(w) < 1 else asin(w)) for w in ${roots_} if Abs(w) <= 1])`
            : `sum([(acos(w) - acos(w) if Abs(w) < 1 else acos(w)) for w in ${roots_} if Abs(w) <= 1])`,
      },
      {
        n: sumOf(roots, (e) => [Math.min(...e.sol)]),
        misconception: "Found only one solution for each value of the trig function",
        rationale: `A value of $\\${f} x$ strictly between $-1$ and $1$ occurs twice in every period.`,
        derivation: `sum([min(list(solveset(Eq(${f}(x), w), x, ${ivl}))) for w in ${roots_} if Abs(w) <= 1])`,
      },
    ];
    const picked: typeof cands = [];
    for (const c of cands) if (c.n !== C && !picked.some((p) => p.n === c.n)) picked.push(c);
    if (picked.length < 3) throw new RetryTemplate("traps coincide");
    const [D1, D2, D3] = picked.map((c) => ({ tex: pis(c.n), value: `${c.n}*pi/6`, misconception: c.misconception, rationale: c.rationale, derivation: c.derivation }));
    return {
      ...base(),
      diagram: null,
      statement: `What is the sum of all solutions of $${eqTex}$ in the interval $0 \\le x < 2\\pi$?`,
      options: options(
        { tex: pis(C), value: `${C}*pi/6`, rationale: `Factor as a quadratic in $\\${f} x$, discard impossible values, and collect every solution in $[0, 2\\pi)$.` },
        D1,
        D2,
        D3,
      ),
      solution: `Let $s = \\${f} x$. Then $${polyTex([A, B, Cc], "s")} = 0$ factors as $${g === 1 ? "" : `\\frac{1}{${g}}`}${[polyTex([b1, -a1], "s"), polyTex([b2, -a2], "s")].map((p) => (p === "s" ? p : `(${p})`)).sort((p, q) => (p === "s" ? -1 : q === "s" ? 1 : 0)).join("")} = 0$, so $\\${f} x = ${frac(...u)}$ or $\\${f} x = ${frac(...v)}$.${bad.length ? ` The value $${frac(...bad[0])}$ is impossible since $|\\${f} x| \\le 1$.` : ""} In $[0, 2\\pi)$ the solutions are $${solList.map((n) => piTex(n, 6)).join(", ")}$, whose sum is $${piTex(C, 6)}$.`,
      key_insight: `Treat the equation as a quadratic in $\\${f} x$, then count every angle in one full period, discarding values outside $[-1, 1]$.`,
      techniques: this.techniques,
      estimated_difficulty: 5 + 1.5 * t,
      estimated_solve_seconds: Math.round(70 + 60 * t),
      verification: sympyVerification(
        `sum([sum(solveset(Eq(${f}(x), w), x, ${ivl})) for w in solve(${eqPy}, y)])`,
        [`all([simplify(${A}*${f}(s0)**2 + (${B})*${f}(s0) + (${Cc})) == 0 for w in solve(${eqPy}, y) for s0 in solveset(Eq(${f}(x), w), x, ${ivl})])`],
        "solveset is applied to each root of the quadratic separately (SymPy's solveset drops solutions of the composite trig equation).",
      ),
      template_id: this.id,
    };
  },
};

// ------------------------------------------------------------- cosine law ----

const T60: [number, number, number][] = [
  [3, 8, 7], [5, 8, 7], [7, 15, 13], [8, 15, 13], [5, 21, 19], [16, 21, 19], [7, 40, 37], [33, 40, 37],
];
const T120: [number, number, number][] = [
  [3, 5, 7], [7, 8, 13], [5, 16, 19], [11, 24, 31], [7, 33, 37],
];

export const cosineLaw: ProceduralTemplate = {
  id: "b5.cosine_law",
  slot: 5,
  title: "Third side by the cosine law",
  techniques: ["cosine law", "exact values at 60° and 120°"],
  range: [4.5, 6],
  generate(rng, difficulty) {
    const t = level(difficulty, 4.5, 6);
    const A = rng.pick([60, 120]);
    let b: number, c: number;
    if (t > 0.5 && rng.bool(0.5)) {
      b = rng.int(2, 10);
      c = rng.int(2, 10);
      if (b === c) c++;
    } else {
      const tr = rng.pick(A === 60 ? T60 : T120);
      [b, c] = rng.bool() ? [tr[0], tr[1]] : [tr[1], tr[0]];
    }
    const s = A === 60 ? -1 : 1; // a² = b² + c² + s·bc
    const sq = b * b + c * c;
    const C = surd(1, 1, sq + s * b * c);
    const D1 = surd(1, 1, sq - s * b * c);
    const D2 = surd(1, 1, sq);
    const D3 = sqrtRat(2 * sq + s * b * c, 2);
    assertDistinctNumbers(C.num, D1.num, D2.num, D3.num);
    const cosT = A === 60 ? "\\frac{1}{2}" : "-\\frac{1}{2}";
    const elements = [
      pt("A", 0, 0),
      pt("B", c, 0),
      pt("C", b * Math.cos((A * Math.PI) / 180), b * Math.sin((A * Math.PI) / 180)),
      seg("A", "B", { label: `${c}`, length: c }),
      seg("A", "C", { label: `${b}`, length: b }),
      seg("B", "C", { label: "?", length: C.num }),
      ang("B", "A", "C", { label: `${A}°`, measure: A }),
    ];
    return {
      ...base(),
      statement: `In triangle $ABC$, $AB = ${c}$, $AC = ${b}$ and $\\angle BAC = ${A}^\\circ$. What is the length of $BC$?`,
      options: options(
        { tex: $(C.tex), value: C.value, rationale: `$BC^2 = ${b}^2 + ${c}^2 - 2 \\cdot ${b} \\cdot ${c} \\cos ${A}^\\circ$ with $\\cos ${A}^\\circ = ${cosT}$.` },
        {
          tex: $(D1.tex),
          value: D1.value,
          misconception: `Used the wrong sign for cos ${A}°`,
          rationale: `$\\cos ${A}^\\circ = ${cosT}$; flipping its sign turns $${s < 0 ? "-" : "+"}bc$ into $${s < 0 ? "+" : "-"}bc$.`,
          derivation: `sqrt(${b}**2 + ${c}**2 - 2*${b}*${c}*cos(${A === 60 ? "2*pi/3" : "pi/3"}))`,
        },
        {
          tex: $(D2.tex),
          value: D2.value,
          misconception: "Applied the Pythagorean theorem to a non-right triangle",
          rationale: `The angle at $A$ is $${A}^\\circ$, not $90^\\circ$, so the correction term $-2bc\\cos A$ is needed.`,
          derivation: `sqrt(${b}**2 + ${c}**2)`,
        },
        {
          tex: $(D3.tex),
          value: D3.value,
          misconception: "Dropped the factor 2 in the cosine law",
          rationale: "The cosine law is $a^2 = b^2 + c^2 - 2bc\\cos A$; forgetting the 2 halves the correction term.",
          derivation: `sqrt(${b}**2 + ${c}**2 - ${b}*${c}*cos(${A === 60 ? "pi/3" : "2*pi/3"}))`,
        },
      ),
      solution: `By the cosine law, $BC^2 = ${b}^2 + ${c}^2 - 2 \\cdot ${b} \\cdot ${c} \\cdot \\left(${cosT}\\right) = ${sq} ${s < 0 ? "-" : "+"} ${b * c} = ${sq + s * b * c}$, so $BC = ${C.tex}$.`,
      key_insight: `The cosine law with $\\cos ${A}^\\circ = ${cosT}$ gives $a^2 = b^2 + c^2 ${s < 0 ? "-" : "+"} bc$.`,
      techniques: this.techniques,
      estimated_difficulty: 4.5 + 1.5 * t,
      estimated_solve_seconds: Math.round(50 + 40 * t),
      verification: sympyVerification(`Point(${c}, 0).distance(Point(${b}*cos(${A === 60 ? "pi/3" : "2*pi/3"}), ${b}*sin(${A === 60 ? "pi/3" : "2*pi/3"})))`),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `Triangle ABC with AB = ${c} along the bottom, AC = ${b}, and angle BAC marked ${A} degrees. Side BC is marked with a question mark.`,
      }),
      template_id: this.id,
    };
  },
};

// ---------------------------------------------------------- trig maximum -----

export const trigMax: ProceduralTemplate = {
  id: "b5.trig_max",
  slot: 5,
  title: "Maximum of m cos 2x + k sin x",
  techniques: ["double-angle identity", "quadratic on a restricted domain"],
  range: [5.5, 6.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 5.5, 6.5);
    const m = t < 0.5 ? 1 : rng.pick([1, 2]);
    const outside = rng.bool(t < 0.5 ? 0.35 : 0.55);
    const ak = outside ? rng.int(4 * m + 1, 4 * m + 4) : rng.int(1, 4 * m - 1);
    const k = rng.bool() ? ak : -ak;
    const sg = Math.sign(k);
    let C: Q, D1: Q, D2: Q, D3: Q;
    const vertexVal: Q = reduce(8 * m * m + k * k, 8 * m); // m + k²/(8m)
    D1 = [m + ak, 1];
    const wrongIdMax: Q = ak <= 2 * m ? reduce(4 * m * m + k * k, 4 * m) : [ak, 1];
    let mis2: [string, string, string];
    let mis3: [string, string, string];
    if (!outside) {
      C = vertexVal;
      D2 = wrongIdMax;
      D3 = [ak - m, 1];
      mis2 = [
        "Used cos 2x = 1 − sin²x",
        "The correct identity is $\\cos 2x = 1 - 2\\sin^2 x$.",
        `max([(${m} - ${m}*s0**2 + (${k})*s0) for s0 in [-1, 1, Rational(${k}, ${2 * m})] if Abs(s0) <= 1])`,
      ];
      mis3 = [
        `Assumed the maximum occurs where sin x = ${sg > 0 ? "1" : "−1"}`,
        `Making $${k > 0 ? "" : "-"}\\sin x$ as large as possible ignores that $\\cos 2x$ is then at its minimum; the vertex $\\sin x = ${frac(k, 4 * m)}$ lies inside $[-1, 1]$.`,
        `(${m}*cos(2*x) + (${k})*sin(x)).subs(x, ${sg}*pi/2)`,
      ];
    } else {
      C = [ak - m, 1];
      D2 = vertexVal;
      D3 = [ak, 1];
      mis2 = [
        "Took the vertex of the quadratic without checking that |sin x| ≤ 1",
        `The vertex is at $\\sin x = ${frac(k, 4 * m)}$, which is impossible; the maximum is at an endpoint.`,
        `(${m} - ${2 * m}*y**2 + (${k})*y).subs(y, Rational(${k}, ${4 * m}))`,
      ];
      mis3 = [
        "Used cos 2x = 1 − sin²x",
        "The correct identity is $\\cos 2x = 1 - 2\\sin^2 x$.",
        `(${m} - ${m}*y**2 + (${k})*y).subs(y, ${sg})`,
      ];
    }
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    const fTex = `${m === 1 ? "" : m}\\cos 2x ${k < 0 ? "-" : "+"} ${ak}\\sin x`;
    const qTex = `${m} - ${2 * m}s^2 ${k < 0 ? "-" : "+"} ${ak}s`;
    const sol = outside
      ? `With $s = \\sin x \\in [-1, 1]$ and $\\cos 2x = 1 - 2s^2$, $f = ${qTex}$. This downward parabola has its vertex at $s = ${frac(k, 4 * m)}$, outside $[-1, 1]$, so on the allowed interval it is monotonic and the maximum is at $s = ${sg}$: $f = ${m} - ${2 * m} + ${ak} = ${ak - m}$.`
      : `With $s = \\sin x \\in [-1, 1]$ and $\\cos 2x = 1 - 2s^2$, $f = ${qTex}$. This downward parabola has its vertex at $s = ${frac(k, 4 * m)}$, which lies in $[-1, 1]$, so the maximum is $${m} + \\frac{${k * k}}{${8 * m}} = ${frac(...C)}$.`;
    return {
      ...base(),
      diagram: null,
      statement: `What is the maximum value of $f(x) = ${fTex}$ over all real $x$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: "Rewrite as a quadratic in $s = \\sin x$ and maximize over $-1 \\le s \\le 1$." },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Added the maxima of the two terms separately",
          rationale: "Both terms cannot reach their maxima at the same $x$.",
          derivation: `${m} + Abs(${k})`,
        },
        { tex: fracTex(...D2), value: rat(...D2), misconception: mis2[0], rationale: mis2[1], derivation: mis2[2] },
        { tex: fracTex(...D3), value: rat(...D3), misconception: mis3[0], rationale: mis3[1], derivation: mis3[2] },
      ),
      solution: sol,
      key_insight: "Substitute $s = \\sin x$ to get a quadratic, but remember the domain $-1 \\le s \\le 1$.",
      techniques: this.techniques,
      estimated_difficulty: 5.5 + t,
      estimated_solve_seconds: Math.round(80 + 60 * t),
      verification: sympyVerification(
        `max([simplify(${m}*cos(2*x0) + (${k})*sin(x0)) for x0 in solve(diff(${m}*cos(2*x) + (${k})*sin(x), x), x) if im(x0) == 0])`,
        [],
        "Maximum over all real critical points of f.",
      ),
      template_id: this.id,
    };
  },
};

export const bucket5Templates: ProceduralTemplate[] = [quadrantTangent, sumSinCos, trigEquationSum, cosineLaw, trigMax];
