// T-020..T-024 — 風の近似モデル(F-17 / G-16 G-17 G-18)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { frontalWidth, windLoad, stability, stabilityLabel, dragCoefficient, holdOf } from "../src/wind";
import { loadShelters } from "../src/model";
import { initialState, reduce } from "../src/simulator";
import { autoPlan } from "../src/auto";
import { minimalShelter } from "./helpers";

const shelters = loadShelters(
  JSON.parse(readFileSync(new URL("../data/shelters.json", import.meta.url), "utf8")),
);
const aframe = shelters.find((s) => s.id === "a-frame")!;
const leanto = shelters.find((s) => s.id === "lean-to")!;

/** 正しい手順で完成させた状態(全ロープが目標どおり = 張力 100) */
function completed(id: string) {
  const sh = shelters.find((s) => s.id === id)!;
  let st = initialState(sh);
  for (const a of autoPlan(sh)) st = reduce(st, a).state;
  return st;
}

describe("T-020 正面投影幅の閉形式(G-16)", () => {
  it("A-Frame の張り終えた形は 180×300 の矩形", () => {
    // 前提の検算: 期待値の導出がこの形に依存するので、形そのものを先に確かめる(HC-004)
    const xs = aframe.tarp.pitched.map(([x]) => x);
    const ys = aframe.tarp.pitched.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(180);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(300);
  });
  it.each([
    [0, 180],
    [90, 300],
    [180, 180],
    [270, 300],
  ])("θ=%i → 幅 %i", (deg, expected) => {
    expect(frontalWidth(aframe.tarp.pitched, deg)).toBeCloseTo(expected, 6);
  });
  it("θ=45 は (180+300)/√2 = 339.411…", () => {
    expect(frontalWidth(aframe.tarp.pitched, 45)).toBeCloseTo((180 + 300) / Math.SQRT2, 6);
  });
  it("正方形はどの向きでも対称(θ と θ+90 で同じ)", () => {
    const square: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    for (const deg of [0, 17, 33, 61]) {
      expect(frontalWidth(square, deg)).toBeCloseTo(frontalWidth(square, deg + 90), 6);
    }
  });
});

describe("T-021 荷重は風速の二乗・安定度は単調非増加(G-16)", () => {
  const st = completed("a-frame");
  it("風速 2 倍で荷重 4 倍", () => {
    const a = windLoad(st, { windFrom: 90, speed: 25 });
    const b = windLoad(st, { windFrom: 90, speed: 50 });
    expect(a).toBeGreaterThan(0);
    expect(b / a).toBeCloseTo(4, 6);
  });
  it("風速 0 で荷重 0、安定度は保持力そのもの", () => {
    expect(windLoad(st, { windFrom: 90, speed: 0 })).toBe(0);
    expect(stability(st, { windFrom: 90, speed: 0 })).toBeCloseTo(holdOf(st), 6);
  });
  it("風速に対し安定度は単調非増加で 0..100 に収まる", () => {
    let prev = stability(st, { windFrom: 90, speed: 0 });
    for (let v = 1; v <= 100; v++) {
      const s = stability(st, { windFrom: 90, speed: v });
      expect(s).toBeLessThanOrEqual(prev);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
      prev = s;
    }
  });
  it("ラベルの境界(SPEC §4.7)", () => {
    expect(stabilityLabel(60)).toBe("STABLE");
    expect(stabilityLabel(59.9)).toBe("CAUTION");
    expect(stabilityLabel(30)).toBe("CAUTION");
    expect(stabilityLabel(29.9)).toBe("DANGER");
    expect(stabilityLabel(0)).toBe("DANGER");
  });
});

describe("T-022 向きが効くことの対照(G-17)", () => {
  it("A-Frame は棟に沿う風(θ=0)のほうが直交(θ=90)より安定", () => {
    const st = completed("a-frame");
    // 前提: 棟は y 方向に走る(だから θ=0 の風は棟に沿う)
    const [a, b] = [aframe.ridge[0]!, aframe.ridge[1]!];
    expect(a[0]).toBe(b[0]);
    expect(stability(st, { windFrom: 0, speed: 70 })).toBeGreaterThan(stability(st, { windFrom: 90, speed: 70 }));
  });
  it("Lean-To は開口を風下にすると、風上に向けるより安定", () => {
    const st = completed("lean-to");
    const opening = leanto.opening;
    // 前提: この型は開口を持つ(持たなければ対照が成り立たない — HC-079)
    expect(opening).not.toBeNull();
    const intoWind = stability(st, { windFrom: opening!, speed: 60 });
    const downwind = stability(st, { windFrom: (opening! + 180) % 360, speed: 60 });
    expect(downwind).toBeGreaterThan(intoWind);
  });
  it("開口が風上を向くと Cd が 2.0、それ以外は 1.2", () => {
    expect(dragCoefficient(leanto, leanto.opening!)).toBe(2);
    expect(dragCoefficient(leanto, (leanto.opening! + 180) % 360)).toBe(1.2);
    // 境界: 角度差ちょうど 90 度は「入らない」側
    expect(dragCoefficient(leanto, (leanto.opening! + 90) % 360)).toBe(1.2);
    expect(dragCoefficient(leanto, (leanto.opening! + 89) % 360)).toBe(2);
  });
  it("opening が null の型は向きを変えても Cd が 1.2 のまま", () => {
    expect(aframe.opening).toBeNull();
    for (const deg of [0, 45, 90, 180, 270]) expect(dragCoefficient(aframe, deg)).toBe(1.2);
  });
});

describe("T-023 張力が効く(G-18)", () => {
  it("ロープを一本も接続していなければ hold=0・安定度 0", () => {
    const st = initialState(minimalShelter());
    expect(holdOf(st)).toBe(0);
    expect(stability(st, { windFrom: 0, speed: 0 })).toBe(0);
  });
  it("ペグを目標からずらして張力を落とすと安定度が下がる", () => {
    const st = completed("a-frame");
    const before = stability(st, { windFrom: 90, speed: 40 });
    const peg = aframe.pegs[0]!;
    const slack = reduce(st, { type: "movePeg", peg: peg.id, x: peg.x + 30, y: peg.y }).state;
    // 前提: 実際に張力が下がっていること(下がっていなければ対照にならない)
    expect(holdOf(slack)).toBeLessThan(holdOf(st));
    expect(stability(slack, { windFrom: 90, speed: 40 })).toBeLessThan(before);
  });
});

describe("T-024 データの opening(G-01)", () => {
  it("数値か null。数値なら 0 以上 360 未満", () => {
    for (const s of shelters) {
      if (s.opening === null) continue;
      expect(Number.isFinite(s.opening), s.id).toBe(true);
      expect(s.opening, s.id).toBeGreaterThanOrEqual(0);
      expect(s.opening, s.id).toBeLessThan(360);
    }
    // 全部 null では T-022 の対照が成り立たないので、開口を持つ型が 1 つ以上あること
    expect(shelters.some((s) => s.opening !== null)).toBe(true);
  });
});
