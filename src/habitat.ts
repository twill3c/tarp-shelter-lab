// 居住性(SPEC §4.12)。耐風と排水だけでは、前が大きく開く型や四方が均等な型の長所が測れない。
// 座って頭が当たらない高さを確保できる床の広さを測る。
import type { Pt } from "./knots";
import type { Panel, Shelter } from "./model";
import type { SimState } from "./simulator";
import { standingHeight } from "./wind";

/** 座って頭が当たらない高さ(cm) */
export const SIT_HEIGHT = 90;
/** 標本化の刻み(cm)。A-Frame の閉形式と突き合わせて決めた */
export const SAMPLE_STEP = 3;
/** タープの面積(cm²)。300 cm 角 */
export const TARP_AREA = 90000;

function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return [a[0] + t * dx, a[1] + t * dy];
}

function insidePolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    if (y1 > p[1] !== y2 > p[1]) {
      const xint = x1 + ((p[1] - y1) * (x2 - x1)) / (y2 - y1);
      if (p[0] < xint) inside = !inside;
    }
  }
  return inside;
}

/** 原点から向き dir へ進み、多角形の外へ出るまでの距離 */
function rayExit(origin: Pt, dir: Pt, poly: readonly Pt[]): number {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    const ex = x2 - x1;
    const ey = y2 - y1;
    const den = dir[0] * ey - dir[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((x1 - origin[0]) * ey - (y1 - origin[1]) * ex) / den;
    const u = ((x1 - origin[0]) * dir[1] - (y1 - origin[1]) * dir[0]) / den;
    if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && t > best) best = t;
  }
  return best;
}

/**
 * 点の頭上高(cm)。稜線からの光線で出す。
 * 稜線が点に退化した錐(ティピー)も同じ式で測れる。
 */
export function headroomAt(shelter: Shelter, panel: Panel, p: Pt, height: number): number {
  const a = shelter.ridge[0]!;
  const b = shelter.ridge[shelter.ridge.length - 1]!;
  const foot = closestOnSegment(p, a, b);
  const dx = p[0] - foot[0];
  const dy = p[1] - foot[1];
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) return height;
  const exit = rayExit(foot, [dx / d, dy / d], panel.poly);
  if (exit <= 1e-9) return 0;
  return height * (1 - d / exit);
}

/** 頭上高が座高以上ある床の面積(cm²) */
export function usableFloor(shelter: Shelter, height: number): number {
  if (height < SIT_HEIGHT) return 0;
  const xs = shelter.tarp.pitched.map(([x]) => x);
  const ys = shelter.tarp.pitched.map(([, y]) => y);
  const step = SAMPLE_STEP;
  let usable = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      const p: Pt = [x, y];
      for (const panel of shelter.tarp.panels) {
        if (!insidePolygon(p, panel.poly)) continue;
        if (headroomAt(shelter, panel, p, height) >= SIT_HEIGHT) usable += step * step;
        break;
      }
    }
  }
  return usable;
}

/**
 * 居住性 0〜1 = 使える床 / タープの面積。
 *
 * **記憶化する。** 格子標本化は一回で数千点を走るので、画面が毎描画で呼ぶと重い
 * (実測: 記憶化前は実ブラウザ検品が 300 秒で終わらなかった)。
 * 純関数なので、型と高さを鍵にして覚えてよい。
 */
const cache = new Map<string, number>();

export function habitability(shelter: Shelter, height: number): number {
  const key = `${shelter.id}:${height}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const value = Math.max(0, Math.min(1, usableFloor(shelter, height) / TARP_AREA));
  cache.set(key, value);
  return value;
}

/** 現在の状態での居住性(立っているポールの高さで測る) */
export function habitabilityOf(state: SimState): number {
  return habitability(state.shelter, standingHeight(state));
}
