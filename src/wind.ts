// 風の近似モデル(SPEC §4.7)。完全な空力ではなく、**向きと張力が効くこと**が分かる近似。
// 係数は設計値であり実測ではない。UI 非依存の純関数(N-04)。
import type { Poly } from "./geometry";
import type { Shelter } from "./model";
import type { SimState } from "./simulator";
import { ropeStatus } from "./simulator";

export interface Wind {
  /** どこから吹くか。0 = 画面の上から、90 = 右から(度) */
  windFrom: number;
  /** 0..100 % */
  speed: number;
}

/** 基準面積(cm²)= 300 × 150 / 2。一枚屋根の正面投影 */
export const A_REF = 22500;

export const STABLE_MIN = 60;
export const CAUTION_MIN = 30;

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * 正面投影幅 —— 多角形を風に垂直な軸 u = (cos θ, sin θ) へ射影した幅(支持関数)。
 * 風の進む向きは v = (−sin θ, cos θ) なので、u は v に直交する。
 */
export function frontalWidth(poly: Poly, windFrom: number): number {
  const ux = Math.cos(rad(windFrom));
  const uy = Math.sin(rad(windFrom));
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of poly) {
    const t = x * ux + y * uy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  return hi - lo;
}

/** 二つの方位の角度差(0..180 度) */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** 開口が風上を向いていれば 2.0、それ以外は 1.2 */
export function dragCoefficient(shelter: Shelter, windFrom: number): number {
  if (shelter.opening === null) return 1.2;
  return angleDiff(shelter.opening, windFrom) < 90 ? 2 : 1.2;
}

/** 立っているポールの最大高さ(cm)。1 本も立っていなければ 0 */
export function standingHeight(state: SimState): number {
  const hs = Object.values(state.poles).map((p) => p.height);
  return hs.length === 0 ? 0 : Math.max(...hs);
}

/** 保持力(点)= 全ロープの張力の平均。接続が無ければ 0 */
export function holdOf(state: SimState): number {
  const ropes = state.shelter.ropes;
  if (ropes.length === 0) return 0;
  let sum = 0;
  for (const r of ropes) {
    const st = ropeStatus(state, r.id);
    sum += st.attached ? st.tension : 0;
  }
  return sum / ropes.length;
}

/** 風荷重(点)= 100 × q × Cd × A / A_ref */
export function windLoad(state: SimState, wind: Wind): number {
  const q = (wind.speed / 100) ** 2;
  const w = frontalWidth(state.shelter.tarp.pitched, wind.windFrom);
  const area = (w * standingHeight(state)) / 2;
  return (100 * q * dragCoefficient(state.shelter, wind.windFrom) * area) / A_REF;
}

/** 安定度 = clamp(保持力 − 荷重, 0, 100) */
export function stability(state: SimState, wind: Wind): number {
  const s = holdOf(state) - windLoad(state, wind);
  return Math.max(0, Math.min(100, s));
}

export type StabilityLabel = "STABLE" | "CAUTION" | "DANGER";

export function stabilityLabel(value: number): StabilityLabel {
  if (value >= STABLE_MIN) return "STABLE";
  if (value >= CAUTION_MIN) return "CAUTION";
  return "DANGER";
}

/** 画面に出す説明。判定の根拠を言えるものだけを出す(HC-079) */
export function stabilityReason(state: SimState, wind: Wind): string {
  const label = stabilityLabel(stability(state, wind));
  if (wind.speed === 0) return "無風";
  if (label === "STABLE") return "風を受け流せている";
  const parts: string[] = [];
  if (state.shelter.opening !== null && angleDiff(state.shelter.opening, wind.windFrom) < 90) {
    parts.push("開口が風上を向いている");
  }
  if (holdOf(state) < 70) parts.push("ロープがたるんでいる");
  const pitched = state.shelter.tarp.pitched;
  if (frontalWidth(pitched, wind.windFrom) > frontalWidth(pitched, wind.windFrom + 90)) {
    parts.push("広い面が風上を向いている");
  }
  return parts.length > 0 ? parts.join("・") : "風が強い";
}
