// 雨の描画(雨滴と溜まり)と操作盤の反映(F-19・原案 §11)。
import { centroid } from "./geometry";
import type { SimState } from "./simulator";
import type { RainRate } from "./rain";
import { drainage, drainageLabel, minSlopeDeg, panelRuns, rainReason, rainVerdict } from "./rain";
import { svgEl } from "./view";
import { standingHeight } from "./wind";

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`要素が無い: ${sel}`);
  return el;
}

/** 決定論の擬似乱数。毎フレーム同じ雨粒が同じ筋を流れる(ちらつかない) */
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 雨滴。雨量 0 では 1 滴も描かない。
 * フィールドの内側だけに描く —— 外へはみ出した要素は SVG が隠すだけで、
 * 幾何の検査(B-04)は落とす(HC-159)。
 */
export function renderRain(state: SimState, rate: RainRate, pool: number, phase: number): void {
  const layer = q<SVGGElement>("#layer-rain");
  layer.replaceChildren();
  const { w, h } = state.shelter.field;

  // 溜まり水は**最も緩い面**の重心に置く。判定を決めているのがその面だからである
  // (先頭の面に置くと、画面と判定が別のことを言う)。0 のときは描かない
  if (pool > 0.02) {
    const panels = state.shelter.tarp.panels;
    const runs = panelRuns(state.shelter);
    let idx = 0;
    for (let i = 1; i < runs.length; i++) if ((runs[i] ?? 0) > (runs[idx] ?? 0)) idx = i;
    const c = centroid(panels[idx]?.poly ?? state.shelter.tarp.pitched);
    const r = 12 + pool * 55;
    layer.append(svgEl("ellipse", { cx: c.x, cy: c.y, rx: r, ry: r * 0.62, class: "puddle" }));
  }

  if (rate <= 0) return;
  const count = rate * 26;
  const len = 14 + rate * 4;
  for (let i = 0; i < count; i++) {
    const x = hash01(i) * w;
    const speed = 0.7 + hash01(i + 1000) * 0.6;
    const y = ((phase * speed + hash01(i + 2000)) % 1) * (h + len) - len;
    const y1 = Math.max(0, y);
    const y2 = Math.min(h, y + len);
    if (y2 - y1 < 4) continue;
    layer.append(svgEl("line", { x1: x.toFixed(1), y1: y1.toFixed(1), x2: (x - 3).toFixed(1), y2: y2.toFixed(1), class: "raindrop" }));
  }
}

/** 操作盤の表示(判定・理由・ゲージ) */
export function renderRainPanel(state: SimState, pool: number, rate: RainRate): void {
  const verdict = q<HTMLElement>("#rain-verdict");
  const attached = state.shelter.ropes.some((r) => state.ropes[r.id] !== undefined);
  const poolBar = q<HTMLElement>("#pool-bar");
  poolBar.style.width = `${Math.round(pool * 100)}%`;
  // **色は判定から出す。** 別の閾値で塗ると、判定が POOL なのにバーだけ別の色になる
  const barLabel = rainVerdict(state, standingHeight(state), rate);
  poolBar.className = barLabel ?? "";
  q<HTMLElement>("#pool-value").textContent = `${Math.round(pool * 100)}%`;
  // 判定を出せるのは張ってから。根拠を言えない記号は出さない(HC-079)
  if (!attached || standingHeight(state) <= 0) {
    verdict.textContent = "—";
    verdict.dataset["label"] = "";
    q<HTMLElement>("#rain-reason").textContent = "ロープを結ぶと判定できる";
    q<HTMLElement>("#rain-value").textContent = "—";
    q<HTMLElement>("#rain-bar").style.width = "0%";
    return;
  }
  const value = drainage(state);
  // 判定は雨量込み。能力だけで GOOD と出すと、その隣で水が溜まって画面が自分と矛盾する
  const label = rainVerdict(state, standingHeight(state), rate);
  if (label === null) {
    verdict.textContent = "雨なし";
    verdict.dataset["label"] = "";
  } else {
    verdict.textContent = label === "GOOD" ? "排水 GOOD" : label === "POOL" ? "水が溜まりそう" : "排水 注意";
    verdict.dataset["label"] = label;
  }
  const slope = minSlopeDeg(state.shelter, standingHeight(state));
  q<HTMLElement>("#rain-reason").textContent = `${rainReason(state, standingHeight(state), rate)}(勾配 ${slope.toFixed(0)}°)`;
  q<HTMLElement>("#rain-value").textContent = String(Math.round(value * 100));
  const bar = q<HTMLElement>("#rain-bar");
  bar.style.width = `${Math.round(value * 100)}%`;
  // 排水力のゲージは**能力**の色。バッジ(状況の判定)とは別の量である
  bar.className = drainageLabel(value);
}
