// 雨の近似モデル(SPEC §4.8)。水がどこへ流れるかではなく、
// **勾配と張りが排水を決めること**が分かる近似。UI 非依存の純関数(N-04)。
import type { Point } from "./geometry";
import type { Shelter } from "./model";
import type { SimState } from "./simulator";
import { standingHeight, holdOf } from "./wind";

/** 雨量。弱 1 / 中 2 / 強 3 */
export type RainRate = 0 | 1 | 2 | 3;

export const GOOD_MIN = 0.65;
export const CAUTION_MIN = 0.4;
/** 勾配がここまでで満点(度) */
export const SLOPE_FULL_DEG = 45;

/** 点から直線(a を通り b へ向かう)への距離 */
function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / len;
}

/** 各屋根面の水平距離(稜線からいちばん遠い頂点まで、cm) */
export function panelRuns(shelter: Shelter): number[] {
  const first = shelter.ridge[0]!;
  const last = shelter.ridge[shelter.ridge.length - 1]!;
  const a = { x: first[0], y: first[1] };
  const b = { x: last[0], y: last[1] };
  return shelter.tarp.panels.map((panel) =>
    Math.max(...panel.poly.map(([x, y]) => distToLine({ x, y }, a, b))),
  );
}

/**
 * 最も緩い面の勾配(度)。**屋根は一番寝ている所に溜まる**ので、
 * 平均でも最大でもなく最小を採る。
 */
export function minSlopeDeg(shelter: Shelter, height: number): number {
  if (height <= 0) return 0;
  const slopes = panelRuns(shelter).map((run) => (Math.atan2(height, run) * 180) / Math.PI);
  return slopes.length === 0 ? 0 : Math.min(...slopes);
}

/** 排水度 0〜1 = clamp(勾配/45,0,1) × 平均張力/100 */
export function drainage(state: SimState, height = standingHeight(state)): number {
  const slope = minSlopeDeg(state.shelter, height);
  const bySlope = Math.max(0, Math.min(1, slope / SLOPE_FULL_DEG));
  return bySlope * (holdOf(state) / 100);
}

export type DrainageLabel = "GOOD" | "CAUTION" | "POOL";

/** 屋根の**能力**の目安。判定そのものではない(判定は rainVerdict) */
export function drainageLabel(value: number): DrainageLabel {
  if (value >= GOOD_MIN) return "GOOD";
  if (value >= CAUTION_MIN) return "CAUTION";
  return "POOL";
}

/** POOL とみなす溜まりの下限 */
export const POOL_MIN = 0.25;
/** ここまでの溜まりは「追いついている」とみなす。手で打ったペグは数 cm ずれるので、
 *  厳密な 0 を要求すると、ほぼ完璧な設営でも強い雨で必ず CAUTION になる(実測) */
export const GOOD_MAX_POOL = 0.05;

/**
 * 判定。**雨量込みで出す** —— 排水度は屋根の能力であって、
 * その雨に足りているかは別の問いである。雨が降っていなければ判定しない。
 */
export function rainVerdict(state: SimState, height: number, rate: RainRate): DrainageLabel | null {
  if (rate <= 0) return null;
  const pool = poolTarget(state, height, rate);
  if (pool < GOOD_MAX_POOL) return "GOOD";
  if (pool < POOL_MIN) return "CAUTION";
  return "POOL";
}

/** 溜まりの平衡値 0〜1 = clamp(雨量/3 − 排水度, 0, 1) */
export function poolTarget(state: SimState, height: number, rate: RainRate): number {
  if (rate <= 0) return 0;
  return Math.max(0, Math.min(1, rate / 3 - drainage(state, height)));
}

/**
 * 画面に出す説明。**判定と同じ入力から作る**(HC-202)。
 * 判定を雨量込みにしたのに理由が能力だけを見ていると、
 * 「水が溜まりそう」の隣に「勾配も張りも足りている」が並ぶ。
 */
export function rainReason(state: SimState, height: number, rate: RainRate): string {
  const verdict = rainVerdict(state, height, rate);
  if (verdict === null) return "雨が降っていない";
  if (verdict === "GOOD") return "この雨には追いついている";
  const parts: string[] = [];
  const slope = minSlopeDeg(state.shelter, height);
  if (slope < 30) parts.push("屋根が寝すぎている");
  if (holdOf(state) < 70) parts.push("布がたるんでいる");
  if (parts.length === 0) parts.push("この勾配では雨が強すぎる");
  return parts.join("・");
}

/** 溜まりを時定数 2 秒で平衡へ近づける(見せ方であって判定ではない) */
export function relaxPool(current: number, target: number, dtSeconds: number): number {
  const k = 1 - Math.exp(-dtSeconds / 2);
  return current + (target - current) * k;
}
