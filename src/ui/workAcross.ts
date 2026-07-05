// Work-across prompt (§5.4): after an evidence→claim edge is created anywhere,
// if the claim sits in a live competing set, offer (non-blocking, unlogged) to
// assess the same evidence against the unassessed rivals.

import type { Graph } from '../model/graphStore';
import type { Edge } from '../model/types';
import { competingSet, isLiveSet, liveEdges } from '../model/derive';
import { useUI } from './uiStore';

export function maybeWorkAcrossToast(g: Graph, edge: Edge): void {
  if (edge.type !== 'consistent_with' && edge.type !== 'inconsistent_with') return;
  const claim = g.nodes[edge.to];
  const evidence = g.nodes[edge.from];
  if (!claim || !evidence) return;

  const questions = liveEdges(g)
    .filter((e) => e.type === 'answers' && e.from === claim.id)
    .map((e) => e.to);
  for (const qId of questions) {
    const set = competingSet(g, qId);
    if (!isLiveSet(set)) continue;
    const assessed = new Set(
      liveEdges(g)
        .filter(
          (e) =>
            e.from === evidence.id &&
            (e.type === 'consistent_with' || e.type === 'inconsistent_with'),
        )
        .map((e) => e.to),
    );
    const unassessed = set.filter((c) => !assessed.has(c.id));
    if (!unassessed.length) continue;

    const short = (t: string) => (t.length > 32 ? `${t.slice(0, 31)}…` : t);
    const ui = useUI.getState();
    ui.showToast({
      text: `Assessed against ‘${short(claim.text)}’. Unassessed: ${unassessed
        .map((c) => short(c.text))
        .join(', ')}`,
      action: {
        label: 'Open matrix row',
        run: () => {
          const s = useUI.getState();
          s.setMatrixFocus(evidence.id);
          s.setView('matrix');
          s.showToast(null);
        },
      },
    });
    return; // one courtesy toast is enough
  }
}
