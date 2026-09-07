// T-042..T-044 — 居住性(F-12 / G-32 G-33)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SIT_HEIGHT, habitability, usableFloor } from "../src/habitat";
import { loadShelters } from "../src/model";

const shelters = loadShelters(
  JSON.parse(readFileSync(new URL("../data/shelters.json", import.meta.url), "utf8")),
);
const byId = (id: string) => shelters.find((s) => s.id === id)!;
const ideal = (id: string) => Math.max(...byId(id).poles.map((p) => p.height.ideal));

describe("T-042 閉形式との一致(G-32)", () => {
  it("A-Frame の屋根面は矩形なので、使える割合は 1 − 90/120", () => {
    const s = byId("a-frame");
    // 前提の検算: 面が矩形であること(稜線からの距離が一定に伸びる)。
    // 左面 [[310,110],[400,110],[400,410],[310,410]] は x が 310..400、y が 110..410 の矩形
    for (const panel of s.tarp.panels) {
      const xs = panel.poly.map(([x]) => x);
      const ys = panel.poly.map(([, y]) => y);
      expect(panel.poly.length).toBe(4);
      expect(new Set(xs).size).toBe(2);
      expect(new Set(ys).size).toBe(2);
    }
    const h = ideal("a-frame");
    const wantFraction = 1 - SIT_HEIGHT / h;
    const floorArea = 180 * 300; // 張り終えた形(実測: 180 × 300 の矩形)
    expect(usableFloor(s, h)).toBeCloseTo(floorArea * wantFraction, -3);
    expect(habitability(s, h)).toBeCloseTo((floorArea * wantFraction) / 90000, 2);
  });
});

describe("T-043 高さに対する単調性と下限(G-32)", () => {
  it("ポールが高いほど居住性は単調非減少", () => {
    const s = byId("lean-to");
    let prev = -1;
    for (let h = 0; h <= 300; h += 10) {
      const v = habitability(s, h);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });
  it("座高未満では 0(頭が当たる)", () => {
    for (const s of shelters) {
      expect(habitability(s, SIT_HEIGHT - 1), s.id).toBe(0);
      expect(habitability(s, 0), s.id).toBe(0);
    }
  });
  it("座高ちょうどでは、面積は 0 に限りなく近い(格子標本化の誤差だけ残る)", () => {
    // 高さが座高ちょうどのとき、頭上高が座高以上になるのは稜線の上だけ ——
    // 線には面積が無いので解析解は 0。格子は線を一列ぶんの帯として数えるので、
    // 刻み 3 cm ぶんの誤差が残る。**それを 0 と書かずに、誤差として書く**
    for (const s of shelters) {
      expect(habitability(s, SIT_HEIGHT), s.id).toBeLessThanOrEqual(0.02);
    }
  });
});

describe("T-044 実測の順位と、軸を足した目的(G-33)", () => {
  // 2026-09-08 実測(SPEC §4.12)。刻み 3 cm。
  const table: [string, number][] = [
    ["lean-to", 0.35],
    ["diamond", 0.294],
    ["plow-point", 0.153],
    ["a-frame", 0.15],
    ["teepee", 0.144],
  ];
  it.each(table)("%s の居住性は %f", (id, want) => {
    expect(habitability(byId(id), ideal(id))).toBeCloseTo(want, 2);
  });
  it("順位が表どおり(降順)", () => {
    const measured = shelters
      .map((s) => [s.id, habitability(s, ideal(s.id))] as const)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    expect(measured).toEqual(table.map(([id]) => id));
  });
  it("**軸を足した目的**: 耐風・排水で最良の型は、居住性では最上位でない", () => {
    // 鋤先は二軸でも材料でも他を上回る(loop_009 の実測)。その型が広さでも一位なら、
    // 軸を足した意味が無い —— 第三の軸は新しい順位を作らなければならない
    const best = shelters
      .map((s) => [s.id, habitability(s, ideal(s.id))] as const)
      .sort((a, b) => b[1] - a[1])[0]![0];
    expect(best).not.toBe("plow-point");
    expect(best).toBe("lean-to");
  });
});
