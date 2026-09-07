// クイズ(SPEC §4.10)。**正解は書かない。モデルから導く。**
// そのぶん「正解がモデルと一致する」は恒等式になり検査にならない(HC-045)。
// 測れるのは設問の側 —— 一意性と、死んだ選択肢の不在である。
import { autoPlan } from "./auto";
import type { RainRate } from "./rain";
import { poolTarget } from "./rain";
import type { MissionLimits } from "./mission";
import type { Shelter } from "./model";
import type { SimState } from "./simulator";
import { initialState, reduce } from "./simulator";
import { stability, standingHeight } from "./wind";

export interface QuizConditions {
  windFrom: number;
  windSpeed: number;
  rain: RainRate;
}

export interface Question {
  id: string;
  prompt: string;
  conditions: QuizConditions;
  limits: MissionLimits;
}

/** 「どれも適さない」の選択肢 ID */
export const NONE_ID = "none";
/** 最良と次点の差がこれ未満なら、設問として差が付いていない */
export const MIN_MARGIN = 0.1;
/** 最大適性がこれ未満なら「どれも適さない」が正解 */
export const NONE_MAX = 0.5;

class QuizDataError extends Error {
  constructor(path: string, msg: string) {
    super(`quiz.json ${path}: ${msg}`);
  }
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new QuizDataError(path, "オブジェクトが必要");
  return v as Record<string, unknown>;
}
function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) throw new QuizDataError(path, "空でない文字列が必要");
  return v;
}
function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new QuizDataError(path, "有限の数値が必要");
  return v;
}

export function loadQuiz(json: unknown): Question[] {
  const root = obj(json, "root");
  const list = root["questions"];
  if (!Array.isArray(list) || list.length === 0) throw new QuizDataError("questions", "空でない配列が必要");
  const out = list.map((raw, i) => {
    const p = `questions[${i}]`;
    const q = obj(raw, p);
    const cond = obj(q["conditions"], `${p}.conditions`);
    const windFrom = num(cond["windFrom"], `${p}.conditions.windFrom`);
    if (!(windFrom >= 0 && windFrom < 360)) throw new QuizDataError(`${p}.conditions.windFrom`, "0 以上 360 未満");
    const windSpeed = num(cond["windSpeed"], `${p}.conditions.windSpeed`);
    if (!(windSpeed >= 0 && windSpeed <= 100)) throw new QuizDataError(`${p}.conditions.windSpeed`, "0..100");
    const rain = num(cond["rain"], `${p}.conditions.rain`);
    if (![0, 1, 2, 3].includes(rain)) throw new QuizDataError(`${p}.conditions.rain`, "0..3 のいずれか");
    const limitsRaw = obj(q["limits"], `${p}.limits`);
    const limits: MissionLimits = {};
    for (const key of ["poles", "pegs", "ropes"] as const) {
      if (limitsRaw[key] === undefined) continue;
      const n = num(limitsRaw[key], `${p}.limits.${key}`);
      if (!Number.isInteger(n) || n <= 0) throw new QuizDataError(`${p}.limits.${key}`, "正の整数が必要");
      limits[key] = n;
    }
    return { id: str(q["id"], `${p}.id`), prompt: str(q["prompt"], `${p}.prompt`), conditions: { windFrom, windSpeed, rain: rain as RainRate }, limits };
  });
  const ids = out.map((q) => q.id);
  if (new Set(ids).size !== ids.length) throw new QuizDataError("questions", "id が重複");
  return out;
}

/** その型を正しい手順で張り終えた状態 */
function pitched(shelter: Shelter): SimState {
  let st = initialState(shelter);
  for (const a of autoPlan(shelter)) st = reduce(st, a).state;
  return st;
}

export interface ShelterScore {
  shelterId: string;
  name: string;
  /** 適性 0〜1。先に壊れるほうが決めるので min を採る */
  fitness: number;
  stability: number;
  pool: number;
  eligible: boolean;
  /** 適格でない理由(適格なら空) */
  reason: string;
}

export interface QuestionResult {
  answerId: string;
  scores: ShelterScore[];
  /** 最良と次点の差。適格な型が 1 つなら 1 */
  margin: number;
  discriminating: boolean;
}

export function evaluateQuestion(question: Question, shelters: Shelter[]): QuestionResult {
  const scores: ShelterScore[] = shelters.map((sh) => {
    const st = pitched(sh);
    const h = standingHeight(st);
    const stab = stability(st, { windFrom: question.conditions.windFrom, speed: question.conditions.windSpeed });
    const pool = poolTarget(st, h, question.conditions.rain);
    const over: string[] = [];
    for (const [key, label, count] of [
      ["poles", "ポール", sh.poles.length],
      ["pegs", "ペグ", sh.pegs.length],
      ["ropes", "ロープ", sh.ropes.length],
    ] as const) {
      const limit = question.limits[key];
      if (limit !== undefined && count > limit) over.push(`${label}を ${count} 本使う(上限 ${limit})`);
    }
    return {
      shelterId: sh.id,
      name: sh.name,
      fitness: Math.min(stab / 100, 1 - pool),
      stability: stab,
      pool,
      eligible: over.length === 0,
      reason: over.join("・"),
    };
  });

  const eligible = scores.filter((s) => s.eligible).sort((a, b) => b.fitness - a.fitness);
  if (eligible.length === 0) {
    return { answerId: NONE_ID, scores, margin: 1, discriminating: true };
  }
  const best = eligible[0]!;
  // 適格な型が 1 つなら選ぶ余地が無いので、差は最大とみなす
  const margin = eligible.length === 1 ? 1 : best.fitness - eligible[1]!.fitness;
  if (best.fitness < NONE_MAX) {
    // 「どれも適さない」が正解。次点との差ではなく**閾値からの隔たり**で一意性を見る。
    // ここに同じ MIN_MARGIN を要求しないと判定が必ず真になり、何も測らない ——
    // 最良が閾値のすぐ下にある設問は、その型を選んだ人を責められない(loop_006 で実測: 0.424 と閾値 0.5)
    const gap = NONE_MAX - best.fitness;
    return { answerId: NONE_ID, scores, margin: gap, discriminating: gap >= MIN_MARGIN };
  }
  return { answerId: best.shelterId, scores, margin, discriminating: margin >= MIN_MARGIN };
}
