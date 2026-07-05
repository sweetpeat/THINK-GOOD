// Pure view-model for node rendering — shared by the canvas, the stratified
// view, and the static share-file SVG so the visual grammar is identical
// everywhere (§5.1): type = colour + glyph; adopted = solid; stale = hatched
// border; linchpin = keystone; derivedFrom = chain-link badge.

import type { AnyNode, AssumptionNode, ClaimNode, EvidenceNode, QuestionNode } from '../model/types';
import { staleStateOf } from '../model/types';
import type { Graph } from '../model/graphStore';
import { competingSet } from '../model/derive';
import { admiraltyGrade, CONFIDENCE_LABELS, LIKELIHOOD_LABELS, VALIDITY_LABELS } from '../model/labels';

export const NODE_W = 192;
const PAD = 9;
const LINE_H = 15;
const META_H = 17;
const CHARS_PER_LINE = 29;

export function wrapText(text: string, maxLines = 3, chars = CHARS_PER_LINE): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= chars) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > chars ? `${w.slice(0, chars - 1)}…` : w;
      if (lines.length === maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, chars - 1)}…`;
  }
  return lines.length ? lines : ['—'];
}

export interface NodeVM {
  node: AnyNode;
  w: number;
  h: number;
  lines: string[];
  meta: string;
  adopted: boolean;
  staleKind: 'fresh' | 'never_declared' | 'undermined';
  linchpin: boolean;
  derivedBadge: 'none' | 'ok' | 'source_changed';
  /** collapsed sub-question extras (§2.6) */
  isCollapsedSub: boolean;
  answerLines: string[];
  answerMeta: string | null;
  isThreadAnchor: boolean;
}

export function buildNodeVM(g: Graph, node: AnyNode, currentThreadId: string): NodeVM {
  const staleKind = staleStateOf(node).kind;
  const lines = wrapText(node.text);
  let meta = '';
  let adopted = false;
  let linchpin = false;
  const isCollapsedSub =
    node.type === 'question' && (node as QuestionNode).parentThreadId === currentThreadId;
  let answerLines: string[] = [];
  let answerMeta: string | null = null;

  if (node.type === 'question') {
    const q = node as QuestionNode;
    meta = q.status === 'answered' ? 'answered' : 'open';
    if (q.mutuallyExclusive) meta += ' · ME';
    if (q.priority) meta += ` · priority ${q.priority}`;
    if (isCollapsedSub) {
      const adoptedClaim = competingSet(g, q.id).find((c) => c.status === 'adopted');
      if (adoptedClaim) {
        answerLines = wrapText(`↳ ${adoptedClaim.text}`, 2);
        const lk = adoptedClaim.likelihood ? LIKELIHOOD_LABELS[adoptedClaim.likelihood] : 'likelihood undeclared';
        const cf = adoptedClaim.confidence
          ? `${CONFIDENCE_LABELS[adoptedClaim.confidence]} confidence`
          : 'confidence undeclared';
        answerMeta = `${lk} · ${cf}`;
      }
    }
  } else if (node.type === 'claim') {
    const c = node as ClaimNode;
    adopted = c.status === 'adopted';
    const lk = c.likelihood ? LIKELIHOOD_LABELS[c.likelihood] : 'undeclared';
    const cf = c.confidence ? CONFIDENCE_LABELS[c.confidence] : 'undeclared';
    meta = `${lk} · ${cf}`;
  } else if (node.type === 'assumption') {
    const a = node as AssumptionNode;
    linchpin = a.linchpin;
    meta = a.validity ? VALIDITY_LABELS[a.validity] : 'validity undeclared';
  } else {
    const e = node as EvidenceNode;
    meta = admiraltyGrade(e.sourceReliability, e.infoCredibility);
  }

  let derivedBadge: NodeVM['derivedBadge'] = 'none';
  if (node.derivedFrom) {
    const s = staleStateOf(node);
    const causedBySource =
      s.kind === 'undermined' &&
      g.events.find((e) => e.id === s.causeEventId)?.nodeId === node.derivedFrom;
    derivedBadge = causedBySource ? 'source_changed' : 'ok';
  }

  const h =
    PAD +
    lines.length * LINE_H +
    (answerLines.length ? answerLines.length * LINE_H + 2 : 0) +
    (answerMeta ? META_H : 0) +
    META_H +
    PAD - 2;

  return {
    node,
    w: NODE_W,
    h,
    lines,
    meta,
    adopted,
    staleKind,
    linchpin,
    derivedBadge,
    isCollapsedSub,
    answerLines,
    answerMeta,
    isThreadAnchor: node.type === 'question' && node.id === currentThreadId,
  };
}

export const TYPE_COLOR: Record<string, string> = {
  question: 'var(--c-question)',
  claim: 'var(--c-claim)',
  assumption: 'var(--c-assumption)',
  evidence: 'var(--c-evidence)',
};
export const TYPE_TINT: Record<string, string> = {
  question: 'var(--c-question-tint)',
  claim: 'var(--c-claim-tint)',
  assumption: 'var(--c-assumption-tint)',
  evidence: 'var(--c-evidence-tint)',
};
export const TYPE_GLYPH: Record<string, string> = {
  question: 'Q',
  claim: 'C',
  assumption: 'A',
  evidence: 'E',
};
