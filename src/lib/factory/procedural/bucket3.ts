/**
 * Bucket 3 — Geometry I (easy; angles, lengths, area).
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
import { $, ang, circ, diagram, frac, poly, pt, rat, reduce, seg, surd } from "./bucket2";

const base = (slot = 3) => ({ slot, tags: ["geometry"] });
const deg = (v: number) => `$${v}^\\circ$`;
const rad = (d: number) => (d * Math.PI) / 180;

export const isoscelesExterior: ProceduralTemplate = {
  id: "b3.isosceles_exterior",
  slot: 3,
  title: "Exterior angle of an isosceles triangle",
  techniques: ["isosceles base angles", "exterior angle theorem"],
  range: [2.5, 3.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 2.5, 3.5);
    const alpha = t < 0.5 ? 10 * rng.int(3, 8) : 2 * rng.int(13, 44);
    const C = 90 + alpha / 2;
    const D1 = 90 - alpha / 2;
    const D2 = 180 - alpha;
    const D3 = 2 * alpha;
    if (D3 >= 180) throw new RetryTemplate("2α too large to be tempting");
    assertDistinctNumbers(C, D1, D2, D3);
    const h = 2 / Math.tan(rad(alpha / 2));
    const elements = [
      pt("A", 0, h),
      pt("B", -2, 0),
      pt("C", 2, 0),
      pt("D", 4.2, 0),
      poly(["A", "B", "C"]),
      seg("A", "B", { ticks: 1 }),
      seg("A", "C", { ticks: 1 }),
      seg("C", "D"),
      ang("B", "A", "C", { label: `${alpha}°`, measure: alpha }),
      ang("A", "C", "D", { label: "?", measure: C }),
    ];
    return {
      ...base(),
      statement: `In triangle $ABC$, $AB = AC$ and $\\angle BAC = ${alpha}^\\circ$. Side $BC$ is extended beyond $C$ to a point $D$. What is $\\angle ACD$?`,
      options: options(
        { tex: deg(C), value: `${C}`, rationale: `The base angles are each $${D1}^\\circ$, and $\\angle ACD = 180^\\circ - ${D1}^\\circ$.` },
        {
          tex: deg(D1),
          value: `${D1}`,
          misconception: "Gave the interior base angle at C instead of the exterior angle",
          rationale: "The base angle is the natural intermediate result, but $\\angle ACD$ is its supplement.",
          derivation: `(180 - ${alpha})/2`,
        },
        {
          tex: deg(D2),
          value: `${D2}`,
          misconception: "Took the exterior angle at C to be the supplement of the apex angle",
          rationale: "Supplements apply to angles sharing a straight line; the apex angle is not on line $BD$.",
          derivation: `180 - ${alpha}`,
        },
        {
          tex: deg(D3),
          value: `${D3}`,
          misconception: "Misread which sides are equal and took the equal angles at A and B",
          rationale: `If $\\angle B$ also equalled $${alpha}^\\circ$, the exterior angle would be $${alpha}^\\circ + ${alpha}^\\circ$; but the equal angles sit opposite the equal sides, at $B$ and $C$.`,
          derivation: `${alpha} + ${alpha}`,
        },
      ),
      solution: `Since $AB = AC$, the base angles are equal: $\\angle ABC = \\angle ACB = \\frac{180^\\circ - ${alpha}^\\circ}{2} = ${D1}^\\circ$. Angles on the straight line $BD$ give $\\angle ACD = 180^\\circ - ${D1}^\\circ = ${C}^\\circ$. (Equivalently, the exterior angle equals the sum of the remote interior angles: $${alpha}^\\circ + ${D1}^\\circ$.)`,
      key_insight: "Equal sides face equal angles; an exterior angle equals the sum of the two remote interior angles.",
      techniques: this.techniques,
      estimated_difficulty: 2.5 + t,
      estimated_solve_seconds: Math.round(35 + 25 * t),
      verification: sympyVerification(`180 - solve(Eq(2*x + ${alpha}, 180), x)[0]`),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `Isosceles triangle ABC with apex A, tick marks showing AB = AC, and the apex angle marked ${alpha} degrees. The base BC is extended past C to D, and angle ACD is marked with a question mark.`,
      }),
      template_id: this.id,
    };
  },
};

// (half-base, height) pairs from Pythagorean triples with hypotenuse = equal side
const HALF_BASE_HEIGHT: [number, number, number][] = [
  [3, 4, 5],
  [4, 3, 5],
  [5, 12, 13],
  [12, 5, 13],
  [8, 15, 17],
  [15, 8, 17],
  [7, 24, 25],
  [24, 7, 25],
  [20, 21, 29],
  [21, 20, 29],
];

export const isoscelesArea: ProceduralTemplate = {
  id: "b3.isosceles_area",
  slot: 3,
  title: "Area of an isosceles triangle from its sides",
  techniques: ["altitude bisects the base", "Pythagorean theorem"],
  range: [3, 4.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 3, 4.5);
    const [hb0, h0, s0] = rng.pick(t < 0.5 ? HALF_BASE_HEIGHT.slice(0, 6) : HALF_BASE_HEIGHT);
    const k = rng.int(1, t < 0.5 ? 2 : 3);
    const hb = hb0 * k;
    const h = h0 * k;
    const s = s0 * k;
    const b = 2 * hb;
    const C = hb * h;
    const D1 = (b * s) / 2;
    const D2 = b * h;
    const forgotHalf = s > b;
    const D3 = forgotHalf ? surd(hb, 1, s * s - b * b) : surd(hb, 1, s * s + hb * hb);
    assertDistinctNumbers(C, D1, D2, D3.num);
    const elements = [
      pt("A", 0, h),
      pt("B", -hb, 0),
      pt("C", hb, 0),
      pt("M", 0, 0),
      poly(["A", "B", "C"]),
      seg("A", "B", { label: `${s}`, length: s, ticks: 1 }),
      seg("A", "C", { label: `${s}`, length: s, ticks: 1 }),
      seg("B", "C", { label: `${b}`, length: b }),
      seg("A", "M", { dashed: true }),
      ang("A", "M", "C", { right: true }),
    ];
    return {
      ...base(),
      statement: `A triangle has two sides of length $${s}$ and a third side of length $${b}$. What is its area?`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: `The altitude to the base bisects it, so the height is $\\sqrt{${s}^2 - ${hb}^2} = ${h}$.` },
        {
          tex: `$${D1}$`,
          value: `${D1}`,
          misconception: "Used the slanted side as the height",
          rationale: `The equal side has length ${s}, but it is not perpendicular to the base.`,
          derivation: `Rational(1,2)*${b}*${s}`,
        },
        {
          tex: `$${D2}$`,
          value: `${D2}`,
          misconception: "Forgot the factor one-half in the triangle area formula",
          rationale: "Base times height is the area of a rectangle, twice the triangle.",
          derivation: `${b}*${h}`,
        },
        forgotHalf
          ? {
              tex: $(D3.tex),
              value: D3.value,
              misconception: "Used the whole base instead of half of it in the Pythagorean theorem",
              rationale: `The altitude meets the base at its midpoint, so the right triangle has legs ${hb} and $h$, not ${b} and $h$.`,
              derivation: `Rational(1,2)*${b}*sqrt(${s}**2 - ${b}**2)`,
            }
          : {
              tex: $(D3.tex),
              value: D3.value,
              misconception: "Added the squares instead of subtracting when finding the height",
              rationale: `The equal side is the hypotenuse, so $h^2 = ${s}^2 - ${hb}^2$, not $${s}^2 + ${hb}^2$.`,
              derivation: `Rational(1,2)*${b}*sqrt(${s}**2 + ${hb}**2)`,
            },
      ),
      solution: `The triangle is isosceles; the altitude from the apex bisects the base into two halves of length $${hb}$. By Pythagoras, the height is $h = \\sqrt{${s}^2 - ${hb}^2} = \\sqrt{${s * s - hb * hb}} = ${h}$. The area is $\\frac{1}{2} \\cdot ${b} \\cdot ${h} = ${C}$.`,
      key_insight: "In an isosceles triangle the altitude to the base bisects it, creating two right triangles.",
      techniques: this.techniques,
      estimated_difficulty: 3 + 1.5 * t,
      estimated_solve_seconds: Math.round(50 + 40 * t),
      verification: sympyVerification(`Abs(Triangle(Point(0, 0), Point(${b}, 0), Point(${hb}, sqrt(${s}**2 - ${hb}**2))).area)`),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `Isosceles triangle ABC with AB = AC = ${s} (tick marks) and base BC = ${b}. A dashed altitude from A meets BC at its midpoint M at a right angle.`,
      }),
      template_id: this.id,
    };
  },
};

export const inscribedAngle: ProceduralTemplate = {
  id: "b3.inscribed_angle",
  slot: 3,
  title: "Inscribed and central angles",
  techniques: ["inscribed angle theorem", "isosceles triangles from radii"],
  range: [3, 4.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 3, 4.5);
    const twoStep = t > 0.5 && rng.bool(0.7);
    const R = 3;
    let theta: number;
    let given: string;
    let C: number, D1: number, D2: number, D3: number;
    let beta = 0;
    if (!twoStep) {
      theta = t < 0.5 ? 10 * rng.int(4, 16) : 2 * rng.int(20, 80);
      C = theta / 2;
      D1 = theta;
      D2 = 180 - theta / 2;
      D3 = 90 - theta / 2;
      given = `$\\angle AOB = ${theta}^\\circ$`;
    } else {
      beta = rng.int(15, 72);
      theta = 180 - 2 * beta;
      C = 90 - beta;
      D1 = 180 - 2 * beta;
      D2 = 90 + beta;
      D3 = beta;
      given = `$\\angle OAB = ${beta}^\\circ$`;
    }
    assertDistinctNumbers(C, D1, D2, D3);
    const aA = rad(270 - theta / 2);
    const aB = rad(270 + theta / 2);
    const aC = rad(90 + rng.int(-30, 30));
    const elements = [
      pt("O", 0, 0),
      pt("A", R * Math.cos(aA), R * Math.sin(aA)),
      pt("B", R * Math.cos(aB), R * Math.sin(aB)),
      pt("C", R * Math.cos(aC), R * Math.sin(aC)),
      circ("O", R, ["A", "B", "C"]),
      seg("O", "A"),
      seg("O", "B"),
      seg("C", "A"),
      seg("C", "B"),
      ...(twoStep
        ? [seg("A", "B"), ang("O", "A", "B", { label: `${beta}°`, measure: beta })]
        : [ang("A", "O", "B", { label: `${theta}°`, measure: theta })]),
      ang("A", "C", "B", { label: "?", measure: C }),
    ];
    const statement = `Points $A$, $B$ and $C$ lie on a circle with centre $O$, and $C$ is on the major arc $AB$. If ${given}, what is $\\angle ACB$?`;
    const solution = twoStep
      ? `Since $OA = OB$ (radii), triangle $OAB$ is isosceles, so $\\angle OBA = ${beta}^\\circ$ and $\\angle AOB = 180^\\circ - 2 \\cdot ${beta}^\\circ = ${theta}^\\circ$. The inscribed angle on the major arc is half the central angle: $\\angle ACB = \\frac{${theta}^\\circ}{2} = ${C}^\\circ$.`
      : `The inscribed angle $\\angle ACB$ and the central angle $\\angle AOB$ stand on the same arc $AB$, and $C$ is on the other side, so $\\angle ACB = \\frac{1}{2} \\angle AOB = \\frac{${theta}^\\circ}{2} = ${C}^\\circ$.`;
    const distractors = twoStep
      ? [
          {
            tex: deg(D1),
            value: `${D1}`,
            misconception: "Stopped at the central angle AOB",
            rationale: `$${D1}^\\circ$ is $\\angle AOB$; the inscribed angle is half of it.`,
            derivation: `180 - 2*${beta}`,
          },
          {
            tex: deg(D2),
            value: `${D2}`,
            misconception: "Used the arc on the wrong side (C on the minor arc)",
            rationale: "An inscribed angle on the minor arc would be the supplement, but $C$ is on the major arc.",
            derivation: `180 - (180 - 2*${beta})/2`,
          },
          {
            tex: deg(D3),
            value: `${D3}`,
            misconception: "Assumed angle ACB equals angle OAB",
            rationale: "Both angles look similar in the figure, but nothing makes them equal.",
            derivation: `${beta}`,
          },
        ]
      : [
          {
            tex: deg(D1),
            value: `${D1}`,
            misconception: "Assumed the inscribed angle equals the central angle",
            rationale: "Both angles stand on arc $AB$, but the inscribed angle is half the central one.",
            derivation: `${theta}`,
          },
          {
            tex: deg(D2),
            value: `${D2}`,
            misconception: "Used the arc on the wrong side (C on the minor arc)",
            rationale: "An inscribed angle on the minor arc would be the supplement of half the central angle.",
            derivation: `180 - ${theta}/2`,
          },
          {
            tex: deg(D3),
            value: `${D3}`,
            misconception: "Computed a base angle of the isosceles triangle OAB instead",
            rationale: `$\\frac{180^\\circ - ${theta}^\\circ}{2}$ is $\\angle OAB$, not the inscribed angle.`,
            derivation: `(180 - ${theta})/2`,
          },
        ];
    return {
      ...base(),
      statement,
      options: options(
        { tex: deg(C), value: `${C}`, rationale: "An inscribed angle is half the central angle on the same arc." },
        distractors[0],
        distractors[1],
        distractors[2],
      ),
      solution,
      key_insight: "An inscribed angle is half the central angle subtending the same arc; radii make isosceles triangles.",
      techniques: this.techniques,
      estimated_difficulty: twoStep ? 3.8 + 0.7 * t : 3 + t,
      estimated_solve_seconds: Math.round((twoStep ? 60 : 35) + 25 * t),
      verification: (() => {
        // A and B on the unit circle symmetric about the downward vertical, C at the top (major arc).
        const th = twoStep ? `(180 - 2*${beta})` : `${theta}`;
        const A = `Point(cos(rad(270 - ${th}/2)), sin(rad(270 - ${th}/2)))`;
        const B = `Point(cos(rad(270 + ${th}/2)), sin(rad(270 + ${th}/2)))`;
        return sympyVerification(
          `N(deg(Triangle(${A}, Point(0, 1), ${B}).angles[Point(0, 1)]), 50)`,
          twoStep ? [`Abs(N(deg(Triangle(Point(0, 0), ${A}, ${B}).angles[${A}]), 30) - ${beta}) < 10**(-20)`] : [],
          twoStep ? "The construction is checked to have angle OAB as given." : "",
        );
      })(),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `Circle with centre O and points A, B, C on it; C lies on the major arc AB. Radii OA and OB and chords CA and CB are drawn. ${twoStep ? `Chord AB is drawn and angle OAB is marked ${beta} degrees.` : `Angle AOB is marked ${theta} degrees.`} Angle ACB is marked with a question mark.`,
      }),
      template_id: this.id,
    };
  },
};

export const parallelSimilar: ProceduralTemplate = {
  id: "b3.parallel_similar",
  slot: 3,
  title: "Similar triangles from a parallel line",
  techniques: ["similar triangles", "scale factor"],
  range: [3, 4.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 3, 4.5);
    const p = rng.int(2, 6 + Math.round(3 * t));
    const q = rng.int(1, 5 + Math.round(4 * t));
    let r = rng.int(2, 8 + Math.round(4 * t));
    if (t < 0.5) {
      // make BC an integer: r multiple of p / gcd
      const [, den] = reduce(p + q, p);
      r = den * rng.int(1, 3);
      if (r < 2) r *= 2;
    }
    const C = reduce(r * (p + q), p);
    const D1 = reduce(r * q, p);
    const D2: [number, number] = [r + q, 1];
    const D3 = reduce(r * (p + q), q);
    assertDistinctNumbers(...[C, D1, D2, D3].map(([u, v]) => u / v));
    const bc = C[0] / C[1];
    if (bc > 40 || r / p > 2.5 || r / p < 0.5) throw new RetryTemplate("badly shaped triangle");
    const AB = p + q;
    const phi = rad(rng.int(55, 72));
    const A: [number, number] = [AB * Math.cos(phi), AB * Math.sin(phi)];
    const f = p / AB;
    const D: [number, number] = [A[0] + (0 - A[0]) * f, A[1] + (0 - A[1]) * f];
    const E: [number, number] = [A[0] + (bc - A[0]) * f, A[1] + (0 - A[1]) * f];
    const elements = [
      pt("A", ...A),
      pt("B", 0, 0),
      pt("C", bc, 0),
      pt("D", ...D),
      pt("E", ...E),
      poly(["A", "B", "C"]),
      seg("A", "D", { label: `${p}`, length: p }),
      seg("D", "B", { label: `${q}`, length: q }),
      seg("D", "E", { label: `${r}`, length: r, arrows: 1 }),
      seg("B", "C", { label: "x", length: bc, arrows: 1 }),
    ];
    return {
      ...base(),
      statement: `In triangle $ABC$, point $D$ lies on $AB$ and point $E$ lies on $AC$ with $DE \\parallel BC$. If $AD = ${p}$, $DB = ${q}$ and $DE = ${r}$, what is $BC$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `Triangles $ADE$ and $ABC$ are similar with ratio $AD : AB = ${p} : ${AB}$.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Used DB : AD as the scale factor",
          rationale: "The matching sides are $AD$ and $AB$ (both measured from $A$), not $AD$ and $DB$.",
          derivation: `Rational(${r}*${q}, ${p})`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Added the extra length instead of scaling",
          rationale: `Similar figures scale multiplicatively; $BC$ is not $DE$ plus $DB$.`,
          derivation: `${r} + ${q}`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Used AB : DB as the scale factor",
          rationale: "Triangle $ABC$ corresponds to triangle $ADE$, so the ratio must compare $AB$ with $AD$.",
          derivation: `Rational(${r}*(${p} + ${q}), ${q})`,
        },
      ),
      solution: `Because $DE \\parallel BC$, triangle $ADE$ is similar to triangle $ABC$ (equal corresponding angles). So $\\frac{BC}{DE} = \\frac{AB}{AD} = \\frac{${AB}}{${p}}$, giving $BC = ${r} \\cdot \\frac{${AB}}{${p}} = ${frac(...C)}$.`,
      key_insight: "A line parallel to one side cuts off a similar triangle; compare whole sides from the shared vertex.",
      techniques: this.techniques,
      estimated_difficulty: 3 + 1.5 * t,
      estimated_solve_seconds: Math.round(40 + 35 * t),
      verification: sympyVerification(`solve(Eq(x/${r}, Rational(${p} + ${q}, ${p})), x)[0]`),
      diagram: diagram("geometry", elements, {
        essential: false,
        alt: `Triangle ABC with base BC labelled x. Segment DE joins D on AB to E on AC and is parallel to BC (arrow marks). AD = ${p}, DB = ${q}, DE = ${r}.`,
      }),
      template_id: this.id,
    };
  },
};

export const rectangleDiagonal: ProceduralTemplate = {
  id: "b3.rectangle_diagonal",
  slot: 3,
  title: "Diagonal of a rectangle from perimeter and area",
  techniques: ["(l + w)^2 identity", "Pythagorean theorem"],
  range: [3.5, 4.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 3.5, 4.5);
    const l = rng.int(3, 9 + Math.round(5 * t));
    let w = rng.int(2, 8 + Math.round(4 * t));
    if (w === l) w = l + rng.int(1, 3);
    const P = 2 * (l + w);
    const A = l * w;
    const s = l + w;
    const C = surd(1, 1, s * s - 2 * A);
    const D1 = surd(1, 1, s * s + 2 * A);
    const D2 = surd(1, 1, P * P - 2 * A);
    const D3 = s * s - 2 * A;
    assertDistinctNumbers(C.num, D1.num, D2.num, D3);
    return {
      ...base(),
      diagram: null,
      statement: `A rectangle has perimeter $${P}$ and area $${A}$. What is the length of its diagonal?`,
      options: options(
        { tex: $(C.tex), value: C.value, rationale: `$d^2 = l^2 + w^2 = (l + w)^2 - 2lw = ${s}^2 - 2 \\cdot ${A}$.` },
        {
          tex: $(D1.tex),
          value: D1.value,
          misconception: "Sign error: used l² + w² = (l + w)² + 2lw",
          rationale: "Expanding $(l + w)^2$ produces $+2lw$, so it must be subtracted to leave $l^2 + w^2$.",
          derivation: `sqrt(${s}**2 + 2*${A})`,
        },
        {
          tex: $(D2.tex),
          value: D2.value,
          misconception: "Used the whole perimeter as l + w",
          rationale: `The perimeter is $2(l + w)$, so $l + w = ${s}$, not $${P}$.`,
          derivation: `sqrt(${P}**2 - 2*${A})`,
        },
        {
          tex: `$${D3}$`,
          value: `${D3}`,
          misconception: "Forgot to take the square root",
          rationale: "$(l + w)^2 - 2lw$ is the square of the diagonal, not the diagonal.",
          derivation: `${s}**2 - 2*${A}`,
        },
      ),
      solution: `Let the sides be $l$ and $w$. Then $l + w = \\frac{${P}}{2} = ${s}$ and $lw = ${A}$. The diagonal satisfies $d^2 = l^2 + w^2 = (l + w)^2 - 2lw = ${s * s} - ${2 * A} = ${D3}$, so $d = ${C.tex}$. (The sides are $${l}$ and $${w}$, but we never needed them.)`,
      key_insight: "$l^2 + w^2 = (l + w)^2 - 2lw$: the diagonal comes straight from the perimeter and area.",
      techniques: this.techniques,
      estimated_difficulty: 3.5 + t,
      estimated_solve_seconds: Math.round(50 + 40 * t),
      verification: sympyVerification(
        `[sqrt(S[0]**2 + S[1]**2) for S in solve([Eq(2*(x + y), ${P}), Eq(x*y, ${A})], [x, y]) if S[0] > 0 and S[1] > 0][0]`,
      ),
      template_id: this.id,
    };
  },
};

export const bucket3Templates: ProceduralTemplate[] = [isoscelesExterior, isoscelesArea, inscribedAngle, parallelSimilar, rectangleDiagonal];
