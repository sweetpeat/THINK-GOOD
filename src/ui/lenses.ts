// Lens engine (§5.3): one generic mechanism — a predicate over (node, derived
// context), applied as dim (15%) or hide. Non-destructive; never edits.

import type { AnyNode, AssumptionNode, QuestionNode } from '../model/types';
import { staleStateOf } from '../model/types';
import type { Graph } from '../model/graphStore';
import {
  competingSet,
  isLiveSet,
  weakestInput,
  liveEdges,
} from '../model/derive';
import { VALIDITY_LABELS } from '../model/labels';

export type LensId =
  | 'assumptions'
  | 'spine'
  | 'gaps'
  | 'disconfirming'
  | 'shaky'
  | 'attention';

export interface LensDef {
  id: LensId;
  label: string;
  predicate: (node: AnyNode, g: Graph) => boolean;
  /** optional caption rendered under matching nodes */
  caption?: (node: AnyNode, g: Graph) => string | null;
}

const adoptedQuestionIds = (g: Graph): Set<string> => {
  const ids = new Set<string>();
  for (const e of liveEdges(g)) {
    if (e.type !== 'answers') continue;
    const c = g.nodes[e.from];
    if (c?.type === 'claim' && c.status === 'adopted') {
      ids.add(e.to);
      ids.add(e.from);
    }
  }
  return ids;
};

export const LENSES: LensDef[] = [
  {
    id: 'assumptions',
    label: 'Assumptions (Key Assumptions Check)',
    predicate: (n) => n.type === 'assumption',
    caption: (n) => {
      const a = n as AssumptionNode;
      const validity = a.validity ? VALIDITY_LABELS[a.validity] : 'validity undeclared';
      return a.linchpin ? `${validity} · linchpin` : validity;
    },
  },
  {
    id: 'spine',
    label: 'Spine / Answers',
    predicate: (n, g) => adoptedQuestionIds(g).has(n.id),
  },
  {
    id: 'gaps',
    label: 'Gaps',
    predicate: (n, g) => {
      if (n.type !== 'question') return false;
      const q = n as QuestionNode;
      if (q.status !== 'open') return false;
      if (q.priority) return true;
      // sits in a live competing-set context: its own set is live, or its
      // parent thread's root question has a live set
      if (isLiveSet(competingSet(g, q.id))) return true;
      const parent = q.parentThreadId ? (g.nodes[q.parentThreadId] as QuestionNode) : null;
      return !!parent && isLiveSet(competingSet(g, parent.id));
    },
    caption: (n) => {
      const q = n as QuestionNode;
      return q.priority ? `priority: ${q.priority}` : null;
    },
  },
  {
    id: 'disconfirming',
    label: 'Disconfirming only',
    predicate: (n, g) =>
      n.type === 'evidence' &&
      liveEdges(g).some((e) => e.type === 'inconsistent_with' && e.from === n.id),
  },
  {
    id: 'shaky',
    label: 'On shaky ground',
    predicate: (n, g) => {
      if (n.type !== 'claim') return false;
      const w = weakestInput(g, n.id);
      return !!w && (w.kind === 'unsupported_assumption' || w.kind === 'stale_dependency');
    },
    caption: (n, g) => weakestInput(g, n.id)?.caption ?? null,
  },
  {
    id: 'attention',
    label: 'Needs attention',
    predicate: (n) => staleStateOf(n).kind !== 'fresh',
    caption: (n) =>
      staleStateOf(n).kind === 'undermined' ? 'undermined' : 'never declared',
  },
];

export const lensById = (id: LensId): LensDef => LENSES.find((l) => l.id === id)!;

/** Edges shown under a lens: both endpoints must match. For the disconfirming
    lens, only the inconsistent edges themselves stay lit. */
export function lensKeepsEdge(
  lens: LensDef,
  edgeType: string,
  fromMatch: boolean,
  toMatch: boolean,
): boolean {
  if (lens.id === 'disconfirming') return edgeType === 'inconsistent_with' && fromMatch;
  return fromMatch && toMatch;
}
