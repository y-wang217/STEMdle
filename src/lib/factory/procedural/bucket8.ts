/**
 * Bucket 8 — Euclid-style II (extremely hard; a hidden elegant trick).
 * The arithmetic is light once the trick is seen; distractors come from named wrong paths.
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
import { frac, rat, reduce } from "./bucket2";

const base = (slot = 8) => ({ slot, tags: ["euclid"], diagram: null });
type Q = [number, number];
const val = (q: Q) => q[0] / q[1];
const qmul = (a: Q, b: Q): Q => reduce(a[0] * b[0], a[1] * b[1]);
const qadd = (a: Q, b: Q): Q => reduce(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const qsub = (a: Q, b: Q): Q => qadd(a, [-b[0], b[1]]);
const qdiv = (a: Q, b: Q): Q => reduce(a[0] * b[1], a[1] * b[0]);
const sv = (q: Q) => (q[1] === 1 ? `${q[0]}` : `Rational(${q[0]},${q[1]})`);
const qsum = (xs: Q[]) => xs.reduce((s, x) => qadd(s, x), [0, 1] as Q);

// --------------------------------------------------- Sophie Germain product --

export const germainProduct: ProceduralTemplate = {
  id: "b8.germain_product",
  slot: 8,
  title: "Telescoping product via the Sophie Germain identity",
  techniques: ["Sophie Germain identity", "telescoping product"],
  range: [8.5, 9.5],
  generate(rng, difficulty) {
    const t = level(difficulty, 8.5, 9.5);
    const c = t < 0.4 ? rng.pick([1, 2]) : rng.pick([1, 2, 3]);
    const J = rng.int(3, t < 0.5 ? 4 : 5);
    const x0 = rng.int(1, 3 * c);
    const K = 4 * c ** 4;
    const xs = Array.from({ length: J }, (_, j) => x0 + 4 * c * j);
    const xL = xs[J - 1];
    const g = (y: number) => y * y + c * c;
    const C = reduce(g(xL + 3 * c), g(x0 - c));
    const D1 = reduce(g(xL + c), g(x0 - c));
    const D2 = reduce(g(xL + 3 * c), g(x0 + c));
    const D3 = reduce((xL + 2 * c) ** 4 + K, x0 ** 4 + K);
    assertDistinctNumbers(val(C), val(D1), val(D2), val(D3));
    const fac = (x: number) => `(${x}^4 + ${K})`;
    const num = xs.map((x) => fac(x + 2 * c)).join("");
    const den = xs.map((x) => fac(x)).join("");
    return {
      ...base(),
      statement: `Evaluate $$\\frac{${num}}{${den}}.$$`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `Each $x^4 + ${K}$ factors as $\\left((x - ${c})^2 + ${c * c}\\right)\\left((x + ${c})^2 + ${c * c}\\right)$, and almost every factor cancels.` },
        {
          tex: fracTex(...D1),
          value: rat(...D1),
          misconception: "Kept the wrong surviving factor at the top end of the telescope",
          rationale: `The last numerator contributes $(${xL + 2 * c} + ${c})^2 + ${c * c}$, which nothing cancels; $(${xL + 2 * c} - ${c})^2 + ${c * c}$ is the factor that does cancel.`,
          derivation: `Rational((${xL} + ${c})**2 + ${c}**2, (${x0} - ${c})**2 + ${c}**2)`,
        },
        {
          tex: fracTex(...D2),
          value: rat(...D2),
          misconception: "Kept the wrong surviving factor at the bottom end of the telescope",
          rationale: `The first denominator's factor $(${x0} + ${c})^2 + ${c * c}$ is cancelled by the first numerator; its other factor $(${x0} - ${c})^2 + ${c * c}$ survives.`,
          derivation: `Rational((${xL} + 3*${c})**2 + ${c}**2, (${x0} + ${c})**2 + ${c}**2)`,
        },
        {
          tex: fracTex(...D3),
          value: rat(...D3),
          misconception: "Telescoped the whole factors as in a sum: last numerator over first denominator",
          rationale: "The cancellation happens between halves of the factors, not between whole factors, so this shortcut is unjustified.",
          derivation: `Rational(${xL + 2 * c}**4 + ${K}, ${x0}**4 + ${K})`,
        },
      ),
      solution: `Since $${K} = 4 \\cdot ${c}^4$, the Sophie Germain identity gives $x^4 + 4 \\cdot ${c}^4 = (x^2 + ${2 * c * c})^2 - (${2 * c}x)^2 = \\left((x - ${c})^2 + ${c * c}\\right)\\left((x + ${c})^2 + ${c * c}\\right)$. Write $g(y) = y^2 + ${c * c}$, so $x^4 + ${K} = g(x - ${c})\\,g(x + ${c})$. The denominator factors are $g(x - ${c})g(x + ${c})$ for $x = ${xs.join(", ")}$, and the numerator factors are $g(x + ${c})g(x + ${3 * c})$ for the same $x$. Because consecutive $x$ differ by $${4 * c}$, $g(x + ${3 * c})$ for one term equals $g(x' - ${c})$ for the next, so everything cancels except $\\frac{g(${xL + 3 * c})}{g(${x0 - c})} = \\frac{${g(xL + 3 * c)}}{${g(x0 - c)}} = ${frac(...C)}$.`,
      key_insight: "$x^4 + 4c^4 = \\left((x - c)^2 + c^2\\right)\\left((x + c)^2 + c^2\\right)$, and the chosen values make these factors chain together.",
      techniques: this.techniques,
      estimated_difficulty: 8.5 + t,
      estimated_solve_seconds: Math.round(180 + 100 * t),
      verification: sympyVerification(`Product(((${x0} + ${4 * c}*n + ${2 * c})**4 + ${K})/((${x0} + ${4 * c}*n)**4 + ${K}), (n, 0, ${J - 1})).doit()`),
      template_id: this.id,
    };
  },
};

// ------------------------------------------------------- floor pairing -------

const ODD_PRIMES = [37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113];
const ODD_COMPOSITES = [45, 63, 75, 99, 105, 117, 135, 147, 165];

export const floorPairing: ProceduralTemplate = {
  id: "b8.floor_pairing",
  slot: 8,
  title: "Sum of floors by pairing k with p − k",
  techniques: ["pairing terms", "fractional parts", "gcd awareness"],
  range: [8.5, 9.8],
  generate(rng, difficulty) {
    const t = level(difficulty, 8.5, 9.8);
    const shared = t > 0.5 && rng.bool(0.6);
    const p = shared ? rng.pick(ODD_COMPOSITES) : rng.pick(ODD_PRIMES);
    const a = rng.int(5, Math.min(p - 2, 60));
    const g = gcd(a, p);
    if (shared ? g === 1 : g !== 1) throw new RetryTemplate("wrong gcd type");
    let C: number, D1: number, D2: number, D3: number;
    let mis: [string, string, string, string, string, string];
    let ders: [string, string, string];
    if (!shared) {
      C = ((a - 1) * (p - 1)) / 2;
      D1 = (a * (p - 1)) / 2;
      D2 = (a - 1) * (p - 1);
      D3 = ((a - 1) * (p + 1)) / 2;
      mis = [
        "Assumed each pair of floors sums to a (ignored the loss from rounding down)",
        `$\\frac{${a}k}{${p}}$ is never an integer here, so each pair $\\lfloor x \\rfloor + \\lfloor ${a} - x \\rfloor$ equals $${a - 1}$, not $${a}$.`,
        "Counted each pair twice (used p − 1 pairs)",
        `The ${p - 1} terms form only $${(p - 1) / 2}$ pairs.`,
        "Off by one in the number of pairs, (p + 1)/2",
        `There are $\\frac{${p} - 1}{2} = ${(p - 1) / 2}$ pairs, not $\\frac{${p} + 1}{2}$.`,
      ];
      ders = [`sum([Rational(kk*${a}, ${p}) for kk in range(1, ${p})])`, `(${a} - 1)*(${p} - 1)`, `(${a} - 1)*(${p} + 1)/2`];
    } else {
      C = (a * (p - 1) - p + g) / 2;
      D1 = (a * (p - 1)) / 2;
      D2 = ((a - 1) * (p - 1)) / 2;
      D3 = a * (p - 1) - p + g;
      mis = [
        "Dropped the floors and summed ak/p directly",
        "Rounding down removes the fractional parts, which add up to a significant amount.",
        `Applied the coprime formula (a − 1)(p − 1)/2 although gcd(${a}, ${p}) = ${g}`,
        `When $${p / g}$ divides $k$, the term $\\frac{${a}k}{${p}}$ is an integer and the pair sums to $${a}$, not $${a - 1}$.`,
        "Forgot to halve after adding the sum to its reversed copy",
        "Adding the sum to itself in reverse order gives twice the answer.",
      ];
      ders = [`sum([Rational(kk*${a}, ${p}) for kk in range(1, ${p})])`, `(${a} - 1)*(${p} - 1)/2`, `${a}*(${p} - 1) - ${p} + gcd(${a}, ${p})`];
    }
    assertDistinctNumbers(C, D1, D2, D3);
    const fl = (k: string) => `\\left\\lfloor \\frac{${k}}{${p}} \\right\\rfloor`;
    const sumTex = `${fl(`${a}`)} + ${fl(`2 \\cdot ${a}`)} + ${fl(`3 \\cdot ${a}`)} + \\cdots + ${fl(`${p - 1} \\cdot ${a}`)}`;
    const solution = !shared
      ? `Pair the term for $k$ with the term for $${p} - k$. Their arguments add to $\\frac{${a}k}{${p}} + \\frac{${a}(${p} - k)}{${p}} = ${a}$. Since $${p}$ is prime and does not divide $${a}k$, neither argument is an integer, so their fractional parts add to exactly $1$ and the two floors add to $${a} - 1 = ${a - 1}$. The $${p - 1}$ terms form $${(p - 1) / 2}$ such pairs, so the sum is $${(p - 1) / 2} \\cdot ${a - 1} = ${C}$.`
      : `Add the sum $S$ to itself in reverse order, pairing $k$ with $${p} - k$; the arguments in each pair add to $${a}$. Since $\\gcd(${a}, ${p}) = ${g}$, the argument $\\frac{${a}k}{${p}} = \\frac{${a / g}k}{${p / g}}$ is an integer exactly when $${p / g} \\mid k$, which happens for $${g - 1}$ values of $k$. For those pairs the floors add to $${a}$; for the other $${p - g}$ values they add to $${a - 1}$. So $2S = ${p - g} \\cdot ${a - 1} + ${g - 1} \\cdot ${a} = ${2 * C}$, and $S = ${C}$.`;
    return {
      ...base(),
      statement: `Evaluate $$${sumTex}.$$`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: `Pair $k$ with $${p} - k$: the floors in each pair add to $${a} - 1$ ${shared ? "except when the arguments are integers" : "because the arguments are never integers"}.` },
        { tex: `$${D1}$`, value: `${D1}`, misconception: mis[0], rationale: mis[1], derivation: ders[0] },
        { tex: `$${D2}$`, value: `${D2}`, misconception: mis[2], rationale: mis[3], derivation: ders[1] },
        { tex: `$${D3}$`, value: `${D3}`, misconception: mis[4], rationale: mis[5], derivation: ders[2] },
      ),
      solution,
      key_insight: "Pair $k$ with $p - k$: the two arguments sum to the integer $a$, so their floors sum to $a - 1$ unless both arguments are integers.",
      techniques: this.techniques,
      estimated_difficulty: shared ? 9.2 + 0.6 * t : 8.5 + 0.6 * t,
      estimated_solve_seconds: Math.round(150 + 120 * t),
      verification: sympyVerification(`sum([floor(Rational(kk*${a}, ${p})) for kk in range(1, ${p})])`),
      template_id: this.id,
    };
  },
};

// ------------------------------------------------- SFFT counting --------

function tau(n: number): number {
  let count = 1;
  for (let p = 2; p * p <= n; p++) {
    let e = 0;
    while (n % p === 0) {
      n /= p;
      e++;
    }
    count *= e + 1;
  }
  if (n > 1) count *= 2;
  return count;
}
function factorTex(n: number): string {
  const parts: string[] = [];
  for (let p = 2; p <= n; p++) {
    let e = 0;
    while (n % p === 0) {
      n /= p;
      e++;
    }
    if (e) parts.push(e === 1 ? `${p}` : `${p}^{${e}}`);
  }
  return parts.join(" \\cdot ");
}

export const reciprocalPairs: ProceduralTemplate = {
  id: "b8.reciprocal_pairs",
  slot: 8,
  title: "Counting solutions of 1/x + 1/y = 1/n",
  techniques: ["Simon's favourite factoring trick", "divisor counting"],
  range: [8.5, 10],
  generate(rng, difficulty) {
    const t = level(difficulty, 8.5, 10);
    const n = rng.pick(t < 0.5 ? [6, 10, 12, 14, 15, 18, 20, 21] : [12, 18, 20, 24, 28, 30, 36, 40, 42, 45, 48, 60]);
    const integers = t > 0.55 && rng.bool(0.6);
    const T2 = tau(n * n);
    const T1 = tau(n);
    let C: number, D1: number, D2: number, D3: number;
    let opts: [string, string, string, string, string, string];
    let ders: [string, string, string];
    if (!integers) {
      C = T2;
      D1 = T1;
      D2 = 2 * T2 - 1;
      D3 = (T2 + 1) / 2;
      opts = [
        `Counted divisors of ${n} instead of ${n}²`,
        `The factorization is $(x - ${n})(y - ${n}) = ${n}^2$, so divisors of $${n * n}$ are needed.`,
        "Also counted the negative factor pairs",
        `Negative factors would make $x < ${n}$ and $y < 0$ (or $x = 0$), which are not positive integers.`,
        "Counted unordered pairs",
        "The question asks for ordered pairs, so $(x, y)$ and $(y, x)$ count separately.",
      ];
      ders = [`divisor_count(${n})`, `2*divisor_count(${n * n}) - 1`, `(divisor_count(${n * n}) + 1)/2`];
    } else {
      C = 2 * T2 - 1;
      D1 = 2 * T2;
      D2 = T2;
      D3 = 2 * T1 - 1;
      opts = [
        `Forgot to exclude the factor pair (−${n}, −${n}), which gives x = y = 0`,
        `$x - ${n} = -${n}$ forces $x = 0$, where $\\frac{1}{x}$ is undefined.`,
        "Counted only the positive factor pairs",
        "Negative divisors of $n^2$ also give integer solutions, e.g. with $x < 0$.",
        `Counted divisors of ${n} instead of ${n}²`,
        `The factorization is $(x - ${n})(y - ${n}) = ${n}^2$.`,
      ];
      ders = [`2*divisor_count(${n * n})`, `divisor_count(${n * n})`, `2*divisor_count(${n}) - 1`];
    }
    assertDistinctNumbers(C, D1, D2, D3);
    const brute = integers
      ? `len([X for X in range(${n - n * n}, ${n + n * n + 1}) if X != 0 and X != ${n} and Mod(${n}*X, X - ${n}) == 0 and ${n}*X/(X - ${n}) != 0])`
      : `len([X for X in range(${n + 1}, ${n + n * n + 1}) if Mod(${n}*X, X - ${n}) == 0])`;
    const what = integers ? "nonzero integers (positive or negative)" : "positive integers";
    const sol = `Clearing denominators, $${n}y + ${n}x = xy$, i.e. $xy - ${n}x - ${n}y = 0$. Adding $${n * n}$ to both sides factors it: $(x - ${n})(y - ${n}) = ${n * n} = ${factorTex(n * n)}$, which has $${T2}$ positive divisors. ${
      integers
        ? `Every divisor $d$ of $${n * n}$, positive or negative, gives $x = ${n} + d$, $y = ${n} + \\frac{${n * n}}{d}$: that is $2 \\cdot ${T2} = ${2 * T2}$ pairs, except $d = -${n}$, which gives $x = y = 0$. So there are $${C}$ solutions.`
        : `Since $x, y > 0$ and $\\frac{1}{x} < \\frac{1}{${n}}$, we need $x, y > ${n}$, so both factors are positive: each positive divisor $d$ of $${n * n}$ gives exactly one pair $x = ${n} + d$, $y = ${n} + \\frac{${n * n}}{d}$. So there are $${C}$ ordered pairs.`
    }`;
    return {
      ...base(),
      statement: `How many ordered pairs $(x, y)$ of ${what} satisfy $$\\frac{1}{x} + \\frac{1}{y} = \\frac{1}{${n}}?$$`,
      options: options(
        { tex: `$${C}$`, value: `${C}`, rationale: `Rewrite as $(x - ${n})(y - ${n}) = ${n}^2$ and count factor pairs.` },
        { tex: `$${D1}$`, value: `${D1}`, misconception: opts[0], rationale: opts[1], derivation: ders[0] },
        { tex: `$${D2}$`, value: `${D2}`, misconception: opts[2], rationale: opts[3], derivation: ders[1] },
        { tex: `$${D3}$`, value: `${D3}`, misconception: opts[4], rationale: opts[5], derivation: ders[2] },
      ),
      solution: sol,
      key_insight: "Clear denominators and add $n^2$ to factor: $(x - n)(y - n) = n^2$, so solutions correspond to divisors of $n^2$.",
      techniques: this.techniques,
      estimated_difficulty: integers ? 9.4 + 0.6 * t : 8.5 + 0.8 * t,
      estimated_solve_seconds: Math.round(150 + 120 * t),
      verification: sympyVerification(brute, [], "Brute force over every admissible x; y is determined by x."),
      template_id: this.id,
    };
  },
};

// ------------------------------------------------- periodic sequence ---------

type Form = "mobius3" | "mobius4" | "lyness" | "linear6";

export const periodicSum: ProceduralTemplate = {
  id: "b8.periodic_sum",
  slot: 8,
  title: "Sum of a recursively defined periodic sequence",
  techniques: ["computing initial terms", "spotting periodicity", "division with remainder"],
  range: [8.5, 10],
  generate(rng, difficulty) {
    const t = level(difficulty, 8.5, 10);
    const form: Form = t < 0.35 ? rng.pick(["mobius3", "linear6"] as const) : t < 0.7 ? rng.pick(["mobius4", "linear6", "mobius3"] as const) : rng.pick(["lyness", "mobius4"] as const);
    const N = rng.int(2001, 2099);
    let p: number;
    let terms: Q[];
    let defTex: string;
    let py: string[]; // SymPy expressions for a_1 .. a_{p+2}
    if (form === "mobius3" || form === "mobius4") {
      const r: Q = rng.pick(form === "mobius3" ? ([[2, 1], [3, 1], [-1, 1], [1, 2], [-2, 1], [3, 2], [1, 3], [4, 1]] as Q[]) : ([[2, 1], [3, 1], [1, 2], [-2, 1], [1, 3], [4, 1], [-3, 1], [3, 2]] as Q[]));
      const f = form === "mobius3" ? (q: Q) => qdiv([1, 1], qsub([1, 1], q)) : (q: Q) => qdiv(qadd([1, 1], q), qsub([1, 1], q));
      const fpy = form === "mobius3" ? "(1/(1 - x))" : "((1 + x)/(1 - x))";
      p = form === "mobius3" ? 3 : 4;
      terms = [r];
      py = [sv(r)];
      for (let i = 1; i < p + 2; i++) {
        terms.push(f(terms[i - 1]));
        py.push(`${fpy}.subs(x, ${py[i - 1]})`);
      }
      defTex = `a_1 = ${frac(...r)} \\quad\\text{and}\\quad a_{n+1} = ${form === "mobius3" ? "\\frac{1}{1 - a_n}" : "\\frac{1 + a_n}{1 - a_n}"} \\text{ for } n \\ge 1`;
    } else {
      const x0 = form === "lyness" ? rng.int(1, 5) : rng.pick([-5, -3, -2, 2, 3, 4, 5, 7]);
      let y0 = form === "lyness" ? rng.int(1, 5) : rng.pick([-4, -1, 1, 3, 6, 8, 9]);
      if (y0 === x0) y0 = x0 + 1;
      p = form === "lyness" ? 5 : 6;
      terms = [
        [x0, 1],
        [y0, 1],
      ];
      py = [`${x0}`, `${y0}`];
      for (let i = 2; i < p + 2; i++) {
        if (form === "lyness") {
          terms.push(qdiv(qadd([1, 1], terms[i - 1]), terms[i - 2]));
          py.push(`((1 + y)/x).subs({x: ${py[i - 2]}, y: ${py[i - 1]}})`);
        } else {
          terms.push(qsub(terms[i - 1], terms[i - 2]));
          py.push(`(${py[i - 1]}) - (${py[i - 2]})`);
        }
      }
      defTex = `a_1 = ${x0},\\quad a_2 = ${y0} \\quad\\text{and}\\quad a_{n+2} = ${form === "lyness" ? "\\frac{1 + a_{n+1}}{a_n}" : "a_{n+1} - a_n"} \\text{ for } n \\ge 1`;
    }
    // sanity: the sequence really has period p
    if (val(terms[p]) !== val(terms[0]) || val(terms[p + 1]) !== val(terms[1])) throw new Error(`period check failed for ${form}`);
    const rho = N % p;
    if (rho === 0) throw new RetryTemplate("no leftover terms");
    const q = Math.floor(N / p);
    const T = qsum(terms.slice(0, p));
    const part = (m: number) => qsum(terms.slice(0, m));
    const C = qadd(qmul([q, 1], T), part(rho));
    type O = { tex: string; value: string; misconception: string; rationale: string; derivation: string; v: Q };
    let D: O[];
    const sumPy = (m: number) => (m === 0 ? "0" : py.slice(0, m).join(" + "));
    if (form !== "linear6") {
      const d1 = qmul(qdiv([N, 1], [p, 1]), T);
      const d2 = qmul([q, 1], T);
      const d3 = qadd(qmul([q, 1], T), part(rho + 1));
      D = [
        {
          v: d1,
          tex: fracTex(...d1),
          value: rat(...d1),
          misconception: `Multiplied the period sum by ${N}/${p}, as if ${N} were a multiple of ${p}`,
          rationale: `$${N} = ${p} \\cdot ${q} + ${rho}$: there are ${q} full periods and ${rho} leftover terms, which are not an average share of a period.`,
          derivation: `Rational(${N}, ${p})*(${sumPy(p)})`,
        },
        {
          v: d2,
          tex: fracTex(...d2),
          value: rat(...d2),
          misconception: "Dropped the leftover terms after the last full period",
          rationale: `The last ${rho} term${rho === 1 ? "" : "s"} (from $a_{${p * q + 1}}$ on) must still be added.`,
          derivation: `${q}*(${sumPy(p)})`,
        },
        {
          v: d3,
          tex: fracTex(...d3),
          value: rat(...d3),
          misconception: "Added one leftover term too many (off by one in the remainder)",
          rationale: `Since $${N} \\equiv ${rho} \\pmod{${p}}$, exactly ${rho} terms remain, $a_1$ to $a_{${rho}}$ of the cycle.`,
          derivation: `${q}*(${sumPy(p)}) + (${sumPy(rho + 1)})`,
        },
      ];
    } else {
      const q3 = Math.floor(N / 3);
      const r3 = N % 3;
      const d3: Q = qadd(qmul([q3, 1], part(3)), part(r3));
      D = [
        {
          v: [0, 1],
          tex: "$0$",
          value: "0",
          misconception: "Concluded the sum is 0 because each block of six terms sums to 0, ignoring the leftover terms",
          rationale: `$${N}$ is not a multiple of 6; the ${rho} leftover term${rho === 1 ? "" : "s"} must be added.`,
          derivation: `${q}*(${sumPy(6)})`,
        },
        {
          v: part(rho + 1),
          tex: fracTex(...part(rho + 1)),
          value: rat(...part(rho + 1)),
          misconception: "Added one leftover term too many (off by one in the remainder)",
          rationale: `Since $${N} \\equiv ${rho} \\pmod 6$, exactly ${rho} terms remain, $a_1$ to $a_{${rho}}$.`,
          derivation: `${q}*(${sumPy(6)}) + (${sumPy(rho + 1)})`,
        },
        {
          v: d3,
          tex: fracTex(...d3),
          value: rat(...d3),
          misconception: "Mistook the sign pattern a₄ = −a₁ for a period of 3",
          rationale: "$a_{n+3} = -a_n$, so the sequence repeats only after 6 steps; three consecutive terms do not repeat.",
          derivation: `${q3}*(${sumPy(3)}) + (${sumPy(r3)})`,
        },
      ];
    }
    assertDistinctNumbers(val(C), ...D.map((o) => val(o.v)));
    const shown = terms.slice(0, p + 1).map((q0) => frac(...q0));
    const strip = (o: O) => ({ tex: o.tex, value: o.value, misconception: o.misconception, rationale: o.rationale, derivation: o.derivation });
    return {
      ...base(),
      statement: `A sequence is defined by $$${defTex}.$$ What is $a_1 + a_2 + \\cdots + a_{${N}}$?`,
      options: options(
        { tex: fracTex(...C), value: rat(...C), rationale: `The sequence repeats every ${p} terms; use $${N} = ${p} \\cdot ${q} + ${rho}$.` },
        strip(D[0]),
        strip(D[1]),
        strip(D[2]),
      ),
      solution: `Compute the first few terms: $${shown.map((s, i) => `a_{${i + 1}} = ${s}`).join(", ")}${form === "lyness" || form === "linear6" ? `, a_{${p + 2}} = ${frac(...terms[p + 1])}` : ""}$. The sequence returns to its start, so it is periodic with period ${p}, and one period sums to $${frac(...T)}$. Since $${N} = ${p} \\cdot ${q} + ${rho}$, the sum is $${q} \\cdot ${T[0] < 0 ? `\\left(${frac(...T)}\\right)` : frac(...T)} + (${shown.slice(0, rho).join(" + ")}) = ${frac(...C)}$.`,
      key_insight: `Compute a few terms: the recursion is periodic with period ${p}, so the long sum reduces to whole periods plus a short remainder.`,
      techniques: this.techniques,
      estimated_difficulty: { mobius3: 8.5, linear6: 8.8, mobius4: 9.2, lyness: 9.6 }[form] + 0.4 * t,
      estimated_solve_seconds: Math.round(150 + 120 * t),
      verification: sympyVerification(
        `${q}*(${sumPy(p)}) + (${sumPy(rho)})`,
        [`simplify((${py[p]}) - (${py[0]})) == 0`, `simplify((${py[p + 1]}) - (${py[1]})) == 0`],
        `Terms are generated from the recursion in SymPy; the checks confirm a_${p + 1} = a_1 and a_${p + 2} = a_2, which proves period ${p}.`,
      ),
      template_id: this.id,
    };
  },
};

export const bucket8Templates: ProceduralTemplate[] = [germainProduct, floorPairing, reciprocalPairs, periodicSum];
