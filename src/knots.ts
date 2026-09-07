// ロープワーク(SPEC §4.11)。図はロープの通り道と上下だけを示す模式図。
// **交差データは幾何で検算する** —— 手で書いた図のデータに対する非循環の検査。
export type Pt = [number, number];

export interface Strand {
  id: string;
  kind: string;
  points: Pt[];
}

export interface Crossing {
  x: number;
  y: number;
  /** 上を通るストランドの id */
  over: string;
  /** 下を通るストランドの id */
  under: string;
}

export interface KnotStep {
  caption: string;
  strands: Strand[];
  crossings: Crossing[];
}

export interface Knot {
  id: string;
  name: string;
  nameJa: string;
  use: string;
  /** 設営工程の ID(STEPS の id) */
  usedIn: string[];
  source: string;
  steps: KnotStep[];
}

export interface KnotDoc {
  viewBox: { w: number; h: number };
  knots: Knot[];
}

class KnotDataError extends Error {
  constructor(path: string, msg: string) {
    super(`knots.json ${path}: ${msg}`);
  }
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new KnotDataError(path, "オブジェクトが必要");
  return v as Record<string, unknown>;
}
function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) throw new KnotDataError(path, "空でない文字列が必要");
  return v;
}
function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new KnotDataError(path, "有限の数値が必要");
  return v;
}
function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new KnotDataError(path, "配列が必要");
  return v;
}

function points(v: unknown, path: string): Pt[] {
  const a = arr(v, path);
  if (a.length < 2) throw new KnotDataError(path, "2 点以上が必要");
  return a.map((p, i) => {
    const q = arr(p, `${path}[${i}]`);
    if (q.length !== 2) throw new KnotDataError(`${path}[${i}]`, "[x, y] が必要");
    return [num(q[0], `${path}[${i}].x`), num(q[1], `${path}[${i}].y`)] as Pt;
  });
}

export function loadKnots(json: unknown): KnotDoc {
  const root = obj(json, "root");
  const vb = obj(root["viewBox"], "viewBox");
  const knots = arr(root["knots"], "knots").map((raw, i) => {
    const p = `knots[${i}]`;
    const k = obj(raw, p);
    const steps = arr(k["steps"], `${p}.steps`).map((s, j) => {
      const sp = `${p}.steps[${j}]`;
      const st = obj(s, sp);
      const strands = arr(st["strands"], `${sp}.strands`).map((x, n) => {
        const s2 = obj(x, `${sp}.strands[${n}]`);
        return {
          id: str(s2["id"], `${sp}.strands[${n}].id`),
          kind: str(s2["kind"], `${sp}.strands[${n}].kind`),
          points: points(s2["points"], `${sp}.strands[${n}].points`),
        };
      });
      const crossings = arr(st["crossings"], `${sp}.crossings`).map((x, n) => {
        const c = obj(x, `${sp}.crossings[${n}]`);
        return {
          x: num(c["x"], `${sp}.crossings[${n}].x`),
          y: num(c["y"], `${sp}.crossings[${n}].y`),
          over: str(c["over"], `${sp}.crossings[${n}].over`),
          under: str(c["under"], `${sp}.crossings[${n}].under`),
        };
      });
      return { caption: str(st["caption"], `${sp}.caption`), strands, crossings };
    });
    if (steps.length === 0) throw new KnotDataError(`${p}.steps`, "空");
    return {
      id: str(k["id"], `${p}.id`),
      name: str(k["name"], `${p}.name`),
      nameJa: str(k["nameJa"], `${p}.nameJa`),
      use: str(k["use"], `${p}.use`),
      usedIn: arr(k["usedIn"], `${p}.usedIn`).map((x, n) => str(x, `${p}.usedIn[${n}]`)),
      source: str(k["source"], `${p}.source`),
      steps,
    };
  });
  if (knots.length === 0) throw new KnotDataError("knots", "空");
  return { viewBox: { w: num(vb["w"], "viewBox.w"), h: num(vb["h"], "viewBox.h") }, knots };
}

/** 線分の交点(平行・重なりは null) */
function segmentIntersection(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
  if (d === 0) return null;
  const t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d;
  const u = ((b1[0] - a1[0]) * (a2[1] - a1[1]) - (b1[1] - a1[1]) * (a2[0] - a1[0])) / d;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return [a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])];
}

/** 二つの折れ線の交点をすべて返す */
export function polylineIntersections(a: Pt[], b: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < a.length; i++) {
    for (let j = 0; j + 1 < b.length; j++) {
      const p = segmentIntersection(a[i]!, a[i + 1]!, b[j]!, b[j + 1]!);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * 手順が進めば図も進む(G-30)。連続するステップの図が同一なら違反。
 * 文だけが進んで図が止まる欠陥は、交差の検算も viewBox の検査も素通りする。
 */
export function stillFrameErrors(doc: KnotDoc): string[] {
  const errors: string[] = [];
  const shape = (s: KnotStep) =>
    JSON.stringify({
      strands: s.strands.map((x) => [x.id, x.kind, x.points]),
      crossings: s.crossings.map((c) => [c.x, c.y, c.over, c.under]),
    });
  for (const knot of doc.knots) {
    for (let i = 1; i < knot.steps.length; i++) {
      if (shape(knot.steps[i]!) === shape(knot.steps[i - 1]!)) {
        errors.push(`${knot.id}: step${i} と step${i + 1} の図が同一(文だけが進んでいる)`);
      }
    }
  }
  return errors;
}

/** 許容(図の単位) */
export const CROSSING_TOLERANCE = 0.5;

/**
 * 交差データの検算。違反を文字列で返す(空なら健全)。
 * - 宣言した交差が、宣言した 2 本のストランドの実際の交点にあるか
 * - 上と下が別のストランドで、どちらもそのステップに在るか
 * - すべての点が viewBox 内か
 */
export function crossingErrors(doc: KnotDoc): string[] {
  const errors: string[] = [];
  const { w, h } = doc.viewBox;
  for (const knot of doc.knots) {
    for (const [i, step] of knot.steps.entries()) {
      const where = `${knot.id} step${i + 1}`;
      const byId = new Map(step.strands.map((s) => [s.id, s]));
      for (const s of step.strands) {
        for (const [x, y] of s.points) {
          if (x < 0 || x > w || y < 0 || y > h) errors.push(`${where} ${s.id}: 点 (${x}, ${y}) が viewBox の外`);
        }
      }
      for (const c of step.crossings) {
        if (c.over === c.under) {
          errors.push(`${where}: 上と下が同じストランド (${c.over})`);
          continue;
        }
        const over = byId.get(c.over);
        const under = byId.get(c.under);
        if (!over || !under) {
          errors.push(`${where}: ストランドが無い (${c.over} / ${c.under})`);
          continue;
        }
        const hits = polylineIntersections(over.points, under.points);
        const near = hits.some((p) => Math.hypot(p[0] - c.x, p[1] - c.y) <= CROSSING_TOLERANCE);
        if (!near) {
          const listed = hits.map((p) => `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`).join(" ") || "なし";
          errors.push(`${where}: (${c.x}, ${c.y}) は ${c.over}×${c.under} の交点でない。実際の交点: ${listed}`);
        }
      }
    }
  }
  return errors;
}
