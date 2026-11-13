/**
 * Tiny, safe expression compiler for diagram function plots (no eval).
 * Grammar: + - * / ^, parentheses, unary minus, implicit multiplication (2x, 3(x+1)),
 * functions sin cos tan sqrt abs exp ln log, constants pi e, variable x.
 */
type Fn = (x: number) => number;

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
};

export function compileExpr(src: string): Fn {
  const tokens = src.replace(/\*\*/g, "^").match(/\d+\.?\d*|\.\d+|[A-Za-z]+|[-+*/^()]/g);
  if (!tokens || tokens.join("") !== src.replace(/\s+/g, "").replace(/\*\*/g, "^")) throw new Error(`unsupported expression: ${src}`);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function primary(): Fn {
    const t = next();
    if (t === undefined) throw new Error("unexpected end");
    if (/^[\d.]/.test(t)) {
      const v = Number(t);
      return () => v;
    }
    if (t === "(") {
      const e = expr();
      if (next() !== ")") throw new Error("missing )");
      return e;
    }
    if (t === "x") return (x) => x;
    if (t === "pi") return () => Math.PI;
    if (t === "e") return () => Math.E;
    if (FUNCS[t]) {
      const f = FUNCS[t];
      const arg = power();
      return (x) => f(arg(x));
    }
    throw new Error(`unknown token ${t}`);
  }
  function power(): Fn {
    const base = primary();
    if (peek() === "^") {
      next();
      const exp = unary();
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }
  function unary(): Fn {
    if (peek() === "-") {
      next();
      const v = unary();
      return (x) => -v(x);
    }
    if (peek() === "+") {
      next();
      return unary();
    }
    return power();
  }
  function term(): Fn {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t === "*" || t === "/") {
        next();
        const right = unary();
        const l = left;
        left = t === "*" ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
      } else if (t !== undefined && (t === "(" || /^[A-Za-z\d.]/.test(t))) {
        const right = power(); // implicit multiplication
        const l = left;
        left = (x) => l(x) * right(x);
      } else return left;
    }
  }
  function expr(): Fn {
    let left = term();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const right = term();
      const l = left;
      left = op === "+" ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
    }
    return left;
  }
  const f = expr();
  if (i !== tokens.length) throw new Error(`unexpected token ${tokens[i]}`);
  return f;
}
