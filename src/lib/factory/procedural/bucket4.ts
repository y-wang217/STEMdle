/**
 * Bucket 4 — Graphs (medium; linear and quadratic functions).
 * Every distractor is produced by a named wrong solving path.
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
import { diagram, fn, frac, poly, polyTex, pt, rat, reduce } from "./bucket2";

const base = (slot = 4) => ({ slot, tags: ["graphs"] });
type Q = [number, number];
const val = (q: Q) => q[0] / q[1];
const qmul = (a: Q, b: Q): Q => reduce(a[0] * b[0], a[1] * b[1]);
const qadd = (a: Q, b: Q): Q => reduce(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
/** SymPy literal for a rational. */
const sv = (q: Q) => (q[1] === 1 ? `${q[0]}` : `Rational(${q[0]},${q[1]})`);
/** Plot-expression literal for a rational. */
const pv = (q: Q) => (q[1] === 1 ? `${q[0]}` : `(${q[0]}/${q[1]})`);
const fmt = (n: number) => (n < 0 ? `-${-n}` : `${n}`);
/** Parenthesise a TeX number if it is negative. */
const par = (s: string) => (s.startsWith("-") ? `\\left(${s}\\right)` : s);
/** "(x - p)" style factor TeX. */
const fac = (p: number) => (p === 0 ? "x" : p > 0 ? `(x - ${p})` : `(x + ${-p})`);

export const parabolaExtreme: ProceduralTemplate = {
  id: "b4.parabola_extreme",
  slot: 4,
  title: "Extreme value of a parabola from its intercepts",
  techniques: ["intercept form", "axis of symmetry"],
  range: [4, 5.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 4, 5.5);
    const a: Q = rng.pick(t < 0.5 ? ([[-2, 1], [-3, 1], [2, 1], [3, 1]] as Q[]) : ([[-2, 1], [2, 1], [-1, 2], [1, 2], [-3, 2], [3, 2], [-3, 1]] as Q[]));
    const p = -rng.int(1, 5);
    const q = rng.int(1, 6);
    if (p + q === 0 || q - p > 9) throw new RetryTemplate("symmetric or too wide");
    const kq = qmul(a, [p * q, 1]);
    if (kq[1] !== 1) throw new RetryTemplate("non-integer intercept");
    const k = kq[0];
    const w = q - p;
    const C = qmul(a, [-(w * w), 4]);
    const D1 = qmul(a, [-(q - 3 * p) * (q + p), 4]);
    const sgn = Math.sign(a[0]);
    const D2: Q = reduce(-sgn * w * w, 4);
    const D3 = qadd([k, 1], qmul(a, [(p + q) * (p + q), 4]));
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    if (Math.abs(val(C)) > 30) throw new RetryTemplate("too tall to draw");
    const isMax = a[0] < 0;
    const word = isMax ? "maximum" : "minimum";
    const h: Q = reduce(p + q, 2);
    const expr = `${pv(a)}*(x - (${p}))*(x - (${q}))`;
    const xmin = p - 1.3;
    const xmax = q + 1.3;
    const f = (x: number) => val(a) * (x - p) * (x - q);
    const elements = [
      fn(expr, xmin, xmax),
      pt("P", p, 0, `(${p}, 0)`),
      pt("Q", q, 0, `(${q}, 0)`),
      pt("Y", 0, k, `(0, ${k})`),
    ];
    const aTex = frac(...a);
    return {
      ...base(),
      statement: `A parabola $y = ax^2 + bx + c$ crosses the $x$-axis at $x = ${p}$ and $x = ${q}$, and crosses the $y$-axis at $(0, ${k})$. What is the ${word} value of $y$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `The vertex lies midway between the roots, at $x = ${frac(...h)}$; with $a = ${aTex}$ evaluate there.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Placed the axis of symmetry at half the distance between the roots, measured from the origin",
          rationale: `The axis is at the average of the roots, $\\frac{${p} + ${q}}{2}$, not at $\\frac{${q} - (${p})}{2}$.`,
          derivation: `${sv(a)}*(Rational(${w},2) - (${p}))*(Rational(${w},2) - (${q}))`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: `Ignored the leading coefficient and used y = ${isMax ? "-" : ""}(x - p)(x - q)`,
          rationale: `The $y$-intercept forces $a = ${aTex}$, which scales the whole graph vertically.`,
          derivation: `(${sgn})*(Rational(${p + q},2) - (${p}))*(Rational(${p + q},2) - (${q}))`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Used c + b²/(4a) instead of c − b²/(4a) for the vertex value",
          rationale: "Completing the square gives $c - \\frac{b^2}{4a}$; the sign is easy to flip.",
          derivation: `${k} + (${sv(a)}*(${p + q}))**2/(4*${sv(a)})`,
        },
      ),
      solution: `In intercept form $y = a${fac(p)}${fac(q)}$. At $x = 0$: $a \\cdot (${-p}) \\cdot (${fmt(-q)}) = ${k}$, so $a = ${aTex}$. The vertex is midway between the roots, at $x = ${frac(...h)}$, giving $y = ${aTex} \\left(${frac(...h)} - (${p})\\right)\\left(${frac(...h)} - ${q}\\right) = ${frac(...C)}$. Since $a ${isMax ? "<" : ">"} 0$ this is the ${word}.`,
      key_insight: "The vertex of a parabola is midway between its $x$-intercepts; one more point fixes the vertical stretch.",
      techniques: this.techniques,
      estimated_difficulty: 4 + 1.5 * t,
      estimated_solve_seconds: Math.round(70 + 50 * t),
      verification: sympyVerification(
        `[g.subs(x, solve(diff(g, x), x)[0]) for g in [solve(Eq(a*(0 - (${p}))*(0 - (${q})), ${k}), a)[0]*(x - (${p}))*(x - (${q}))]][0]`,
      ),
      diagram: diagram("graph", elements, {
        essential: false,
        axes: true,
        grid: true,
        pad: 0.8,
        extra: [
          [xmin, f(xmin)],
          [xmax, f(xmax)],
          [val(h), val(C)],
          [0, 0],
        ],
        alt: `Graph of a parabola opening ${isMax ? "downward" : "upward"}, crossing the x-axis at (${p}, 0) and (${q}, 0) and the y-axis at (0, ${k}).`,
      }),
      template_id: this.id,
    };
  },
};

export const linesTriangle: ProceduralTemplate = {
  id: "b4.lines_triangle",
  slot: 4,
  title: "Triangle cut off by two lines and the y-axis",
  techniques: ["intersection of lines", "area from coordinates"],
  range: [4, 5.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 4, 5.5);
    const R = 2 + Math.round(2 * t);
    const m1 = rng.pick([-R, -2, -1, 1, 2, R]);
    let m2 = rng.pick([-R, -3, -1, 1, 2, 3]);
    if (m2 === m1) m2 = -m1;
    // choose x0 on the side that puts the second intercept below the origin
    const x0 = -Math.sign(m1 - m2) * rng.int(1, 5);
    const span = Math.abs((m1 - m2) * x0);
    if (span < 2) throw new RetryTemplate("too small");
    const b1 = rng.int(1, Math.min(4 + Math.round(4 * t), span - 1));
    const b2 = b1 + (m1 - m2) * x0;
    const y0 = m1 * x0 + b1;
    if (y0 === 0 || b1 + b2 === 0) throw new RetryTemplate("degenerate");
    const baseLen = b1 - b2;
    const ax = Math.abs(x0);
    const C: Q = reduce(baseLen * ax, 2);
    const D1: Q = [baseLen * ax, 1];
    const D2: Q = reduce(baseLen * Math.abs(y0), 2);
    const D3: Q = reduce(Math.abs(b1 + b2) * ax, 2);
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    const L1 = polyTex([m1, b1]);
    const L2 = polyTex([m2, b2]);
    const xmin = Math.min(0, x0) - 1.5;
    const xmax = Math.max(0, x0) + 1.5;
    const elements = [
      fn(`${m1}*x + (${b1})`, xmin, xmax, `y = ${L1}`),
      fn(`${m2}*x + (${b2})`, xmin, xmax, `y = ${L2}`),
      pt("P", 0, b1),
      pt("Q", 0, b2),
      pt("R", x0, y0),
      poly(["P", "Q", "R"], true),
    ];
    return {
      ...base(),
      statement: `The lines $y = ${L1}$ and $y = ${L2}$ together with the $y$-axis enclose a triangle. What is the area of this triangle?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `Base along the $y$-axis is $${b1} - (${b2}) = ${baseLen}$; the height is the horizontal distance $${ax}$ to the intersection point.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Forgot the factor one-half",
          rationale: "Base times height gives a rectangle, twice the triangle.",
          derivation: `${baseLen}*Abs(${x0})`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Used the y-coordinate of the intersection point as the height",
          rationale: "The base lies on the $y$-axis, so the height is measured horizontally, by the $x$-coordinate.",
          derivation: `Rational(1,2)*${baseLen}*Abs(${m1}*(${x0}) + ${b1})`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Took the base as the sum of the intercepts, ignoring the sign of the negative one",
          rationale: `The intercepts $${b1}$ and $${b2}$ lie on opposite sides of the origin, so the base is $${b1} - (${b2})$, not $|${b1} + (${b2})|$.`,
          derivation: `Rational(1,2)*Abs(${b1} + (${b2}))*Abs(${x0})`,
        },
      ),
      solution: `The lines meet the $y$-axis at $(0, ${b1})$ and $(0, ${b2})$, so the base on the $y$-axis has length $${baseLen}$. They intersect where $${L1} = ${L2}$, i.e. $${polyTex([m1 - m2, 0])} = ${b2 - b1}$, so $x = ${x0}$ (and $y = ${y0}$). The height is the distance from this point to the $y$-axis, $${ax}$. Area $= \\frac{1}{2} \\cdot ${baseLen} \\cdot ${ax} = ${frac(...C)}$.`,
      key_insight: "With a side on the $y$-axis, the height of the triangle is the $|x|$-coordinate of the opposite vertex.",
      techniques: this.techniques,
      estimated_difficulty: 4 + 1.5 * t,
      estimated_solve_seconds: Math.round(60 + 50 * t),
      verification: sympyVerification(
        `[Abs(Triangle(Point(0, ${b1}), Point(0, ${b2}), Point(s[x], s[y])).area) for s in [solve([Eq(y, ${m1}*x + (${b1})), Eq(y, ${m2}*x + (${b2}))], [x, y])]][0]`,
      ),
      diagram: diagram("graph", elements, {
        essential: false,
        axes: true,
        grid: true,
        pad: 1,
        alt: `Two lines, y = ${L1} and y = ${L2}, crossing the y-axis at P (0, ${b1}) and Q (0, ${b2}) and meeting each other at R. The triangle PQR is shaded.`,
      }),
      template_id: this.id,
    };
  },
};

export const tangentLine: ProceduralTemplate = {
  id: "b4.tangent_line",
  slot: 4,
  title: "Line tangent to a parabola",
  techniques: ["discriminant", "tangency as a double root"],
  range: [4.5, 6],
  generate(rng, difficulty) {
    const t = level(difficulty, 4.5, 6);
    const A = t < 0.5 ? 1 : rng.pick([1, 2, -1, 3, -2]);
    const m = rng.pick([-4, -3, -2, -1, 1, 2, 3, 4, 5]);
    let d = rng.int(-6, 6);
    if (t < 0.5 && A === 1) d = 2 * rng.int(-4, 4);
    if (d === 0) throw new RetryTemplate("horizontal relative slope");
    const b = m + d;
    const c = rng.int(-6, 8);
    const C = reduce(4 * A * c - d * d, 4 * A);
    const D1 = reduce(4 * A * c + d * d, 4 * A);
    const D2 = reduce(4 * A * c - b * b, 4 * A);
    const D3 = reduce(A * c - d * d, A);
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    const par = polyTex([A, b, c]);
    const line = `${polyTex([m, 0])} + k`;
    return {
      ...base(),
      diagram: null,
      statement: `For what value of $k$ is the line $y = ${line}$ tangent to the parabola $y = ${par}$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: "Tangency means the equation for the intersection points has a double root: discriminant zero." },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Sign error when solving the discriminant equation for k",
          rationale: `$(${b} - (${m}))^2 - 4 \\cdot ${A}(${c} - k) = 0$ gives $k = ${c} - \\frac{${d * d}}{${4 * A}}$; moving terms carelessly flips the sign.`,
          derivation: `${c} + Rational(${d * d}, 4*${A})`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Ignored the slope of the line (found the horizontal tangent instead)",
          rationale: "Using the parabola's own $b$ without subtracting the line's slope finds the tangent with slope $0$.",
          derivation: `${c} - Rational(${b * b}, 4*${A})`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Dropped the 4 in the discriminant b² − 4ac",
          rationale: "Writing the discriminant as $b^2 - ac$ is a common slip.",
          derivation: `solve(Eq((${b} - (${m}))**2 - ${A}*(${c} - k), 0), k)[0]`,
        },
      ),
      solution: `Setting $${par} = ${line}$ gives $${polyTex([A, d, c])} - k = 0$. For tangency the discriminant vanishes: $(${d})^2 - 4 \\cdot ${A} \\cdot (${c} - k) = 0$, so $${c} - k = \\frac{${d * d}}{${4 * A}}$ and $k = ${frac(...C)}$.`,
      key_insight: "A line is tangent to a parabola exactly when their intersection equation has a repeated root.",
      techniques: this.techniques,
      estimated_difficulty: 4.5 + 1.5 * t,
      estimated_solve_seconds: Math.round(70 + 50 * t),
      verification: sympyVerification(
        `[(${A}*x0**2 + (${b})*x0 + (${c})) - (${m})*x0 for x0 in solve(Eq(diff(${A}*x**2 + (${b})*x + (${c}), x), ${m}), x)][0]`,
        [],
        "Tangent point found from slope matching (derivative), independent of the discriminant method.",
      ),
      template_id: this.id,
    };
  },
};

export const vertexReadB: ProceduralTemplate = {
  id: "b4.vertex_read_b",
  slot: 4,
  title: "Coefficient b from a graphed parabola",
  techniques: ["vertex form", "expanding"],
  range: [4.5, 6],
  generate(rng, difficulty) {
    const t = level(difficulty, 4.5, 6);
    const a: Q = rng.pick(t < 0.5 ? ([[1, 1], [-1, 1], [2, 1], [-2, 1]] as Q[]) : ([[1, 2], [-1, 2], [3, 2], [-3, 2], [2, 1], [-2, 1], [-1, 1]] as Q[]));
    const h = rng.pick([-3, -2, -1, 1, 2, 3]);
    const k = rng.int(-4, 4);
    const xP = h + 2;
    const yP = k + 4 * val(a);
    const ah = qmul(a, [h, 1]);
    const C = qmul(ah, [-2, 1]);
    const D1 = qmul(ah, [2, 1]);
    const D2 = qmul(ah, [-1, 1]);
    const D3 = qmul(ah, [-4, 1]);
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    const span = 2.6;
    const xmin = Math.min(h - span, -0.5);
    const xmax = Math.max(h + span, 0.5);
    const f = (x: number) => val(a) * (x - h) ** 2 + k;
    const elements = [
      fn(`${pv(a)}*(x - (${h}))^2 + (${k})`, h - span, h + span),
      pt("V", h, k, `V(${h}, ${k})`),
      pt("P", xP, yP, `P(${xP}, ${yP})`),
    ];
    const aTex = frac(...a);
    return {
      ...base(),
      statement: `The graph of $y = ax^2 + bx + c$ is shown. Its vertex is $V$ and it passes through $P$, with coordinates as labelled. What is the value of $b$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `In vertex form $y = a(x - ${h})^2 + ${k}$ with $a = ${aTex}$; expanding gives $b = -2ah$.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Sign error in the vertex form: used a(x + h)²",
          rationale: `A vertex at $x = ${h}$ means the factor $(x - (${h}))$; using $(x + (${h}))$ flips the sign of $b$.`,
          derivation: `expand(${sv(a)}*(x + (${h}))**2 + (${k})).coeff(x, 1)`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Expanded (x − h)² as x² − hx + h², missing the factor 2",
          rationale: "The middle term of $(x - h)^2$ is $-2hx$.",
          derivation: `-${sv(a)}*(${h})`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Forgot to square the horizontal distance when finding a",
          rationale: `From $V$ to $P$ the graph rises $${frac(...qmul(a, [4, 1]))}$ over a horizontal distance $2$, so $a = \\frac{${frac(...qmul(a, [4, 1]))}}{2^2}$, not $\\frac{${frac(...qmul(a, [4, 1]))}}{2}$.`,
          derivation: `-2*(${sv(qmul(a, [4, 1]))}/2)*(${h})`,
        },
      ),
      solution: `Vertex form: $y = a(x - (${h}))^2 + (${k})$. Substituting $P(${xP}, ${yP})$: $${yP} = a \\cdot 2^2 + (${k})$, so $a = ${aTex}$. Expanding, $y = ax^2 - 2ahx + (ah^2 + k)$, so $b = -2 \\cdot ${aTex} \\cdot (${h}) = ${frac(...C)}$.`,
      key_insight: "Read the vertex, use one more point to find $a$, then expand: $b = -2ah$.",
      techniques: this.techniques,
      estimated_difficulty: 4.5 + 1.5 * t,
      estimated_solve_seconds: Math.round(70 + 50 * t),
      verification: sympyVerification(
        `solve([Eq(a*(${h})**2 + b*(${h}) + c, ${k}), Eq(2*a*(${h}) + b, 0), Eq(a*(${xP})**2 + b*(${xP}) + c, ${sv(reduce(4 * a[0] + k * a[1], a[1]))})], [a, b, c])[b]`,
      ),
      diagram: diagram("graph", elements, {
        essential: true,
        axes: true,
        grid: true,
        pad: 0.8,
        extra: [
          [xmin, f(h - span)],
          [xmax, f(h + span)],
          [0, 0],
        ],
        alt: `Graph of a parabola opening ${a[0] > 0 ? "upward" : "downward"} with vertex V at (${h}, ${k}), passing through the point P at (${xP}, ${yP}).`,
      }),
      template_id: this.id,
    };
  },
};

export const perpBisector: ProceduralTemplate = {
  id: "b4.perp_bisector",
  slot: 4,
  title: "y-intercept of a perpendicular bisector",
  techniques: ["negative reciprocal slopes", "midpoint"],
  range: [4, 5],
  generate(rng, difficulty) {
    const t = level(difficulty, 4, 5);
    const R = 5 + Math.round(3 * t);
    const x1 = rng.int(-R, R);
    const y1 = rng.int(-R, R);
    const x2 = rng.int(-R, R);
    const y2 = rng.int(-R, R);
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 || dy === 0) throw new RetryTemplate("axis-parallel segment");
    if (t < 0.5 && (x1 + x2) % 2 !== 0) throw new RetryTemplate("prefer integer midpoint at low difficulty");
    const sx = x1 + x2;
    const sy = y1 + y2;
    const C = reduce(sy * dy + sx * dx, 2 * dy);
    const D1 = reduce(sy * dx - dy * sx, 2 * dx);
    const D2 = reduce(sy * dy - sx * dx, 2 * dy);
    const D3 = reduce(y1 * dy + x1 * dx, dy);
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    const m: Q = reduce(dy, dx);
    const mp: Q = reduce(-dx, dy);
    const M = `\\left(${frac(sx, 2)}, ${frac(sy, 2)}\\right)`;
    return {
      ...base(),
      diagram: null,
      statement: `What is the $y$-intercept of the perpendicular bisector of the segment joining $A(${x1}, ${y1})$ and $B(${x2}, ${y2})$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `The bisector passes through the midpoint $${M}$ with slope $${frac(...mp)}$.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Used the slope of AB instead of the perpendicular slope",
          rationale: `The bisector is perpendicular to $AB$, so its slope is $${frac(...mp)}$, not $${frac(...m)}$.`,
          derivation: `Rational(${sy},2) - Rational(${dy},${dx})*Rational(${sx},2)`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Took the reciprocal of the slope but forgot to change its sign",
          rationale: "Perpendicular slopes are negative reciprocals: both the flip and the sign change are needed.",
          derivation: `Rational(${sy},2) - Rational(${dx},${dy})*Rational(${sx},2)`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Drew the perpendicular through A instead of through the midpoint",
          rationale: "A bisector must pass through the midpoint of the segment.",
          derivation: `${y1} - Rational(${-dx},${dy})*(${x1})`,
        },
      ),
      solution: `The midpoint is $M = ${M}$. The slope of $AB$ is $${frac(...m)}$, so the perpendicular slope is $${frac(...mp)}$. The bisector is $y = ${frac(...mp)}\\left(x - ${par(frac(sx, 2))}\\right) + ${par(frac(sy, 2))}$; at $x = 0$, $y = ${par(frac(...mp))} \\cdot ${par(frac(-sx, 2))} + ${par(frac(sy, 2))} = ${frac(...C)}$.`,
      key_insight: "The perpendicular bisector goes through the midpoint with the negative reciprocal slope; equivalently, it is the set of points equidistant from $A$ and $B$.",
      techniques: this.techniques,
      estimated_difficulty: 4 + t,
      estimated_solve_seconds: Math.round(60 + 40 * t),
      verification: sympyVerification(`solve(Eq((0 - (${x1}))**2 + (y - (${y1}))**2, (0 - (${x2}))**2 + (y - (${y2}))**2), y)[0]`, [], "Points on the bisector are equidistant from A and B."),
      template_id: this.id,
    };
  },
};

export const bucket4Templates: ProceduralTemplate[] = [parabolaExtreme, linesTriangle, tangentLine, vertexReadB, perpBisector];
