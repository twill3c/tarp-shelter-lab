// AUTO 手順列(F-08)。データから「正しい手順」を Action の列として生成する。
// 生成器は状態機械と同じデータを読むので、G-07 が言えるのは「データが自己整合であること」まで
// (手順の妥当性は L1 の目視)。
import type { Shelter } from "./model";
import type { Action } from "./simulator";

export function autoPlan(shelter: Shelter, now = 0): Action[] {
  const plan: Action[] = [{ type: "unfold", now }];
  for (const p of shelter.poles) plan.push({ type: "dropPole", x: p.x, y: p.y, now });
  for (const g of shelter.pegs) plan.push({ type: "dropPeg", x: g.x, y: g.y, now });
  for (const r of shelter.ropes) plan.push({ type: "attachRope", rope: r.id, peg: r.peg, now });
  // 張力段: 目標どおりに置いたので吸着で確定する
  for (const g of shelter.pegs) plan.push({ type: "releasePeg", peg: g.id, now });
  return plan;
}
