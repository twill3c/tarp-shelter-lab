// スコアとランク(SPEC §4.6)。係数は設計値であり実測ではない。
export interface ScoreInput {
  seconds: number;
  mistakes: number;
  hints: number;
}

export const FREE_SECONDS = 30;
export const SECOND_PENALTY = 5;
export const MISTAKE_PENALTY = 60;
export const HINT_PENALTY = 40;

export function computeScore(input: ScoreInput): number {
  const timePenalty = Math.max(0, input.seconds - FREE_SECONDS) * SECOND_PENALTY;
  const raw = 1000 - timePenalty - input.mistakes * MISTAKE_PENALTY - input.hints * HINT_PENALTY;
  return Math.max(0, Math.min(1000, Math.round(raw)));
}

export type Rank = "S" | "A" | "B" | "C" | "D";

export function rankOf(score: number): Rank {
  if (score >= 900) return "S";
  if (score >= 750) return "A";
  if (score >= 550) return "B";
  if (score >= 350) return "C";
  return "D";
}
