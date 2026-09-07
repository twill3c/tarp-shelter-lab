// 課題の描画(F-18)。判定と、満たしていない項目の列挙。
import type { Mission, MissionContext, MissionResult } from "./mission";
import { missionStatus } from "./mission";
import type { SimState } from "./simulator";

function q<T extends Element>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`要素が無い: ${sel}`);
  return el;
}

/** 課題の一覧を作る。クリア済みには印を付ける */
export function renderMissionList(missions: Mission[], currentId: string | null, cleared: string[], onSelect: (id: string | null) => void): void {
  const sel = q<HTMLSelectElement>("#mission-select");
  const free = document.createElement("option");
  free.value = "";
  free.textContent = "(自由に張る)";
  sel.replaceChildren(
    free,
    ...missions.map((m) => {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = `${cleared.includes(m.id) ? "済 " : ""}${m.title}`;
      return o;
    }),
  );
  sel.value = currentId ?? "";
  if (!sel.dataset["bound"]) {
    sel.dataset["bound"] = "1";
    sel.addEventListener("change", () => onSelect(sel.value === "" ? null : sel.value));
  }
}

/**
 * 課題の判定を出す。**満たしていない項目を並べる。**
 * 課題を選んでいなければ盤は静かにする(判定する対象が無い)。
 */
export function renderMissionPanel(state: SimState, mission: Mission | null, ctx: MissionContext, cleared: string[]): MissionResult | null {
  const verdict = q<HTMLElement>("#mission-verdict");
  const title = q<HTMLElement>("#mission-title");
  const brief = q<HTMLElement>("#mission-brief");
  const list = q<HTMLUListElement>("#mission-checks");
  if (!mission) {
    verdict.textContent = "—";
    verdict.dataset["label"] = "";
    title.textContent = "";
    brief.textContent = "課題を選ぶと、条件と達成の判定が出る";
    list.replaceChildren();
    return null;
  }
  const result = missionStatus(state, mission, ctx);
  verdict.textContent = result.cleared ? "CLEAR" : "挑戦中";
  verdict.dataset["label"] = result.cleared ? "CLEAR" : "TRYING";
  title.textContent = cleared.includes(mission.id) ? `${mission.title}(クリア済み)` : mission.title;
  brief.textContent = `${mission.brief} ヒント: ${mission.hint}`;
  list.replaceChildren(
    ...result.checks.map((c) => {
      const li = document.createElement("li");
      li.dataset["ok"] = String(c.ok);
      li.dataset["check"] = c.id;
      const mark = document.createElement("span");
      mark.className = "mark";
      // 記号だけに頼らず文でも言う(色覚に依存しない — 原案 §23.1)
      mark.textContent = c.ok ? "済" : "未";
      const text = document.createElement("span");
      text.textContent = `${c.label} — ${c.detail}`;
      li.append(mark, text);
      return li;
    }),
  );
  return result;
}
