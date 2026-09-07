// T-038 / T-039 — ロープワーク(F-21 / G-28 G-29)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForeignChars } from "../src/hygiene";
import { crossingErrors, loadKnots, stillFrameErrors } from "../src/knots";
import { STEPS } from "../src/simulator";

const RAW = readFileSync(new URL("../data/knots.json", import.meta.url), "utf8");
const doc = loadKnots(JSON.parse(RAW));

describe("T-038 交差データを幾何で検算(G-28)", () => {
  it("宣言した交差が実際の交点にあり、上下が別のストランドで、全点が viewBox 内", () => {
    expect(crossingErrors(doc)).toEqual([]);
  });
  it("陽性対照: 交差を 10 ずらしたデータは落ちる", () => {
    const broken = structuredClone(doc);
    const first = broken.knots[0]!.steps[0]!.crossings[0]!;
    first.x += 10;
    const errors = crossingErrors(broken);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/交点/);
  });
  it("陽性対照: 上と下が同じストランドを指すデータは落ちる", () => {
    const broken = structuredClone(doc);
    const c = broken.knots[0]!.steps[0]!.crossings[0]!;
    c.under = c.over;
    expect(crossingErrors(broken).some((e) => /同じ/.test(e))).toBe(true);
  });
  it("陽性対照: viewBox の外へ出た点は落ちる", () => {
    const broken = structuredClone(doc);
    broken.knots[0]!.steps[0]!.strands[0]!.points[0]![1] = -50;
    expect(crossingErrors(broken).some((e) => /viewBox/.test(e))).toBe(true);
  });
  it("各ステップに交差が 1 つ以上ある(交差の無い図は結び方を示さない)", () => {
    for (const k of doc.knots) {
      for (const [i, st] of k.steps.entries()) {
        expect(st.crossings.length, `${k.id} step ${i}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("T-039 設営工程との対応が両方向で完全(G-29)", () => {
  const stepIds = new Set<string>(STEPS.map((s) => s.id));
  it("usedIn の工程 ID が実在する", () => {
    for (const k of doc.knots) {
      expect(k.usedIn.length, k.id).toBeGreaterThan(0);
      for (const id of k.usedIn) expect(stepIds.has(id), `${k.id} → ${id}`).toBe(true);
    }
  });
  it("ロープを扱う工程はどれも結び方を持つ(死んだ工程を作らない)", () => {
    for (const need of ["ropes", "tension"] as const) {
      const found = doc.knots.filter((k) => k.usedIn.includes(need));
      expect(found.length, need).toBeGreaterThanOrEqual(1);
    }
  });
  it("どの結び方も一つ以上の工程から参照される(死んだ項目を置かない)", () => {
    for (const k of doc.knots) expect(k.usedIn.length, k.id).toBeGreaterThan(0);
    expect(new Set(doc.knots.map((k) => k.id)).size).toBe(doc.knots.length);
  });
  it("全項目に出典の別が書かれている", () => {
    for (const k of doc.knots) {
      expect(k.source.length, k.id).toBeGreaterThan(20);
      // 出典章に記載があるか無いかを、どちらかの語で必ず言っている
      expect(/名指し|記載が無い/.test(k.source), k.id).toBe(true);
    }
  });
  it("字種に違反が無い", () => {
    expect(findForeignChars(RAW)).toEqual([]);
  });
});

describe("T-040 手順が進めば図も進む(G-30)", () => {
  it("連続するステップの図が同一でない", () => {
    expect(stillFrameErrors(doc)).toEqual([]);
  });
  it("陽性対照: 次のステップを前の複製にすると落ちる", () => {
    const broken = structuredClone(doc);
    const steps = broken.knots[0]!.steps;
    steps[1] = { ...structuredClone(steps[0]!), caption: "文だけ変えた" };
    const errors = stillFrameErrors(broken);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/同一/);
  });
});
