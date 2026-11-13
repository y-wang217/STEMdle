/**
 * Split text containing `$inline$` and `$$display$$` TeX into segments.
 * `\$` is a literal dollar sign. Throws on an unclosed delimiter so that
 * malformed content is caught by validation instead of rendering wrongly.
 */
export type Segment = { type: "text" | "inline" | "display"; value: string };

export function splitMath(input: string): Segment[] {
  const out: Segment[] = [];
  let buf = "";
  let i = 0;
  const pushText = () => {
    if (buf) out.push({ type: "text", value: buf });
    buf = "";
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === "\\" && input[i + 1] === "$") {
      buf += "$";
      i += 2;
      continue;
    }
    if (ch === "$") {
      const display = input[i + 1] === "$";
      const delim = display ? "$$" : "$";
      let j = i + delim.length;
      let math = "";
      let closed = false;
      while (j < input.length) {
        if (input[j] === "\\" && j + 1 < input.length) {
          math += input[j] + input[j + 1];
          j += 2;
          continue;
        }
        if (input.startsWith(delim, j)) {
          closed = true;
          break;
        }
        math += input[j];
        j++;
      }
      if (!closed) throw new Error(`unclosed ${delim} delimiter`);
      pushText();
      out.push({ type: display ? "display" : "inline", value: math.trim() });
      i = j + delim.length;
      continue;
    }
    buf += ch;
    i++;
  }
  pushText();
  return out;
}
