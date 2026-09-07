// T-031..T-034 — MISSION(F-18 / G-22 G-23 G-24)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { autoPlan } from "../src/auto";
import { findForeignChars } from "../src/hygiene";
import { loadMissions, missionStatus, clearedIds, recordClear } from "../src/mission";
import { loadShelters } from "../src/model";
import { initialState, reduce } from "../src/simulator";
import type { StorageLike } from "../src/storage";

const shelters = loadShelters(
  JSON.parse(readFileSync(new URL("../data/shelters.json", import.meta.url), "utf8")),
);
const MISSION_RAW = readFileSync(new URL("../data/missions.json", import.meta.url), "utf8");
const missions = loadMissions(JSON.parse(MISSION_RAW));

/** 正しい手順で完成させた状態 */
function completed(id: string) {
  const sh = shelters.find((s) => s.id === id)!;
  let st = initialState(sh);
  for (const a of autoPlan(sh)) st = reduce(st, a).state;
  return st;
}

/** 課題の条件どおりに、素早くミスなく張り終えた文脈 */
function ctx(missionId: string) {
  const m = missions.find((x) => x.id === missionId)!;
  return { elapsedSeconds: 30, wind: { windFrom: m.conditions.windFrom, speed: m.conditions.windSpeed }, rain: m.conditions.rain };
}

describe("T-031 各課題は型を選ばせる(G-22)", () => {
  const table: Record<string, string> = { m01: "a-frame", m02: "a-frame", m03: "diamond", m04: "lean-to" };
  it("課題 × 型の総当たりで、達成できる型が 1 つ以上・できない型が 1 つ以上", () => {
    for (const m of missions) {
      const ok = shelters.filter((sh) => missionStatus(completed(sh.id), m, ctx(m.id)).cleared);
      expect(ok.length, `${m.id} 達成できる型`).toBeGreaterThanOrEqual(1);
      expect(ok.length, `${m.id} 達成できない型`).toBeLessThan(shelters.length);
    }
  });
  it("SPEC §4.9 の表と一致する(達成できるのは表の型だけ)", () => {
    for (const m of missions) {
      const ok = shelters.filter((sh) => missionStatus(completed(sh.id), m, ctx(m.id)).cleared).map((sh) => sh.id);
      expect(ok, m.id).toEqual([table[m.id]]);
    }
  });
});

describe("T-032 未達の理由を列挙する(G-23・陽性対照 5 本)", () => {
  it("材料の上限: ポール 1 本までの課題に A-Frame(2 本)を出すと、その項目が未達に挙がる", () => {
    const m = missions.find((x) => x.id === "m03")!;
    const st = completed("a-frame");
    const r = missionStatus(st, m, ctx("m03"));
    expect(r.cleared).toBe(false);
    expect(r.unmet.some((u) => u.id === "limit:poles")).toBe(true);
  });
  it("安定度: 風の課題に Diamond を出すと安定度の項目が未達", () => {
    const r = missionStatus(completed("diamond"), missions.find((x) => x.id === "m02")!, ctx("m02"));
    expect(r.unmet.some((u) => u.id === "minStability")).toBe(true);
  });
  it("排水: 雨の課題に Lean-To を出すと排水の項目が未達", () => {
    const r = missionStatus(completed("lean-to"), missions.find((x) => x.id === "m01")!, ctx("m01"));
    expect(r.unmet.some((u) => u.id === "rainVerdict")).toBe(true);
  });
  it("時間: 制限時間を超えるとその項目が未達(他は満たしたまま)", () => {
    const m = missions.find((x) => x.id === "m01")!;
    const base = ctx("m01");
    const ok = missionStatus(completed("a-frame"), m, base);
    expect(ok.cleared).toBe(true);
    const late = missionStatus(completed("a-frame"), m, { ...base, elapsedSeconds: 999 });
    expect(late.cleared).toBe(false);
    expect(late.unmet.map((u) => u.id)).toEqual(["maxSeconds"]);
  });
  it("未完成: 張り終えていなければ complete が未達", () => {
    const sh = shelters.find((s) => s.id === "a-frame")!;
    const r = missionStatus(initialState(sh), missions[0]!, ctx("m01"));
    expect(r.cleared).toBe(false);
    expect(r.unmet.some((u) => u.id === "complete")).toBe(true);
  });
  it("達成時は未達が空で、満たした項目が列挙される", () => {
    const r = missionStatus(completed("diamond"), missions.find((x) => x.id === "m03")!, ctx("m03"));
    expect(r.cleared).toBe(true);
    expect(r.unmet).toEqual([]);
    expect(r.checks.length).toBeGreaterThan(0);
    expect(r.checks.every((c) => c.ok)).toBe(true);
  });
});

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

describe("T-033 クリア記録の往復(G-24)", () => {
  it("保存→読込で同じ集合。重複しない", () => {
    const st = memoryStorage();
    expect(clearedIds(st)).toEqual([]);
    expect(recordClear(st, "m01")).toEqual(["m01"]);
    expect(recordClear(st, "m01")).toEqual(["m01"]);
    expect(recordClear(st, "m03").sort()).toEqual(["m01", "m03"]);
    expect(clearedIds(st).sort()).toEqual(["m01", "m03"]);
  });
  it("壊れた値・例外を投げる storage でも落ちない", () => {
    const st = memoryStorage();
    st.map.set("tarp-shelter-lab:missions", "{not json");
    expect(clearedIds(st)).toEqual([]);
    st.map.set("tarp-shelter-lab:missions", JSON.stringify({ nope: 1 }));
    expect(clearedIds(st)).toEqual([]);
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(clearedIds(throwing)).toEqual([]);
    expect(() => recordClear(throwing, "m01")).not.toThrow();
  });
});

describe("T-034 課題データの整合(G-01)", () => {
  it("ID が一意で、条件と要求が型どおり", () => {
    const ids = missions.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of missions) {
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.brief.length).toBeGreaterThan(0);
      expect(m.hint.length).toBeGreaterThan(0);
      const rv = m.requirements.rainVerdict;
      if (rv !== undefined) expect(["GOOD", "CAUTION", "POOL"]).toContain(rv);
      for (const v of Object.values(m.limits)) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });
  it("字種に違反が無い(共通の検査は data/ を見ない)", () => {
    expect(findForeignChars(MISSION_RAW)).toEqual([]);
  });
});
