// テスト用の最小シェルター。1 ポール・2 ペグ・2 ロープ。
// 期待値を導出しやすくするため寸法は小さい整数にし、前提(ペグ間距離 ≥ 2×tolerance・
// 目標がフィールド内)は各テストの冒頭で assert する(HC-004 / HC-068)。
import type { Shelter } from "../src/model";

export function minimalShelter(overrides: Partial<Shelter> = {}): Shelter {
  return {
    id: "mini",
    name: "Mini",
    nameJa: "最小",
    difficulty: 1,
    field: { w: 400, h: 300 },
    tarp: {
      folded: [
        [180, 130],
        [220, 130],
        [220, 170],
        [180, 170],
      ],
      flat: [
        [100, 100],
        [300, 100],
        [300, 200],
        [100, 200],
      ],
      pitched: [
        [120, 100],
        [280, 100],
        [280, 200],
        [120, 200],
      ],
      // 棟 x=200 で左右に割る。面積和 160×100 = 8000 は pitched と一致する
      panels: [
        { poly: [[120, 100], [200, 100], [200, 200], [120, 200]], shade: 0.8 },
        { poly: [[200, 100], [280, 100], [280, 200], [200, 200]], shade: 1 },
      ],
    },
    ridge: [
      [200, 100],
      [200, 200],
    ],
    opening: null,
    poles: [{ id: "p1", x: 200, y: 100, height: { min: 90, ideal: 120, max: 150 } }],
    pegs: [
      { id: "g1", x: 100, y: 220 },
      { id: "g2", x: 300, y: 220 },
    ],
    ropes: [
      { id: "r1", anchor: { x: 120, y: 200 }, peg: "g1" },
      { id: "r2", anchor: { x: 280, y: 200 }, peg: "g2" },
    ],
    tolerance: 40,
    weather: ["rain"],
    notes: ["テスト用"],
    source: {
      title: "test",
      edition: "t",
      year: 2026,
      figure: "-",
      url: "https://example.invalid/",
      rights: "test",
      usage: "test",
    },
    ...overrides,
  };
}
