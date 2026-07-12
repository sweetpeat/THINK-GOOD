// Per-workflow creation palettes and retype options (diamond spec §3.1).
// The canvas letters are per-context: Q/C/A/E in question threads,
// D/A/C/I/V/E/S in incident threads. Both UIs and the retype pickers key off
// this one table so an invalid type is never offered.

import type { NodeType } from '../model/types';

export type Workflow = 'ach' | 'diamond';

export interface PaletteEntry {
  type: NodeType;
  key: string; // single lowercase letter pressed on the canvas
  label: string;
}

export const PALETTES: Record<Workflow, PaletteEntry[]> = {
  ach: [
    { type: 'question', key: 'q', label: 'Question' },
    { type: 'claim', key: 'c', label: 'Claim' },
    { type: 'assumption', key: 'a', label: 'Assumption' },
    { type: 'evidence', key: 'e', label: 'Evidence' },
  ],
  diamond: [
    { type: 'diamond_event', key: 'd', label: 'Event' },
    { type: 'adversary', key: 'a', label: 'Adversary' },
    { type: 'capability', key: 'c', label: 'Capability' },
    { type: 'infrastructure', key: 'i', label: 'Infrastructure' },
    { type: 'victim', key: 'v', label: 'Victim' },
    { type: 'evidence', key: 'e', label: 'Evidence' },
    { type: 'claim', key: 's', label: 'Assessment (claim)' },
  ],
};

export function typeForKey(workflow: Workflow, key: string): NodeType | null {
  return PALETTES[workflow].find((p) => p.key === key)?.type ?? null;
}

export function keyFor(workflow: Workflow, type: NodeType): string {
  return PALETTES[workflow].find((p) => p.type === type)?.key ?? type[0];
}

/** The types a node may be retyped to in this workflow (incident/question
    placement rules are still enforced by repo.ts). */
export function retypeOptions(workflow: Workflow, currentType: NodeType): NodeType[] {
  return PALETTES[workflow].map((p) => p.type).filter((t) => t !== currentType);
}
