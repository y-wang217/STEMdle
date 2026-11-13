/**
 * Render text with $inline$ / $$display$$ TeX via KaTeX. Works on server and
 * client. Text segments are HTML-escaped; KaTeX runs with trust disabled.
 * If TeX fails to parse we show the raw source (never a silently altered meaning).
 */
import katex from "katex";
import { splitMath } from "@/lib/math/segments";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function texToHtml(text: string, block = false): string {
  let segs;
  try {
    segs = splitMath(text);
  } catch {
    return `<span class="text-bad">${escapeHtml(text)}</span>`;
  }
  return segs
    .map((s) => {
      if (s.type === "text") return escapeHtml(s.value).replace(/\n\n+/g, block ? "</p><p>" : "<br/><br/>").replace(/\n/g, "<br/>");
      try {
        return katex.renderToString(s.value, { displayMode: s.type === "display", throwOnError: true, trust: false, strict: "ignore", output: "htmlAndMathml" });
      } catch {
        return `<code class="text-bad">${escapeHtml(s.value)}</code>`;
      }
    })
    .join("");
}

export function Tex({ children, className, as = "span" }: { children: string; className?: string; as?: "span" | "div" | "p" }) {
  const Tag = as;
  const html = as === "div" ? `<p>${texToHtml(children, true)}</p>` : texToHtml(children);
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
