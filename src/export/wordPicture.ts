// Word-picture (§5.8): a deterministic template fill. Slots are filled
// verbatim from node fields, enum labels, and log payloads; a bullet is
// omitted only when its source is empty; no text is ever invented.

import type { Graph } from '../model/graphStore';
import type { AssumptionNode, ClaimNode, EvidenceNode, LogEvent, QuestionNode } from '../model/types';
import {
  competingSet,
  disconfirmationCoverage,
  liveEdges,
  liveNodes,
  threadEvents,
  threadFamily,
} from '../model/derive';
import {
  admiraltyGrade,
  CONFIDENCE_LABELS,
  LIKELIHOOD_LABELS,
  PRIORITY_LABELS,
  VALIDITY_LABELS,
} from '../model/labels';

export type WPBlock =
  | { kind: 'title'; text: string }
  | { kind: 'para'; strong?: string; text: string }
  | { kind: 'bullets'; strong?: string; items: string[] }
  | { kind: 'footer'; text: string };

interface CeremonyRival {
  id: string;
  text: string;
  iCount: number;
}

function adoptionRecord(g: Graph, claimId: string): { event: LogEvent; rivals: CeremonyRival[]; gateAReason?: string; gateARivalIds: Set<string> } | null {
  // latest adoption event for this claim, plus any rival_stronger override logged with it
  for (let i = g.events.length - 1; i >= 0; i--) {
    const e = g.events[i];
    if (e.type !== 'claim_status_changed' || e.nodeId !== claimId) continue;
    const p = e.payload as { after?: string; ceremony?: { rivals?: CeremonyRival[] } | null };
    if (p.after !== 'adopted') return null; // most recent change was a reversal
    const rivals = p.ceremony?.rivals ?? [];
    let gateAReason: string | undefined;
    const gateARivalIds = new Set<string>();
    for (let j = i - 1; j >= 0 && i - j <= 4; j--) {
      const ov = g.events[j];
      if (ov.type === 'gate_overridden' && ov.nodeId === claimId) {
        const op = ov.payload as { gate?: string; snapshot?: { id: string }[] };
        if (op.gate === 'rival_stronger') {
          gateAReason = ov.reason;
          for (const r of op.snapshot ?? []) gateARivalIds.add(r.id);
        }
      } else break;
    }
    return { event: e, rivals, gateAReason, gateARivalIds };
  }
  return null;
}

export function buildWordPicture(g: Graph, rootThreadId: string, now = new Date()): WPBlock[] {
  const root = g.nodes[rootThreadId] as QuestionNode;
  const blocks: WPBlock[] = [{ kind: 'title', text: root?.text ?? 'Untitled question' }];
  const family = threadFamily(g, rootThreadId);
  const familySet = new Set(family);

  const adopted = competingSet(g, rootThreadId).filter((c) => c.status === 'adopted');

  if (!adopted.length) {
    blocks.push({ kind: 'para', strong: 'Judgement:', text: 'none adopted yet.' });
  }

  for (const claim of adopted) {
    const lk = claim.likelihood ? LIKELIHOOD_LABELS[claim.likelihood] : null;
    const cf = claim.confidence ? CONFIDENCE_LABELS[claim.confidence] : null;
    const assessed =
      lk && cf
        ? `assessed as ${lk}, ${cf} confidence.`
        : `${lk ? `assessed as ${lk}` : ''}${lk && !cf ? '. ' : ''}(likelihood/confidence not yet declared)`;
    blocks.push({ kind: 'para', strong: 'Judgement:', text: `${claim.text} — ${assessed}` });

    // Basis
    const items: string[] = [];
    const assumptions = liveEdges(g)
      .filter((e) => e.type === 'rests_on' && e.from === claim.id)
      .map((e) => g.nodes[e.to] as AssumptionNode)
      .filter((a) => a?.type === 'assumption');
    if (assumptions.length) {
      const list = assumptions
        .map(
          (a) =>
            `${a.text} — ${a.validity ? VALIDITY_LABELS[a.validity] : 'validity undeclared'}${a.linchpin ? ', linchpin' : ''}`,
        )
        .join('; ');
      items.push(`Rests on ${assumptions.length} assumption(s): ${list}.`);
    }
    const consistent = liveEdges(g)
      .filter((e) => e.type === 'consistent_with' && e.to === claim.id)
      .map((e) => g.nodes[e.from] as EvidenceNode);
    if (consistent.length) {
      items.push(
        `Evidence consistent: ${consistent
          .map((ev) => `${ev.text} [${admiraltyGrade(ev.sourceReliability, ev.infoCredibility)}]`)
          .join('; ')}.`,
      );
    }
    const inconsistent = liveEdges(g)
      .filter((e) => e.type === 'inconsistent_with' && e.to === claim.id)
      .map((e) => g.nodes[e.from] as EvidenceNode);
    if (inconsistent.length) {
      items.push(
        `Evidence inconsistent with this judgement: ${inconsistent
          .map((ev) => `${ev.text} [${admiraltyGrade(ev.sourceReliability, ev.infoCredibility)}]`)
          .join('; ')}.`,
      );
    } else {
      const rivalIds = competingSet(g, rootThreadId)
        .filter((c) => c.id !== claim.id)
        .map((c) => c.id);
      const iToRivals = rivalIds.some((id) => disconfirmationCoverage(g, id).count > 0);
      items.push(
        iToRivals
          ? 'None recorded — no disconfirmation survives against this judgement.'
          : 'No disconfirmation was recorded against this judgement.',
      );
    }
    blocks.push({ kind: 'bullets', strong: 'Basis:', items });

    // Alternatives considered — from the adoption record (§5.5.6)
    const record = adoptionRecord(g, claim.id);
    if (record && record.rivals.length) {
      const date = record.event.at.slice(0, 10);
      blocks.push({
        kind: 'bullets',
        strong: `Alternatives considered (from the adoption record of ${date}):`,
        items: record.rivals.map((r) => {
          const overridden = record.gateARivalIds.has(r.id) && record.gateAReason;
          return `${r.text} — ${r.iCount} inconsistent item(s).${overridden ? ` Adopted over this rival: ${record.gateAReason}` : ''}`;
        }),
      });
    }
  }

  // Sub-judgements: promoted nodes across the family (§5.8)
  const promoted = liveNodes(g).filter((n) => n.derivedFrom && familySet.has(n.threadId));
  if (promoted.length) {
    blocks.push({
      kind: 'bullets',
      strong: 'Sub-judgements this rests on:',
      items: promoted.map((p) => {
        const source = g.nodes[p.derivedFrom!] as ClaimNode | undefined;
        const sourceQ = source ? (g.nodes[source.threadId] as QuestionNode) : undefined;
        const lk = source?.likelihood ? LIKELIHOOD_LABELS[source.likelihood] : 'likelihood undeclared';
        const cf = source?.confidence ? `${CONFIDENCE_LABELS[source.confidence]} confidence` : 'confidence undeclared';
        return `${p.text} ← ${sourceQ?.text ?? 'removed question'}: ${source?.text ?? 'removed claim'} — ${lk}, ${cf}.`;
      }),
    });
  }

  // Outstanding gaps: open questions with priority (§5.8)
  const gaps = family
    .map((tid) => g.nodes[tid] as QuestionNode)
    .filter((q) => q?.type === 'question' && !q.deletedAt && q.status === 'open' && q.priority);
  if (gaps.length) {
    blocks.push({
      kind: 'bullets',
      strong: 'Outstanding gaps:',
      items: gaps.map((q) => `${q.text} — priority ${PRIORITY_LABELS[q.priority!]}.`),
    });
  }

  // Assumption watch: linchpins with abandon triggers
  const watch = liveNodes(g).filter(
    (n): n is AssumptionNode =>
      n.type === 'assumption' && familySet.has(n.threadId) && (n as AssumptionNode).linchpin && !!(n as AssumptionNode).abandonTrigger,
  );
  if (watch.length) {
    blocks.push({
      kind: 'bullets',
      strong: 'Assumption watch:',
      items: watch.map((a) => `${a.text} — abandon if: ${a.abandonTrigger}`),
    });
  }

  const events = threadEvents(g, rootThreadId);
  const retypes = events.filter((e) => e.type === 'node_retyped').length;
  const overrides = events.filter((e) => e.type === 'gate_overridden').length;
  blocks.push({
    kind: 'footer',
    text: `Audit: ${events.length} events · ${retypes} retypes · ${overrides} gate overrides · generated ${now.toISOString()}`,
  });

  return blocks;
}

export function wordPictureMarkdown(blocks: WPBlock[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'title') out.push(`# ${b.text}`, '');
    else if (b.kind === 'para') out.push(`**${b.strong ?? ''}** ${b.text}`, '');
    else if (b.kind === 'bullets') {
      out.push(`**${b.strong ?? ''}**`, '');
      for (const item of b.items) out.push(`- ${item}`);
      out.push('');
    } else if (b.kind === 'footer') out.push('---', b.text);
  }
  return out.join('\n');
}
