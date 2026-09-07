// T-001 / T-002 / T-016 / T-017 — data/shelters.json の整合(G-01・G-08・G-12)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadShelters } from "../src/model";
import { dist } from "../src/geometry";
import { findForeignChars } from "../src/hygiene";

const RAW = readFileSync(new URL("../data/shelters.json", import.meta.url), "utf8");
const shelters = loadShelters(JSON.parse(RAW));

describe("T-001 図鑑が読め、ID が一意で、ロープの peg 参照が実在する(F-01 F-13 G-01)", () => {
  it("ID 集合が SPEC §2 F-01 と一致する", () => {
    // 出所: SPEC §2 F-01。MVP の三種に Phase 5 で鋤先とティピーを足した(2026-09-07)
    expect(new Set(shelters.map((s) => s.id))).toEqual(
      new Set(["a-frame", "lean-to", "diamond", "plow-point", "teepee"]),
    );
  });
  it("シェルター ID・部品 ID に重複が無い", () => {
    const ids = shelters.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of shelters) {
      const parts = [...s.poles.map((p) => p.id), ...s.pegs.map((g) => g.id), ...s.ropes.map((r) => r.id)];
      expect(new Set(parts).size, s.id).toBe(parts.length);
    }
  });
  it("ロープの peg は実在のペグを指し、参照切れ 0", () => {
    for (const s of shelters) {
      const pegIds = new Set(s.pegs.map((g) => g.id));
      const dangling = s.ropes.filter((r) => !pegIds.has(r.peg));
      expect(dangling, s.id).toEqual([]);
    }
  });
});

describe("T-002 幾何の整合(G-01)", () => {
  it("全目標・全多角形頂点がフィールド内", () => {
    for (const s of shelters) {
      const inside = (x: number, y: number) => x >= 0 && x <= s.field.w && y >= 0 && y <= s.field.h;
      for (const p of s.poles) expect(inside(p.x, p.y), `${s.id} ${p.id}`).toBe(true);
      for (const g of s.pegs) expect(inside(g.x, g.y), `${s.id} ${g.id}`).toBe(true);
      for (const poly of [s.tarp.folded, s.tarp.flat, s.tarp.pitched]) {
        for (const [x, y] of poly) expect(inside(x, y), `${s.id} tarp`).toBe(true);
      }
    }
  });
  it("ペグ目標同士の距離 ≥ 2×tolerance(判定が曖昧にならない — SPEC §4.2)", () => {
    for (const s of shelters) {
      for (let i = 0; i < s.pegs.length; i++) {
        for (let j = i + 1; j < s.pegs.length; j++) {
          const a = s.pegs[i]!;
          const b = s.pegs[j]!;
          expect(dist(a, b), `${s.id} ${a.id}-${b.id}`).toBeGreaterThanOrEqual(2 * s.tolerance);
        }
      }
      // ポール目標も同じ規則
      for (let i = 0; i < s.poles.length; i++) {
        for (let j = i + 1; j < s.poles.length; j++) {
          expect(dist(s.poles[i]!, s.poles[j]!), s.id).toBeGreaterThanOrEqual(2 * s.tolerance);
        }
      }
    }
  });
  it("ロープの anchor は pitched の頂点かポール位置に一致する(SPEC §5)", () => {
    for (const s of shelters) {
      const anchors = [
        ...s.tarp.pitched.map(([x, y]) => ({ x, y })),
        ...s.poles.map((p) => ({ x: p.x, y: p.y })),
      ];
      for (const r of s.ropes) {
        const hit = anchors.some((a) => a.x === r.anchor.x && a.y === r.anchor.y);
        expect(hit, `${s.id} ${r.id} anchor`).toBe(true);
      }
    }
  });
  it("ロープの目標長は正で、tolerance より長い(ペグが anchor に重ならない)", () => {
    for (const s of shelters) {
      for (const r of s.ropes) {
        const peg = s.pegs.find((g) => g.id === r.peg)!;
        expect(dist(r.anchor, peg), `${s.id} ${r.id}`).toBeGreaterThan(s.tolerance);
      }
    }
  });
});

describe("T-016 字種(G-08・HC-072)— 共通の text_hygiene は data/ を見ない", () => {
  it("shelters.json にキリル文字・ハングル・制御文字が無い", () => {
    expect(findForeignChars(RAW)).toEqual([]);
  });
  it("陽性対照: キリルの а(U+0430)と制御文字 U+0007 は検出される", () => {
    // 見た目はラテンの a と同じ。読んでも気づけないので検査器の側を対照で押さえる
    const bad = "t\u0430rp\u0007";
    const hits = findForeignChars(bad);
    expect(hits.map((h) => h.char)).toEqual(["\u0430", "\u0007"]);
  });
  it("陰性対照: 和文・英数・記号・改行は検出しない(実データの正常部分から取る — HC-074)", () => {
    const sample = shelters.map((s) => s.nameJa + s.notes.join("\n")).join("\n");
    expect(sample.length).toBeGreaterThan(0);
    expect(findForeignChars(sample)).toEqual([]);
  });
});

describe("T-017 出典七項目(F-13 G-12)", () => {
  it("各シェルターの source が七項目とも空でなく、url は https", () => {
    for (const s of shelters) {
      const src = s.source;
      for (const k of ["title", "edition", "figure", "url", "rights", "usage"] as const) {
        expect(String(src[k]).trim().length, `${s.id}.source.${k}`).toBeGreaterThan(0);
      }
      expect(Number.isInteger(src.year), `${s.id}.source.year`).toBe(true);
      expect(src.url.startsWith("https://"), `${s.id}.source.url`).toBe(true);
    }
  });
});

describe("T-019 屋根面 panels の整合(F-02 G-01・SPEC §4.1)", () => {
  // 靴紐公式。pitched を panels で分割したのだから、面積の和は元の面積に一致する。
  // 分割の仕方(何枚か・どこで切るか)には依存しないので、循環しない検算になる。
  const area = (poly: readonly (readonly [number, number])[]): number => {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  };

  it("panels の面積和 = pitched の面積", () => {
    for (const s of shelters) {
      const whole = area(s.tarp.pitched);
      expect(whole, s.id).toBeGreaterThan(0);
      const sum = s.tarp.panels.reduce((acc, p) => acc + area(p.poly), 0);
      expect(sum, `${s.id} 面積和`).toBeCloseTo(whole, 6);
    }
  });

  it("panels の頂点はフィールド内、shade は 0 より大きく 1 以下", () => {
    for (const s of shelters) {
      for (const panel of s.tarp.panels) {
        for (const [x, y] of panel.poly) {
          expect(x >= 0 && x <= s.field.w && y >= 0 && y <= s.field.h, `${s.id} panel`).toBe(true);
        }
        expect(panel.shade, `${s.id} shade`).toBeGreaterThan(0);
        expect(panel.shade, `${s.id} shade`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("ridge の端点は panels の頂点集合に含まれる(稜線が面の境界であることの検算)", () => {
    for (const s of shelters) {
      const verts = new Set(s.tarp.panels.flatMap((p) => p.poly.map(([x, y]) => `${x},${y}`)));
      expect(s.ridge.length, `${s.id} ridge`).toBeGreaterThan(0);
      for (const [x, y] of s.ridge) {
        expect(verts.has(`${x},${y}`), `${s.id} ridge ${x},${y}`).toBe(true);
      }
    }
  });
});

describe("T-041 開口の向きが幾何と一致する(F-17 G-31)", () => {
  // 片側だけを持ち上げる型では、開口は持ち上げた側を向く。だから opening は自由な宣言ではない。
  // 2026-09-08: この検査を書いたら Lean-To が逆(ポールは北・開口は南)だと分かった。
  const centroid = (pts: readonly (readonly [number, number])[]) => ({
    x: pts.reduce((a, p) => a + p[0], 0) / pts.length,
    y: pts.reduce((a, p) => a + p[1], 0) / pts.length,
  });
  /** 0 = 画面の上(北)、90 = 右(東) */
  const bearing = (dx: number, dy: number) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const diff = (a: number, b: number) => {
    const d = Math.abs(((a - b) % 360) + 360) % 360;
    return d > 180 ? 360 - d : d;
  };
  /** ポールが重心から離れていれば、開口は幾何から決まる */
  const OFFSET_MIN = 30;
  const ANGLE_MAX = 45;

  function geometricOpening(s: (typeof shelters)[number]): number | null {
    const c = centroid(s.tarp.pitched);
    const p = centroid(s.poles.map((x) => [x.x, x.y] as [number, number]));
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return Math.hypot(dx, dy) < OFFSET_MIN ? null : bearing(dx, dy);
  }

  it("ポールが偏っている型は、開口がその方位と 45 度以内", () => {
    for (const s of shelters) {
      const want = geometricOpening(s);
      if (want === null) continue;
      expect(s.opening, `${s.id} は片側を持ち上げるので開口が幾何から決まる`).not.toBeNull();
      expect(diff(s.opening!, want), `${s.id} 宣言 ${s.opening} / 幾何 ${want.toFixed(1)}`).toBeLessThanOrEqual(ANGLE_MAX);
    }
  });
  it("幾何から決まらない型は、理由を openingNote に書いている(黙って除外しない)", () => {
    for (const s of shelters) {
      if (geometricOpening(s) !== null) continue;
      expect(s.openingNote ?? "", `${s.id}`).not.toBe("");
    }
  });
  it("陽性対照: 開口を 180 度ずらすと落ちる", () => {
    const target = shelters.find((s) => geometricOpening(s) !== null)!;
    const want = geometricOpening(target)!;
    expect(diff((target.opening! + 180) % 360, want)).toBeGreaterThan(ANGLE_MAX);
  });
});
