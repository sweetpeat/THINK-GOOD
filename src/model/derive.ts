// Derived computations (§4). All deterministic pure functions of the graph.
// Nothing here ever writes; nothing here ever produces a judgement value —
// only reachability, counts, and display annotations.

import type {
  AnyNode,
  AssumptionNode,
  ClaimNode,
  DiamondEventNode,
  Edge,
  EvidenceNode,
  IncidentNode,
  KillChainPhase,
  LogEvent,
  QuestionNode,
  StaleState,
  VertexNode,
  VertexType,
} from './types';
import {
  declaredJudgements,
  isFullyGraded,
  isVertexType,
  KILL_CHAIN_ORDER,
  staleStateOf,
  VERTEX_TYPES,
} from './types';
import { admiraltyGrade } from './labels';
import type { Graph } from './graphStore';

export const isLive = (n: AnyNode | undefined): n is AnyNode => !!n && !n.deletedAt;

export function liveNodes(g: Graph): AnyNode[] {
  return Object.values(g.nodes).filter(isLive);
}

export function liveEdges(g: Graph): Edge[] {
  return Object.values(g.edges).filter(
    (e) => isLive(g.nodes[e.from]) && isLive(g.nodes[e.to]),
  );
}

/** Nodes whose home thread is `threadId` (a question's home thread is itself). */
export function ownNodes(g: Graph, threadId: string): AnyNode[] {
  return liveNodes(g).filter((n) => n.threadId === threadId);
}

/** Sub-questions displayed collapsed inside `threadId` (§2.6). */
export function subQuestionsOf(g: Graph, threadId: string): QuestionNode[] {
  return liveNodes(g).filter(
    (n): n is QuestionNode => n.type === 'question' && n.parentThreadId === threadId,
  );
}

/** Everything rendered on the canvas of `threadId`: own nodes + collapsed sub-questions. */
export function displayedNodes(g: Graph, threadId: string): AnyNode[] {
  return [...ownNodes(g, threadId), ...subQuestionsOf(g, threadId)];
}

/** Edges drawn on the canvas of `threadId` (both endpoints displayed there). */
export function displayedEdges(g: Graph, threadId: string): Edge[] {
  const shown = new Set(displayedNodes(g, threadId).map((n) => n.id));
  return liveEdges(g).filter((e) => shown.has(e.from) && shown.has(e.to));
}

export function rootQuestions(g: Graph): QuestionNode[] {
  return liveNodes(g)
    .filter((n): n is QuestionNode => n.type === 'question' && !n.parentThreadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function rootIncidents(g: Graph): IncidentNode[] {
  return liveNodes(g)
    .filter((n): n is IncidentNode => n.type === 'incident')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Which workflow a thread belongs to (diamond spec §2.1): keyed off its anchor. */
export function threadWorkflow(g: Graph, threadId: string): 'ach' | 'diamond' {
  return g.nodes[threadId]?.type === 'incident' ? 'diamond' : 'ach';
}

/** A root thread id plus all descendant sub-thread ids, depth-first, root first. */
export function threadFamily(g: Graph, rootThreadId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    subQuestionsOf(g, id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((sq) => walk(sq.id));
  };
  walk(rootThreadId);
  return out;
}

/** Breadcrumb chain from the root thread down to `threadId`. An incident is
    always its own (single-link) chain — no sub-threads in diamond v1. */
export function threadAncestry(g: Graph, threadId: string): (QuestionNode | IncidentNode)[] {
  const anchor = g.nodes[threadId];
  if (anchor?.type === 'incident') return [anchor as IncidentNode];
  const chain: QuestionNode[] = [];
  let cur = anchor as QuestionNode | undefined;
  while (cur && cur.type === 'question') {
    chain.unshift(cur);
    cur = cur.parentThreadId ? (g.nodes[cur.parentThreadId] as QuestionNode) : undefined;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Dependency direction (§2.4). "B depends on A": a change to A undermines B.
// dependents[A] = list of B. The dependency cone of X = transitive dependents.
// ---------------------------------------------------------------------------

const adjCache = new WeakMap<object, Map<string, string[]>>();

export function dependentsAdjacency(g: Graph): Map<string, string[]> {
  const cached = adjCache.get(g.nodes);
  if (cached) return cached;
  const adj = new Map<string, string[]>();
  const push = (a: string, b: string) => {
    if (!isLive(g.nodes[a]) || !isLive(g.nodes[b])) return;
    const list = adj.get(a) ?? [];
    list.push(b);
    adj.set(a, list);
  };
  // Assessment claims (answers → incident) depend on every live diamond_event
  // in that incident's thread (diamond spec §1.3): the assessment summarizes
  // the diamond map, so any staling change to the map undermines it.
  const assessorsByIncident = new Map<string, string[]>();
  for (const e of Object.values(g.edges)) {
    if (e.type === 'consistent_with' || e.type === 'inconsistent_with') {
      push(e.from, e.to); // claim/vertex depends on evidence
    } else if (e.type === 'rests_on') {
      push(e.to, e.from); // claim depends on assumption
    } else if (e.type === 'answers') {
      const claim = g.nodes[e.from] as ClaimNode | undefined;
      if (claim?.type === 'claim' && claim.status === 'adopted') push(e.from, e.to); // question/incident depends on adopted answer
      if (g.nodes[e.to]?.type === 'incident' && claim?.type === 'claim') {
        assessorsByIncident.set(e.to, [...(assessorsByIncident.get(e.to) ?? []), e.from]);
      }
    } else if (e.type === 'characterizes') {
      push(e.from, e.to); // diamond_event depends on its vertices
    }
  }
  for (const n of liveNodes(g)) {
    if (n.derivedFrom) push(n.derivedFrom, n.id); // promoted node depends on its source claim
    if (n.type === 'diamond_event') {
      for (const claimId of assessorsByIncident.get(n.threadId) ?? []) push(n.id, claimId);
    }
  }
  adjCache.set(g.nodes, adj);
  return adj;
}

/** Everything that ultimately consumes X (X excluded). */
export function dependencyCone(g: Graph, xId: string): Set<string> {
  const adj = dependentsAdjacency(g);
  const cone = new Set<string>();
  const stack = [...(adj.get(xId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (cone.has(id)) continue;
    cone.add(id);
    for (const next of adj.get(id) ?? []) if (!cone.has(next)) stack.push(next);
  }
  return cone;
}

// ---------------------------------------------------------------------------
// Competing sets (§2.5)
// ---------------------------------------------------------------------------

export function competingSet(g: Graph, questionId: string): ClaimNode[] {
  return liveEdges(g)
    .filter((e) => e.type === 'answers' && e.to === questionId)
    .map((e) => g.nodes[e.from] as ClaimNode)
    .filter((c) => c?.type === 'claim')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function isLiveSet(claims: ClaimNode[]): boolean {
  return claims.length >= 2;
}

/** Questions in the thread family that currently have a live competing set. */
export function questionsWithLiveSets(g: Graph, rootThreadId: string): QuestionNode[] {
  return threadFamily(g, rootThreadId)
    .map((tid) => g.nodes[tid] as QuestionNode)
    .filter((q) => q?.type === 'question' && isLive(q) && isLiveSet(competingSet(g, q.id)));
}

// ---------------------------------------------------------------------------
// Diamond workflow derivations (diamond spec §2). Orderings, gap lists, and
// lane assembly only — never judgement values.
// ---------------------------------------------------------------------------

const phaseRank = (p?: KillChainPhase): number =>
  p == null ? KILL_CHAIN_ORDER.length : KILL_CHAIN_ORDER.indexOf(p);

/** Event order (diamond spec §2.2): phase → occurredAt (missing last) → createdAt. */
export function eventOrder(a: DiamondEventNode, b: DiamondEventNode): number {
  const pr = phaseRank(a.phase) - phaseRank(b.phase);
  if (pr !== 0) return pr;
  const ao = a.occurredAt ?? '￿';
  const bo = b.occurredAt ?? '￿';
  return ao.localeCompare(bo) || a.createdAt.localeCompare(b.createdAt);
}

export function diamondEvents(g: Graph, incidentId: string): DiamondEventNode[] {
  return liveNodes(g)
    .filter((n): n is DiamondEventNode => n.type === 'diamond_event' && n.threadId === incidentId)
    .sort(eventOrder);
}

/** The vertices characterizing an event, grouped by role. A role with an empty
    list is a gap. Multiple per role are legal (rival identifications). */
export function verticesOf(g: Graph, eventId: string): Record<VertexType, VertexNode[]> {
  const out: Record<VertexType, VertexNode[]> = {
    adversary: [], capability: [], infrastructure: [], victim: [],
  };
  for (const e of liveEdges(g)) {
    if (e.type !== 'characterizes' || e.to !== eventId) continue;
    const v = g.nodes[e.from];
    if (v && isVertexType(v.type)) out[v.type].push(v as VertexNode);
  }
  for (const role of VERTEX_TYPES) out[role].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return out;
}

/** Pivot list (diamond spec §2.4): the events a vertex characterizes. */
export function eventsCharacterizedBy(g: Graph, vertexId: string): DiamondEventNode[] {
  return liveEdges(g)
    .filter((e) => e.type === 'characterizes' && e.from === vertexId)
    .map((e) => g.nodes[e.to] as DiamondEventNode)
    .filter((n) => n?.type === 'diamond_event')
    .sort(eventOrder);
}

export function missingRoles(g: Graph, eventId: string): VertexType[] {
  const present = verticesOf(g, eventId);
  return VERTEX_TYPES.filter((r) => present[r].length === 0);
}

/** An intelligence gap clears only by creating the missing vertex or declaring
    the missing judgement — never by affirmation (diamond spec §2.5). */
export type GapItem =
  | { kind: 'missing_vertex'; event: DiamondEventNode; role: VertexType }
  | { kind: 'ungraded'; node: AnyNode };

export function diamondGaps(g: Graph, incidentId: string): GapItem[] {
  const gaps: GapItem[] = [];
  for (const ev of diamondEvents(g, incidentId)) {
    for (const role of missingRoles(g, ev.id)) gaps.push({ kind: 'missing_vertex', event: ev, role });
  }
  const diamondNodes = liveNodes(g).filter(
    (n) => n.threadId === incidentId && (n.type === 'diamond_event' || isVertexType(n.type)),
  );
  for (const n of diamondNodes.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!isFullyGraded(n)) gaps.push({ kind: 'ungraded', node: n });
  }
  return gaps;
}

export interface KillChainLane {
  phase: KillChainPhase | null; // null = the "unphased" lane
  events: DiamondEventNode[];
}

/** The seven phases in order, each with its events; an "unphased" lane appears
    last only when needed. Empty lanes render — an empty lane is information. */
export function killChain(g: Graph, incidentId: string): KillChainLane[] {
  const events = diamondEvents(g, incidentId);
  const lanes: KillChainLane[] = KILL_CHAIN_ORDER.map((phase) => ({
    phase,
    events: events.filter((e) => e.phase === phase),
  }));
  const unphased = events.filter((e) => e.phase == null);
  if (unphased.length) lanes.push({ phase: null, events: unphased });
  return lanes;
}

// ---------------------------------------------------------------------------
// Weakest-input annotation (§4.2). Display only; never gates, never alters values.
// ---------------------------------------------------------------------------

export interface WeakestInput {
  kind: 'unsupported_assumption' | 'stale_dependency' | 'caveated_assumption' | 'weak_evidence';
  node: AnyNode;
  caption: string;
}

const RELIABILITY_BADNESS = { F: 0, E: 1, D: 2, C: 3, B: 4, A: 5 } as const;

export function directDependencies(g: Graph, claimId: string): AnyNode[] {
  const deps: AnyNode[] = [];
  for (const e of liveEdges(g)) {
    if (e.type === 'rests_on' && e.from === claimId) deps.push(g.nodes[e.to]);
    if ((e.type === 'consistent_with' || e.type === 'inconsistent_with') && e.to === claimId)
      deps.push(g.nodes[e.from]);
  }
  return deps.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function weakestInput(g: Graph, claimId: string): WeakestInput | null {
  const deps = directDependencies(g, claimId);
  if (!deps.length) return null;

  const unsupported = deps.find(
    (d) => d.type === 'assumption' && (d as AssumptionNode).validity === 'unsupported',
  );
  if (unsupported)
    return {
      kind: 'unsupported_assumption',
      node: unsupported,
      caption: `rests on unsupported assumption: ‘${unsupported.text}’`,
    };

  const stale = deps.find((d) => staleStateOf(d).kind !== 'fresh');
  if (stale) {
    const kind = staleStateOf(stale).kind === 'undermined' ? 'undermined' : 'ungraded';
    return {
      kind: 'stale_dependency',
      node: stale,
      caption: `depends on ${kind} ${stale.type}: ‘${stale.text}’`,
    };
  }

  const caveated = deps.find(
    (d) => d.type === 'assumption' && (d as AssumptionNode).validity === 'caveated',
  );
  if (caveated)
    return {
      kind: 'caveated_assumption',
      node: caveated,
      caption: `rests on caveated assumption: ‘${caveated.text}’`,
    };

  // All remaining evidence is fully graded (ungraded would have hit the stale rule).
  const evidence = deps.filter((d): d is EvidenceNode => d.type === 'evidence');
  if (evidence.length) {
    const worst = [...evidence].sort((a, b) => {
      const rel = RELIABILITY_BADNESS[a.sourceReliability!] - RELIABILITY_BADNESS[b.sourceReliability!];
      if (rel !== 0) return rel; // reliability outranks credibility
      return b.infoCredibility! - a.infoCredibility!; // 6 is worst
    })[0];
    return {
      kind: 'weak_evidence',
      node: worst,
      caption: `weakest evidence: ‘${worst.text}’ [${admiraltyGrade(worst.sourceReliability, worst.infoCredibility)}]`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Diagnosticity + disconfirmation coverage (§4.3, §4.4)
// ---------------------------------------------------------------------------

/** In a live set, evidence is non-diagnostic iff consistent with every claim and inconsistent with none. */
export function isNonDiagnostic(g: Graph, evidenceId: string, set: ClaimNode[]): boolean {
  if (!isLiveSet(set)) return false;
  const edges = liveEdges(g).filter((e) => e.from === evidenceId);
  const setIds = new Set(set.map((c) => c.id));
  const consistentTo = new Set(
    edges.filter((e) => e.type === 'consistent_with' && setIds.has(e.to)).map((e) => e.to),
  );
  const anyInconsistent = edges.some((e) => e.type === 'inconsistent_with' && setIds.has(e.to));
  return !anyInconsistent && consistentTo.size === set.length;
}

export function disconfirmationCoverage(g: Graph, claimId: string): { count: number; attempted: boolean } {
  const count = liveEdges(g).filter((e) => e.type === 'inconsistent_with' && e.to === claimId).length;
  return { count, attempted: count >= 1 };
}

// ---------------------------------------------------------------------------
// Staleness queue (§4.1)
// ---------------------------------------------------------------------------

export interface QueueItem {
  node: AnyNode;
  stale: StaleState;
  /** For undermined items: the causing event. */
  cause?: LogEvent;
}

export function queue(g: Graph, rootThreadId?: string): QueueItem[] {
  const scope = rootThreadId ? new Set(threadFamily(g, rootThreadId)) : null;
  const eventsById = new Map(g.events.map((e) => [e.id, e]));
  const items: QueueItem[] = [];
  for (const n of liveNodes(g)) {
    if (scope && !scope.has(n.threadId)) continue;
    const s = staleStateOf(n);
    if (s.kind === 'fresh') continue;
    items.push({
      node: n,
      stale: s,
      cause: s.kind === 'undermined' ? eventsById.get(s.causeEventId) : undefined,
    });
  }
  const seqOf = (i: QueueItem) => i.cause?.seq ?? Number.MAX_SAFE_INTEGER;
  return items.sort((a, b) => {
    const aU = a.stale.kind === 'undermined' ? 0 : 1;
    const bU = b.stale.kind === 'undermined' ? 0 : 1;
    if (aU !== bU) return aU - bU; // undermined first
    if (aU === 0) return seqOf(a) - seqOf(b); // oldest cause first
    return a.node.createdAt.localeCompare(b.node.createdAt); // oldest node first
  });
}

/** Cone reviews (§5.6): ≥2 undermined items sharing one causeEventId. */
export function coneReviews(items: QueueItem[]): Map<string, QueueItem[]> {
  const byCause = new Map<string, QueueItem[]>();
  for (const i of items) {
    if (i.stale.kind !== 'undermined') continue;
    const list = byCause.get(i.stale.causeEventId) ?? [];
    list.push(i);
    byCause.set(i.stale.causeEventId, list);
  }
  for (const [k, v] of byCause) if (v.length < 2) byCause.delete(k);
  return byCause;
}

// ---------------------------------------------------------------------------
// Spine (§4.5): adopted claims across the thread family, each with its question.
// ---------------------------------------------------------------------------

export interface SpineEntry {
  question: QuestionNode;
  claims: ClaimNode[]; // adopted claims answering it, oldest first
  depth: number;
}

export function spine(g: Graph, rootThreadId: string): SpineEntry[] {
  const out: SpineEntry[] = [];
  const walk = (threadId: string, depth: number) => {
    const q = g.nodes[threadId] as QuestionNode | undefined;
    if (!q || q.type !== 'question' || !isLive(q)) return;
    const adopted = competingSet(g, q.id).filter((c) => c.status === 'adopted');
    if (adopted.length) out.push({ question: q, claims: adopted, depth });
    subQuestionsOf(g, threadId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((sq) => walk(sq.id, depth + 1));
  };
  walk(rootThreadId, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Type history + audit filters (§3) — the log rendered.
// ---------------------------------------------------------------------------

export function typeHistory(g: Graph, nodeId: string): LogEvent[] {
  return g.events.filter((e) => e.type === 'node_retyped' && e.nodeId === nodeId);
}

export function threadEvents(g: Graph, rootThreadId: string): LogEvent[] {
  const family = new Set(threadFamily(g, rootThreadId));
  return g.events.filter((e) => family.has(e.threadId));
}

// ---------------------------------------------------------------------------
// Sessions + briefing (§5.7). Session boundary: >8h since previous event.
// ---------------------------------------------------------------------------

export const SESSION_GAP_MS = 8 * 60 * 60 * 1000;

/** Events after the last >8h gap in this thread family's log. */
export function latestSessionEvents(events: LogEvent[]): LogEvent[] {
  let start = 0;
  for (let i = 1; i < events.length; i++) {
    const gap = Date.parse(events[i].at) - Date.parse(events[i - 1].at);
    if (gap > SESSION_GAP_MS) start = i;
  }
  return events.slice(start);
}

export function isReentry(events: LogEvent[], now: number): boolean {
  if (!events.length) return false;
  return now - Date.parse(events[events.length - 1].at) > SESSION_GAP_MS;
}

// ---------------------------------------------------------------------------
// Stats (§4.6) — all from the log.
// ---------------------------------------------------------------------------

export interface Stats {
  medianCaptureMs: number | null;
  queueSize: number;
  oldestQueueAt: string | null; // timestamp anchoring the oldest queue item
  nodeCounts: Record<string, number>;
  gateOverrides: number;
}

export function stats(g: Graph): Stats {
  const captures = g.events
    .filter((e) => e.type === 'node_created')
    .map((e) => (e.payload as { captureMs?: number })?.captureMs)
    .filter((v): v is number => typeof v === 'number')
    .sort((a, b) => a - b);
  const medianCaptureMs = captures.length
    ? captures.length % 2
      ? captures[(captures.length - 1) / 2]
      : Math.round((captures[captures.length / 2 - 1] + captures[captures.length / 2]) / 2)
    : null;

  const q = queue(g);
  const oldest = q[0];
  const nodeCounts: Record<string, number> = {
    question: 0, claim: 0, assumption: 0, evidence: 0,
    incident: 0, diamond_event: 0, adversary: 0, capability: 0, infrastructure: 0, victim: 0,
  };
  for (const n of liveNodes(g)) nodeCounts[n.type]++;

  return {
    medianCaptureMs,
    queueSize: q.length,
    oldestQueueAt: oldest ? (oldest.cause?.at ?? oldest.node.createdAt) : null,
    nodeCounts,
    gateOverrides: g.events.filter((e) => e.type === 'gate_overridden').length,
  };
}

// Convenience for badges and captions.
export function hasDeclaredJudgements(n: AnyNode): boolean {
  return Object.keys(declaredJudgements(n)).length > 0;
}
