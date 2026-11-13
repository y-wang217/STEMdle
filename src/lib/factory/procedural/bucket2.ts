/**
 * Bucket 2 — Algebra (easy; equations, factoring, substitution).
 * Every distractor is produced by a named wrong solving path.
 *
 * This file also exports small TeX / diagram helpers shared by buckets 2–8.
 */
import type { CandidateQuestionT, DiagramElementT } from "@/lib/schemas/question";
import {
  type ProceduralTemplate,
  RetryTemplate,
  assertDistinctNumbers,
  fracTex,
  gcd,
  level,
  options,
  ratValue,
  sympyVerification,
} from "./types";

// ------------------------------------------------------------------ helpers --

/** TeX (no $) for p/q in lowest terms. */
export function frac(p: number, q: number): string {
  if (q < 0) [p, q] = [-p, -q];
  const g = gcd(p, q) || 1;
  p /= g;
  q /= g;
  if (q === 1) return `${p}`;
  return p < 0 ? `-\\frac{${-p}}{${q}}` : `\\frac{${p}}{${q}}`;
}

/** SymPy value for p/q in lowest terms. */
export function rat(p: number, q: number): string {
  return ratValue(...reduce(p, q));
}

/** Reduce p/q, returning [p, q] with q > 0. */
export function reduce(p: number, q: number): [number, number] {
  if (q < 0) [p, q] = [-p, -q];
  const g = gcd(p, q) || 1;
  return [p / g, q / g];
}

/** " + 3" / " - 3" for a following term; "" for zero. */
export function signed(n: number): string {
  if (n === 0) return "";
  return n > 0 ? ` + ${n}` : ` - ${-n}`;
}

/** TeX for a polynomial with integer coefficients, highest degree first, in variable v. */
export function polyTex(coeffs: number[], v = "x"): string {
  const deg = coeffs.length - 1;
  let out = "";
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const p = deg - i;
    const mon = p === 0 ? "" : p === 1 ? v : `${v}^{${p}}`;
    const abs = Math.abs(c);
    const body = p === 0 ? `${abs}` : abs === 1 ? mon : `${abs}${mon}`;
    if (!out) out = (c < 0 ? "-" : "") + body;
    else out += c < 0 ? ` - ${body}` : ` + ${body}`;
  });
  return out || "0";
}

/** n = k^2 * m with m squarefree; returns [k, m]. */
export function sqrtSplit(n: number): [number, number] {
  let k = 1;
  let m = n;
  for (let d = 2; d * d <= m; d++) {
    while (m % (d * d) === 0) {
      m /= d * d;
      k *= d;
    }
  }
  return [k, m];
}

/** The number (p/q)·√n in simplest form: TeX (no $), SymPy value and float. */
export function surd(p: number, q: number, n: number): { tex: string; value: string; num: number } {
  const [k, m] = sqrtSplit(n);
  const [a, b] = reduce(p * k, q);
  const num = (a / b) * Math.sqrt(m);
  if (m === 1 || a === 0) return { tex: frac(a, b), value: ratValue(a, b), num: a / b };
  const root = `\\sqrt{${m}}`;
  const abs = Math.abs(a);
  const sign = a < 0 ? "-" : "";
  const tex = b === 1 ? `${sign}${abs === 1 ? "" : abs}${root}` : `${sign}\\frac{${abs === 1 ? "" : abs}${root}}{${b}}`;
  return { tex, value: `Rational(${a},${b})*sqrt(${m})`, num };
}

/** √(p/q) in simplest form. */
export function sqrtRat(p: number, q: number) {
  const [a, b] = reduce(p, q);
  return surd(1, b, a * b);
}

/** TeX (no $) for (p/q)·π. */
export function piTex(p: number, q: number): string {
  const [a, b] = reduce(p, q);
  if (a === 0) return "0";
  const abs = Math.abs(a);
  const sign = a < 0 ? "-" : "";
  if (b === 1) return `${sign}${abs === 1 ? "" : abs}\\pi`;
  return `${sign}\\frac{${abs === 1 ? "" : abs}\\pi}{${b}}`;
}

export const $ = (s: string) => `$${s}$`;
export const r4 = (x: number) => Math.round(x * 10000) / 10000;

// diagram element builders
export const pt = (id: string, x: number, y: number, label: string | null = null, show = true): DiagramElementT => ({
  kind: "point",
  id,
  x: r4(x),
  y: r4(y),
  label,
  show,
});
export const seg = (
  from: string,
  to: string,
  o: { label?: string; length?: number; dashed?: boolean; ticks?: number; arrows?: number } = {},
): DiagramElementT => ({
  kind: "segment",
  from,
  to,
  label: o.label ?? null,
  length: o.length ?? null,
  dashed: o.dashed ?? false,
  ticks: o.ticks ?? 0,
  arrows: o.arrows ?? 0,
});
export const ang = (a: string, vertex: string, b: string, o: { label?: string; right?: boolean; measure?: number } = {}): DiagramElementT => ({
  kind: "angle",
  a,
  vertex,
  b,
  label: o.label ?? null,
  right: o.right ?? false,
  measure_deg: o.measure ?? (o.right ? 90 : null),
});
export const circ = (center: string, radius: number, points_on: string[] = []): DiagramElementT => ({
  kind: "circle",
  center,
  radius: r4(radius),
  through: null,
  points_on,
});
export const poly = (vertices: string[], shaded = false): DiagramElementT => ({ kind: "polygon", vertices, shaded });
export const fn = (expr: string, x_min: number, x_max: number, label: string | null = null): DiagramElementT => ({
  kind: "function",
  expr,
  x_min: r4(x_min),
  x_max: r4(x_max),
  label,
});

/** Assemble a to-scale diagram whose window is fitted around its points (plus optional extra extents). */
export function diagram(
  type: "geometry" | "graph",
  elements: DiagramElementT[],
  o: { essential: boolean; alt: string; axes?: boolean; grid?: boolean; pad?: number; extra?: [number, number][] },
): NonNullable<CandidateQuestionT["diagram"]> {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const e of elements) {
    if (e.kind === "point") {
      xs.push(e.x);
      ys.push(e.y);
    }
    if (e.kind === "circle" && e.radius != null) {
      const c = elements.find((p) => p.kind === "point" && p.id === e.center);
      if (c && c.kind === "point") {
        xs.push(c.x - e.radius, c.x + e.radius);
        ys.push(c.y - e.radius, c.y + e.radius);
      }
    }
  }
  for (const [x, y] of o.extra ?? []) {
    xs.push(x);
    ys.push(y);
  }
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const pad = o.pad ?? 0.12 * Math.max(w, h, 1);
  return {
    type,
    x_min: r4(Math.min(...xs) - pad),
    x_max: r4(Math.max(...xs) + pad),
    y_min: r4(Math.min(...ys) - pad),
    y_max: r4(Math.max(...ys) + pad),
    axes: o.axes ?? false,
    grid: o.grid ?? false,
    to_scale: true,
    essential: o.essential,
    alt_text: o.alt,
    elements,
  };
}

const base = (slot = 2) => ({ slot, tags: ["algebra"], diagram: null });

// ---------------------------------------------------------------- templates --

export const linearBrackets: ProceduralTemplate = {
  id: "b2.linear_brackets",
  slot: 2,
  title: "Linear equation with brackets on both sides",
  techniques: ["distributive law", "collecting like terms"],
  range: [2, 3.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 2, 3.5);
    const a = rng.int(2, 5 + Math.round(4 * t));
    let b = rng.int(2, 5 + Math.round(4 * t));
    if (b === a) b = a + rng.int(1, 3);
    const p = rng.int(1, 5 + Math.round(4 * t));
    const q = rng.int(1, 5 + Math.round(4 * t));
    let r: number;
    if (t < 0.5 || rng.bool(0.4)) {
      const x0 = rng.int(-6, 9);
      r = (a - b) * x0 + a * p + b * q;
    } else r = rng.int(-15, 25);
    if (r === 0) throw new RetryTemplate("r = 0");
    const C: [number, number] = [r - b * q - a * p, a - b];
    const D1: [number, number] = [r - q - p, a - b];
    const D2: [number, number] = [r + b * q - a * p, a - b];
    const D3: [number, number] = [r - b * q - a * p, a + b];
    assertDistinctNumbers(...[C, D1, D2, D3].map(([n, d]) => n / d));
    const eq = `${a}(x + ${p}) = ${b}(x - ${q})${signed(r)}`;
    const L = a - b;
    const rhsConst = r - b * q - a * p;
    return {
      ...base(),
      statement: `Solve for $x$: $$${eq}$$`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: "Expand both brackets fully, collect the $x$-terms on one side and the constants on the other." },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Multiplied only the first term inside each bracket",
          rationale: `Writing $${a}(x + ${p})$ as $${a}x + ${p}$ (and likewise on the right) forgets to multiply the constants.`,
          derivation: `solve(Eq(${a}*x + ${p}, ${b}*x - ${q} + (${r})), x)[0]`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Sign error expanding the right-hand bracket",
          rationale: `$${b}(x - ${q})$ is $${b}x - ${b * q}$; dropping the minus sign gives $${b}x + ${b * q}$.`,
          derivation: `solve(Eq(${a}*x + ${a * p}, ${b}*x + ${b * q} + (${r})), x)[0]`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Moved the x-term across the equals sign without changing its sign",
          rationale: `Bringing $${b}x$ to the left must give $${a}x - ${b}x$, not $${a}x + ${b}x$.`,
          derivation: `Rational(${r} - ${b * q} - ${a * p}, ${a} + ${b})`,
        },
      ),
      solution: `Expand: $${a}x + ${a * p} = ${b}x - ${b * q}${signed(r)}$. Collect terms: $${polyTex([L, 0])} = ${rhsConst}$, so $x = ${frac(...C)}$.`,
      key_insight: "Distribute to every term in a bracket, and change sign whenever a term crosses the equals sign.",
      techniques: this.techniques,
      estimated_difficulty: 2 + 1.5 * t,
      estimated_solve_seconds: Math.round(40 + 30 * t),
      verification: sympyVerification(`solve(Eq(${a}*(x + ${p}), ${b}*(x - ${q}) + (${r})), x)[0]`),
      template_id: this.id,
    };
  },
};

export const reciprocalPowers: ProceduralTemplate = {
  id: "b2.reciprocal_powers",
  slot: 2,
  title: "Powers of x ± 1/x by squaring",
  techniques: ["squaring an identity", "substitution"],
  range: [2.5, 4],
  generate(rng, difficulty) {
    const t = level(difficulty, 2.5, 4);
    const variant = t < 0.35 ? "plus2" : t < 0.7 ? rng.pick(["plus2", "minus2"]) : rng.pick(["minus2", "plus3"]);
    const k = variant === "minus2" ? rng.int(2, 9) : rng.int(3, 9);
    let given: string;
    let ask: string;
    let target: string;
    let rootPoly: string;
    let C: number, D1: number, D2: number, D3: number;
    let opts: [string, string, string, string, string, string];
    let solution: string;
    if (variant === "plus2") {
      given = `x + \\frac{1}{x} = ${k}`;
      ask = `x^2 + \\frac{1}{x^2}`;
      target = "x**2 + 1/x**2";
      rootPoly = `x + 1/x - ${k}`;
      C = k * k - 2;
      D1 = k * k;
      D2 = k * k + 2;
      D3 = k * k - 1;
      opts = [
        "Squared each term separately",
        `$(x + \\frac{1}{x})^2$ is not $x^2 + \\frac{1}{x^2}$: the cross term $2 \\cdot x \\cdot \\frac{1}{x} = 2$ is missing.`,
        "Added the cross term instead of subtracting it",
        "The cross term $2$ belongs on the expanded side, so it must be subtracted when isolating $x^2 + \\frac{1}{x^2}$.",
        "Took the cross term to be 1 instead of 2",
        "$x \\cdot \\frac{1}{x} = 1$, but the expansion has two such cross products.",
      ];
      solution = `Square both sides: $x^2 + 2 + \\frac{1}{x^2} = ${k * k}$, so $x^2 + \\frac{1}{x^2} = ${k * k} - 2 = ${C}$.`;
    } else if (variant === "minus2") {
      given = `x - \\frac{1}{x} = ${k}`;
      ask = `x^2 + \\frac{1}{x^2}`;
      target = "x**2 + 1/x**2";
      rootPoly = `x - 1/x - ${k}`;
      C = k * k + 2;
      D1 = k * k;
      D2 = k * k - 2;
      D3 = k * k + 1;
      opts = [
        "Squared each term separately",
        "The expansion of $(x - \\frac{1}{x})^2$ has a cross term that cannot be ignored.",
        "Used the cross term's sign from (x + 1/x)²",
        "Here the cross term is $-2$, so it is added back, not subtracted.",
        "Took the cross term to be 1 instead of 2",
        "$x \\cdot \\frac{1}{x} = 1$, but the expansion has two such cross products.",
      ];
      solution = `Square both sides: $x^2 - 2 + \\frac{1}{x^2} = ${k * k}$, so $x^2 + \\frac{1}{x^2} = ${k * k} + 2 = ${C}$.`;
    } else {
      given = `x + \\frac{1}{x} = ${k}`;
      ask = `x^3 + \\frac{1}{x^3}`;
      target = "x**3 + 1/x**3";
      rootPoly = `x + 1/x - ${k}`;
      C = k ** 3 - 3 * k;
      D1 = k ** 3;
      D2 = k ** 3 + 3 * k;
      D3 = k ** 3 - 3;
      opts = [
        "Cubed each term separately",
        "$(x + \\frac{1}{x})^3$ also contains $3x + \\frac{3}{x}$.",
        "Added the middle terms instead of subtracting them",
        "Isolating $x^3 + \\frac{1}{x^3}$ requires subtracting $3(x + \\frac{1}{x})$.",
        "Treated the middle terms as the constant 3",
        `The middle terms are $3x + \\frac{3}{x} = 3(x + \\frac{1}{x}) = ${3 * k}$, not $3$.`,
      ];
      solution = `Cube both sides: $x^3 + 3x + \\frac{3}{x} + \\frac{1}{x^3} = ${k ** 3}$. Since $3x + \\frac{3}{x} = 3 \\cdot ${k} = ${3 * k}$, we get $x^3 + \\frac{1}{x^3} = ${k ** 3} - ${3 * k} = ${C}$.`;
    }
    assertDistinctNumbers(C, D1, D2, D3);
    const dv = variant === "plus3" ? [`${k}**3`, `${k}**3 + 3*${k}`, `${k}**3 - 3`] : variant === "plus2" ? [`${k}**2`, `${k}**2 + 2`, `${k}**2 - 1`] : [`${k}**2`, `${k}**2 - 2`, `${k}**2 + 1`];
    return {
      ...base(),
      statement: `If $${given}$, what is the value of $${ask}$?`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: "Raise the given equation to the needed power and remove the cross terms using the given value." },
        { tex: `$${D1}$`, value: `${D1}`, misconception: opts[0], rationale: opts[1], derivation: dv[0] },
        { tex: `$${D2}$`, value: `${D2}`, misconception: opts[2], rationale: opts[3], derivation: dv[1] },
        { tex: `$${D3}$`, value: `${D3}`, misconception: opts[4], rationale: opts[5], derivation: dv[2] },
      ),
      solution: `${solution} There is no need to find $x$ itself.`,
      key_insight: "Because $x \\cdot \\frac{1}{x} = 1$, the cross terms of the expansion are constants (or multiples of the given expression).",
      techniques: this.techniques,
      estimated_difficulty: 2.5 + 1.5 * t,
      estimated_solve_seconds: Math.round(40 + 40 * t),
      verification: sympyVerification(
        `[simplify((${target}).subs(x, R[0])) for R in [solve(${rootPoly}, x)]][0]`,
        [`[simplify((${target}).subs(x, R[0]) - (${target}).subs(x, R[1])) == 0 for R in [solve(${rootPoly}, x)]][0]`],
        "Both roots of the given equation give the same value.",
      ),
      template_id: this.id,
    };
  },
};

export const symmetricSystem: ProceduralTemplate = {
  id: "b2.symmetric_system",
  slot: 2,
  title: "Add or subtract a symmetric linear system",
  techniques: ["adding equations", "elimination"],
  range: [2, 3.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 2, 3.5);
    const a = rng.int(2, 6 + Math.round(5 * t));
    let b = rng.int(2, 6 + Math.round(5 * t));
    if (b === a) b = a + rng.int(1, 4);
    const x0 = rng.int(-4, 9);
    let y0 = rng.int(-4, 9);
    if (y0 === x0) y0 = x0 + rng.int(1, 3);
    const P = a * x0 + b * y0;
    const Q = b * x0 + a * y0;
    const askSum = t < 0.5 ? true : rng.bool(0.5);
    const S = x0 + y0;
    const Dd = x0 - y0;
    let C: number, D1: number, D2: number, D3: number;
    if (askSum) {
      C = S;
      D1 = Dd;
      D2 = P + Q;
      D3 = x0;
    } else {
      C = Dd;
      D1 = S;
      D2 = P - Q;
      D3 = -Dd;
    }
    assertDistinctNumbers(C, D1, D2, D3);
    const target = askSum ? "x + y" : "x - y";
    const eqs = `\\begin{aligned} ${a}x + ${b}y &= ${P} \\\\ ${b}x + ${a}y &= ${Q} \\end{aligned}`;
    const sol = askSum
      ? `Add the equations: $${a + b}x + ${a + b}y = ${P + Q}$, so $x + y = \\frac{${P + Q}}{${a + b}} = ${S}$.`
      : `Subtract the second equation from the first: $(${a} - ${b})x + (${b} - ${a})y = ${P} - ${Q}$, i.e. $${a - b}(x - y) = ${P - Q}$, so $x - y = ${Dd}$.`;
    return {
      ...base(),
      statement: `If $$${eqs}$$ what is the value of $${target}$?`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: askSum ? "Adding the equations makes both coefficients equal." : "Subtracting the equations makes the coefficients opposite." },
        askSum
          ? {
              tex: `$${D1}$`,
              value: `${D1}`,
              misconception: "Subtracted the equations, which gives x − y",
              rationale: "Subtracting is also natural, but it produces $x - y$, not the requested $x + y$.",
              derivation: `Rational(${P} - ${Q}, ${a} - ${b})`,
            }
          : {
              tex: `$${D1}$`,
              value: `${D1}`,
              misconception: "Added the equations, which gives x + y",
              rationale: "Adding is the more familiar move, but it produces $x + y$, not the requested $x - y$.",
              derivation: `Rational(${P} + ${Q}, ${a} + ${b})`,
            },
        askSum
          ? {
              tex: `$${D2}$`,
              value: `${D2}`,
              misconception: `Forgot to divide by the common coefficient ${a + b}`,
              rationale: `Adding gives $${a + b}(x + y) = ${P + Q}$; the right-hand side alone is not $x + y$.`,
              derivation: `${P} + ${Q}`,
            }
          : {
              tex: `$${D2}$`,
              value: `${D2}`,
              misconception: `Forgot to divide by the common coefficient ${a - b}`,
              rationale: `Subtracting gives $${a - b}(x - y) = ${P - Q}$; the right-hand side alone is not $x - y$.`,
              derivation: `${P} - ${Q}`,
            },
        askSum
          ? {
              tex: `$${D3}$`,
              value: `${D3}`,
              misconception: "Solved for x and reported it as the answer",
              rationale: "Solving the full system is valid but long, and it is easy to stop at $x$.",
              derivation: `solve([Eq(${a}*x + ${b}*y, ${P}), Eq(${b}*x + ${a}*y, ${Q})], [x, y])[x]`,
            }
          : {
              tex: `$${D3}$`,
              value: `${D3}`,
              misconception: "Subtracted the equations in one order but divided as if in the other",
              rationale: `$(${b}x + ${a}y) - (${a}x + ${b}y)$ equals $${b - a}(x - y)$, so mixing the orders flips the sign.`,
              derivation: `Rational(${Q} - ${P}, ${a} - ${b})`,
            },
      ),
      solution: `${sol} (Indeed $x = ${x0}$, $y = ${y0}$.)`,
      key_insight: "When the coefficients are swapped between the equations, adding or subtracting them isolates $x + y$ or $x - y$ directly.",
      techniques: this.techniques,
      estimated_difficulty: 2 + 1.5 * t,
      estimated_solve_seconds: Math.round(35 + 35 * t),
      verification: sympyVerification(
        `[s[x] ${askSum ? "+" : "-"} s[y] for s in [solve([Eq(${a}*x + ${b}*y, ${P}), Eq(${b}*x + ${a}*y, ${Q})], [x, y])]][0]`,
      ),
      template_id: this.id,
    };
  },
};

export const commonBaseExponent: ProceduralTemplate = {
  id: "b2.common_base_exponent",
  slot: 2,
  title: "Exponential equation via a common base",
  techniques: ["common base", "laws of exponents"],
  range: [2.5, 4],
  generate(rng, difficulty) {
    const t = level(difficulty, 2.5, 4);
    const fam = rng.pick([
      { c: 2, ex: [2, 3, 4, 5] },
      { c: 3, ex: [2, 3, 4] },
      { c: 5, ex: [2, 3] },
    ]);
    const [m, n] = rng.shuffle(fam.ex).slice(0, 2);
    const A = fam.c ** m;
    const B = fam.c ** n;
    const p = rng.int(1, 3);
    let r = rng.int(1, 3);
    if (r === p) r = p + 1;
    if (m * p === n * r) throw new RetryTemplate("parallel exponents");
    let q = 0;
    let s = 0;
    let found = false;
    for (let tries = 0; tries < 60 && !found; tries++) {
      q = rng.int(-4, 5);
      if (t < 0.5) {
        // integer answer x0
        const x0 = rng.int(-5, 8);
        const num = m * (p * x0 + q) - n * r * x0;
        if (num % n === 0) {
          s = num / n;
          found = true;
        }
      } else {
        s = rng.int(-4, 5);
        found = true;
      }
    }
    if (!found) throw new RetryTemplate("no integer instance");
    if (q === 0 && s === 0) throw new RetryTemplate("trivial");
    const C = reduce(n * s - m * q, m * p - n * r);
    const D1 = reduce(s - q, m * p - n * r);
    const D2 = reduce(s - q, p - r);
    if (n * p - m * r === 0) throw new RetryTemplate("degenerate swap");
    const D3 = reduce(m * s - n * q, n * p - m * r);
    assertDistinctNumbers(...[C, D1, D2, D3].map(([u, v]) => u / v));
    const e1 = polyTex([p, q]);
    const e2 = polyTex([r, s]);
    return {
      ...base(),
      statement: `Solve for $x$: $$${A}^{${e1}} = ${B}^{${e2}}$$`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `Write both sides as powers of ${fam.c} and equate exponents.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Multiplied only the x-term of each exponent by the power of the base",
          rationale: `$(${fam.c}^{${m}})^{${e1}} = ${fam.c}^{${m}(${e1})}$: the whole exponent, constant term included, is multiplied by ${m} (and likewise by ${n} on the right).`,
          derivation: `solve(Eq(${m * p}*x + (${q}), ${n * r}*x + (${s})), x)[0]`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Equated the exponents even though the bases differ",
          rationale: `Exponents may be equated only once both sides use the same base; $${A} \\ne ${B}$.`,
          derivation: `solve(Eq(${p}*x + (${q}), ${r}*x + (${s})), x)[0]`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: `Swapped the powers: wrote ${A} as ${fam.c} to the ${n} and ${B} as ${fam.c} to the ${m}`,
          rationale: `$${A} = ${fam.c}^{${m}}$ and $${B} = ${fam.c}^{${n}}$; mixing them up multiplies each exponent by the wrong number.`,
          derivation: `solve(Eq(${n}*(${p}*x + (${q})), ${m}*(${r}*x + (${s}))), x)[0]`,
        },
      ),
      solution: `Since $${A} = ${fam.c}^{${m}}$ and $${B} = ${fam.c}^{${n}}$, the equation is $${fam.c}^{${m}(${e1})} = ${fam.c}^{${n}(${e2})}$. Equate exponents: $${polyTex([m * p, m * q])} = ${polyTex([n * r, n * s])}$, so $${polyTex([m * p - n * r, 0])} = ${n * s - m * q}$ and $x = ${frac(...C)}$.`,
      key_insight: "Rewrite both sides with the same base; only then may the exponents be equated.",
      techniques: this.techniques,
      estimated_difficulty: 2.5 + 1.5 * t,
      estimated_solve_seconds: Math.round(45 + 35 * t),
      verification: sympyVerification(`[v for v in solve(Eq(Integer(${A})**(${p}*x + (${q})), Integer(${B})**(${r}*x + (${s}))), x) if v.is_real]`),
      template_id: this.id,
    };
  },
};

export const bucket2Templates: ProceduralTemplate[] = [linearBrackets, reciprocalPowers, symmetricSystem, commonBaseExponent];
