"use client";
/**
 * Deterministic, non-interactive JSXGraph rendering of a structured DiagramSpec.
 * The spec is data; nothing here evaluates arbitrary code. On failure we show
 * the alt text and an explicit notice — the question text is never altered.
 */
import { useEffect, useId, useRef, useState } from "react";
import type { DiagramSpecT } from "@/lib/schemas/question";
import { compileExpr } from "@/lib/math/expr";

type JXGModule = typeof import("jsxgraph");

function cssVar(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function labelText(s: string): string {
  // Render simple TeX-ish labels as plain text (e.g. "\\theta" -> θ, "x^2" -> x²).
  return s
    .replace(/\$/g, "")
    .replace(/\\theta/g, "θ")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\pi/g, "π")
    .replace(/\\circ/g, "°")
    .replace(/\^\{?2\}?/g, "²")
    .replace(/\\sqrt\{([^}]*)\}/g, "√$1")
    .replace(/[{}\\]/g, "");
}

export function Diagram({ spec, className, admin = false }: { spec: DiagramSpecT; className?: string; admin?: boolean }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = `jxg-${reactId}`;
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let board: { removeObject?: unknown } | null = null;
    let JXG: JXGModule | null = null;
    let cancelled = false;
    let lastWidth = -1;
    const el = box.current;
    if (!el) return;
    const free = () => {
      if (!board || !JXG) return;
      try {
        (JXG.JSXGraph as unknown as { freeBoard: (b: unknown) => void }).freeBoard(board);
      } catch {
        /* container already removed by React */
      }
      board = null;
    };

    const render = async () => {
      try {
        JXG = JXG ?? (await import("jsxgraph"));
        if (cancelled || !el.isConnected) return;
        const width = el.clientWidth || 320;
        if (Math.abs(width - lastWidth) < 2 && board) return; // ignore height-only resizes
        lastWidth = width;
        free();
        const ratio = (spec.y_max - spec.y_min) / (spec.x_max - spec.x_min);
        el.style.height = `${Math.min(Math.max(width * ratio, 160), 300)}px`;
        const ink = cssVar("--ink", "#1a1f2b");
        const muted = cssVar("--muted", "#7b8091");
        const accent = cssVar("--accent", "#d9481f");
        const b = JXG.JSXGraph.initBoard(el as never, {
          boundingbox: [spec.x_min, spec.y_max, spec.x_max, spec.y_min],
          keepaspectratio: spec.type === "geometry",
          axis: spec.axes,
          grid: spec.grid,
          showNavigation: false,
          showCopyright: false,
          showInfobox: false,
          pan: { enabled: false },
          zoom: { enabled: false, wheel: false },
          registerEvents: false,
          defaultAxes: {
            x: { strokeColor: muted, ticks: { strokeColor: muted, label: { strokeColor: muted, fontSize: 11 } } },
            y: { strokeColor: muted, ticks: { strokeColor: muted, label: { strokeColor: muted, fontSize: 11 } } },
          },
        } as never) as unknown as {
          create: (type: string, parents: unknown[], attrs?: Record<string, unknown>) => unknown;
          suspendUpdate: () => void;
          unsuspendUpdate: () => void;
        };
        board = b as never;
        b.suspendUpdate();
        const pts: Record<string, unknown> = {};
        const coords: Record<string, [number, number]> = {};
        const base = { fixed: true, highlight: false, strokeColor: ink };
        for (const e of spec.elements)
          if (e.kind === "point") {
            coords[e.id] = [e.x, e.y];
            pts[e.id] = b.create("point", [e.x, e.y], {
              ...base,
              name: labelText(e.label ?? e.id),
              withLabel: true,
              visible: true,
              size: e.show ? 2 : 0,
              fillColor: ink,
              label: { strokeColor: ink, fontSize: 14, offset: [6, 6], highlight: false },
            });
          }
        const need = (pid: string) => {
          if (!pts[pid]) throw new Error(`unknown point ${pid}`);
          return pts[pid];
        };
        for (const e of spec.elements) {
          switch (e.kind) {
            case "segment": {
              const seg = b.create("segment", [need(e.from), need(e.to)], { ...base, strokeWidth: 2, dash: e.dashed ? 2 : 0 });
              if (e.ticks > 0) b.create("hatch", [seg, e.ticks], { ...base, strokeWidth: 1.5 });
              if (e.arrows > 0) b.create("hatch", [seg, e.arrows], { ...base, strokeColor: accent, strokeWidth: 1.5 });
              if (e.label) {
                const [x1, y1] = coords[e.from];
                const [x2, y2] = coords[e.to];
                const len = Math.hypot(x2 - x1, y2 - y1) || 1;
                const off = (spec.x_max - spec.x_min) * 0.035;
                b.create("text", [(x1 + x2) / 2 - ((y2 - y1) / len) * off, (y1 + y2) / 2 + ((x2 - x1) / len) * off, labelText(e.label)], {
                  fixed: true,
                  highlight: false,
                  anchorX: "middle",
                  anchorY: "middle",
                  strokeColor: accent,
                  fontSize: 14,
                });
              }
              break;
            }
            case "line":
              b.create("line", [need(e.through[0]), need(e.through[1])], { ...base, strokeWidth: 1.5, dash: e.dashed ? 2 : 0 });
              break;
            case "polygon":
              b.create("polygon", e.vertices.map(need), {
                ...base,
                fillColor: e.shaded ? accent : "none",
                fillOpacity: e.shaded ? 0.12 : 0,
                borders: { strokeColor: ink, strokeWidth: 2, highlight: false, fixed: true },
                vertices: { visible: false },
              });
              break;
            case "circle":
              b.create("circle", [need(e.center), e.through ? need(e.through) : e.radius], { ...base, strokeWidth: 2, fillColor: "none" });
              break;
            case "arc":
              b.create("arc", [need(e.center), need(e.from), need(e.to)], { ...base, strokeWidth: 2 });
              break;
            case "angle":
              b.create("nonreflexangle", [need(e.a), need(e.vertex), need(e.b)], {
                ...base,
                radius: (spec.x_max - spec.x_min) * 0.06,
                type: e.right ? "square" : "sector",
                orthoType: "square",
                fillColor: accent,
                fillOpacity: 0.15,
                strokeColor: accent,
                name: e.label ? labelText(e.label) : "",
                withLabel: Boolean(e.label),
                label: { strokeColor: accent, fontSize: 13, highlight: false },
              });
              break;
            case "function": {
              const f = compileExpr(e.expr);
              b.create("functiongraph", [f, e.x_min, e.x_max], { ...base, strokeColor: accent, strokeWidth: 2.5, name: e.label ? labelText(e.label) : "", withLabel: Boolean(e.label) });
              break;
            }
            case "text":
              b.create("text", [e.x, e.y, labelText(e.text)], { fixed: true, highlight: false, strokeColor: ink, fontSize: 14 });
              break;
          }
        }
        b.unsuspendUpdate();
        setError(null);
      } catch (err) {
        console.error("diagram render failed", err);
        setError((err as Error).message);
      }
    };
    void render();
    const ro = new ResizeObserver(() => void render());
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
      free();
    };
  }, [spec, id]);

  return (
    <figure className={className} aria-label={spec.alt_text}>
      <div ref={box} id={id} className="jxgbox w-full" role="img" aria-label={spec.alt_text} style={{ display: error ? "none" : "block" }} />
      {error && (
        <div className="rounded-xl border border-dashed border-rule p-3 text-sm text-ink-2" role="alert">
          <strong>Diagram unavailable.</strong> {spec.essential ? "This question relies on its diagram — please reload. " : ""}
          Description: {spec.alt_text}
          {admin && <div className="mt-1 font-mono text-xs text-bad">{error}</div>}
        </div>
      )}
      <figcaption className="sr-only">{spec.alt_text}</figcaption>
    </figure>
  );
}
