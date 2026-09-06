// 設営の状態機械(F-04 F-05 F-06 F-07)。副作用なし。UI は reduce の返す event を表示に使う。
import type { Point } from "./geometry";
import { dist } from "./geometry";
import {
  TENSION_OK,
  TENSION_SLACK_CM,
  heightMessage,
  nearestOpenTarget,
  poleHeightStatus,
  tension,
  tensionMessage,
} from "./judge";
import type { Shelter } from "./model";

export interface PlacedPole {
  x: number;
  y: number;
  height: number;
}

export interface SimState {
  shelter: Shelter;
  unfolded: boolean;
  /** 充填済みポール(目標 ID → 実位置と高さ) */
  poles: Record<string, PlacedPole>;
  /** 充填済みペグ(目標 ID → 実位置) */
  pegs: Record<string, Point>;
  /** 接続済みロープ(ロープ ID → 接続先ペグ ID) */
  ropes: Record<string, string>;
  mistakes: number;
  hints: number;
  startedAt: number | null;
  completedAt: number | null;
}

export type Action =
  | { type: "unfold"; now: number }
  | { type: "dropPole"; x: number; y: number; now: number }
  | { type: "dropPeg"; x: number; y: number; now: number }
  | { type: "attachRope"; rope: string; peg: string; now: number }
  | { type: "movePeg"; peg: string; x: number; y: number }
  | { type: "releasePeg"; peg: string; now: number }
  | { type: "setPoleHeight"; pole: string; height: number }
  | { type: "hint" }
  | { type: "reset" };

export type EventKind = "filled" | "miss" | "wrong-rope" | "attached" | "snapped" | "complete" | "info";

export interface SimEvent {
  kind: EventKind;
  message: string;
  /** 充填・接続した目標の ID */
  targetId?: string;
}

export interface StepDef {
  id: "unfold" | "poles" | "pegs" | "ropes" | "tension" | "complete";
  label: string;
  instruction: string;
}

export const STEPS: readonly StepDef[] = [
  { id: "unfold", label: "STEP 1 展開", instruction: "畳んだタープをタップして地面に広げる" },
  { id: "poles", label: "STEP 2 ポール", instruction: "ポールを印の位置へドラッグする" },
  { id: "pegs", label: "STEP 3 ペグ", instruction: "ペグを印の位置へドラッグする" },
  { id: "ropes", label: "STEP 4 ロープ", instruction: "光っている端からペグへ線を引く" },
  { id: "tension", label: "STEP 5 張力", instruction: "ペグを動かしてすべてのロープを張る" },
  { id: "complete", label: "COMPLETE", instruction: "張り終えた。スコアを確認して RESET、または別のシェルターへ" },
];

export function initialState(shelter: Shelter): SimState {
  return {
    shelter,
    unfolded: false,
    poles: {},
    pegs: {},
    ropes: {},
    mistakes: 0,
    hints: 0,
    startedAt: null,
    completedAt: null,
  };
}

export interface RopeStatus {
  length: number;
  target: number;
  tension: number;
  message: string | null;
  attached: boolean;
  correct: boolean;
}

export function ropeStatus(state: SimState, ropeId: string): RopeStatus {
  const def = state.shelter.ropes.find((r) => r.id === ropeId);
  if (!def) throw new Error(`rope ${ropeId} が無い`);
  const targetPeg = state.shelter.pegs.find((g) => g.id === def.peg)!;
  const target = dist(def.anchor, targetPeg);
  const attachedTo = state.ropes[ropeId];
  const pos = attachedTo !== undefined ? state.pegs[attachedTo] : undefined;
  if (!pos) return { length: 0, target, tension: 0, message: null, attached: false, correct: false };
  const length = dist(def.anchor, pos);
  return {
    length,
    target,
    tension: tension(target, length),
    message: tensionMessage(target, length),
    attached: true,
    correct: attachedTo === def.peg,
  };
}

function allPolesPlaced(s: SimState): boolean {
  return s.shelter.poles.every((p) => s.poles[p.id] !== undefined);
}
function allPegsPlaced(s: SimState): boolean {
  return s.shelter.pegs.every((g) => s.pegs[g.id] !== undefined);
}
function allRopesCorrect(s: SimState): boolean {
  return s.shelter.ropes.every((r) => s.ropes[r.id] === r.peg);
}
function allRopesTight(s: SimState): boolean {
  return s.shelter.ropes.every((r) => ropeStatus(s, r.id).tension >= TENSION_OK);
}
function allHeightsOk(s: SimState): boolean {
  return s.shelter.poles.every((p) => {
    const placed = s.poles[p.id];
    return placed !== undefined && poleHeightStatus(p.height, placed.height) === "OK";
  });
}

/** F-06 の六条件 */
export function isComplete(s: SimState): boolean {
  return (
    s.unfolded && allPolesPlaced(s) && allPegsPlaced(s) && allRopesCorrect(s) && allRopesTight(s) && allHeightsOk(s)
  );
}

/** 現在の段階(STEPS の添字) */
export function stepIndex(s: SimState): number {
  if (isComplete(s)) return STEPS.length - 1;
  if (!s.unfolded) return 0;
  if (!allPolesPlaced(s)) return 1;
  if (!allPegsPlaced(s)) return 2;
  if (!allRopesCorrect(s)) return 3;
  return 4;
}

export function currentStep(s: SimState): StepDef {
  return STEPS[stepIndex(s)]!;
}

/** 完成状態を妨げている理由(張力・高さ)。画面のフィードバック用 */
export function blockers(s: SimState): string[] {
  const out: string[] = [];
  for (const r of s.shelter.ropes) {
    const st = ropeStatus(s, r.id);
    if (st.attached && st.message) out.push(`${r.id}: ${st.message}`);
  }
  for (const p of s.shelter.poles) {
    const placed = s.poles[p.id];
    if (!placed) continue;
    const m = heightMessage(poleHeightStatus(p.height, placed.height));
    if (m) out.push(`${p.id}: ${m}`);
  }
  return out;
}

function started(s: SimState, now: number): SimState {
  return s.startedAt === null ? { ...s, startedAt: now } : s;
}

function finish(s: SimState, now: number): { state: SimState; event?: SimEvent } {
  if (isComplete(s) && s.completedAt === null) {
    return { state: { ...s, completedAt: now }, event: { kind: "complete", message: "SHELTER COMPLETE" } };
  }
  return { state: s };
}

export function reduce(state: SimState, action: Action): { state: SimState; event?: SimEvent } {
  const sh = state.shelter;
  switch (action.type) {
    case "reset":
      return { state: initialState(sh) };

    case "unfold": {
      if (state.unfolded) return { state };
      const s = started({ ...state, unfolded: true }, action.now);
      return { state: s, event: { kind: "info", message: "タープを広げた" } };
    }

    case "dropPole": {
      const s = started(state, action.now);
      const hit = nearestOpenTarget(sh.poles, new Set(Object.keys(s.poles)), action);
      if (!hit || hit.d > sh.tolerance) {
        return { state: { ...s, mistakes: s.mistakes + 1 }, event: { kind: "miss", message: "そこではありません" } };
      }
      const t = hit.target;
      const next = { ...s, poles: { ...s.poles, [t.id]: { x: t.x, y: t.y, height: t.height.ideal } } };
      const done = finish(next, action.now);
      return { state: done.state, event: done.event ?? { kind: "filled", message: `ポール ${t.id} を立てた`, targetId: t.id } };
    }

    case "dropPeg": {
      const s = started(state, action.now);
      const hit = nearestOpenTarget(sh.pegs, new Set(Object.keys(s.pegs)), action);
      if (!hit || hit.d > sh.tolerance) {
        return { state: { ...s, mistakes: s.mistakes + 1 }, event: { kind: "miss", message: "そこではありません" } };
      }
      const t = hit.target;
      // 置いた実位置をそのまま保持する(張力はここから決まる)
      const next = { ...s, pegs: { ...s.pegs, [t.id]: { x: action.x, y: action.y } } };
      const done = finish(next, action.now);
      return { state: done.state, event: done.event ?? { kind: "filled", message: `ペグ ${t.id} を打った`, targetId: t.id } };
    }

    case "attachRope": {
      const s = started(state, action.now);
      const def = sh.ropes.find((r) => r.id === action.rope);
      if (!def || s.pegs[action.peg] === undefined) {
        return { state: { ...s, mistakes: s.mistakes + 1 }, event: { kind: "miss", message: "そのペグは打たれていません" } };
      }
      if (def.peg !== action.peg) {
        return { state: { ...s, mistakes: s.mistakes + 1 }, event: { kind: "wrong-rope", message: "別のペグです" } };
      }
      const next = { ...s, ropes: { ...s.ropes, [def.id]: action.peg } };
      const done = finish(next, action.now);
      const msg = ropeStatus(next, def.id).message;
      return {
        state: done.state,
        event: done.event ?? { kind: "attached", message: msg ?? `ロープ ${def.id} を結んだ`, targetId: def.id },
      };
    }

    case "movePeg": {
      if (state.pegs[action.peg] === undefined) return { state };
      const x = Math.max(0, Math.min(sh.field.w, action.x));
      const y = Math.max(0, Math.min(sh.field.h, action.y));
      return { state: { ...state, pegs: { ...state.pegs, [action.peg]: { x, y } } } };
    }

    case "releasePeg": {
      const pos = state.pegs[action.peg];
      if (pos === undefined) return { state };
      const target = sh.pegs.find((g) => g.id === action.peg)!;
      let s = state;
      let snapped = false;
      // 目標から 15 cm 以内なら吸着(SPEC §4.3)
      if (dist(pos, target) <= TENSION_SLACK_CM) {
        s = { ...s, pegs: { ...s.pegs, [action.peg]: { x: target.x, y: target.y } } };
        snapped = true;
      }
      const done = finish(s, action.now);
      if (done.event) return done;
      return { state: done.state, event: snapped ? { kind: "snapped", message: "ピンと張れた", targetId: action.peg } : undefined };
    }

    case "setPoleHeight": {
      const placed = state.poles[action.pole];
      if (!placed) return { state };
      const s = { ...state, poles: { ...state.poles, [action.pole]: { ...placed, height: action.height } } };
      // 高さは完成後にも動かせるので、完成状態から外れうる
      if (s.completedAt !== null && !isComplete(s)) return { state: { ...s, completedAt: null } };
      const done = finish(s, Date.now());
      return done;
    }

    case "hint":
      return { state: { ...state, hints: state.hints + 1 } };
  }
}

/** HINT が指す「次の目標」(未充填のポール/ペグ、未接続のロープ、たるんだロープ) */
export function nextTarget(s: SimState): { kind: "unfold" | "pole" | "peg" | "rope" | "tension"; id: string } | null {
  if (!s.unfolded) return { kind: "unfold", id: "tarp" };
  const pole = s.shelter.poles.find((p) => s.poles[p.id] === undefined);
  if (pole) return { kind: "pole", id: pole.id };
  const peg = s.shelter.pegs.find((g) => s.pegs[g.id] === undefined);
  if (peg) return { kind: "peg", id: peg.id };
  const rope = s.shelter.ropes.find((r) => s.ropes[r.id] !== r.peg);
  if (rope) return { kind: "rope", id: rope.id };
  const slack = s.shelter.ropes.find((r) => ropeStatus(s, r.id).tension < TENSION_OK);
  if (slack) return { kind: "tension", id: slack.peg };
  return null;
}
