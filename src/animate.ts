// アニメーション(原案 §8)。展開・張り上げ・AUTO 再生。
// 完了を Promise で返し、再生中は操作を止める(main.ts が busy を持つ)。
import type { Poly } from "./geometry";
import { lerpPoly } from "./geometry";

export function raf(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** from → to へ多角形を補間しながら draw を呼ぶ。duration ms */
export async function morphPoly(from: Poly, to: Poly, duration: number, draw: (poly: Poly) => void): Promise<void> {
  // 頂点数が違う多角形は補間できない(データ側で揃えている)。揃っていなければ即座に切り替える
  if (from.length !== to.length) {
    draw(to);
    return;
  }
  const start = performance.now();
  for (;;) {
    const now = await raf();
    const t = Math.min(1, (now - start) / duration);
    draw(lerpPoly(from, to, easeOutCubic(t)));
    if (t >= 1) return;
  }
}
