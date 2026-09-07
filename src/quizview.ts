// クイズの描画(F-20)。回答後は**各型の実数値を並べて理由を示す**。
// 書いた説明ではなく計算した値を出すので、シミュレータと食い違わない。
import type { Shelter } from "./model";
import type { Question, QuestionResult } from "./quiz";
import { NONE_ID, evaluateQuestion } from "./quiz";

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`要素が無い: ${sel}`);
  return el;
}

export interface QuizState {
  index: number;
  answered: string | null;
  correct: number;
  asked: number;
}

const WIND_LABEL: Record<number, string> = { 0: "北", 45: "北東", 90: "東", 135: "南東", 180: "南", 225: "南西", 270: "西", 315: "北西" };
const RAIN_LABEL = ["なし", "弱", "中", "強"];

function conditionText(question: Question): string {
  const c = question.conditions;
  const wind = c.windSpeed === 0 ? "風なし" : `${WIND_LABEL[c.windFrom] ?? `${c.windFrom}度`}から ${c.windSpeed}%`;
  const limits = Object.entries(question.limits).map(([k, v]) => `${k === "poles" ? "ポール" : k === "pegs" ? "ペグ" : "ロープ"} ${v} 本まで`);
  return [`風: ${wind}`, `雨: ${RAIN_LABEL[c.rain]}`, ...limits].join(" / ");
}

export function renderQuiz(
  questions: Question[],
  shelters: Shelter[],
  state: QuizState,
  onAnswer: (choiceId: string) => void,
  onNext: () => void,
): void {
  const question = questions[state.index % questions.length]!;
  const result: QuestionResult = evaluateQuestion(question, shelters);
  q<HTMLElement>("#quiz-prompt").textContent = `${question.prompt}(${conditionText(question)})`;

  const choices = q<HTMLElement>("#quiz-choices");
  const options: { id: string; label: string }[] = [
    ...shelters.map((s) => ({ id: s.id, label: `${s.name} / ${s.nameJa}` })),
    { id: NONE_ID, label: "どれも適さない" },
  ];
  choices.replaceChildren(
    ...options.map((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset["choice"] = o.id;
      b.textContent = o.label;
      if (state.answered !== null) {
        b.disabled = true;
        if (o.id === result.answerId) b.dataset["state"] = state.answered === o.id ? "correct" : "answer";
        else if (o.id === state.answered) b.dataset["state"] = "wrong";
      } else {
        b.addEventListener("click", () => onAnswer(o.id));
      }
      return b;
    }),
  );

  const verdict = q<HTMLElement>("#quiz-verdict");
  const detail = q<HTMLUListElement>("#quiz-detail");
  if (state.answered === null) {
    verdict.textContent = "";
    detail.replaceChildren();
  } else {
    const ok = state.answered === result.answerId;
    const answerLabel = options.find((o) => o.id === result.answerId)?.label ?? result.answerId;
    verdict.textContent = ok ? `正解 — ${answerLabel}` : `不正解 — 正解は ${answerLabel}`;
    verdict.style.color = ok ? "var(--ok)" : "var(--alert)";
    // 理由は書かずに計算した値で示す
    detail.replaceChildren(
      ...result.scores.map((s) => {
        const li = document.createElement("li");
        li.dataset["ok"] = String(s.eligible && s.shelterId === result.answerId);
        li.dataset["shelter"] = s.shelterId;
        const mark = document.createElement("span");
        mark.className = "mark";
        mark.textContent = s.shelterId === result.answerId ? "◎" : s.eligible ? "・" : "×";
        const text = document.createElement("span");
        text.textContent = s.eligible
          ? `${s.name}: 適性 ${s.fitness.toFixed(2)}(安定度 ${Math.round(s.stability)} / 溜まり ${Math.round(s.pool * 100)}%)`
          : `${s.name}: 使えない — ${s.reason}`;
        li.append(mark, text);
        return li;
      }),
    );
  }

  q<HTMLElement>("#quiz-score").textContent = state.asked === 0 ? "" : `${state.asked} 問中 ${state.correct} 問正解`;
  const next = q<HTMLButtonElement>("#quiz-next");
  next.disabled = state.answered === null;
  if (!next.dataset["bound"]) {
    next.dataset["bound"] = "1";
    next.addEventListener("click", onNext);
  }
}
