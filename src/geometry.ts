export interface Point {
  x: number;
  y: number;
}

export type Poly = [number, number][];

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPoly(a: Poly, b: Poly, t: number): Poly {
  return a.map((p, i) => {
    const q = b[i] ?? p;
    return [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  });
}

export function polyToPath(poly: Poly): string {
  return poly.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ") + " Z";
}

export function centroid(poly: Poly): Point {
  const n = poly.length || 1;
  const sx = poly.reduce((acc, [x]) => acc + x, 0);
  const sy = poly.reduce((acc, [, y]) => acc + y, 0);
  return { x: sx / n, y: sy / n };
}
