// MISSION(SPEC §4.9)。課題は**判定できる述語の集まり**。
// 判定は未達の項目を必ず列挙する —— 根拠を言えない合否は出さない(HC-079)。
import type { DrainageLabel, RainRate } from "./rain";
import { rainVerdict } from "./rain";
import type { SimState } from "./simulator";
import { isComplete } from "./simulator";
import type { StorageLike } from "./storage";
import type { Wind } from "./wind";
import { stability, standingHeight } from "./wind";
import { habitabilityOf } from "./habitat";

export interface MissionConditions {
  windFrom: number;
  windSpeed: number;
  rain: RainRate;
}

export interface MissionLimits {
  poles?: number;
  pegs?: number;
  ropes?: number;
}

export interface MissionRequirements {
  minStability?: number;
  minHabitability?: number;
  rainVerdict?: DrainageLabel;
  maxSeconds?: number;
  maxMistakes?: number;
}

export interface Mission {
  id: string;
  title: string;
  brief: string;
  hint: string;
  conditions: MissionConditions;
  limits: MissionLimits;
  requirements: MissionRequirements;
}

class MissionDataError extends Error {
  constructor(path: string, msg: string) {
    super(`missions.json ${path}: ${msg}`);
  }
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new MissionDataError(path, "オブジェクトが必要");
  return v as Record<string, unknown>;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) throw new MissionDataError(path, "空でない文字列が必要");
  return v;
}

function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new MissionDataError(path, "有限の数値が必要");
  return v;
}

function posInt(v: unknown, path: string): number {
  const n = num(v, path);
  if (!Number.isInteger(n) || n <= 0) throw new MissionDataError(path, "正の整数が必要");
  return n;
}

const VERDICTS: DrainageLabel[] = ["GOOD", "CAUTION", "POOL"];

export function loadMissions(json: unknown): Mission[] {
  const root = obj(json, "root");
  const list = root["missions"];
  if (!Array.isArray(list) || list.length === 0) throw new MissionDataError("missions", "空でない配列が必要");
  const out = list.map((raw, i) => {
    const p = `missions[${i}]`;
    const m = obj(raw, p);
    const cond = obj(m["conditions"], `${p}.conditions`);
    const rain = num(cond["rain"], `${p}.conditions.rain`);
    if (![0, 1, 2, 3].includes(rain)) throw new MissionDataError(`${p}.conditions.rain`, "0..3 のいずれか");
    const limitsRaw = obj(m["limits"], `${p}.limits`);
    const limits: MissionLimits = {};
    for (const key of ["poles", "pegs", "ropes"] as const) {
      if (limitsRaw[key] !== undefined) limits[key] = posInt(limitsRaw[key], `${p}.limits.${key}`);
    }
    const reqRaw = obj(m["requirements"], `${p}.requirements`);
    const requirements: MissionRequirements = {};
    if (reqRaw["minStability"] !== undefined) requirements.minStability = num(reqRaw["minStability"], `${p}.requirements.minStability`);
    if (reqRaw["minHabitability"] !== undefined) requirements.minHabitability = num(reqRaw["minHabitability"], `${p}.requirements.minHabitability`);
    if (reqRaw["maxSeconds"] !== undefined) requirements.maxSeconds = num(reqRaw["maxSeconds"], `${p}.requirements.maxSeconds`);
    if (reqRaw["maxMistakes"] !== undefined) requirements.maxMistakes = num(reqRaw["maxMistakes"], `${p}.requirements.maxMistakes`);
    if (reqRaw["rainVerdict"] !== undefined) {
      const v = str(reqRaw["rainVerdict"], `${p}.requirements.rainVerdict`);
      if (!VERDICTS.includes(v as DrainageLabel)) throw new MissionDataError(`${p}.requirements.rainVerdict`, "GOOD/CAUTION/POOL のいずれか");
      requirements.rainVerdict = v as DrainageLabel;
    }
    return {
      id: str(m["id"], `${p}.id`),
      title: str(m["title"], `${p}.title`),
      brief: str(m["brief"], `${p}.brief`),
      hint: str(m["hint"], `${p}.hint`),
      conditions: {
        windFrom: num(cond["windFrom"], `${p}.conditions.windFrom`),
        windSpeed: num(cond["windSpeed"], `${p}.conditions.windSpeed`),
        rain: rain as RainRate,
      },
      limits,
      requirements,
    };
  });
  const ids = out.map((m) => m.id);
  if (new Set(ids).size !== ids.length) throw new MissionDataError("missions", "id が重複");
  return out;
}

export interface MissionCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface MissionResult {
  cleared: boolean;
  checks: MissionCheck[];
  /** 満たしていない項目だけ */
  unmet: MissionCheck[];
}

export interface MissionContext {
  elapsedSeconds: number;
  wind: Wind;
  rain: RainRate;
}

/**
 * 達成判定。**満たしていない項目を必ず列挙する。**
 * 材料の上限は「その型が要求する数」で見る —— 選んだ時点で決まるので、
 * 張り終える前でも「この型では無理」と言える。
 */
export function missionStatus(state: SimState, mission: Mission, ctx: MissionContext): MissionResult {
  const sh = state.shelter;
  const checks: MissionCheck[] = [];

  for (const [key, label, count] of [
    ["poles", "ポール", sh.poles.length],
    ["pegs", "ペグ", sh.pegs.length],
    ["ropes", "ロープ", sh.ropes.length],
  ] as const) {
    const limit = mission.limits[key];
    if (limit === undefined) continue;
    checks.push({
      id: `limit:${key}`,
      label: `${label}は ${limit} 本まで`,
      ok: count <= limit,
      detail: `この型は ${count} 本使う`,
    });
  }

  const complete = isComplete(state);
  checks.push({ id: "complete", label: "張り終えている", ok: complete, detail: complete ? "完成" : "まだ張り終えていない" });

  const req = mission.requirements;
  if (req.minStability !== undefined) {
    const value = stability(state, ctx.wind);
    checks.push({
      id: "minStability",
      label: `安定度 ${req.minStability} 以上`,
      ok: complete && value >= req.minStability,
      detail: `いまの安定度 ${Math.round(value)}`,
    });
  }
  if (req.minHabitability !== undefined) {
    const value = habitabilityOf(state);
    checks.push({
      id: "minHabitability",
      label: `居住性 ${req.minHabitability} 以上`,
      ok: complete && value >= req.minHabitability,
      detail: `いまの居住性 ${value.toFixed(2)}`,
    });
  }
  if (req.rainVerdict !== undefined) {
    const v = rainVerdict(state, standingHeight(state), ctx.rain);
    checks.push({
      id: "rainVerdict",
      label: `排水の判定が ${req.rainVerdict}`,
      ok: complete && v === req.rainVerdict,
      detail: v === null ? "雨が降っていない" : `いまの判定 ${v}`,
    });
  }
  if (req.maxSeconds !== undefined) {
    checks.push({
      id: "maxSeconds",
      label: `${req.maxSeconds} 秒以内`,
      ok: ctx.elapsedSeconds <= req.maxSeconds,
      detail: `経過 ${Math.round(ctx.elapsedSeconds)} 秒`,
    });
  }
  if (req.maxMistakes !== undefined) {
    checks.push({
      id: "maxMistakes",
      label: `ミス ${req.maxMistakes} 回まで`,
      ok: state.mistakes <= req.maxMistakes,
      detail: `いま ${state.mistakes} 回`,
    });
  }

  const unmet = checks.filter((c) => !c.ok);
  return { cleared: unmet.length === 0, checks, unmet };
}

const KEY = "tarp-shelter-lab:missions";

/** クリア済みの課題 ID。読めなければ空 */
export function clearedIds(storage: StorageLike): string[] {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

/** クリアを記録する。重複しない。返り値は記録後の集合 */
export function recordClear(storage: StorageLike, missionId: string): string[] {
  const next = clearedIds(storage);
  if (!next.includes(missionId)) next.push(missionId);
  try {
    storage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても画面は続ける(記録は今回限りになる)
  }
  return next;
}
