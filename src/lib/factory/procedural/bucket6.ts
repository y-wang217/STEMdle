/**
 * Bucket 6 — Geometry II (hard; a non-obvious geometric insight).
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
import { $, ang, circ, diagram, frac, piTex, poly, pt, rat, reduce, seg, sqrtRat, surd } from "./bucket2";

const base = (slot = 6) => ({ slot, tags: ["geometry"] });

// (m, n) tangent lengths on the hypotenuse for integer right triangles: legs r+m, r+n
const TANGENT_PAIRS: [number, number][] = [
  [2, 3],
  [3, 10],
  [5, 12],
  [4, 21],
  [14, 15],
  [5, 36],
  [7, 30],
];

export const incircleTangentArea: ProceduralTemplate = {
  id: "b6.incircle_tangent_area",
  slot: 6,
  title: "Right triangle area from the incircle's tangent point",
  techniques: ["equal tangent lengths", "Pythagorean theorem", "algebraic elimination"],
  range: [6, 7.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 6, 7.5);
    let m: number, n: number;
    if (t < 0.5 || rng.bool(0.3)) {
      const k = rng.int(1, t < 0.5 ? 2 : 3);
      [m, n] = rng.pick(TANGENT_PAIRS).map((v) => v * k) as [number, number];
      if (m * n > 400) throw new RetryTemplate("too large");
    } else {
      m = rng.int(2, 9);
      n = rng.int(m + 1, m + 8);
    }
    if (rng.bool()) [m, n] = [n, m];
    const r = (-(m + n) + Math.sqrt((m + n) ** 2 + 4 * m * n)) / 2;
    const C = m * n;
    const D1 = reduce(m * n, 2);
    const D2 = reduce((m + n) ** 2, 4);
    const D3 = surd(m + n, 2, m * n);
    assertDistinctNumbers(C, D1[0] / D1[1], D2[0] / D2[1], D3.num);
    const A: [number, number] = [r + m, 0];
    const B: [number, number] = [0, r + n];
    const f = m / (m + n);
    const T: [number, number] = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
    const elements = [
      pt("C", 0, 0),
      pt("A", ...A),
      pt("B", ...B),
      pt("I", r, r, null, false),
      pt("T", ...T),
      pt("U", r, 0, null, false),
      pt("W", 0, r, null, false),
      poly(["A", "B", "C"]),
      circ("I", r, ["T", "U", "W"]),
      seg("A", "T", { label: `${m}`, length: m }),
      seg("T", "B", { label: `${n}`, length: n }),
      ang("A", "C", "B", { right: true }),
    ];
    return {
      ...base(),
      statement: `A circle is inscribed in a right triangle. The point where the circle touches the hypotenuse divides the hypotenuse into segments of lengths $${m}$ and $${n}$. What is the area of the triangle?`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: `With inradius $r$ the legs are $r + ${m}$ and $r + ${n}$; Pythagoras gives $r^2 + ${m + n}r = ${m * n}$, which is exactly what the area needs.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Treated the two hypotenuse segments as the legs",
          rationale: `$\\frac{1}{2} \\cdot ${m} \\cdot ${n}$ uses the tangent lengths as if they were perpendicular sides.`,
          derivation: `Rational(1,2)*${m}*${n}`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Assumed the triangle is isosceles",
          rationale: `With equal legs the hypotenuse ${m + n} would give legs $\\frac{${m + n}}{\\sqrt{2}}$ and area $\\frac{${m + n}^2}{4}$, but the segments ${m} and ${n} differ, so the legs do too.`,
          derivation: `Rational(1,2)*(${m + n}/sqrt(2))**2`,
        },
        {
          tex: $(D3.tex),
          value: D3.value,
          misconception: "Confused the tangent point with the foot of the altitude",
          rationale: `For the altitude foot, $h^2 = ${m} \\cdot ${n}$ and the area would be $\\frac{1}{2}(${m + n})\\sqrt{${m * n}}$; but the incircle touches the hypotenuse at a different point.`,
          derivation: `Rational(1,2)*(${m} + ${n})*sqrt(${m}*${n})`,
        },
      ),
      solution: `Let the inradius be $r$. Tangent lengths from a vertex are equal, so from the right-angle vertex both tangents have length $r$, and the legs are $r + ${m}$ and $r + ${n}$, while the hypotenuse is $${m + n}$. Pythagoras: $(r + ${m})^2 + (r + ${n})^2 = ${m + n}^2$ simplifies to $r^2 + ${m + n}r = ${m * n}$. The area is $\\frac{1}{2}(r + ${m})(r + ${n}) = \\frac{1}{2}\\left(r^2 + ${m + n}r + ${m * n}\\right) = \\frac{1}{2}(${m * n} + ${m * n}) = ${C}$. We never need $r$ itself.`,
      key_insight: "Write the legs as $r + m$ and $r + n$; Pythagoras gives $r^2 + (m + n)r = mn$, so the area is exactly $mn$.",
      techniques: this.techniques,
      estimated_difficulty: 6 + 1.5 * t,
      estimated_solve_seconds: Math.round(110 + 80 * t),
      verification: sympyVerification(
        `[(${m} + r0)*(${n} + r0)/2 for r0 in solve(Eq((${m} + x)**2 + (${n} + x)**2, (${m} + ${n})**2), x) if r0 > 0][0]`,
        [`len([r0 for r0 in solve(Eq((${m} + x)**2 + (${n} + x)**2, (${m} + ${n})**2), x) if r0 > 0]) == 1`],
        "Solves for the inradius from Pythagoras, then computes the area directly.",
      ),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `Right triangle ABC with the right angle at C and its inscribed circle. The circle touches the hypotenuse AB at T, with AT = ${m} and TB = ${n}.`,
      }),
      template_id: this.id,
    };
  },
};

export const circleThroughVertices: ProceduralTemplate = {
  id: "b6.circle_through_vertices",
  slot: 6,
  title: "Circle through two corners, tangent to the opposite side",
  techniques: ["centre on the perpendicular bisector", "right triangle with the radius"],
  range: [6, 7],
  generate(rng, difficulty) {
    const t = level(difficulty, 6, 7);
    const square = t < 0.5 ? true : rng.bool(0.3);
    let w: number, h: number;
    if (square) {
      w = h = rng.pick(t < 0.5 ? [8, 16, 4, 12] : [6, 10, 12, 20, 9]);
    } else {
      h = rng.int(3, 10);
      w = rng.int(Math.max(2, Math.ceil(h / 2)), 2 * h - 1);
      if (w === h) throw new RetryTemplate("square handled separately");
    }
    const C = reduce(4 * h * h + w * w, 8 * h);
    const D1 = sqrtRat(4 * h * h + w * w, 4);
    const D2 = reduce(h * h + w * w, 2 * h);
    const D3 = reduce(w, 2);
    const r = C[0] / C[1];
    assertDistinctNumbers(r, D1.num, D2[0] / D2[1], D3[0] / D3[1]);
    const elements = [
      pt("A", 0, 0),
      pt("B", w, 0),
      pt("C", w, h),
      pt("D", 0, h),
      pt("M", w / 2, h),
      pt("O", w / 2, h - r),
      poly(["A", "B", "C", "D"]),
      circ("O", r, ["A", "B", "M"]),
      seg("A", "B", { label: `${w}`, length: w }),
      ...(square ? [] : [seg("B", "C", { label: `${h}`, length: h })]),
      seg("O", "M", { label: "r", length: r, dashed: true }),
      seg("O", "A", { dashed: true }),
      ang("O", "M", "C", { right: true }),
    ];
    const what = square ? `Square $ABCD$ has side length $${w}$.` : `Rectangle $ABCD$ has $AB = ${w}$ and $BC = ${h}$.`;
    return {
      ...base(),
      statement: `${what} A circle passes through $A$ and $B$ and is tangent to side $CD$. What is the radius of the circle?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `The centre is on the perpendicular bisector of $AB$, at distance $r$ below $CD$; then $r^2 = \\left(${frac(w, 2)}\\right)^2 + (${h} - r)^2$.` },
        {
          tex: $(D1.tex),
          value: D1.value,
          misconception: "Took the radius to be the distance from the tangency point to A",
          rationale: "The tangency point and $A$ are both on the circle, so their distance is a chord, not a radius.",
          derivation: `Point(${w}/2, ${h}).distance(Point(0, 0))`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Used the whole side AB instead of half of it in the right triangle",
          rationale: `The right triangle joins the centre to $A$ and to the midpoint of $AB$, so its horizontal leg is $${frac(w, 2)}$, not $${w}$.`,
          derivation: `solve(Eq(${w}**2 + (${h} - r)**2, r**2), r)[0]`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Assumed the centre is at the midpoint of AB",
          rationale: "A circle centred on $AB$ through $A$ and $B$ would have radius $\\frac{AB}{2}$, but then it could not reach side $CD$ tangentially.",
          derivation: `Rational(${w}, 2)`,
        },
      ),
      solution: `By symmetry the centre $O$ lies on the perpendicular bisector of $AB$, and since the circle touches $CD$, the radius to the tangency point $M$ is perpendicular to $CD$, so $O$ is at distance $r$ below $CD$ and at height $${h} - r$ above $AB$. In the right triangle formed by $O$, $A$ and the midpoint of $AB$: $r^2 = \\left(${frac(w, 2)}\\right)^2 + (${h} - r)^2$. Expanding, $0 = ${frac(w * w, 4)} + ${h * h} - ${2 * h}r$, so $r = ${frac(...C)}$.`,
      key_insight: "The centre lies on the perpendicular bisector of $AB$ at distance $r$ from the tangent side; one right triangle then fixes $r$.",
      techniques: this.techniques,
      estimated_difficulty: 6 + t,
      estimated_solve_seconds: Math.round(100 + 60 * t),
      verification: sympyVerification(`solve(Eq(Rational(${w},2)**2 + (${h} - r)**2, r**2), r)[0]`, [`${4 * h * h + w * w} <= ${8 * h * h}`], "The check confirms r ≤ BC, so the centre lies inside the rectangle."),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `${square ? "Square" : "Rectangle"} ABCD with AB = ${w} along the bottom${square ? "" : ` and BC = ${h}`}. A circle with centre O passes through A and B and touches the top side CD at its midpoint M; the radius OM is dashed and perpendicular to CD.`,
      }),
      template_id: this.id,
    };
  },
};

export const vivianiArea: ProceduralTemplate = {
  id: "b6.viviani_area",
  slot: 6,
  title: "Equilateral triangle from distances of an interior point",
  techniques: ["area decomposition", "Viviani's theorem"],
  range: [6.5, 7.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 6.5, 7.5);
    const top = 3 + Math.round(4 * t);
    const d1 = rng.int(1, top);
    const d2 = rng.int(1, top);
    const d3 = rng.int(1, top);
    const H = d1 + d2 + d3;
    const C = surd(H * H, 3, 3);
    const D1 = surd(H * H, 4, 3);
    const D2 = surd(4 * H * H, 3, 3);
    const D3 = surd(H * H, 12, 3);
    assertDistinctNumbers(C.num, D1.num, D2.num, D3.num);
    const s = (2 * H) / Math.sqrt(3);
    const px = (2 * d3 + d1) / Math.sqrt(3);
    const py = d1;
    const t3 = px / 2 + (py * Math.sqrt(3)) / 2;
    const t2 = (px - s) * -0.5 + (py * Math.sqrt(3)) / 2;
    const elements = [
      pt("A", s / 2, H),
      pt("B", 0, 0),
      pt("C", s, 0),
      pt("P", px, py),
      pt("F1", px, 0, null, false),
      pt("F2", s - t2 / 2, (t2 * Math.sqrt(3)) / 2, null, false),
      pt("F3", t3 / 2, (t3 * Math.sqrt(3)) / 2, null, false),
      poly(["A", "B", "C"]),
      seg("P", "F1", { label: `${d1}`, length: d1, dashed: true }),
      seg("P", "F2", { label: `${d2}`, length: d2, dashed: true }),
      seg("P", "F3", { label: `${d3}`, length: d3, dashed: true }),
      ang("P", "F1", "C", { right: true }),
      ang("P", "F2", "A", { right: true }),
      ang("P", "F3", "B", { right: true }),
    ];
    return {
      ...base(),
      statement: `A point $P$ inside an equilateral triangle is at distances $${d1}$, $${d2}$ and $${d3}$ from the three sides. What is the area of the triangle?`,
      options: options(
        { tex: $(C.tex), value: C.value, rationale: `Splitting into three triangles at $P$ gives $\\frac{1}{2}s(${d1} + ${d2} + ${d3})$, which must equal $\\frac{\\sqrt{3}}{4}s^2$.` },
        {
          tex: $(D1.tex),
          value: D1.value,
          misconception: "Took the side length equal to the sum of the distances",
          rationale: `The sum $${H}$ is the height of the triangle (Viviani), not its side.`,
          derivation: `sqrt(3)/4*${H}**2`,
        },
        {
          tex: $(D2.tex),
          value: D2.value,
          misconception: "Forgot the one-half in the areas of the three small triangles",
          rationale: `Each small triangle has area $\\frac{1}{2} \\cdot s \\cdot d_i$; dropping the $\\frac{1}{2}$ doubles the side length.`,
          derivation: `[sqrt(3)/4*s0**2 for s0 in solve(Eq(sqrt(3)/4*x**2, x*${H}), x) if s0 > 0][0]`,
        },
        {
          tex: $(D3.tex),
          value: D3.value,
          misconception: "Used height = s√3 instead of s√3/2",
          rationale: "The height of an equilateral triangle with side $s$ is $\\frac{\\sqrt{3}}{2}s$.",
          derivation: `sqrt(3)/4*(${H}/sqrt(3))**2`,
        },
      ),
      solution: `Let the side be $s$. Joining $P$ to the vertices splits the triangle into three triangles with bases $s$ and heights $${d1}$, $${d2}$, $${d3}$, so the area is $\\frac{1}{2}s(${d1} + ${d2} + ${d3}) = ${frac(H, 2)}s$. It is also $\\frac{\\sqrt{3}}{4}s^2$. Hence $s = \\frac{${2 * H}}{\\sqrt{3}}$ (the height is $${H}$, the sum of the distances), and the area is $${frac(H, 2)} \\cdot \\frac{${2 * H}}{\\sqrt{3}} = \\frac{${H * H}}{\\sqrt{3}} = ${C.tex}$.`,
      key_insight: "The three distances from any interior point add up to the height of the equilateral triangle (Viviani's theorem), by splitting the area.",
      techniques: this.techniques,
      estimated_difficulty: 6.5 + t,
      estimated_solve_seconds: Math.round(100 + 60 * t),
      verification: sympyVerification(
        `[Triangle(Point(0, 0), Point(s0, 0), Point(s0/2, s0*sqrt(3)/2)).area for s0 in solve(Eq((sqrt(3)*x - sqrt(3)*((2*${d3} + ${d1})/sqrt(3)) - ${d1})/2, ${d2}), x)][0]`,
        [],
        "Places P at height d1 and distance d3 from side AB, then solves for the side length making its distance to AC equal d2.",
      ),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `Equilateral triangle ABC with an interior point P. Dashed perpendiculars from P to the three sides have lengths ${d1} (to BC), ${d2} (to CA) and ${d3} (to AB).`,
      }),
      template_id: this.id,
    };
  },
};

export const annulusChord: ProceduralTemplate = {
  id: "b6.annulus_chord",
  slot: 6,
  title: "Annulus area from a tangent chord",
  techniques: ["radius perpendicular to tangent", "Pythagorean theorem", "spotting a red herring"],
  range: [6, 6.8],
  generate(rng, difficulty) {
    const t = level(difficulty, 6, 6.8);
    const L = 2 * rng.int(2, 6 + Math.round(4 * t));
    const r = rng.int(2, 6 + Math.round(4 * t));
    if (r === L) throw new RetryTemplate("r = L");
    const C = L * L;
    const D1 = 4 * L * L;
    const D2 = 4 * r * r + L * L;
    const D3 = 4 * r * L + L * L;
    assertDistinctNumbers(C, D1, D2, D3);
    const R = Math.sqrt(r * r + (L * L) / 4);
    const elements = [
      pt("O", 0, 0),
      pt("T", 0, r),
      pt("P", -L / 2, r),
      pt("Q", L / 2, r),
      circ("O", r, ["T"]),
      circ("O", R, ["P", "Q"]),
      seg("P", "Q", { label: `${L}`, length: L }),
      seg("O", "T", { label: `${r}`, length: r }),
      seg("O", "Q", { dashed: true }),
      ang("O", "T", "Q", { right: true }),
    ];
    const pv = (n: number) => $(piTex(n, 4));
    return {
      ...base(),
      statement: `Two circles have the same centre. A chord of the larger circle has length $${L}$ and is tangent to the smaller circle, whose radius is $${r}$. What is the area of the region between the two circles?`,
      options: options(
        { tex: pv(C), value: `${C}*pi/4`, rationale: `$R^2 - r^2 = \\left(\\frac{${L}}{2}\\right)^2$, so the area is $\\pi \\cdot ${L * L / 4}$; the inner radius is irrelevant.` },
        {
          tex: pv(D1),
          value: `${D1}*pi/4`,
          misconception: "Used the whole chord instead of half of it",
          rationale: "The radius to the tangency point bisects the chord, so the right triangle has leg $\\frac{L}{2}$.",
          derivation: `pi*${L}**2`,
        },
        {
          tex: pv(D2),
          value: `${D2}*pi/4`,
          misconception: "Found the area of the larger disc but forgot to subtract the smaller one",
          rationale: "The region between the circles is $\\pi R^2 - \\pi r^2$.",
          derivation: `pi*(${r}**2 + (${L}/2)**2)`,
        },
        {
          tex: pv(D3),
          value: `${D3}*pi/4`,
          misconception: "Took the outer radius to be r + L/2 (added lengths instead of using Pythagoras)",
          rationale: "The half-chord is perpendicular to the inner radius, so the lengths combine by Pythagoras.",
          derivation: `pi*((${r} + Rational(${L},2))**2 - ${r}**2)`,
        },
      ),
      solution: `Let the radii be $R > r$. The radius to the point of tangency is perpendicular to the chord and bisects it, so $R^2 = r^2 + \\left(\\frac{${L}}{2}\\right)^2$. The area between the circles is $\\pi R^2 - \\pi r^2 = \\pi \\left(\\frac{${L}}{2}\\right)^2 = ${piTex(C, 4)}$. Notice that the inner radius $${r}$ cancels: every such annulus with a tangent chord of length $${L}$ has the same area.`,
      key_insight: "$R^2 - r^2$ equals the square of the half-chord, so the annulus area depends only on the chord.",
      techniques: this.techniques,
      estimated_difficulty: 6 + t,
      estimated_solve_seconds: Math.round(80 + 50 * t),
      verification: sympyVerification(`pi*(Point(0, 0).distance(Point(Rational(${L},2), ${r}))**2 - ${r}**2)`),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `Two concentric circles with centre O. Chord PQ of the outer circle, of length ${L}, touches the inner circle at T. The inner radius OT = ${r} is perpendicular to PQ.`,
      }),
      template_id: this.id,
    };
  },
};

export const bucket6Templates: ProceduralTemplate[] = [incircleTangentArea, circleThroughVertices, vivianiArea, annulusChord];
