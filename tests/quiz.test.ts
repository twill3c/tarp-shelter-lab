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
  it("陽性対照: 無風・無雨は三型とも適性 1.000 で差が付かず、不適格と判定される", () => {
    const flat = { id: "control", prompt: "対照", conditions: { windFrom: 0, windSpeed: 0, rain: 0 as const }, limits: {} };
    const r = evaluateQuestion(flat, shelters);
    // 前提: 実際に三型とも満点であること(そうでなければ対照になっていない)
    expect(r.scores.map((s) => Number(s.fitness.toFixed(3)))).toEqual([1, 1, 1]);
    expect(r.margin).toBe(0);
    expect(r.discriminating).toBe(false);
  });
  it("差の閾値は SPEC の 0.10", () => {
    expect(MIN_MARGIN).toBe(0.1);
  });
});

describe("T-036 選択肢が死んでいない(G-26)", () => {
  const table: Record<string, string> = {
    q1: "a-frame",
    q2: "a-frame",
    q3: "diamond",
    q4: "lean-to",
    q5: NONE_ID,
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
  it("どの型も、少なくとも一つの設問で正解になる(死んだ型を置かない)", () => {
    const answers = new Set(questions.map((q) => evaluateQuestion(q, shelters).answerId));
    for (const sh of shelters) expect(answers.has(sh.id), sh.id).toBe(true);
  });
  it("材料の上限を超える型は適格でないと印が付く", () => {
    const q3 = questions.find((q) => q.id === "q3")!;
    const r = evaluateQuestion(q3, shelters);
    const aframe = r.scores.find((s) => s.shelterId === "a-frame")!;
    expect(aframe.eligible).toBe(false);
    expect(aframe.reason).toMatch(/ポール/);
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
