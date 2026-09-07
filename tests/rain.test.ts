// T-025..T-028 — 雨の近似モデル(F-19 / G-19 G-20 G-21)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { panelRuns, minSlopeDeg, drainage, drainageLabel, poolTarget, rainVerdict, rainReason } from "../src/rain";
import { loadShelters } from "../src/model";
import { initialState, reduce } from "../src/simulator";
import { autoPlan } from "../src/auto";
import { minimalShelter } from "./helpers";

const shelters = loadShelters(
  JSON.parse(readFileSync(new URL("../data/shelters.json", import.meta.url), "utf8")),
);
const byId = (id: string) => shelters.find((s) => s.id === id)!;

function completed(id: string) {
  const sh = byId(id);
  let st = initialState(sh);
  for (const a of autoPlan(sh)) st = reduce(st, a).state;
  return st;
}

describe("T-025 水平距離と勾配(G-19)", () => {
  // 出所: SPEC §4.8。2026-09-07 にデータから計算した値(実装より先に手で出した)
  it.each([
    ["a-frame", 90, 53.1301],
    ["lean-to", 260, 29.9816],
    ["diamond", 212, 31.5169],
  ])("%s は run %i cm・最も緩い勾配 %f 度", (id, run, slope) => {
    const sh = byId(id);
    const runs = panelRuns(sh);
    expect(Math.max(...runs)).toBeCloseTo(run, 6);
    const h = Math.max(...sh.poles.map((p) => p.height.ideal));
    expect(minSlopeDeg(sh, h)).toBeCloseTo(slope, 4);
  });
  it("合成の最小シェルター(棟 x=200・面は x 120..280)は run 80", () => {
    const sh = minimalShelter();
    const runs = panelRuns(sh);
    // 前提の検算: 面は棟の左右に 80 ずつ広がる(期待値の導出がこの形に依存する)
    expect(runs).toEqual([80, 80]);
    expect(minSlopeDeg(sh, 120)).toBeCloseTo((Math.atan2(120, 80) * 180) / Math.PI, 9);
  });
  it("高さ 0 なら勾配 0(ポールが立っていない)", () => {
    expect(minSlopeDeg(byId("a-frame"), 0)).toBe(0);
  });
});

describe("T-026 排水度の範囲と単調性(G-20)", () => {
  const st = completed("a-frame");
  it("0〜1 に収まる", () => {
    for (const h of [0, 30, 90, 120, 200, 500]) {
      const d = drainage(st, h);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
  it("ポールが高いほど(=勾配が急なほど)排水度は単調非減少", () => {
    let prev = drainage(st, 0);
    for (let h = 5; h <= 300; h += 5) {
      const d = drainage(st, h);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
  it("張力が高いほど排水度は単調非減少", () => {
    const sh = byId("a-frame");
    const peg = sh.pegs[0]!;
    let prev = Infinity;
    for (const off of [0, 10, 20, 30, 40]) {
      const moved = reduce(st, { type: "movePeg", peg: peg.id, x: peg.x + off, y: peg.y }).state;
      const d = drainage(moved, 120);
      expect(d).toBeLessThanOrEqual(prev);
      prev = d;
    }
  });
});

describe("T-027 判定の境界(G-20)", () => {
  it.each([
    [1, "GOOD"],
    [0.65, "GOOD"],
    [0.649, "CAUTION"],
    [0.4, "CAUTION"],
    [0.399, "POOL"],
    [0, "POOL"],
  ])("%f → %s", (value, label) => {
    expect(drainageLabel(value)).toBe(label);
  });
});

describe("T-028 対照(G-21)", () => {
  it("(a) 同じ勾配でも張力を落とすと溜まりが増える", () => {
    // **溜まりが実際に生じる組を選ぶ。** A-Frame は勾配 53 度で排水度が満点なので、
    // 雨量 2 では張力を落としても溜まりが 0 のまま —— 0 と 0 を比べる無意味な対照になる(HC-071)
    const st = completed("lean-to");
    const sh = byId("lean-to");
    const peg = sh.pegs[0]!;
    const slack = reduce(st, { type: "movePeg", peg: peg.id, x: peg.x + 35, y: peg.y }).state;
    // 前提 1: 勾配は同じ(ポール高さを触っていない)
    expect(minSlopeDeg(sh, 150)).toBe(minSlopeDeg(slack.shelter, 150));
    // 前提 2: 比べる二つが下限に張り付いていない(張り付くと比較が何も言わなくなる)
    const tight = poolTarget(st, 150, 3);
    const loose = poolTarget(slack, 150, 3);
    expect(tight).toBeGreaterThan(0);
    expect(loose).toBeGreaterThan(0);
    expect(loose).toBeGreaterThan(tight);
  });
  it("(b) 雨量が強いほど溜まりが増える", () => {
    const st = completed("lean-to");
    const h = 150;
    expect(poolTarget(st, h, 3)).toBeGreaterThan(poolTarget(st, h, 2));
    expect(poolTarget(st, h, 2)).toBeGreaterThan(poolTarget(st, h, 1));
  });
  it("(c) 面が二つある型では、緩いほうの面が判定を決める", () => {
    // 片方の面だけを緩くした合成シェルター。判定は緩いほうに従う
    const sh = minimalShelter({
      tarp: {
        ...minimalShelter().tarp,
        panels: [
          { poly: [[120, 100], [200, 100], [200, 200], [120, 200]], shade: 0.8 },
          // 右の面を遠くまで伸ばす(run 160)。左は 80 のまま
          { poly: [[200, 100], [360, 100], [360, 200], [200, 200]], shade: 1 },
        ],
      },
    });
    const runs = panelRuns(sh);
    // 前提: 二つの面の run が実際に違う(違わなければ対照にならない — HC-079)
    expect(runs).toEqual([80, 160]);
    const h = 120;
    const gentle = (Math.atan2(h, 160) * 180) / Math.PI;
    expect(minSlopeDeg(sh, h)).toBeCloseTo(gentle, 9);
    // 急なほうの面(run 80)の勾配より小さいこと
    expect(minSlopeDeg(sh, h)).toBeLessThan((Math.atan2(h, 80) * 180) / Math.PI);
  });
});

describe("T-029 判定は雨量込み(G-20)", () => {
  it("雨が降っていなければ判定しない", () => {
    const st = completed("lean-to");
    expect(rainVerdict(st, 150, 0)).toBeNull();
  });
  it("排水力が同じでも、雨量によって判定が変わる", () => {
    const st = completed("lean-to");
    // 前提: この型の排水力は「能力としては GOOD」の域にある(だから食い違いが起きうる)
    expect(drainageLabel(drainage(st, 150))).toBe("GOOD");
    expect(rainVerdict(st, 150, 1)).toBe("GOOD");
    expect(rainVerdict(st, 150, 3)).toBe("POOL");
  });
  it("判定と溜まりが食い違わない(GOOD なら溜まり 0、POOL なら 0.25 以上)", () => {
    for (const id of ["a-frame", "lean-to", "diamond"]) {
      const sh = shelters.find((s) => s.id === id)!;
      const st = completed(id);
      const h = Math.max(...sh.poles.map((p) => p.height.ideal));
      for (const rate of [1, 2, 3] as const) {
        const v = rainVerdict(st, h, rate);
        const pool = poolTarget(st, h, rate);
        if (v === "GOOD") expect(pool, `${id} ${rate}`).toBeLessThan(0.05);
        if (v === "POOL") expect(pool, `${id} ${rate}`).toBeGreaterThanOrEqual(0.25);
        if (v === "CAUTION") {
          expect(pool, `${id} ${rate}`).toBeGreaterThanOrEqual(0.05);
          expect(pool, `${id} ${rate}`).toBeLessThan(0.25);
        }
      }
    }
  });
});

describe("T-030 理由文は判定と同じ入力から出る(G-20・HC-202)", () => {
  it("雨が無ければ雨の話をしない。GOOD と POOL で文が変わる", () => {
    const st = completed("lean-to");
    expect(rainReason(st, 150, 0)).toBe("雨が降っていない");
    expect(rainVerdict(st, 150, 1)).toBe("GOOD");
    expect(rainVerdict(st, 150, 3)).toBe("POOL");
    const good = rainReason(st, 150, 1);
    const pool = rainReason(st, 150, 3);
    expect(good).not.toBe(pool);
    // POOL のとき「足りている」とは言わない(判定と理由が食い違わない)
    expect(pool).not.toMatch(/追いついている/);
  });
  it("三種 × 三雨量で、GOOD のときだけ「追いついている」と言う", () => {
    for (const id of ["a-frame", "lean-to", "diamond"]) {
      const sh = shelters.find((s) => s.id === id)!;
      const st = completed(id);
      const h = Math.max(...sh.poles.map((p) => p.height.ideal));
      for (const rate of [1, 2, 3] as const) {
        const v = rainVerdict(st, h, rate);
        const why = rainReason(st, h, rate);
        expect(why.length, `${id} ${rate}`).toBeGreaterThan(0);
        expect(/追いついている/.test(why), `${id} ${rate}`).toBe(v === "GOOD");
      }
    }
  });
});
