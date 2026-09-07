// T-035..T-037 — クイズ(F-20 / G-25 G-26 G-27)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findForeignChars } from "../src/hygiene";
import { loadShelters } from "../src/model";
import { MIN_MARGIN_ABS, MIN_MARGIN_RATIO, NONE_ID, evaluateQuestion, isMarginEnough, loadQuiz } from "../src/quiz";

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
    const flat = { id: "control", prompt: "対照", conditions: { windFrom: 0, windSpeed: 0, rain: 0 as const }, limits: {}, criterion: "weather" as const };
    const r = evaluateQuestion(flat, shelters);
    // 前提: 実際に全型とも満点であること(そうでなければ対照になっていない)
    expect(r.scores.map((s) => Number(s.fitness.toFixed(3)))).toEqual(shelters.map(() => 1));
    expect(r.margin).toBe(0);
    expect(r.discriminating).toBe(false);
  });
  it("差の閾値は相対 15% と絶対 0.03 の二本(SPEC §4.10)", () => {
    expect(MIN_MARGIN_RATIO).toBe(0.15);
    expect(MIN_MARGIN_ABS).toBe(0.03);
    // 値域の広い基準でも狭い基準でも、同じ規則で「差が付いた」と言えること
    expect(isMarginEnough(0.16, 0.88)).toBe(true);
    expect(isMarginEnough(0.056, 0.35)).toBe(true);
    // 相対では足りるが絶対で足りない場合は落とす(値が小さいと 15% も小さくなる)
    expect(isMarginEnough(0.02, 0.1)).toBe(false);
    // 絶対では足りるが相対で足りない場合も落とす
    expect(isMarginEnough(0.05, 0.9)).toBe(false);
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
    q7: "lean-to",
    q8: "diamond",
  };
  it("SPEC §4.10 の表と一致する", () => {
    for (const q of questions) {
      expect(evaluateQuestion(q, shelters).answerId, q.id).toBe(table[q.id]);
    }
  });
  it("広さを問う設問が 1 つ以上ある(基準が死んでいない)", () => {
    expect(questions.filter((q) => q.criterion === "space").length).toBeGreaterThanOrEqual(1);
  });
  it("「どれも適さない」が正解になる設問が 1 つ以上ある", () => {
    const none = questions.filter((q) => evaluateQuestion(q, shelters).answerId === NONE_ID);
    expect(none.length).toBeGreaterThanOrEqual(1);
  });
  it("一度も正解にならない型は、SPEC に理由を書いた型だけ", () => {
    // 型が増えると、モデルの二軸で他に劣る型が出る。**測って認め、理由を書く**のが正しい ——
    // 「どの型も一度は正解になる」を要求すると、設問を歪めてでも通したくなる。
    // 型が増えると、モデルの軸で他に劣る型が出る。**測って認め、理由を書く**のが正しい。
    // 2026-09-08 に居住性を足すまでは Lean-To と Diamond がここに入っていた(SPEC §4.12)
    // 2026-09-08: 居住性という第三の軸を足したので、二軸で負けていた二型も勝てるようになった
    const NEVER_WINS: string[] = [];
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
