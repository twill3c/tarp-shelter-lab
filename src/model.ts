// data/shelters.json の型と読込時の検算(SPEC §5)。
// 「仮定が崩れたら落ちる」検算をここに置く(HC-075): 参照切れ・欠落・型違いは黙って通さない。
import type { Point, Poly } from "./geometry";

export interface HeightRange {
  min: number;
  ideal: number;
  max: number;
}

export interface PoleDef {
  id: string;
  x: number;
  y: number;
  height: HeightRange;
}

export interface PegDef {
  id: string;
  x: number;
  y: number;
}

export interface RopeDef {
  id: string;
  anchor: Point;
  peg: string;
}

export interface Source {
  title: string;
  edition: string;
  year: number;
  figure: string;
  url: string;
  rights: string;
  usage: string;
}

export interface Shelter {
  id: string;
  name: string;
  nameJa: string;
  difficulty: number;
  field: { w: number; h: number };
  tarp: { folded: Poly; flat: Poly; pitched: Poly };
  poles: PoleDef[];
  pegs: PegDef[];
  ropes: RopeDef[];
  tolerance: number;
  weather: string[];
  notes: string[];
  source: Source;
}

class DataError extends Error {
  constructor(path: string, msg: string) {
    super(`shelters.json ${path}: ${msg}`);
  }
}

function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new DataError(path, "有限の数値が必要");
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) throw new DataError(path, "空でない文字列が必要");
  return v;
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new DataError(path, "オブジェクトが必要");
  return v as Record<string, unknown>;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new DataError(path, "配列が必要");
  return v;
}

function poly(v: unknown, path: string): Poly {
  const a = arr(v, path);
  if (a.length < 3) throw new DataError(path, "多角形は 3 頂点以上");
  return a.map((p, i) => {
    const q = arr(p, `${path}[${i}]`);
    if (q.length !== 2) throw new DataError(`${path}[${i}]`, "[x, y] が必要");
    return [num(q[0], `${path}[${i}].x`), num(q[1], `${path}[${i}].y`)];
  });
}

function point(v: unknown, path: string): Point {
  const o = obj(v, path);
  return { x: num(o["x"], `${path}.x`), y: num(o["y"], `${path}.y`) };
}

export function validateShelter(v: unknown, idx: number): Shelter {
  const p = `[${idx}]`;
  const o = obj(v, p);
  const id = str(o["id"], `${p}.id`);
  const tarp = obj(o["tarp"], `${id}.tarp`);
  const field = obj(o["field"], `${id}.field`);
  const src = obj(o["source"], `${id}.source`);
  const poles = arr(o["poles"], `${id}.poles`).map((x, i) => {
    const q = obj(x, `${id}.poles[${i}]`);
    const h = obj(q["height"], `${id}.poles[${i}].height`);
    const height = {
      min: num(h["min"], `${id}.poles[${i}].height.min`),
      ideal: num(h["ideal"], `${id}.poles[${i}].height.ideal`),
      max: num(h["max"], `${id}.poles[${i}].height.max`),
    };
    if (!(height.min <= height.ideal && height.ideal <= height.max)) {
      throw new DataError(`${id}.poles[${i}].height`, "min ≤ ideal ≤ max でない");
    }
    return { id: str(q["id"], `${id}.poles[${i}].id`), ...point(q, `${id}.poles[${i}]`), height };
  });
  const pegs = arr(o["pegs"], `${id}.pegs`).map((x, i) => {
    const q = obj(x, `${id}.pegs[${i}]`);
    return { id: str(q["id"], `${id}.pegs[${i}].id`), ...point(q, `${id}.pegs[${i}]`) };
  });
  const pegIds = new Set(pegs.map((g) => g.id));
  const ropes = arr(o["ropes"], `${id}.ropes`).map((x, i) => {
    const q = obj(x, `${id}.ropes[${i}]`);
    const peg = str(q["peg"], `${id}.ropes[${i}].peg`);
    if (!pegIds.has(peg)) throw new DataError(`${id}.ropes[${i}].peg`, `ペグ ${peg} が無い`);
    return { id: str(q["id"], `${id}.ropes[${i}].id`), anchor: point(q["anchor"], `${id}.ropes[${i}].anchor`), peg };
  });
  const ids = [...poles.map((x) => x.id), ...pegs.map((x) => x.id), ...ropes.map((x) => x.id)];
  if (new Set(ids).size !== ids.length) throw new DataError(id, "部品 ID が重複");
  return {
    id,
    name: str(o["name"], `${id}.name`),
    nameJa: str(o["nameJa"], `${id}.nameJa`),
    difficulty: num(o["difficulty"], `${id}.difficulty`),
    field: { w: num(field["w"], `${id}.field.w`), h: num(field["h"], `${id}.field.h`) },
    tarp: {
      folded: poly(tarp["folded"], `${id}.tarp.folded`),
      flat: poly(tarp["flat"], `${id}.tarp.flat`),
      pitched: poly(tarp["pitched"], `${id}.tarp.pitched`),
    },
    poles,
    pegs,
    ropes,
    tolerance: num(o["tolerance"], `${id}.tolerance`),
    weather: arr(o["weather"], `${id}.weather`).map((w, i) => str(w, `${id}.weather[${i}]`)),
    notes: arr(o["notes"], `${id}.notes`).map((w, i) => str(w, `${id}.notes[${i}]`)),
    source: {
      title: str(src["title"], `${id}.source.title`),
      edition: str(src["edition"], `${id}.source.edition`),
      year: num(src["year"], `${id}.source.year`),
      figure: str(src["figure"], `${id}.source.figure`),
      url: str(src["url"], `${id}.source.url`),
      rights: str(src["rights"], `${id}.source.rights`),
      usage: str(src["usage"], `${id}.source.usage`),
    },
  };
}

export function loadShelters(json: unknown): Shelter[] {
  const root = obj(json, "root");
  const list = arr(root["shelters"], "shelters").map(validateShelter);
  if (list.length === 0) throw new DataError("shelters", "空");
  if (new Set(list.map((s) => s.id)).size !== list.length) throw new DataError("shelters", "id が重複");
  return list;
}
