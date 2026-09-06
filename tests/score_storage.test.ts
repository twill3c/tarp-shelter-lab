// T-011..T-014 — スコア・ランク・保存(F-09 F-10 / G-05 G-06)
import { describe, expect, it } from "vitest";
import { computeScore, rankOf } from "../src/score";
import type { StorageLike } from "../src/storage";
import { loadBest, saveBest } from "../src/storage";

describe("T-011 スコアの表(G-05・SPEC §4.6 の式)", () => {
  it.each([
    [30, 0, 0, 1000],
    [230, 0, 0, 0],
    [30, 1, 0, 940],
    [30, 0, 1, 960],
    [0, 0, 0, 1000],
    [500, 10, 10, 0], // 下限で止まる
  ])("%i 秒・ミス %i・ヒント %i → %i", (seconds, mistakes, hints, expected) => {
    expect(computeScore({ seconds, mistakes, hints })).toBe(expected);
  });
  it("ミス・秒・ヒントに対し単調非増加、0–1000 に収まる", () => {
    for (let m = 0; m < 20; m++) {
      const a = computeScore({ seconds: 60, mistakes: m, hints: 0 });
      const b = computeScore({ seconds: 60, mistakes: m + 1, hints: 0 });
      expect(b).toBeLessThanOrEqual(a);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1000);
    }
    for (let sec = 0; sec < 300; sec += 7) {
      expect(computeScore({ seconds: sec + 7, mistakes: 0, hints: 0 })).toBeLessThanOrEqual(
        computeScore({ seconds: sec, mistakes: 0, hints: 0 }),
      );
    }
  });
});

describe("T-012 ランク境界(G-05)", () => {
  it.each([
    [1000, "S"],
    [900, "S"],
    [899, "A"],
    [750, "A"],
    [749, "B"],
    [550, "B"],
    [549, "C"],
    [350, "C"],
    [349, "D"],
    [0, "D"],
  ])("%i → %s", (score, rank) => {
    expect(rankOf(score)).toBe(rank);
  });
});

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe("T-013 ベストスコアの往復(G-06)", () => {
  it("保存→読込で同値、低いスコアで上書きしない、高いスコアで置き換わる", () => {
    const st = memoryStorage();
    expect(loadBest(st, "a-frame")).toBeNull();
    const first = { score: 800, rank: "A", seconds: 70, mistakes: 1, at: "2026-09-06T00:00:00Z" };
    expect(saveBest(st, "a-frame", first)).toEqual(first);
    expect(loadBest(st, "a-frame")).toEqual(first);
    const lower = { ...first, score: 700, rank: "B" };
    expect(saveBest(st, "a-frame", lower)).toEqual(first);
    expect(loadBest(st, "a-frame")).toEqual(first);
    const higher = { ...first, score: 950, rank: "S" };
    expect(saveBest(st, "a-frame", higher)).toEqual(higher);
    expect(loadBest(st, "a-frame")).toEqual(higher);
    // 別シェルターの記録は混ざらない
    expect(loadBest(st, "lean-to")).toBeNull();
  });
});

describe("T-014 壊れた値・例外を投げる storage でも落ちない(G-06)", () => {
  it("壊れた JSON は null、形の違う JSON も null", () => {
    const st = memoryStorage();
    st.map.set("tarp-shelter-lab:best:a-frame", "{not json");
    expect(loadBest(st, "a-frame")).toBeNull();
    st.map.set("tarp-shelter-lab:best:a-frame", JSON.stringify({ score: "high" }));
    expect(loadBest(st, "a-frame")).toBeNull();
  });
  it("getItem/setItem が例外を投げても読込は null・保存は渡した記録を返す", () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadBest(throwing, "a-frame")).toBeNull();
    const rec = { score: 500, rank: "C", seconds: 90, mistakes: 3, at: "2026-09-06T00:00:00Z" };
    expect(() => saveBest(throwing, "a-frame", rec)).not.toThrow();
    expect(saveBest(throwing, "a-frame", rec)).toEqual(rec);
  });
});
