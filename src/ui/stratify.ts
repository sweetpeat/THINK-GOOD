// Stratified layout (§5.2): deterministic band layout of the same thread.
// Positions here are computed, never stored. Bands top→bottom: Question ·
// Claims · Assumptions · waterline · Evidence. Within-band order is
// barycentric by connected neighbours' positions (one pass), tie-break createdAt.

import type { AnyNode, Edge } from '../model/types';
import type { NodeVM } from './nodeVM';
import { NODE_W } from './nodeVM';

const SLOT = NODE_W + 48;
const BAND_GAP = 96;
const TOP = 70;
const LEFT = 60;

export interface StratifiedLayout {
  positions: Map<string, { x: number; y: number }>;
  bands: { label: string; y: number }[];
  waterlineY: number;
  width: number;
  height: number;
}

const bandOf = (n: AnyNode): number =>
  n.type === 'question' ? 0 : n.type === 'claim' ? 1 : n.type === 'assumption' ? 2 : 3;

export function stratify(nodes: NodeVM[], edges: Edge[], originX = LEFT, originY = TOP): StratifiedLayout {
  const byBand: NodeVM[][] = [[], [], [], []];
  for (const vm of nodes) byBand[bandOf(vm.node)].push(vm);

  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    neighbours.set(e.from, [...(neighbours.get(e.from) ?? []), e.to]);
    neighbours.set(e.to, [...(neighbours.get(e.to) ?? []), e.from]);
  }

  // seed order: current canvas x, tie-break createdAt — keeps the transition legible
  const seedSort = (a: NodeVM, b: NodeVM) =>
    a.node.x - b.node.x || a.node.createdAt.localeCompare(b.node.createdAt);

  const slotX = new Map<string, number>();
  const order: NodeVM[][] = [];
  for (let b = 0; b < 4; b++) {
    const band = [...byBand[b]].sort(seedSort);
    band.forEach((vm, i) => slotX.set(vm.node.id, i));
    order.push(band);
  }

  // one barycentric pass over claims, then assumptions, then evidence, then questions
  for (const b of [1, 2, 3, 0]) {
    const band = order[b];
    const scored = band.map((vm) => {
      const ns = (neighbours.get(vm.node.id) ?? []).filter((id) => slotX.has(id));
      const bary = ns.length
        ? ns.reduce((s, id) => s + slotX.get(id)!, 0) / ns.length
        : slotX.get(vm.node.id)!;
      return { vm, bary };
    });
    scored.sort((a, b2) => a.bary - b2.bary || a.vm.node.createdAt.localeCompare(b2.vm.node.createdAt));
    scored.forEach(({ vm }, i) => slotX.set(vm.node.id, i));
    order[b] = scored.map((s) => s.vm);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const bands: { label: string; y: number }[] = [];
  const labels = ['Question', 'Claims', 'Assumptions', 'Evidence'];
  let y = originY;
  let waterlineY = 0;
  let maxCols = 1;

  for (let b = 0; b < 4; b++) {
    const band = order[b];
    const bandH = band.length ? Math.max(...band.map((vm) => vm.h)) : 0;
    if (b === 3) {
      waterlineY = y - BAND_GAP / 2 - 6; // the waterline sits above the evidence band (§5.2)
    }
    bands.push({ label: labels[b], y });
    band.forEach((vm, i) => positions.set(vm.node.id, { x: originX + i * SLOT, y }));
    maxCols = Math.max(maxCols, band.length);
    y += (band.length ? bandH : 24) + BAND_GAP;
  }

  return {
    positions,
    bands,
    waterlineY,
    width: originX + maxCols * SLOT + 40,
    height: y,
  };
}
