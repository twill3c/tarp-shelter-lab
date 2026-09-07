// 画面の主制御。状態は SimState 一つ。描画は状態から毎回作り直す。
import raw from "../data/shelters.json";
import missionRaw from "../data/missions.json";
import quizRaw from "../data/quiz.json";
import { morphPoly, sleep } from "./animate";
import { autoPlan } from "./auto";
import type { Point } from "./geometry";
import { TENSION_SLACK_CM } from "./judge";
import type { Shelter } from "./model";
import { loadShelters } from "./model";
import { trackDrag } from "./pointer";
import type { Wind } from "./wind";
import { stability } from "./wind";
import { renderWind, renderWindPanel, swayOffset } from "./windview";
import type { RainRate } from "./rain";
import { poolTarget, relaxPool } from "./rain";
import { renderRain, renderRainPanel } from "./rainview";
import type { Mission } from "./mission";
import { clearedIds, loadMissions, recordClear } from "./mission";
import { renderMissionList, renderMissionPanel } from "./missionview";
import { evaluateQuestion, loadQuiz } from "./quiz";
import type { QuizState } from "./quizview";
import { renderQuiz } from "./quizview";
import { standingHeight } from "./wind";
import { computeScore, rankOf } from "./score";
import type { Action, SimEvent, SimState } from "./simulator";
import { blockers, initialState, isComplete, nextTarget, reduce } from "./simulator";
import type { BestRecord, StorageLike } from "./storage";
import { loadBest, saveBest } from "./storage";
import {
  drawGhost,
  nearestPlacedPeg,
  renderControls,
  renderFeedback,
  renderField,
  renderScore,
  renderShelterList,
  renderSource,
  renderSteps,
  renderTimer,
  renderTray,
  setField,
  tarpPolyFor,
} from "./view";

const shelters = loadShelters(raw);
const missions = loadMissions(missionRaw);
const questions = loadQuiz(quizRaw);

const storage: StorageLike = {
  getItem: (k) => window.localStorage.getItem(k),
  setItem: (k, v) => window.localStorage.setItem(k, v),
};

interface App {
  state: SimState;
  hint: { kind: "unfold" | "pole" | "peg" | "rope" | "tension"; id: string } | null;
  busy: boolean;
  /** AUTO 再生中はスコアを記録しない(SPEC §4.6) */
  auto: boolean;
  lastScore: { score: number; rank: string; seconds: number; mistakes: number; hints: number } | null;
  wind: Wind;
  rain: RainRate;
  mission: Mission | null;
  quiz: QuizState;
  /** 溜まりは時間で緩和する見せ方の量。判定そのものではない */
  pool: number;
  lastTick: number;
}

const app: App = { state: initialState(shelters[0]!), hint: null, busy: false, auto: false, lastScore: null, wind: { windFrom: 0, speed: 0 }, rain: 0, pool: 0, lastTick: 0, mission: null, quiz: { index: 0, answered: null, correct: 0, asked: 0 } };

function svg(): SVGSVGElement {
  const el = document.querySelector<SVGSVGElement>("svg#field");
  if (!el) throw new Error("svg#field が無い");
  return el;
}

function bests(): Record<string, BestRecord | null> {
  return Object.fromEntries(shelters.map((s) => [s.id, loadBest(storage, s.id)]));
}

function elapsedSeconds(s: SimState): number {
  if (s.startedAt === null) return 0;
  return ((s.completedAt ?? performance.now()) - s.startedAt) / 1000;
}

function render(tarpOverride?: Point[] | undefined): void {
  const s = app.state;
  renderField({ state: s, hint: app.hint, ...(tarpOverride ? { tarpOverride: tarpOverride.map((p) => [p.x, p.y] as [number, number]) } : {}) });
  renderTray(s);
  renderSteps(s);
  renderControls(s, onHeight);
  renderTimer(s, performance.now());
  const b = bests();
  renderShelterList(shelters, s.shelter.id, b, selectShelter);
  renderScore(app.lastScore, b[s.shelter.id] ?? null, app.auto ? "AUTO 再生の記録は保存しません" : "ベストスコアはこの端末にだけ保存されます");
  renderWindPanel(s, app.wind);
  renderRainPanel(s, app.pool, app.rain);
  const cleared = clearedIds(storage);
  renderMissionList(missions, app.mission?.id ?? null, cleared, selectMission);
  const result = renderMissionPanel(s, app.mission, { elapsedSeconds: elapsedSeconds(s), wind: app.wind, rain: app.rain }, cleared);
  // 課題中は天候を課題が握る(利用者が変えると、何を判定しているのか言えなくなる)
  for (const sel of ["#wind-dir", "#wind-speed", "#rain-rate"]) {
    const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(sel);
    if (el) el.disabled = app.mission !== null;
  }
  if (result?.cleared && app.mission && !app.auto && !cleared.includes(app.mission.id)) {
    recordClear(storage, app.mission.id);
    renderMissionList(missions, app.mission.id, clearedIds(storage), selectMission);
  }
  for (const id of ["btn-hint", "btn-auto"]) {
    const btn = document.querySelector<HTMLButtonElement>(`#${id}`);
    if (btn) btn.disabled = app.busy || isComplete(s);
  }
}

function morph(from: SimState, to: SimState): Promise<void> {
  const a = tarpPolyFor(from);
  const b = tarpPolyFor(to);
  if (a === b) return Promise.resolve();
  return morphPoly(a, b, 600, (poly) => {
    renderField({ state: to, hint: app.hint, tarpOverride: poly });
  });
}

async function dispatch(action: Action): Promise<SimEvent | undefined> {
  const before = app.state;
  const { state, event } = reduce(before, action);
  app.state = state;
  if (event?.kind === "miss" || event?.kind === "wrong-rope") {
    renderFeedback(event.message, "miss");
  } else if (event?.kind === "complete") {
    // 見出し(#status)が COMPLETE を、案内(#instruction)が次の行動を出すので、ここは黙る。
    // 三つが同じことを言うと、どれも読まれなくなる
    renderFeedback("", "");
  } else {
    // 完成を妨げている理由は、イベントの有無に関わらず出し直す。
    // setPoleHeight のようにイベントを返さない操作でも、画面が古い文を持ち続けないようにする
    const blocked = blockers(state);
    if (blocked.length > 0) renderFeedback(blocked[0]!, "");
    else if (event) renderFeedback(event.message, "good");
    else renderFeedback("", "");
  }
  if (tarpPolyFor(before) !== tarpPolyFor(state)) {
    app.busy = true;
    render();
    await morph(before, state);
    app.busy = false;
  }
  if (event?.kind === "complete") onComplete();
  app.hint = null;
  render();
  return event;
}

function onComplete(): void {
  const s = app.state;
  const seconds = elapsedSeconds(s);
  const score = computeScore({ seconds: Math.round(seconds), mistakes: s.mistakes, hints: s.hints });
  const rank = rankOf(score);
  app.lastScore = { score, rank, seconds, mistakes: s.mistakes, hints: s.hints };
  if (!app.auto) {
    saveBest(storage, s.shelter.id, { score, rank, seconds: Math.round(seconds), mistakes: s.mistakes, at: new Date().toISOString() });
  }
}

function onHeight(pole: string, height: number): void {
  void dispatch({ type: "setPoleHeight", pole, height });
}

function applyWeather(m: Mission | null): void {
  if (!m) return;
  app.wind = { windFrom: m.conditions.windFrom, speed: m.conditions.windSpeed };
  app.rain = m.conditions.rain;
  app.pool = 0;
  const dir = document.querySelector<HTMLSelectElement>("#wind-dir");
  if (dir) dir.value = String(m.conditions.windFrom);
  const speed = document.querySelector<HTMLInputElement>("#wind-speed");
  if (speed) speed.value = String(m.conditions.windSpeed);
  const out = document.querySelector("#wind-speed-val");
  if (out) out.textContent = `${m.conditions.windSpeed}%`;
  const rate = document.querySelector<HTMLSelectElement>("#rain-rate");
  if (rate) rate.value = String(m.conditions.rain);
}

function selectMission(id: string | null): void {
  if (app.busy) return;
  app.mission = id === null ? null : (missions.find((m) => m.id === id) ?? null);
  applyWeather(app.mission);
  // 課題を選び直したら最初から張る(条件が変わったのに途中の状態を残すと判定が読めない)
  startShelter(app.state.shelter);
}

function selectShelter(id: string): void {
  if (app.busy) return;
  const sh = shelters.find((s) => s.id === id);
  if (!sh) return;
  startShelter(sh);
}

function startShelter(sh: Shelter): void {
  app.state = initialState(sh);
  app.pool = 0;
  app.hint = null;
  app.auto = false;
  app.lastScore = null;
  setField(sh);
  renderSource(sh);
  renderFeedback("", "");
  render();
}

/** タープをタップして展開 */
function onTarpClick(): void {
  if (app.busy || app.state.unfolded) return;
  void dispatch({ type: "unfold", now: performance.now() });
}

/** トレイからのドラッグ(ポール・ペグ) */
function onTrayDown(part: "pole" | "peg", ev: PointerEvent): void {
  if (app.busy) return;
  const btn = ev.currentTarget as HTMLButtonElement;
  if (btn.getAttribute("data-remaining") === "0") return;
  if (!app.state.unfolded) {
    renderFeedback("先にタープを広げてください", "miss");
    return;
  }
  const s = svg();
  trackDrag(s, ev, {
    move: (p) => drawGhost(part, p, null),
    end: (p, _c, inside) => {
      drawGhost(null, null, null);
      if (!inside) return;
      void dispatch(part === "pole" ? { type: "dropPole", x: p.x, y: p.y, now: performance.now() } : { type: "dropPeg", x: p.x, y: p.y, now: performance.now() });
    },
    cancel: () => drawGhost(null, null, null),
  });
}

/** ロープの端からペグへ線を引く / 打ったペグをつまんで動かす */
function onFieldDown(ev: PointerEvent): void {
  if (app.busy) return;
  const target = ev.target as Element;
  const s = svg();

  const anchorEl = target.closest("circle.anchor");
  if (anchorEl) {
    const ropeId = anchorEl.getAttribute("data-rope");
    const def = app.state.shelter.ropes.find((r) => r.id === ropeId);
    if (!def) return;
    trackDrag(s, ev, {
      move: (p) => drawGhost(null, null, { from: def.anchor, to: p }),
      end: (p) => {
        drawGhost(null, null, null);
        const pegId = nearestPlacedPeg(app.state, p, app.state.shelter.tolerance);
        if (!pegId) {
          renderFeedback("ペグまで線を引いてください", "miss");
          return;
        }
        void dispatch({ type: "attachRope", rope: def.id, peg: pegId, now: performance.now() });
      },
      cancel: () => drawGhost(null, null, null),
    });
    return;
  }

  const pegEl = target.closest("g.peg");
  if (pegEl) {
    const pegId = pegEl.getAttribute("data-id");
    if (!pegId) return;
    trackDrag(s, ev, {
      move: (p) => {
        void dispatch({ type: "movePeg", peg: pegId, x: p.x, y: p.y });
      },
      end: () => {
        void dispatch({ type: "releasePeg", peg: pegId, now: performance.now() });
      },
      cancel: () => {
        void dispatch({ type: "releasePeg", peg: pegId, now: performance.now() });
      },
    });
    return;
  }

  if (target.closest("path#tarp")) onTarpClick();
}

async function runAuto(): Promise<void> {
  if (app.busy) return;
  app.busy = true;
  app.auto = true;
  app.state = initialState(app.state.shelter);
  app.hint = null;
  app.lastScore = null;
  render();
  const plan = autoPlan(app.state.shelter, performance.now());
  // autoPlan は一般の手順として末尾に releasePeg を並べるが、目標どおりに置いた再生では
  // 張力が既に 100 なので何も変えない。完成した時点で打ち切る
  for (const action of plan) {
    app.busy = false; // dispatch 内のアニメーションに任せる
    await dispatch({ ...action, ...(("now" in action) ? { now: performance.now() } : {}) } as Action);
    app.busy = true;
    render();
    // 完成を検めるのは**待つ前**。待ってから抜けると、画面が COMPLETE を出したまま
    // 操作を捨てる時間が残る
    if (isComplete(app.state)) break;
    await sleep(220);
  }
  app.busy = false;
  render();
}

function onHint(): void {
  if (app.busy) return;
  const t = nextTarget(app.state);
  if (!t) {
    renderFeedback("すべて張れています", "good");
    return;
  }
  void dispatch({ type: "hint" }).then(() => {
    app.hint = t;
    const msg: Record<string, string> = {
      unfold: "タープをタップして広げる",
      pole: `ポールを ${t.id} の印へ`,
      peg: `ペグを ${t.id} の印へ`,
      rope: `ロープ ${t.id} を対応するペグへ`,
      tension: `ペグ ${t.id} を外へ引いて張る`,
    };
    renderFeedback(msg[t.kind] ?? "", "");
    render();
  });
}

function tick(now: number): void {
  renderTimer(app.state, now);
  // 矢印は流れ、タープは風下へ揺れる。周期 2.4 秒
  const phase = (now / 2400) % 1;
  renderWind(app.state, app.wind, phase);
  // 溜まりは平衡へ緩和する。dt は実時間(タブが止まっていた分を一気に足さない)
  const dt = app.lastTick === 0 ? 0 : Math.min(0.25, (now - app.lastTick) / 1000);
  app.lastTick = now;
  const target = poolTarget(app.state, standingHeight(app.state), app.rain);
  const beforePct = Math.round(app.pool * 100);
  app.pool = relaxPool(app.pool, target, dt);
  renderRain(app.state, app.rain, app.pool, (now / 900) % 1);
  // **表示している値が変わったときに描き直す。** 生の差で間引くと、緩和が遅いときに
  // 1 フレームの変化が閾値を一度も超えず、絵は育つのに数字が止まったままになる(実測)
  if (Math.round(app.pool * 100) !== beforePct) renderRainPanel(app.state, app.pool, app.rain);
  const field = document.querySelector<SVGGElement>("#layer-tarp");
  if (field) {
    const { dx, dy } = swayOffset(app.wind, stability(app.state, app.wind), phase);
    field.setAttribute("transform", dx === 0 && dy === 0 ? "" : `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
  }
  requestAnimationFrame(tick);
}

function drawQuiz(): void {
  renderQuiz(questions, shelters, app.quiz, onQuizAnswer, onQuizNext);
}

function onQuizAnswer(choiceId: string): void {
  if (app.quiz.answered !== null) return;
  const question = questions[app.quiz.index % questions.length]!;
  const correct = evaluateQuestion(question, shelters).answerId === choiceId;
  app.quiz = { ...app.quiz, answered: choiceId, asked: app.quiz.asked + 1, correct: app.quiz.correct + (correct ? 1 : 0) };
  drawQuiz();
}

function onQuizNext(): void {
  app.quiz = { ...app.quiz, index: app.quiz.index + 1, answered: null };
  drawQuiz();
}

function boot(): void {
  startShelter(shelters[0]!);
  drawQuiz();
  const s = svg();
  s.addEventListener("pointerdown", onFieldDown, { passive: false });
  for (const part of ["pole", "peg"] as const) {
    const btn = document.querySelector<HTMLButtonElement>(`#tray button[data-part="${part}"]`);
    btn?.addEventListener("pointerdown", (ev) => onTrayDown(part, ev));
  }
  document.querySelector("#btn-reset")?.addEventListener("click", () => {
    if (app.busy) return;
    app.auto = false;
    app.lastScore = null;
    void dispatch({ type: "reset" });
  });
  document.querySelector("#btn-hint")?.addEventListener("click", onHint);
  document.querySelector("#btn-auto")?.addEventListener("click", () => void runAuto());

  const dir = document.querySelector<HTMLSelectElement>("#wind-dir");
  dir?.addEventListener("change", () => {
    app.wind = { ...app.wind, windFrom: Number(dir.value) };
    render();
  });
  const rain = document.querySelector<HTMLSelectElement>("#rain-rate");
  rain?.addEventListener("change", () => {
    app.rain = Number(rain.value) as RainRate;
    render();
  });
  const speed = document.querySelector<HTMLInputElement>("#wind-speed");
  speed?.addEventListener("input", () => {
    app.wind = { ...app.wind, speed: Number(speed.value) };
    const out = document.querySelector("#wind-speed-val");
    if (out) out.textContent = `${speed.value}%`;
    render();
  });
  requestAnimationFrame(tick);
}

function start(): void {
  boot();
  // 吸着の許容(cm)は画面の説明と同じ定数から出す(文書とコードの二重管理を避ける)
  const note = document.querySelector("#walk li:nth-child(6)");
  if (note) note.textContent = `たるんだロープは、ペグをつまんで外へ引く。${TENSION_SLACK_CM} cm 以内なら吸い付いて張り切る。`;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
