// 配置判定・張力・ポール高さ(SPEC §4.2–§4.4)。UI 非依存の純関数(N-04)。
import type { Point } from "./geometry";
import { dist } from "./geometry";
import type { HeightRange } from "./model";

/** 張れている閾値(SPEC §4.3: 差 15 cm 以内で 70) */
export const TENSION_OK = 70;
/** 吸着・「文なし」の許容差(cm) */
export const TENSION_SLACK_CM = 15;

/** tension = clamp(100 − |target − length| × 2, 0, 100) */
export function tension(targetLength: number, ropeLength: number): number {
  const t = 100 - Math.abs(targetLength - ropeLength) * 2;
  return Math.max(0, Math.min(100, t));
}

export function sag(targetLength: number, ropeLength: number): number {
  return 1 - tension(targetLength, ropeLength) / 100;
}

/** 短すぎればたるみ、長すぎれば届かない。±15 cm 以内は null */
export function tensionMessage(targetLength: number, ropeLength: number): string | null {
  const diff = ropeLength - targetLength;
  if (diff < -TENSION_SLACK_CM) return "たるみが発生しています";
  if (diff > TENSION_SLACK_CM) return "ロープが届きません";
  return null;
}

export interface Target extends Point {
  id: string;
}

/** 未充填の目標のうち最も近いもの。無ければ null */
export function nearestOpenTarget<T extends Target>(
  targets: readonly T[],
  filled: ReadonlySet<string>,
  p: Point,
): { target: T; d: number } | null {
  let best: { target: T; d: number } | null = null;
  for (const t of targets) {
    if (filled.has(t.id)) continue;
    const d = dist(t, p);
    if (best === null || d < best.d) best = { target: t, d };
  }
  return best;
}

export type HeightStatus = "LOW" | "OK" | "HIGH";

export function poleHeightStatus(range: HeightRange, value: number): HeightStatus {
  if (value < range.min) return "LOW";
  if (value > range.max) return "HIGH";
  return "OK";
}

export function heightMessage(status: HeightStatus): string | null {
  if (status === "LOW") return "居住空間 LOW";
  if (status === "HIGH") return "居住空間 HIGH";
  return null;
}
