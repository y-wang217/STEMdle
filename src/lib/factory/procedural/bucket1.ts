/**
 * Bucket 1 — Arithmetic (easy; mental math, numerical intuition).
 * Every distractor is produced by a named wrong solving path.
 */
import {
  type ProceduralTemplate,
  RetryTemplate,
  assertDistinctNumbers,
  fracTex,
  lcm,
  level,
  options,
  ratValue,
  sympyVerification,
} from "./types";

const base = (slot = 1) => ({ slot, tags: ["arithmetic"], diagram: null });

export const fractionSum: ProceduralTemplate = {
  id: "b1.fraction_sum",
  slot: 1,
  title: "Sum of two fractions",
  techniques: ["common denominators"],
  range: [1, 3],
  generate(rng, difficulty) {
    const t = level(difficulty, 1, 3);
    const maxDen = Math.round(6 + 8 * t);
    const b = rng.int(2, maxDen);
    let d = rng.int(2, maxDen);
    if (d === b) d = b + 1;
    const a = rng.int(1, b - 1);
    const c = rng.int(1, d - 1);
    const num = a * d + c * b;
    const den = b * d;
    assertDistinctNumbers(num / den, (a + c) / (b + d), (a * c) / (b * d), (a + c) / lcm(b, d));
    const L = lcm(b, d);
    return {
      ...base(),
      statement: `What is $\\frac{${a}}{${b}} + \\frac{${c}}{${d}}$?`,
      options: options(
        { tex: fracTex(num, den), value: ratValue(num, den), rationale: `Rewrite both fractions over the common denominator ${L}, then add numerators.` },
        {
          tex: fracTex(a + c, b + d),
          value: ratValue(a + c, b + d),
          misconception: "Added numerators and denominators separately",
          rationale: "Adding tops and bottoms feels natural but is not how fractions combine.",
          derivation: `Rational(${a}+${c}, ${b}+${d})`,
        },
        {
          tex: fracTex(a + c, L),
          value: ratValue(a + c, L),
          misconception: "Found a common denominator but did not scale the numerators",
          rationale: "The denominator was converted correctly, but the numerators were left unchanged.",
          derivation: `Rational(${a}+${c}, ${L})`,
        },
        {
          tex: fracTex(a * c, b * d),
          value: ratValue(a * c, b * d),
          misconception: "Multiplied the fractions instead of adding",
          rationale: "Multiplication of fractions is straightforward, so it is a tempting shortcut.",
          derivation: `Rational(${a},${b})*Rational(${c},${d})`,
        },
      ),
      solution: `Over the common denominator $${L}$: $\\frac{${a}}{${b}} = \\frac{${(a * L) / b}}{${L}}$ and $\\frac{${c}}{${d}} = \\frac{${(c * L) / d}}{${L}}$. Their sum is $\\frac{${(a * L) / b + (c * L) / d}}{${L}}$, which simplifies to ${fracTex(num, den)}.`,
      key_insight: "Fractions add only once they share a denominator.",
      techniques: this.techniques,
      estimated_difficulty: 1 + t,
      estimated_solve_seconds: Math.round(20 + 25 * t),
      verification: sympyVerification(`Rational(${a},${b}) + Rational(${c},${d})`),
      template_id: this.id,
    };
  },
};

export const percentUpDown: ProceduralTemplate = {
  id: "b1.percent_up_down",
  slot: 1,
  title: "Successive percentage changes",
  techniques: ["multiplicative percent change"],
  range: [1, 3.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 1, 3.5);
    const p = 10 * rng.int(1, t > 0.5 ? 6 : 4);
    const q = t > 0.4 && rng.bool(0.6) ? 10 * rng.int(1, 6) : p;
    const C = 100 + p - q - (p * q) / 100;
    const D1 = 100 + p - q;
    const D2 = 100 + p + q + (p * q) / 100;
    const D3 = 100 + p - q + (p * q) / 100;
    assertDistinctNumbers(C, D1, D2, D3);
    const pct = (v: number) => `$${v}\\%$`;
    return {
      ...base(),
      statement: `A jacket's price is increased by $${p}\\%$. Later, the new price is decreased by $${q}\\%$. The final price is what percent of the original price?`,
      options: options(
        { tex: pct(C), value: `${C}`, rationale: `Multiply the factors: $${(100 + p) / 100} \\times ${(100 - q) / 100} = ${C / 100}$.` },
        {
          tex: pct(D1),
          value: `${D1}`,
          misconception: "Added the percentage changes as if they acted on the same base",
          rationale: `The ${q}% decrease is taken from a larger price, so it removes more than ${q}% of the original.`,
          derivation: `100 + ${p} - ${q}`,
        },
        {
          tex: pct(D2),
          value: `${D2}`,
          misconception: "Treated the decrease as a second increase",
          rationale: "A sign slip turns the factor $1 - q$ into $1 + q$.",
          derivation: `100*(1 + Rational(${p},100))*(1 + Rational(${q},100))`,
        },
        {
          tex: pct(D3),
          value: `${D3}`,
          misconception: "Expanded (1 + p)(1 − q) with the wrong sign on the cross term",
          rationale: "The cross term $p \\cdot q$ must be subtracted, not added.",
          derivation: `100 + ${p} - ${q} + ${p}*${q}/100`,
        },
      ),
      solution: `An increase of ${p}% multiplies the price by $${(100 + p) / 100}$; a decrease of ${q}% multiplies it by $${(100 - q) / 100}$. The final price is $${(100 + p) / 100} \\times ${(100 - q) / 100} = ${C / 100}$ of the original, i.e. $${C}\\%$.`,
      key_insight: "Successive percentage changes multiply; they do not add.",
      techniques: this.techniques,
      estimated_difficulty: 1.5 + t,
      estimated_solve_seconds: Math.round(30 + 30 * t),
      verification: sympyVerification(`100*(1 + Rational(${p},100))*(1 - Rational(${q},100))`),
      template_id: this.id,
    };
  },
};

export const orderOfOperations: ProceduralTemplate = {
  id: "b1.order_of_operations",
  slot: 1,
  title: "Order of operations with a power",
  techniques: ["order of operations"],
  range: [1, 2.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 1, 2.5);
    const B = rng.int(2, 6 + Math.round(4 * t));
    const C = rng.int(2, 6);
    const k = rng.int(1, 4 + Math.round(4 * t));
    const A = B * C * k;
    const D = rng.int(2, 5 + Math.round(4 * t));
    const neg = t > 0.5 && rng.bool(0.5);
    const correct = (A / B) * C - D * D;
    const d1 = A / (B * C) - D * D;
    const d2 = neg ? (A / B) * C + D * D : (A / B) * C - 2 * D;
    const d3 = ((A / B) * C - D) ** 2; // subtracting before squaring
    assertDistinctNumbers(correct, d1, d2, d3);
    const expr = `${A} \\div ${B} \\times ${C} - ${D}^2`;
    return {
      ...base(),
      statement: `Evaluate $${expr}$.`,
      options: options(
        { tex: `$${correct}$`, value: `${correct}`, rationale: "Powers first, then division and multiplication from left to right, then subtraction." },
        {
          tex: `$${d1}$`,
          value: `${d1}`,
          misconception: "Performed the multiplication before the division",
          rationale: `Division and multiplication have equal precedence and are done left to right: $(${A} \\div ${B}) \\times ${C}$, not $${A} \\div (${B} \\times ${C})$.`,
          derivation: `${A}/(${B}*${C}) - ${D}**2`,
        },
        neg
          ? {
              tex: `$${d2}$`,
              value: `${d2}`,
              misconception: "Read −D² as (−D)²",
              rationale: `The exponent binds before the minus sign: $-${D}^2 = -${D * D}$.`,
              derivation: `${A}/${B}*${C} + (-${D})**2`,
            }
          : {
              tex: `$${d2}$`,
              value: `${d2}`,
              misconception: "Doubled instead of squaring",
              rationale: `$${D}^2$ means $${D} \\times ${D}$, not $${D} \\times 2$.`,
              derivation: `${A}/${B}*${C} - 2*${D}`,
            },
        {
          tex: `$${d3}$`,
          value: `${d3}`,
          misconception: "Subtracted before applying the exponent",
          rationale: "Working strictly left to right applies the square to the whole running total.",
          derivation: `(${A}/${B}*${C} - ${D})**2`,
        },
      ),
      solution: `$${D}^2 = ${D * D}$. Then left to right: $${A} \\div ${B} = ${A / B}$, and $${A / B} \\times ${C} = ${(A / B) * C}$. Finally $${(A / B) * C} - ${D * D} = ${correct}$.`,
      key_insight: "Exponents first; division and multiplication share a level and go left to right.",
      techniques: this.techniques,
      estimated_difficulty: 1 + t,
      estimated_solve_seconds: Math.round(20 + 20 * t),
      verification: sympyVerification(`Rational(${A},${B})*${C} - ${D}**2`),
      template_id: this.id,
    };
  },
};

export const differenceOfSquaresProduct: ProceduralTemplate = {
  id: "b1.clever_product",
  slot: 1,
  title: "Mental product via difference of squares",
  techniques: ["difference of squares", "mental math"],
  range: [1.5, 4],
  generate(rng, difficulty) {
    const t = level(difficulty, 1.5, 4);
    const n = rng.pick(t < 0.4 ? [100, 50, 20, 30] : t < 0.75 ? [60, 70, 80, 90, 1000] : [250, 500, 150, 1000, 75]);
    const k = rng.int(2, t < 0.5 ? 4 : 9);
    if (k >= n) throw new RetryTemplate("k too large");
    const C = n * n - k * k;
    const D1 = n * n + k * k;
    const D2 = n * n - k;
    const D3 = n * n - 2 * k * n + k * k; // (n-k)^2
    assertDistinctNumbers(C, D1, D2, D3);
    return {
      ...base(),
      statement: `Compute $${n - k} \\times ${n + k}$.`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: `$(${n} - ${k})(${n} + ${k}) = ${n}^2 - ${k}^2$.` },
        {
          tex: `$${D1}$`,
          value: `${D1}`,
          misconception: "Recalled the identity with the wrong sign: (n − k)(n + k) = n² + k²",
          rationale: "The cross terms cancel, but the product of −k and +k is negative.",
          derivation: `${n}**2 + ${k}**2`,
        },
        {
          tex: `$${D2}$`,
          value: `${D2}`,
          misconception: "Forgot to square k",
          rationale: `Remembering “subtract the small part” but subtracting $${k}$ rather than $${k}^2$.`,
          derivation: `${n}**2 - ${k}`,
        },
        {
          tex: `$${D3}$`,
          value: `${D3}`,
          misconception: "Squared the smaller factor instead of using both",
          rationale: `Approximating the product as $${n - k}^2$ ignores the larger factor.`,
          derivation: `(${n} - ${k})**2`,
        },
      ),
      solution: `Both factors are ${k} away from ${n}, so $${n - k} \\times ${n + k} = ${n}^2 - ${k}^2 = ${n * n} - ${k * k} = ${C}$.`,
      key_insight: "Two numbers equally spaced around a round number multiply as a difference of squares.",
      techniques: this.techniques,
      estimated_difficulty: 1.5 + 1.5 * t,
      estimated_solve_seconds: Math.round(25 + 30 * t),
      verification: sympyVerification(`${n - k}*${n + k}`),
      template_id: this.id,
    };
  },
};

export const averageNewNumber: ProceduralTemplate = {
  id: "b1.average_new",
  slot: 1,
  title: "Number added to change an average",
  techniques: ["averages as totals"],
  range: [1.5, 4],
  generate(rng, difficulty) {
    const t = level(difficulty, 1.5, 4);
    const n = rng.int(4, 6 + Math.round(8 * t));
    const A = rng.int(20, 90);
    const delta = (t > 0.5 && rng.bool(0.4) ? -1 : 1) * rng.int(1, 3 + Math.round(3 * t));
    const B = A + delta;
    const C = (n + 1) * B - n * A;
    const D1 = B;
    const D2 = n * (B - A);
    const D3 = A + n * (B - A);
    assertDistinctNumbers(C, D1, D2, D3);
    if (C <= 0) throw new RetryTemplate("non-positive answer");
    return {
      ...base(),
      statement: `The average of ${n} numbers is $${A}$. When one more number is included, the average of all ${n + 1} numbers becomes $${B}$. What number was included?`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: `New total $${n + 1} \\times ${B}$ minus old total $${n} \\times ${A}$.` },
        {
          tex: `$${D1}$`,
          value: `${D1}`,
          misconception: "Assumed the new number equals the new average",
          rationale: "The new number must also pull every existing number's share up or down.",
          derivation: `${B}`,
        },
        {
          tex: `$${D2}$`,
          value: `${D2}`,
          misconception: "Counted only the change needed by the original numbers",
          rationale: `The ${n} old numbers need ${delta > 0 ? "an extra" : "a reduction of"} $${Math.abs(n * (B - A))}$ in total, but the new number must also supply its own $${B}$.`,
          derivation: `${n}*(${B} - ${A})`,
        },
        {
          tex: `$${D3}$`,
          value: `${D3}`,
          misconception: "Started from the old average instead of the new one",
          rationale: "The added number must equal the new average plus the shift given to the others.",
          derivation: `${A} + ${n}*(${B} - ${A})`,
        },
      ),
      solution: `Old total: $${n} \\times ${A} = ${n * A}$. New total: $${n + 1} \\times ${B} = ${(n + 1) * B}$. The added number is $${(n + 1) * B} - ${n * A} = ${C}$.`,
      key_insight: "Work with totals, not averages: total = average × count.",
      techniques: this.techniques,
      estimated_difficulty: 1.5 + 1.5 * t,
      estimated_solve_seconds: Math.round(30 + 30 * t),
      verification: sympyVerification(`${n + 1}*${B} - ${n}*${A}`),
      template_id: this.id,
    };
  },
};

export const unitsDigitPower: ProceduralTemplate = {
  id: "b1.units_digit",
  slot: 1,
  title: "Units digit of a large power",
  techniques: ["cyclic patterns", "modular arithmetic"],
  range: [2, 4.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 2, 4.5);
    const a = rng.pick(t < 0.5 ? [2, 3, 7, 8] : [3, 7, 8, 12, 13, 17, 23, 27, 33]);
    const k = rng.int(2, 6) * 4 * (t > 0.5 ? 50 : 10) + rng.int(0, 3) + (t > 0.5 ? 2026 - 2024 : 0);
    const u = Number(BigInt(a) ** BigInt(k) % 10n);
    const r = k % 4;
    const e1 = r === 0 ? 0 : r + 1; // remainder 0 used as exponent 0, or off-by-one in the cycle
    const D1 = Number(BigInt(a % 10) ** BigInt(e1) % 10n);
    const D2 = (a * k) % 10;
    const D3 = a % 10;
    assertDistinctNumbers(u, D1, D2, D3);
    return {
      ...base(),
      statement: `What is the units digit of $${a}^{${k}}$?`,
      options: options(
        { tex: `$${u}$`, value: `${u}`, rationale: `The units digits of powers of ${a % 10} cycle with period dividing 4, and $${k} \\equiv ${r} \\pmod 4$.` },
        {
          tex: `$${D1}$`,
          value: `${D1}`,
          misconception: r === 0 ? "Used a remainder of 0 as the exponent 0" : "Matched the exponent to the wrong position in the cycle (off by one)",
          rationale: r === 0 ? "A remainder of 0 means the 4th term of the cycle, not the 0th power." : "Miscounting where the cycle starts shifts the answer by one place.",
          derivation: `Mod(${a % 10}**${e1}, 10)`,
        },
        {
          tex: `$${D2}$`,
          value: `${D2}`,
          misconception: "Multiplied the base by the exponent",
          rationale: "Treating a power like repeated addition.",
          derivation: `Mod(${a}*${k}, 10)`,
        },
        {
          tex: `$${D3}$`,
          value: `${D3}`,
          misconception: "Assumed the units digit of a power matches the base's units digit",
          rationale: "True for digits 0, 1, 5, 6 only.",
          derivation: `Mod(${a}, 10)`,
        },
      ),
      solution: `Only the units digit matters. The units digits of successive powers of ${a % 10} repeat every 4 steps. Since $${k} = 4 \\times ${Math.floor(k / 4)} + ${r}$, the units digit of $${a}^{${k}}$ is the same as that of $${a % 10}^{${r === 0 ? 4 : r}}$, which is $${u}$.`,
      key_insight: "Units digits of powers are periodic, so reduce the exponent modulo the cycle length.",
      techniques: this.techniques,
      estimated_difficulty: 2 + 1.5 * t,
      estimated_solve_seconds: Math.round(40 + 30 * t),
      verification: sympyVerification(`Mod(Integer(${a})**${k}, 10)`),
      template_id: this.id,
    };
  },
};

export const largestPower: ProceduralTemplate = {
  id: "b1.largest_power",
  slot: 1,
  title: "Compare powers via a common exponent",
  techniques: ["common exponents", "estimation"],
  range: [2, 4.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 2, 4.5);
    const g = rng.pick([10, 12, 20, 30]);
    const pool: { b: number; k: number; v: number }[] = [];
    for (const b of [2, 3, 5, 6, 7, 10, 11, 12])
      for (let k = 1; k <= 7; k++) {
        const v = b ** k;
        if (v >= 20 && v <= 140) pool.push({ b, k, v });
      }
    const picks: typeof pool = [];
    for (const c of rng.shuffle(pool)) {
      if (picks.some((p) => p.b === c.b || p.v === c.v || p.k === c.k)) continue;
      picks.push(c);
      if (picks.length === 4) break;
    }
    if (picks.length < 4) throw new RetryTemplate("pool exhausted");
    const vals = picks.map((p) => p.v);
    const spread = Math.max(...vals) / Math.min(...vals);
    if (spread > (t > 0.5 ? 1.6 : 3)) throw new RetryTemplate("too easy to eyeball");
    const order = [...picks].sort((a, b) => b.v - a.v);
    const best = order[0];
    const maxExp = [...picks].sort((a, b) => b.k - a.k)[0];
    const maxBase = [...picks].sort((a, b) => b.b - a.b)[0];
    if (best === maxExp && best === maxBase) throw new RetryTemplate("trivial");
    const tex = (p: (typeof picks)[number]) => `$${p.b}^{${p.k * g}}$`;
    const val = (p: (typeof picks)[number]) => `Integer(${p.b})**${p.k * g}`;
    const others = picks.filter((p) => p !== best);
    const distractors = others.map((p) => {
      if (p === maxExp)
        return {
          tex: tex(p),
          value: val(p),
          misconception: "Assumed the largest exponent gives the largest number",
          rationale: `It has the biggest exponent, but $${p.b}^{${p.k * g}} = (${p.b}^{${p.k}})^{${g}} = ${p.v}^{${g}}$.`,
          derivation: val(p),
        };
      if (p === maxBase)
        return {
          tex: tex(p),
          value: val(p),
          misconception: "Assumed the largest base gives the largest number",
          rationale: `It has the biggest base, but rewritten it is only $${p.v}^{${g}}$.`,
          derivation: val(p),
        };
      return {
        tex: tex(p),
        value: val(p),
        misconception: "Compared base × exponent instead of the powers themselves",
        rationale: `Its product of base and exponent looks competitive, but it equals $${p.v}^{${g}}$.`,
        derivation: val(p),
      };
    });
    return {
      ...base(),
      statement: `Which of the following numbers is the largest?`,
      options: options(
        { tex: tex(best), value: val(best), rationale: `Writing each as a power with exponent ${g}, it equals $${best.v}^{${g}}$, the largest.` },
        distractors[0],
        distractors[1],
        distractors[2],
      ),
      solution: `Every exponent is a multiple of ${g}, so write each number as $(\\text{base}^{k})^{${g}}$: ${picks
        .map((p) => `$${p.b}^{${p.k * g}} = ${p.v}^{${g}}$`)
        .join(", ")}. Comparing the inner values, the largest is $${best.v}^{${g}} = ${best.b}^{${best.k * g}}$.`,
      key_insight: "Rewrite powers with a common exponent and compare the bases.",
      techniques: this.techniques,
      estimated_difficulty: 2 + 2 * t,
      estimated_solve_seconds: Math.round(45 + 40 * t),
      verification: sympyVerification(`Max(${picks.map(val).join(", ")})`),
      template_id: this.id,
    };
  },
};

export const twoPipes: ProceduralTemplate = {
  id: "b1.two_pipes",
  slot: 1,
  title: "Combined work rate",
  techniques: ["rates add"],
  range: [2, 4],
  generate(rng, difficulty) {
    const t = level(difficulty, 2, 4);
    const a = rng.int(2, 6 + Math.round(6 * t));
    let b = rng.int(2, 6 + Math.round(10 * t));
    if (b === a) b += rng.int(1, 3);
    const C = { p: a * b, q: a + b };
    const D1 = { p: a + b, q: 2 };
    const D2 = { p: a + b, q: 1 };
    const D3 = { p: Math.min(a, b), q: 2 };
    assertDistinctNumbers(C.p / C.q, D1.p / D1.q, D2.p / D2.q, D3.p / D3.q);
    return {
      ...base(),
      statement: `One pipe fills a tank in $${a}$ hours and another fills the same tank in $${b}$ hours. Working together at these rates, how many hours do they take to fill the empty tank?`,
      options: options(
        { tex: fracTex(C.p, C.q), value: ratValue(C.p, C.q), rationale: `Rates add: $\\frac{1}{${a}} + \\frac{1}{${b}} = \\frac{${a + b}}{${a * b}}$ tank per hour.` },
        {
          tex: fracTex(D1.p, D1.q),
          value: ratValue(D1.p, D1.q),
          misconception: "Averaged the two times",
          rationale: "Averaging times answers how long one 'typical' pipe takes, not two pipes together.",
          derivation: `Rational(${a}+${b}, 2)`,
        },
        {
          tex: fracTex(D2.p, D2.q),
          value: ratValue(D2.p, D2.q),
          misconception: "Added the times",
          rationale: "Adding times would describe the pipes working one after the other on two tanks.",
          derivation: `${a}+${b}`,
        },
        {
          tex: fracTex(D3.p, D3.q),
          value: ratValue(D3.p, D3.q),
          misconception: "Assumed two pipes simply halve the faster pipe's time",
          rationale: "That is only right if both pipes are equally fast.",
          derivation: `Rational(Min(${a},${b}), 2)`,
        },
      ),
      solution: `Together they fill $\\frac{1}{${a}} + \\frac{1}{${b}} = \\frac{${a + b}}{${a * b}}$ of the tank per hour, so the time is $\\frac{${a * b}}{${a + b}}$ hours, which is ${fracTex(C.p, C.q)}.`,
      key_insight: "Add rates (tanks per hour), not times.",
      techniques: this.techniques,
      estimated_difficulty: 2 + 1.5 * t,
      estimated_solve_seconds: Math.round(40 + 30 * t),
      verification: sympyVerification(`1/(Rational(1,${a}) + Rational(1,${b}))`),
      template_id: this.id,
    };
  },
};

export const bucket1Templates: ProceduralTemplate[] = [
  fractionSum,
  percentUpDown,
  orderOfOperations,
  differenceOfSquaresProduct,
  averageNewNumber,
  unitsDigitPower,
  largestPower,
  twoPipes,
];
