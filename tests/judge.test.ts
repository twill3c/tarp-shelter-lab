// T-003..T-008 — 配置判定と張力(F-05 F-11 / G-02 G-03)
import { describe, expect, it } from "vitest";
import { dist } from "../src/geometry";
import { tension, tensionMessage } from "../src/judge";
import { initialState, reduce } from "../src/simulator";
import { minimalShelter } from "./helpers";

function pegPhaseState() {
  // 展開してポールを充填し、ペグ段階に立つ
  const s = minimalShelter();
  let st = initialState(s);
  st = reduce(st, { type: "unfold", now: 0 }).state;
  st = reduce(st, { type: "dropPole", x: s.poles[0]!.x, y: s.poles[0]!.y, now: 1 }).state;
  return { s, st };
}

describe("T-003 許容内のドロップは最も近い未充填目標を充填し、ミスは増えない(G-02)", () => {
  it("距離 = tolerance − 1", () => {
    const { s, st } = pegPhaseState();
    const g1 = s.pegs[0]!;
    // 前提の検算: g1 と g2 は 2×tolerance 以上離れている(どちらへ入ったかが曖昧にならない)
    expect(dist(g1, s.pegs[1]!)).toBeGreaterThanOrEqual(2 * s.tolerance);
    const r = reduce(st, { type: "dropPeg", x: g1.x + (s.tolerance - 1), y: g1.y, now: 2 });
    expect(r.event?.kind).toBe("filled");
    expect(Object.keys(r.state.pegs)).toEqual(["g1"]);
    expect(r.state.mistakes).toBe(0);
  });
});

describe("T-004 許容外のドロップは充填せずミス +1(G-02)", () => {
  it("距離 = tolerance + 1", () => {
    const { s, st } = pegPhaseState();
    const g1 = s.pegs[0]!;
    const r = reduce(st, { type: "dropPeg", x: g1.x + (s.tolerance + 1), y: g1.y, now: 2 });
    expect(r.event?.kind).toBe("miss");
    expect(Object.keys(r.state.pegs)).toEqual([]);
    expect(r.state.mistakes).toBe(1);
  });
});

describe("T-005 充填済み目標は再充填しない(G-02)", () => {
  it("同じ場所へ二度落としても充填集合は不変で、ミスとして数える", () => {
    const { s, st } = pegPhaseState();
    const g1 = s.pegs[0]!;
    const once = reduce(st, { type: "dropPeg", x: g1.x, y: g1.y, now: 2 }).state;
    const twice = reduce(once, { type: "dropPeg", x: g1.x, y: g1.y, now: 3 });
    expect(Object.keys(twice.state.pegs)).toEqual(Object.keys(once.pegs));
    expect(twice.event?.kind).toBe("miss");
  });
  it("充填済みの近くでも、未充填の別目標が許容内ならそちらへ入る", () => {
    const s = minimalShelter({
      // g3 を g1 から tolerance ちょうど離す(g1 充填後に g3 が最寄りの未充填になる)
      pegs: [
        { id: "g1", x: 100, y: 220 },
        { id: "g2", x: 300, y: 220 },
        { id: "g3", x: 100, y: 260 },
      ],
    });
    expect(dist(s.pegs[0]!, s.pegs[2]!)).toBe(s.tolerance);
    let st = initialState(s);
    st = reduce(st, { type: "unfold", now: 0 }).state;
    st = reduce(st, { type: "dropPole", x: s.poles[0]!.x, y: s.poles[0]!.y, now: 1 }).state;
    st = reduce(st, { type: "dropPeg", x: 100, y: 220, now: 2 }).state;
    const r = reduce(st, { type: "dropPeg", x: 100, y: 225, now: 3 });
    expect(r.event?.kind).toBe("filled");
    expect(Object.keys(r.state.pegs).sort()).toEqual(["g1", "g3"]);
  });
});

describe("T-006 張力の値の表(G-03・SPEC §4.3 の閉形式)", () => {
  it.each([
    [0, 100],
    [5, 90],
    [15, 70],
    [30, 40],
    [50, 0],
    [60, 0],
  ])("差 %i cm → 張力 %i", (diff, expected) => {
    expect(tension(200, 200 + diff)).toBe(expected);
    expect(tension(200, 200 - diff)).toBe(expected);
  });
});

describe("T-007 張力は差の絶対値に対し単調非増加(G-03)", () => {
  it("0..100 cm を 1 cm 刻み", () => {
    let prev = tension(300, 300);
    for (let d = 1; d <= 100; d++) {
      const t = tension(300, 300 + d);
      expect(t).toBeLessThanOrEqual(prev);
      expect(t).toBeGreaterThanOrEqual(0);
      prev = t;
    }
  });
});

describe("T-008 たるみ・届かないの文の向き(G-03)", () => {
  it("短すぎ(−20)はたるみ、長すぎ(+20)は届かない、±15 以内は文なし", () => {
    expect(tensionMessage(200, 180)).toMatch(/たるみ/);
    expect(tensionMessage(200, 220)).toMatch(/届きません/);
    expect(tensionMessage(200, 215)).toBeNull();
    expect(tensionMessage(200, 185)).toBeNull();
    expect(tensionMessage(200, 200)).toBeNull();
  });
});
