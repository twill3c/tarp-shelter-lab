// ロープワークの描画(F-21)。
// 交差は「下を通る線を背景色で一度切ってから、上を通る線を引き直す」で表す。
// 切る位置と向きは**交差データではなく実際の線分**から取る(データが指す点で、線の向きに沿って切る)。
import type { Crossing, KnotDoc, Pt, Strand } from "./knots";
import { svgEl } from "./view";

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`要素が無い: ${sel}`);
  return el;
}

function pathOf(points: Pt[]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
}

/** 点 p を含む線分の向き(単位ベクトル)。見つからなければ x 方向 */
function directionAt(strand: Strand, p: Crossing): Pt {
  for (let i = 0; i + 1 < strand.points.length; i++) {
    const a = strand.points[i]!;
    const b = strand.points[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    const t = ((p.x - a[0]) * (b[0] - a[0]) + (p.y - a[1]) * (b[1] - a[1])) / (len * len);
    if (t < -0.01 || t > 1.01) continue;
    const cx = a[0] + t * (b[0] - a[0]);
    const cy = a[1] + t * (b[1] - a[1]);
    if (Math.hypot(cx - p.x, cy - p.y) <= 0.6) return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  }
  return [1, 0];
}

const WIDTH: Record<string, number> = { pole: 9, line: 7, rope: 5, tail: 5 };

function renderStep(doc: KnotDoc, stepIndex: number, knotIndex: number): SVGSVGElement {
  const knot = doc.knots[knotIndex]!;
  const step = knot.steps[stepIndex]!;
  const svg = svgEl("svg", {
    viewBox: `0 0 ${doc.viewBox.w} ${doc.viewBox.h}`,
    role: "img",
    "aria-label": step.caption,
  });
  const byId = new Map(step.strands.map((s) => [s.id, s]));
  for (const s of step.strands) {
    svg.append(svgEl("path", { d: pathOf(s.points), class: `strand-${s.kind}` }));
  }
  // 下を通る線を切り、上を通る線を引き直す
  for (const c of step.crossings) {
    const under = byId.get(c.under);
    const over = byId.get(c.over);
    if (!under || !over) continue;
    const [dx, dy] = directionAt(under, c);
    const gap = (WIDTH[over.kind] ?? 5) + 5;
    svg.append(
      svgEl("path", {
        d: `M${c.x - (dx * gap) / 2} ${c.y - (dy * gap) / 2} L${c.x + (dx * gap) / 2} ${c.y + (dy * gap) / 2}`,
        class: "crossing-gap",
        "stroke-width": (WIDTH[under.kind] ?? 5) + 2,
      }),
    );
    const [ox, oy] = directionAt(over, c);
    const keep = gap + 6;
    svg.append(
      svgEl("path", {
        d: `M${c.x - (ox * keep) / 2} ${c.y - (oy * keep) / 2} L${c.x + (ox * keep) / 2} ${c.y + (oy * keep) / 2}`,
        class: `strand-${over.kind}`,
      }),
    );
  }
  return svg;
}

export function renderKnots(doc: KnotDoc, currentIndex: number, onSelect: (index: number) => void): void {
  const tabs = q<HTMLElement>("#knot-tabs");
  tabs.replaceChildren(
    ...doc.knots.map((k, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset["knot"] = k.id;
      b.setAttribute("aria-pressed", String(i === currentIndex));
      b.textContent = `${k.nameJa} / ${k.name}`;
      b.addEventListener("click", () => onSelect(i));
      return b;
    }),
  );

  const knot = doc.knots[currentIndex]!;
  const body = q<HTMLElement>("#knot-body");
  // 用途は図の格子の外に出す。格子に入れると図と同じ幅の列を一つ占める
  q<HTMLElement>("#knot-use").textContent = `用途: ${knot.use}(設営の ${knot.usedIn.join(" / ")} の工程で使う)`;
  body.replaceChildren(
    ...knot.steps.map((st, i) => {
      const box = document.createElement("div");
      box.className = "knot-step";
      box.dataset["step"] = String(i + 1);
      box.append(renderStep(doc, i, currentIndex));
      const p = document.createElement("p");
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = `${i + 1}.`;
      p.append(num, document.createTextNode(st.caption));
      box.append(p);
      return box;
    }),
  );
  q<HTMLElement>("#knot-source").textContent = `出典: ${knot.source}`;
}
