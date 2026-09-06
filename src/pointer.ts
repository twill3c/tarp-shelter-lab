// Pointer Events による操作(F-03)。マウス・タッチ・ペンを一本化する。
// 座標は常に SVG のユーザー座標(cm)へ変換してから状態機械へ渡す。
import type { Point } from "./geometry";

export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

export function insideSvg(svg: SVGSVGElement, clientX: number, clientY: number): boolean {
  const r = svg.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

export interface DragHandlers {
  move(p: Point, client: { x: number; y: number }): void;
  end(p: Point, client: { x: number; y: number }, inside: boolean): void;
  cancel(): void;
}

/** pointerdown の後に window で move/up を追い、終了時に後始末する */
export function trackDrag(svg: SVGSVGElement, ev: PointerEvent, handlers: DragHandlers): void {
  ev.preventDefault();
  const id = ev.pointerId;
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    e.preventDefault();
    handlers.move(svgPoint(svg, e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    cleanup();
    handlers.end(svgPoint(svg, e.clientX, e.clientY), { x: e.clientX, y: e.clientY }, insideSvg(svg, e.clientX, e.clientY));
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    cleanup();
    handlers.cancel();
  };
  const cleanup = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
  };
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
}
