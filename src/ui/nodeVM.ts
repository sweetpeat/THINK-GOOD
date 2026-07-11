// Pure view-model for node rendering — shared by the canvas, the stratified
// view, and the static share-file SVG so the visual grammar is identical
// everywhere (§5.1): type = colour + glyph; adopted = solid; stale = hatched
// border; linchpin = keystone; derivedFrom = chain-link badge.

import type {
  AnyNode,
  AssumptionNode,
  ClaimNode,
  DiamondEventNode,
  EvidenceNode,
  IncidentNode,
  QuestionNode,
  VertexNode,
  VertexType,
} from '../model/types';
import { isVertexType, staleStateOf, VERTEX_TYPES } from '../model/types';
import type { Graph } from '../model/graphStore';
import {
  competingSet,
  diamondEvents,
  diamondGaps,
  eventsCharacterizedBy,
  missingRoles,
} from '../model/derive';
import {
  admiraltyGrade,
  CONFIDENCE_LABELS,
  LIKELIHOOD_LABELS,
  PHASE_LABELS,
  RESULT_LABELS,
  VALIDITY_LABELS,
} from '../model/labels';

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
  /** diamond_event only: the four roles, filled or gap (diamond spec §3.1) */
  roleSlots: { role: VertexType; present: boolean }[] | null;
}

export function buildNodeVM(g: Graph, node: AnyNode, currentThreadId: string): NodeVM {
  const staleKind = staleStateOf(node).kind;
  const lines = wrapText(node.text);
  let meta = '';
  let adopted = false;
  let linchpin = false;
  let roleSlots: NodeVM['roleSlots'] = null;
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
  } else if (node.type === 'evidence') {
    const e = node as EvidenceNode;
    meta = admiraltyGrade(e.sourceReliability, e.infoCredibility);
  } else if (node.type === 'incident') {
    const inc = node as IncidentNode;
    const events = diamondEvents(g, inc.id);
    const gapCount = diamondGaps(g, inc.id).length; // same count as home/briefing/ceremony
    meta = `${inc.status} · ${events.length} event${events.length === 1 ? '' : 's'}`;
    if (gapCount) meta += ` · ${gapCount} gap${gapCount === 1 ? '' : 's'}`;
  } else if (node.type === 'diamond_event') {
    const ev = node as DiamondEventNode;
    const phase = ev.phase ? PHASE_LABELS[ev.phase] : 'phase undeclared';
    meta = `${phase} · ${ev.result ? RESULT_LABELS[ev.result] : 'result?'}`;
    const missing = new Set(missingRoles(g, node.id));
    roleSlots = VERTEX_TYPES.map((role) => ({ role, present: !missing.has(role) }));
  } else if (isVertexType(node.type)) {
    const v = node as VertexNode;
    const conf = v.confidence ? `${CONFIDENCE_LABELS[v.confidence]} confidence` : 'confidence undeclared';
    const n = eventsCharacterizedBy(g, v.id).length;
    meta = n ? `${conf} · ${n} event${n === 1 ? '' : 's'}` : conf;
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
    isThreadAnchor:
      (node.type === 'question' || node.type === 'incident') && node.id === currentThreadId,
    roleSlots,
  };
}

export const TYPE_COLOR: Record<string, string> = {
  question: 'var(--c-question)',
  claim: 'var(--c-claim)',
  assumption: 'var(--c-assumption)',
  evidence: 'var(--c-evidence)',
  incident: 'var(--c-incident)',
  diamond_event: 'var(--c-event)',
  adversary: 'var(--c-adversary)',
  capability: 'var(--c-capability)',
  infrastructure: 'var(--c-infrastructure)',
  victim: 'var(--c-victim)',
};
export const TYPE_TINT: Record<string, string> = {
  question: 'var(--c-question-tint)',
  claim: 'var(--c-claim-tint)',
  assumption: 'var(--c-assumption-tint)',
  evidence: 'var(--c-evidence-tint)',
  incident: 'var(--c-incident-tint)',
  diamond_event: 'var(--c-event-tint)',
  adversary: 'var(--c-adversary-tint)',
  capability: 'var(--c-capability-tint)',
  infrastructure: 'var(--c-infrastructure-tint)',
  victim: 'var(--c-victim-tint)',
};
export const TYPE_GLYPH: Record<string, string> = {
  question: 'Q',
  claim: 'C',
  assumption: 'A',
  evidence: 'E',
  incident: '◆',
  diamond_event: 'D',
  adversary: 'Ad',
  capability: 'Cp',
  infrastructure: 'In',
  victim: 'Vi',
};
