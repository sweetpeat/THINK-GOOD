// Edge geometry shared by the interactive canvas and the static export.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;

/** Point where the line from this rect's centre toward (tx,ty) exits the rect. */
export function anchor(r: Rect, tx: number, ty: number): { x: number; y: number } {
  const dx = tx - cx(r);
  const dy = ty - cy(r);
  if (dx === 0 && dy === 0) return { x: cx(r), y: cy(r) };
  const sx = dx !== 0 ? r.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? r.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx(r) + dx * s, y: cy(r) + dy * s };
}

export interface EdgeShape {
  d: string;
  mid: { x: number; y: number };
  /** unit normal at the midpoint, for the inconsistency tick */
  normal: { x: number; y: number };
}

export function edgePath(from: Rect, to: Rect): EdgeShape {
  const a = anchor(from, cx(to), cy(to));
  const b = anchor(to, cx(from), cy(from));
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // gentle curve: bow perpendicular to the line, proportionate but capped
  const bow = Math.min(18, len * 0.08);
  const nx = -dy / len;
  const ny = dx / len;
  const c1x = mx + nx * bow;
  const c1y = my + ny * bow;
  return {
    d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
    mid: { x: (a.x + 2 * c1x + b.x) / 4, y: (a.y + 2 * c1y + b.y) / 4 },
    normal: { x: nx, y: ny },
  };
}
