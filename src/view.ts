// SVG と HTML の描画(F-02 F-04 F-10 F-12 F-13)。状態から毎回作り直す(掴み置きしない — HC-080)。
import type { Point, Poly } from "./geometry";
import { dist, polyToPath } from "./geometry";
import { TENSION_OK, poleHeightStatus } from "./judge";
import type { Shelter } from "./model";
import type { BestRecord } from "./storage";
import type { SimState } from "./simulator";
import { STEPS, isComplete, ropeStatus, stepIndex } from "./simulator";

const NS = "http://www.w3.org/2000/svg";

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`要素が無い: ${sel}`);
  return el;
}

export interface HintTarget {
  kind: "unfold" | "pole" | "peg" | "rope" | "tension";
  id: string;
}

export interface ViewInput {
  state: SimState;
  /** アニメーション中のタープ多角形(無ければ状態から決める) */
  tarpOverride?: Poly;
  hint: HintTarget | null;
}

function allPolesPlaced(s: SimState): boolean {
  return s.shelter.poles.every((p) => s.poles[p.id] !== undefined);
}

export function tarpPolyFor(s: SimState): Poly {
  if (!s.unfolded) return s.shelter.tarp.folded;
  if (!allPolesPlaced(s)) return s.shelter.tarp.flat;
  return s.shelter.tarp.pitched;
}

export function setField(shelter: Shelter): void {
  const svg = q<SVGSVGElement>("svg#field");
  svg.setAttribute("viewBox", `0 0 ${shelter.field.w} ${shelter.field.h}`);
  const ground = q<SVGRectElement>("#ground");
  ground.setAttribute("width", String(shelter.field.w));
  ground.setAttribute("height", String(shelter.field.h));
}

export function renderField(input: ViewInput): void {
  const { state: s, hint } = input;
  const sh = s.shelter;
  const targets = q<SVGGElement>("#layer-targets");
  const tarpLayer = q<SVGGElement>("#layer-tarp");
  const parts = q<SVGGElement>("#layer-parts");
  const labels = q<SVGGElement>("#layer-labels");
  targets.replaceChildren();
  tarpLayer.replaceChildren();
  parts.replaceChildren();
  labels.replaceChildren();

  // 目標(未充填のみ)
  if (s.unfolded) {
    for (const p of sh.poles) {
      if (s.poles[p.id]) continue;
      const c = svgEl("circle", { cx: p.x, cy: p.y, r: sh.tolerance, class: "target", "data-kind": "pole", "data-id": p.id });
      if (hint?.kind === "pole" && hint.id === p.id) c.classList.add("hint");
      targets.append(c);
    }
    if (allPolesPlaced(s)) {
      for (const g of sh.pegs) {
        if (s.pegs[g.id]) continue;
        const c = svgEl("circle", { cx: g.x, cy: g.y, r: sh.tolerance, class: "target", "data-kind": "peg", "data-id": g.id });
        if (hint?.kind === "peg" && hint.id === g.id) c.classList.add("hint");
        targets.append(c);
      }
    }
  }

  // タープ。張り上げアニメーションの途中(tarpOverride あり)は面を描かない ——
  // 面の座標は最終形のものなので、途中の輪郭とずれた絵になる
  const pitched = allPolesPlaced(s) && s.unfolded && input.tarpOverride === undefined;
  const poly = input.tarpOverride ?? tarpPolyFor(s);
  const tarp = svgEl("path", { id: "tarp", d: polyToPath(poly), class: "tarp", "data-state": s.unfolded ? (allPolesPlaced(s) ? "pitched" : "flat") : "folded" });
  if (!s.unfolded && hint?.kind === "unfold") tarp.classList.add("hint");
  tarpLayer.append(tarp);

  // 張り終えた状態では、稜線で分けた屋根面を陰影で塗り分け、稜線を引く。
  // 平面図のままだと「地面に置いた布」と「張った屋根」が同じ絵になり、A 形に見えない
  if (pitched) {
    for (const panel of sh.tarp.panels) {
      // 明度そのものを変える。半透明を重ねるだけだと下地と同系色なので差が読めない(実測)
      const face = svgEl("path", { d: polyToPath(panel.poly), class: "tarp-panel", fill: shadeColor(panel.shade) });
      tarpLayer.append(face);
    }
    const ridge = svgEl("path", { d: sh.ridge.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" "), class: "ridge" });
    tarpLayer.append(ridge);
  }

  if (!s.unfolded) {
    const c = centroidOf(poly);
    const t = svgEl("text", { x: c.x, y: c.y + 5, class: "label", "text-anchor": "middle" });
    t.textContent = "TAP";
    labels.append(t);
  }

  // ロープ(接続済み)
  const allPegs = sh.pegs.every((g) => s.pegs[g.id] !== undefined);
  for (const r of sh.ropes) {
    const to = s.ropes[r.id];
    const pos = to !== undefined ? s.pegs[to] : undefined;
    if (!pos) continue;
    const st = ropeStatus(s, r.id);
    const line = svgEl("line", { x1: r.anchor.x, y1: r.anchor.y, x2: pos.x, y2: pos.y, class: "rope", "data-id": r.id });
    if (st.tension < TENSION_OK) line.classList.add(st.length < st.target ? "slack" : "loose");
    parts.append(line);
  }

  // ポール
  for (const p of sh.poles) {
    const placed = s.poles[p.id];
    if (!placed) continue;
    const g = svgEl("g", { class: "pole", "data-id": p.id });
    g.append(svgEl("circle", { cx: placed.x, cy: placed.y, r: 9, class: "base" }));
    g.append(svgEl("circle", { cx: placed.x, cy: placed.y, r: 6, class: "head" }));
    parts.append(g);
    // 高さは操作パネル側に数値と判定が出るので、図には ID だけ置く
    // (狭い幅では字を大きくするので、長いラベルはタープに重なって読めない)
    const t = svgEl("text", { x: placed.x + 14, y: placed.y + 5, class: "label" });
    t.textContent = p.id;
    labels.append(t);
  }

  // ペグ
  for (const g of sh.pegs) {
    const pos = s.pegs[g.id];
    if (!pos) continue;
    const grp = svgEl("g", { class: "peg", "data-id": g.id });
    if (hint?.kind === "tension" && hint.id === g.id) grp.classList.add("hint");
    grp.append(svgEl("circle", { cx: pos.x, cy: pos.y, r: 11 }));
    parts.append(grp);
    const t = svgEl("text", { x: pos.x + 14, y: pos.y + 5, class: "label" });
    t.textContent = g.id;
    labels.append(t);
  }

  // ロープの端(未接続・全ペグ充填後)。**最前面に描く** —— 棟の張り綱の端はポールと同じ座標にあり、
  // 先に描くとポールの図形に覆われてポインタが届かない(loop_001 で実測。要素は在るのに操作が通らない)
  if (allPegs) {
    for (const r of sh.ropes) {
      if (s.ropes[r.id] === r.peg) continue;
      const c = svgEl("circle", { cx: r.anchor.x, cy: r.anchor.y, r: 14, class: "anchor", "data-rope": r.id });
      if (hint?.kind === "rope" && hint.id === r.id) c.classList.add("hint");
      parts.append(c);
    }
  }

  // ラベルがフィールド外へ出ないように寄せる(HC-159: 図の中の要素は viewBox に収める)
  for (const t of labels.querySelectorAll("text")) clampLabel(t, sh.field.w, sh.field.h);
}

/** 基準色 #e2c27a = hsl(41.5 61% 68%) の明度に shade を掛ける(SPEC §4.1 の屋根面) */
function shadeColor(shade: number): string {
  return `hsl(41.5 61% ${(68 * shade).toFixed(1)}%)`;
}

function centroidOf(poly: Poly): Point {
  const n = poly.length || 1;
  return { x: poly.reduce((a, p) => a + p[0], 0) / n, y: poly.reduce((a, p) => a + p[1], 0) / n };
}

function clampLabel(t: SVGTextElement, w: number, h: number): void {
  const b = t.getBBox();
  let x = Number(t.getAttribute("x"));
  let y = Number(t.getAttribute("y"));
  if (b.x + b.width > w - 2) x -= b.x + b.width - (w - 2);
  if (b.x < 2) x += 2 - b.x;
  if (b.y + b.height > h - 2) y -= b.y + b.height - (h - 2);
  if (b.y < 2) y += 2 - b.y;
  t.setAttribute("x", String(x));
  t.setAttribute("y", String(y));
}

export function renderTray(s: SimState): void {
  const polesLeft = s.shelter.poles.length - Object.keys(s.poles).length;
  const pegsLeft = s.shelter.pegs.length - Object.keys(s.pegs).length;
  for (const [part, n] of [
    ["pole", polesLeft],
    ["peg", pegsLeft],
  ] as const) {
    const b = q<HTMLButtonElement>(`#tray button[data-part="${part}"]`);
    b.setAttribute("data-remaining", String(n));
    q<HTMLElement>(`#tray button[data-part="${part}"] .count`).textContent = `×${n}`;
  }
}

export function renderSteps(s: SimState): void {
  const ol = q<HTMLOListElement>("#steps");
  const idx = stepIndex(s);
  ol.replaceChildren(
    ...STEPS.map((st, i) => {
      const li = document.createElement("li");
      li.dataset["step"] = st.id;
      li.textContent = st.label;
      if (i < idx) li.classList.add("done");
      if (i === idx) li.classList.add("active");
      return li;
    }),
  );
  q<HTMLElement>("#instruction").textContent = STEPS[idx]!.instruction;
  q<HTMLElement>("#status").textContent = isComplete(s) ? "SHELTER COMPLETE" : "";
}

export function renderControls(s: SimState, onHeight: (pole: string, h: number) => void): void {
  const heights = q<HTMLElement>("#heights");
  heights.replaceChildren();
  for (const p of s.shelter.poles) {
    const placed = s.poles[p.id];
    if (!placed) continue;
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = `${p.id} 高さ`;
    const input = document.createElement("input");
    input.type = "range";
    input.className = "pole-height";
    input.dataset["pole"] = p.id;
    input.min = String(Math.max(30, p.height.min - 40));
    input.max = String(p.height.max + 40);
    input.step = "5";
    input.value = String(placed.height);
    input.addEventListener("input", () => onHeight(p.id, Number(input.value)));
    const stat = document.createElement("span");
    const hs = poleHeightStatus(p.height, placed.height);
    stat.className = `hstat ${hs}`;
    stat.textContent = `${placed.height}cm ${hs}`;
    label.append(name, input, stat);
    heights.append(label);
  }

  const tensions = q<HTMLElement>("#tensions");
  tensions.replaceChildren();
  for (const r of s.shelter.ropes) {
    const st = ropeStatus(s, r.id);
    if (!st.attached) continue;
    const gauge = document.createElement("span");
    gauge.className = "gauge";
    gauge.dataset["rope"] = r.id;
    const name = document.createElement("span");
    name.textContent = `${r.id}→${r.peg}`;
    const bar = document.createElement("span");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = `${st.tension}%`;
    if (st.tension >= TENSION_OK) fill.className = "ok";
    bar.append(fill);
    const val = document.createElement("span");
    val.textContent = `${Math.round(st.tension)}`;
    gauge.append(name, bar, val);
    tensions.append(gauge);
  }
}

export function renderShelterList(shelters: Shelter[], currentId: string, bests: Record<string, BestRecord | null>, onSelect: (id: string) => void): void {
  const ul = q<HTMLUListElement>("#shelter-list");
  ul.replaceChildren(
    ...shelters.map((s) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.dataset["shelter"] = s.id;
      b.setAttribute("aria-pressed", String(s.id === currentId));
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = `${s.name.toUpperCase()} / ${s.nameJa}`;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = `難度 ${"★".repeat(s.difficulty)}  ポール ${s.poles.length}・ペグ ${s.pegs.length}・ロープ ${s.ropes.length}  [${s.weather.join(" / ")}]`;
      const best = document.createElement("span");
      best.className = "best";
      best.dataset["best"] = s.id;
      const rec = bests[s.id];
      best.textContent = rec ? `BEST ${rec.score} (${rec.rank})` : "BEST —";
      b.append(name, meta, best);
      b.addEventListener("click", () => onSelect(s.id));
      li.append(b);
      return li;
    }),
  );
}

export function renderSource(s: Shelter): void {
  const src = s.source;
  q<HTMLElement>('#source [data-field="title"]').textContent = src.title;
  q<HTMLElement>('#source [data-field="edition"]').textContent = `${src.edition}(${src.year})`;
  q<HTMLElement>('#source [data-field="figure"]').textContent = src.figure;
  q<HTMLAnchorElement>('#source a[data-field="url"]').href = src.url;
  q<HTMLElement>('#source [data-field="rights"]').textContent = src.rights;
  q<HTMLElement>('#source [data-field="usage"]').textContent = src.usage;
  q<HTMLElement>("#sim-title").textContent = `SIMULATOR — ${s.name.toUpperCase()}`;
  const notes = q<HTMLUListElement>("#notes-list");
  notes.replaceChildren(
    ...s.notes.map((n) => {
      const li = document.createElement("li");
      li.textContent = n;
      return li;
    }),
  );
}

export function renderFeedback(text: string, tone: "" | "miss" | "good"): void {
  const el = q<HTMLElement>("#feedback");
  el.textContent = text;
  el.className = `feedback ${tone}`.trim();
}

export function renderScore(rec: { score: number; rank: string; seconds: number; mistakes: number; hints: number } | null, best: BestRecord | null, note: string): void {
  const panel = q<HTMLElement>("#score-panel");
  if (!rec) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  q<HTMLElement>('#score-panel [data-field="score"]').textContent = String(rec.score);
  q<HTMLElement>('#score-panel [data-field="rank"]').textContent = rec.rank;
  q<HTMLElement>('#score-panel [data-field="seconds"]').textContent = `${rec.seconds.toFixed(1)}s`;
  q<HTMLElement>('#score-panel [data-field="mistakes"]').textContent = String(rec.mistakes);
  q<HTMLElement>('#score-panel [data-field="hints"]').textContent = String(rec.hints);
  q<HTMLElement>('#score-panel [data-field="best"]').textContent = best ? `${best.score} (${best.rank})` : "—";
  q<HTMLElement>('#score-panel [data-field="note"]').textContent = note;
}

export function renderTimer(s: SimState, now: number): void {
  const el = q<HTMLElement>("#timer");
  if (s.startedAt === null) {
    el.textContent = "00:00";
    return;
  }
  const end = s.completedAt ?? now;
  const sec = Math.max(0, Math.floor((end - s.startedAt) / 1000));
  el.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

/** ドラッグ中のゴースト描画(layer-drag) */
export function drawGhost(kind: "pole" | "peg" | null, p: Point | null, line: { from: Point; to: Point } | null): void {
  const layer = q<SVGGElement>("#layer-drag");
  layer.replaceChildren();
  if (kind && p) {
    const g = svgEl("g", { class: `ghost ${kind}` });
    if (kind === "pole") {
      g.append(svgEl("circle", { cx: p.x, cy: p.y, r: 9, fill: "#1f2419" }));
      g.append(svgEl("circle", { cx: p.x, cy: p.y, r: 6, fill: "#c9a961" }));
    } else {
      g.append(svgEl("circle", { cx: p.x, cy: p.y, r: 11, fill: "#a33a2a", stroke: "#1f2419", "stroke-width": 2 }));
    }
    layer.append(g);
  }
  if (line) {
    layer.append(svgEl("line", { x1: line.from.x, y1: line.from.y, x2: line.to.x, y2: line.to.y, class: "drag-line" }));
  }
}

/** 充填済みペグのうち点 p に最も近いもの(半径以内) */
export function nearestPlacedPeg(s: SimState, p: Point, radius: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const [id, pos] of Object.entries(s.pegs)) {
    const d = dist(pos, p);
    if (d <= radius && (best === null || d < best.d)) best = { id, d };
  }
  return best?.id ?? null;
}
