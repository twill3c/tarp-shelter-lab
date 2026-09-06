// T-009 / T-010 / T-015 / T-018 — 状態機械と完成述語(F-04 F-06 F-07 F-08 / G-04 G-07)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { autoPlan } from "../src/auto";
import { loadShelters } from "../src/model";
import type { SimState } from "../src/simulator";
import { STEPS, initialState, isComplete, reduce, ropeStatus, stepIndex } from "../src/simulator";
import { minimalShelter } from "./helpers";

const shelters = loadShelters(
  JSON.parse(readFileSync(new URL("../data/shelters.json", import.meta.url), "utf8")),
);

/** 最小シェルターを正しい手順で完成させる。途中の段階番号も返す */
function playCorrect() {
  const s = minimalShelter();
  const stages: number[] = [];
  let st = initialState(s);
  stages.push(stepIndex(st));
  st = reduce(st, { type: "unfold", now: 0 }).state;
  stages.push(stepIndex(st));
  for (const p of s.poles) st = reduce(st, { type: "dropPole", x: p.x, y: p.y, now: 1 }).state;
  stages.push(stepIndex(st));
  for (const g of s.pegs) st = reduce(st, { type: "dropPeg", x: g.x, y: g.y, now: 2 }).state;
  stages.push(stepIndex(st));
  for (const r of s.ropes) st = reduce(st, { type: "attachRope", rope: r.id, peg: r.peg, now: 3 }).state;
  stages.push(stepIndex(st));
  return { s, st, stages };
}

describe("T-009 正しい手順で complete、段階は順に進む(G-04)", () => {
  it("展開→ポール→ペグ→ロープ→(張力は目標どおりなので)完成", () => {
    const { st, stages } = playCorrect();
    expect(isComplete(st)).toBe(true);
    // 段階は 0(展開) → 1(ポール) → 2(ペグ) → 3(ロープ) → 完成 の順で単調に進む
    expect(stages).toEqual([0, 1, 2, 3, STEPS.length - 1]);
    expect(STEPS[STEPS.length - 1]!.id).toBe("complete");
    expect(st.completedAt).not.toBeNull();
  });
});

describe("T-010 六条件をそれぞれ一つだけ崩した変異体はすべて未完成(G-04・陽性対照)", () => {
  const { s, st } = playCorrect();
  // 前提: 変異前は完成している(対照が成り立つ前提を assert で固定する — HC-079)
  expect(isComplete(st)).toBe(true);

  const mutants: Record<string, SimState> = {
    未展開: { ...st, unfolded: false },
    ポール未充填: { ...st, poles: {} },
    ペグ未充填: { ...st, pegs: { g1: st.pegs["g1"]! } },
    ロープを別ペグへ: { ...st, ropes: { ...st.ropes, r1: "g2" } },
    張力69: (() => {
      // r1 の目標長 + 15.5 cm の位置へ g1 をずらす(SPEC §4.3: 100 − 15.5×2 = 69)
      const r1 = s.ropes[0]!;
      const g1 = s.pegs[0]!;
      const len = Math.hypot(g1.x - r1.anchor.x, g1.y - r1.anchor.y);
      const k = (len + 15.5) / len;
      const moved = reduce(st, {
        type: "movePeg",
        peg: "g1",
        x: r1.anchor.x + (g1.x - r1.anchor.x) * k,
        y: r1.anchor.y + (g1.y - r1.anchor.y) * k,
      }).state;
      expect(ropeStatus(moved, "r1").tension).toBeCloseTo(69, 5);
      return moved;
    })(),
    ポール高さ超過: reduce(st, { type: "setPoleHeight", pole: "p1", height: s.poles[0]!.height.max + 1 })
      .state,
  };

  it.each(Object.keys(mutants))("%s → 未完成", (name) => {
    expect(isComplete(mutants[name]!)).toBe(false);
  });
});

describe("T-015 AUTO 手順列をデータ三種に流すと complete(G-07)", () => {
  it.each(shelters.map((s) => [s.id, s] as const))("%s", (_id, s) => {
    let st = initialState(s);
    const plan = autoPlan(s);
    expect(plan.length).toBeGreaterThan(0);
    for (const a of plan) {
      const r = reduce(st, a);
      // 正しい手順列なので途中でミスが出てはならない
      expect(r.event?.kind, JSON.stringify(a)).not.toBe("miss");
      st = r.state;
    }
    expect(isComplete(st)).toBe(true);
    expect(st.mistakes).toBe(0);
  });
});

describe("T-018 reset は初期状態と深い等価(F-07)", () => {
  it("途中まで進めてから reset", () => {
    const s = minimalShelter();
    let st = initialState(s);
    st = reduce(st, { type: "unfold", now: 0 }).state;
    st = reduce(st, { type: "dropPole", x: 0, y: 0, now: 1 }).state; // ミスを一つ入れる
    expect(st.mistakes).toBe(1);
    const back = reduce(st, { type: "reset" }).state;
    expect(back).toEqual(initialState(s));
  });
});
