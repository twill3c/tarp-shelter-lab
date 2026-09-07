// 風の描画(矢印とタープの揺れ)と操作盤の反映(F-17・原案 §10)。
import { svgEl } from "./view";
import type { SimState } from "./simulator";
import type { Wind } from "./wind";
import { stability, stabilityLabel, stabilityReason } from "./wind";

const rad = (deg: number) => (deg * Math.PI) / 180;

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`要素が無い: ${sel}`);
  return el;
}

/**
 * 風の矢印。風の進む向き v = (−sin θ, cos θ) に沿って流す。
 * 本数と長さは風速に連動させ、**風速 0 では 1 本も描かない**
 * (無風のときに矢印が出ていると、画面が嘘をつく)。
 */
export function renderWind(state: SimState, wind: Wind, phase: number): void {
  const layer = q<SVGGElement>("#layer-wind");
  layer.replaceChildren();
  if (wind.speed <= 0) return;
  const { w, h } = state.shelter.field;
  const vx = -Math.sin(rad(wind.windFrom));
  const vy = Math.cos(rad(wind.windFrom));
  // 進行方向に直交する軸に沿って等間隔に並べる
  const px = -vy;
  const py = vx;
  const cx = w / 2;
  const cy = h / 2;
  const span = Math.hypot(w, h);
  const lanes = 7;
  const len = 40 + (wind.speed / 100) * 70;
  const travel = span + len;
  for (let i = 0; i < lanes; i++) {
    const off = ((i + 0.5) / lanes - 0.5) * span * 0.92;
    // 位相をずらして流れて見せる。lane ごとに少しずらす
    const t = (phase + i / lanes) % 1;
    const s = -travel / 2 + t * travel;
    const bx = cx + px * off + vx * s;
    const by = cy + py * off + vy * s;
    const ex = bx + vx * len;
    const ey = by + vy * len;
    // **フィールドの内側へ切り詰める。** SVG は viewBox の外を勝手に隠すので見た目は同じだが、
    // 隠れているだけの要素は「図がはみ出していないか」の幾何検査(B-04)を必ず落とす。
    // 見えない要素を検査の例外にするより、描く側で収める(HC-159)
    const seg = clipToBox(bx, by, ex, ey, w, h);
    if (!seg) continue;
    layer.append(svgEl("path", { d: `M${seg.x1.toFixed(1)} ${seg.y1.toFixed(1)} L${seg.x2.toFixed(1)} ${seg.y2.toFixed(1)}`, class: "windarrow" }));
    // 矢じりは、先端が切り詰められていないときだけ描く
    if (seg.x2 !== ex || seg.y2 !== ey) continue;
    const a = rad(150);
    for (const sign of [1, -1]) {
      const hx = vx * Math.cos(a) - vy * sign * Math.sin(a);
      const hy = vx * sign * Math.sin(a) + vy * Math.cos(a);
      const tip = clipToBox(ex, ey, ex + hx * 12, ey + hy * 12, w, h);
      if (!tip) continue;
      layer.append(
        svgEl("path", { d: `M${tip.x1.toFixed(1)} ${tip.y1.toFixed(1)} L${tip.x2.toFixed(1)} ${tip.y2.toFixed(1)}`, class: "windarrow" }),
      );
    }
  }
}

/** 線分を [0,w]×[0,h] の矩形へ切り詰める(Liang-Barsky)。外なら null */
function clipToBox(x1: number, y1: number, x2: number, y2: number, w: number, h: number):
  | { x1: number; y1: number; x2: number; y2: number }
  | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const tests: [number, number][] = [
    [-dx, x1],
    [dx, w - x1],
    [-dy, y1],
    [dy, h - y1],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  // 短すぎる切れ端は描かない(点のような線は読めない)
  if ((t1 - t0) * Math.hypot(dx, dy) < 10) return null;
  return { x1: x1 + dx * t0, y1: y1 + dy * t0, x2: x1 + dx * t1, y2: y1 + dy * t1 };
}

/**
 * タープの揺れ。風の向きへ少し押されるだけの平行移動で表す。
 * 幅は風速と安定度から決め、**安定度が高いほど揺れない**。
 */
export function swayOffset(wind: Wind, stabilityValue: number, phase: number): { dx: number; dy: number } {
  if (wind.speed <= 0) return { dx: 0, dy: 0 };
  const amp = (wind.speed / 100) * 10 * (1 - stabilityValue / 100);
  const k = Math.sin(phase * Math.PI * 2);
  return { dx: -Math.sin(rad(wind.windFrom)) * amp * k, dy: Math.cos(rad(wind.windFrom)) * amp * k };
}

/** 操作盤の表示(判定・理由・ゲージ) */
export function renderWindPanel(state: SimState, wind: Wind): void {
  const value = stability(state, wind);
  const label = stabilityLabel(value);
  const verdict = q<HTMLElement>("#wind-verdict");
  const attached = state.shelter.ropes.some((r) => state.ropes[r.id] !== undefined);
  // 判定を出せるのは、張ってからである。判定の根拠を言えない記号は出さない(HC-079)
  if (!attached) {
    verdict.textContent = "—";
    verdict.dataset["label"] = "";
    q<HTMLElement>("#wind-reason").textContent = "ロープを結ぶと判定できる";
    q<HTMLElement>("#wind-value").textContent = "—";
    q<HTMLElement>("#wind-bar").style.width = "0%";
    return;
  }
  verdict.textContent = label;
  verdict.dataset["label"] = label;
  q<HTMLElement>("#wind-reason").textContent = stabilityReason(state, wind);
  q<HTMLElement>("#wind-value").textContent = String(Math.round(value));
  const bar = q<HTMLElement>("#wind-bar");
  bar.style.width = `${Math.round(value)}%`;
  bar.className = label;
}
