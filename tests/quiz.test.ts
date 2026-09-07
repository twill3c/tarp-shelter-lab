// T-035..T-037 — クイズ(F-20 / G-25 G-26 G-27)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForeignChars } from "../src/hygiene";
import { loadShelters } from "../src/model";
import { MIN_MARGIN, NONE_ID, evaluateQuestion, loadQuiz } from "../src/quiz";

const shelters = loadShelters(
  JSON.parse(readFileSync(new URL("../data/shelters.json", import.meta.url), "utf8")),
);
const QUIZ_RAW = readFileSync(new URL("../data/quiz.json", import.meta.url), "utf8");
const questions = loadQuiz(JSON.parse(QUIZ_RAW));

describe("T-035 正解が一意(G-25)", () => {
  it("全設問で、差が 0.10 以上あるか適格な型が 1 つだけ", () => {
    for (const q of questions) {
      const r = evaluateQuestion(q, shelters);
      expect(r.discriminating, `${q.id} 差 ${r.margin.toFixed(3)}`).toBe(true);
      expect(r.answerId.length, q.id).toBeGreaterThan(0);
    }
  });
  it("陽性対照: 無風・無雨は全型とも適性 1.000 で差が付かず、不適格と判定される", () => {
    const flat = { id: "control", prompt: "対照", conditions: { windFrom: 0, windSpeed: 0, rain: 0 as const }, limits: {} };
    const r = evaluateQuestion(flat, shelters);
    // 前提: 実際に全型とも満点であること(そうでなければ対照になっていない)
    expect(r.scores.map((s) => Number(s.fitness.toFixed(3)))).toEqual(shelters.map(() => 1));
    expect(r.margin).toBe(0);
    expect(r.discriminating).toBe(false);
  });
  it("差の閾値は SPEC の 0.10", () => {
    expect(MIN_MARGIN).toBe(0.1);
  });
});

describe("T-036 選択肢が死んでいない(G-26)", () => {
  // 2026-09-08・Lean-To の開口修正の後に再実測(SPEC §4.10)
  const table: Record<string, string> = {
    q1: "a-frame",
    q2: "a-frame",
    q3: "plow-point",
    q4: "plow-point",
    q5: "teepee",
    q6: NONE_ID,
  };
  it("SPEC §4.10 の表と一致する", () => {
    for (const q of questions) {
      expect(evaluateQuestion(q, shelters).answerId, q.id).toBe(table[q.id]);
    }
  });
  it("「どれも適さない」が正解になる設問が 1 つ以上ある", () => {
    const none = questions.filter((q) => evaluateQuestion(q, shelters).answerId === NONE_ID);
    expect(none.length).toBeGreaterThanOrEqual(1);
  });
  it("一度も正解にならない型は、SPEC に理由を書いた型だけ", () => {
    // 型が増えると、モデルの二軸で他に劣る型が出る。**測って認め、理由を書く**のが正しい ——
    // 「どの型も一度は正解になる」を要求すると、設問を歪めてでも通したくなる。
    // 2026-09-08 実測: Lean-To と Diamond は鋤先に勾配でも正面投影でも材料でも劣り、
    // 上限で鋤先だけを外すこともできない(SPEC §4.9)
    const NEVER_WINS = ["lean-to", "diamond"];
    const answers = new Set(questions.map((q) => evaluateQuestion(q, shelters).answerId));
    const never = shelters.filter((sh) => !answers.has(sh.id)).map((sh) => sh.id);
    expect(never.sort()).toEqual([...NEVER_WINS].sort());
  });
  it("材料の上限を超える型は適格でないと印が付く", () => {
    // q3 はペグ 3 本まで。A-Frame(6 本)は失格、鋤先(3 本)は適格
    const q3 = questions.find((q) => q.id === "q3")!;
    const r = evaluateQuestion(q3, shelters);
    const aframe = r.scores.find((s) => s.shelterId === "a-frame")!;
    expect(aframe.eligible).toBe(false);
    expect(aframe.reason).toMatch(/ペグ/);
    expect(r.scores.find((s) => s.shelterId === "plow-point")!.eligible).toBe(true);
  });
});

describe("T-037 設問データの整合(G-27)", () => {
  it("ID が一意で、状況が範囲内", () => {
    const ids = questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of questions) {
      expect(q.prompt.length).toBeGreaterThan(0);
      expect(q.conditions.windFrom).toBeGreaterThanOrEqual(0);
      expect(q.conditions.windFrom).toBeLessThan(360);
      expect(q.conditions.windSpeed).toBeGreaterThanOrEqual(0);
      expect(q.conditions.windSpeed).toBeLessThanOrEqual(100);
      expect([0, 1, 2, 3]).toContain(q.conditions.rain);
    }
  });
  it("字種に違反が無い", () => {
    expect(findForeignChars(QUIZ_RAW)).toEqual([]);
  });
});
