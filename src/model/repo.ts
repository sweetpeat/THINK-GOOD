// Repository layer (§1). ALL mutations go through this module: each function
// (a) validates against the schemas, (b) writes the mutation, and (c) appends
// the corresponding event(s) atomically. UI code never touches Dexie directly.
// The events table is append-only: this module only ever bulkAdds to it.
// No function here ever computes a judgement value — every judgement written
// is exactly the value the user selected (§0 invariant 1).

import { nanoid } from 'nanoid';
import { db } from './db';
import { graphStore, type Graph } from './graphStore';
import {
  type AnyNode,
  type AssumptionNode,
  type ClaimNode,
  type Edge,
  type EdgeType,
  type EventType,
  type LogEvent,
  type NodeType,
  type QuestionNode,
  type StoreSnapshot,
  JUDGEMENT_FIELDS,
  declaredJudgements,
  validEdgeTypes,
} from './types';
import { competingSet, dependencyCone, isLive } from './derive';

const nowISO = () => new Date().toISOString();
let seqCounter = 0;

// ---------------------------------------------------------------------------
// Load / persist
// ---------------------------------------------------------------------------

export async function loadStore(): Promise<void> {
  const [nodes, edges, events] = await Promise.all([
    db.nodes.toArray(),
    db.edges.toArray(),
    db.events.toArray(),
  ]);
  events.sort((a, b) => a.seq - b.seq);
  seqCounter = events.length ? events[events.length - 1].seq + 1 : 0;
  graphStore.setState({
    loaded: true,
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(edges.map((e) => [e.id, e])),
    events,
  });
}

interface Changes {
  putNodes?: AnyNode[];
  putEdges?: Edge[];
  delEdges?: string[];
  events: LogEvent[];
}

async function commit(ch: Changes): Promise<void> {
  if (!ch.events.length) throw new Error('every mutation must append at least one event');
  await db.transaction('rw', db.nodes, db.edges, db.events, async () => {
    if (ch.putNodes?.length) await db.nodes.bulkPut(ch.putNodes);
    if (ch.putEdges?.length) await db.edges.bulkPut(ch.putEdges);
    if (ch.delEdges?.length) await db.edges.bulkDelete(ch.delEdges);
    await db.events.bulkAdd(ch.events); // append-only
  });
  graphStore.setState((s) => {
    const nodes = { ...s.nodes };
    for (const n of ch.putNodes ?? []) nodes[n.id] = n;
    const edges = { ...s.edges };
    for (const e of ch.putEdges ?? []) edges[e.id] = e;
    for (const id of ch.delEdges ?? []) delete edges[id];
    return { nodes, edges, events: [...s.events, ...ch.events] };
  });
}

function mkEvent(
  type: EventType,
  fields: { nodeId?: string; edgeId?: string; threadId: string; payload?: unknown; reason?: string },
): LogEvent {
  return { id: nanoid(), seq: seqCounter++, at: nowISO(), type, payload: null, ...fields };
}

const state = (): Graph => graphStore.getState();

function requireNode(id: string): AnyNode {
  const n = state().nodes[id];
  if (!isLive(n)) throw new Error(`node ${id} does not exist`);
  return n;
}

// ---------------------------------------------------------------------------
// Staling (§2.7). On a staling event on X, every dependency-cone member that
// currently holds ≥1 declared judgement becomes undermined (earliest cause kept).
// Questions never hold undermined. The system marks staleness — a display
// fact — never judgement values.
// ---------------------------------------------------------------------------

function markUndermined(
  g: Graph,
  memberIds: Iterable<string>,
  causeEventId: string,
  acc: Map<string, AnyNode>,
): void {
  for (const id of memberIds) {
    const n = acc.get(id) ?? g.nodes[id];
    if (!isLive(n) || n.type === 'question') continue;
    if (!Object.keys(declaredJudgements(n)).length) continue; // ungraded → already never_declared
    if (n.stale.kind === 'undermined') continue; // keeps earliest cause
    acc.set(id, { ...n, stale: { kind: 'undermined', causeEventId } });
  }
}

/** The endpoint whose judgement an edge feeds (§2.4): rests_on → the claim (from); others → to. */
function edgeConsumer(e: Edge): string {
  return e.type === 'rests_on' ? e.from : e.to;
}

function staleConsumerCone(g: Graph, e: Edge, causeEventId: string, acc: Map<string, AnyNode>) {
  const consumer = edgeConsumer(e);
  markUndermined(g, [consumer, ...dependencyCone(g, consumer)], causeEventId, acc);
}

// ---------------------------------------------------------------------------
// Node creation (§5.1, §2.6)
// ---------------------------------------------------------------------------

export interface CreateNodeInput {
  threadId: string; // canvas the node is created on ('' when creating a root thread)
  type: NodeType;
  text: string;
  x: number;
  y: number;
  captureMs?: number;
  /** Judgements graded inline before commit (Tab flow); each logged as its own declaration. */
  judgements?: Record<string, unknown>;
}

export async function createNode(input: CreateNodeInput): Promise<AnyNode> {
  const text = input.text.trim();
  if (!text) throw new Error('node text is required');
  const id = nanoid();
  const createdAt = nowISO();
  const base = {
    id,
    text,
    x: input.x,
    y: input.y,
    createdAt,
    stale: { kind: 'fresh' } as const,
  };
  let node: AnyNode;
  const events: LogEvent[] = [];

  if (input.type === 'question') {
    // Every question anchors its own thread (§2.6); created inside a thread ⇒ sub-question.
    node = {
      ...base,
      type: 'question',
      threadId: id,
      status: 'open',
      mutuallyExclusive: false,
      ...(input.threadId ? { parentThreadId: input.threadId } : {}),
    };
    events.push(
      mkEvent('thread_created', {
        nodeId: id,
        threadId: id,
        payload: { rootQuestionId: id, parentThreadId: input.threadId || null },
      }),
    );
  } else if (input.type === 'claim') {
    node = { ...base, type: 'claim', threadId: input.threadId, status: 'open' };
  } else if (input.type === 'assumption') {
    node = { ...base, type: 'assumption', threadId: input.threadId, linchpin: false };
  } else {
    node = { ...base, type: 'evidence', threadId: input.threadId };
  }
  if (input.type !== 'question' && !input.threadId) throw new Error('threadId is required');

  events.push(
    mkEvent('node_created', {
      nodeId: id,
      threadId: node.threadId,
      payload: { node: { ...node }, captureMs: input.captureMs },
    }),
  );

  // Inline grades: applied only via judgement_declared events (§8 acceptance).
  for (const [field, value] of Object.entries(input.judgements ?? {})) {
    if (value == null) continue;
    validateJudgement(node.type, field, value);
    const before = (node as unknown as Record<string, unknown>)[field] ?? null;
    (node as unknown as Record<string, unknown>)[field] = value;
    events.push(
      mkEvent('judgement_declared', {
        nodeId: id,
        threadId: node.threadId,
        payload: { field, before, after: value },
      }),
    );
  }

  await commit({ putNodes: [node], events });
  return node;
}

// ---------------------------------------------------------------------------
// Text edits — logged, never staling (§2.7)
// ---------------------------------------------------------------------------

const TEXT_FIELDS: Record<NodeType, string[]> = {
  question: ['text', 'note'],
  claim: ['text', 'note'],
  assumption: ['text', 'note', 'abandonTrigger'],
  evidence: ['text', 'note', 'sourceNote'],
};

export async function editNodeText(
  nodeId: string,
  field: string,
  value: string,
): Promise<void> {
  const node = requireNode(nodeId);
  if (!TEXT_FIELDS[node.type].includes(field)) {
    throw new Error(`${field} is not a text field on a ${node.type}`);
  }
  if (field === 'text' && !value.trim()) throw new Error('node text is required');
  const before = (node as unknown as Record<string, unknown>)[field] ?? null;
  if (before === value) return;
  const updated = { ...node, [field]: value } as AnyNode;
  await commit({
    putNodes: [updated],
    events: [
      mkEvent('node_text_edited', {
        nodeId,
        threadId: node.threadId,
        payload: { field, before, after: value },
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Judgement declaration (§2.2, §2.7). Closed enums only.
// ---------------------------------------------------------------------------

const ENUM_DOMAINS: Record<string, readonly unknown[]> = {
  likelihood: [
    'remote_chance', 'highly_unlikely', 'unlikely', 'realistic_possibility',
    'likely', 'highly_likely', 'almost_certain',
  ],
  confidence: ['low', 'moderate', 'high'],
  validity: ['supported', 'caveated', 'unsupported'],
  sourceReliability: ['A', 'B', 'C', 'D', 'E', 'F'],
  infoCredibility: [1, 2, 3, 4, 5, 6],
  priority: ['low', 'moderate', 'high'],
  linchpin: [true, false],
  mutuallyExclusive: [true, false],
};

// Fields settable per type via declareJudgement. Core judgement fields
// (JUDGEMENT_FIELDS) clear/stale; the annotation flags only log.
const DECLARABLE: Record<NodeType, string[]> = {
  question: ['priority', 'mutuallyExclusive'],
  claim: ['likelihood', 'confidence'],
  assumption: ['validity', 'linchpin'],
  evidence: ['sourceReliability', 'infoCredibility'],
};

function validateJudgement(type: NodeType, field: string, value: unknown): void {
  if (!DECLARABLE[type].includes(field)) {
    throw new Error(`${field} is not declarable on a ${type}`);
  }
  if (value !== null && !ENUM_DOMAINS[field].includes(value)) {
    throw new Error(`${String(value)} is not a valid ${field}`);
  }
}

export async function declareJudgement(
  nodeId: string,
  field: string,
  value: unknown,
): Promise<void> {
  const node = requireNode(nodeId);
  validateJudgement(node.type, field, value);
  const before = (node as unknown as Record<string, unknown>)[field] ?? null;
  const after = value ?? null;
  if (before === after) return;

  const isCore = JUDGEMENT_FIELDS[node.type].includes(field);
  const updated = { ...node, [field]: after ?? undefined } as AnyNode;
  if (isCore) updated.stale = { kind: 'fresh' }; // declaring clears staleness (§2.7)

  const ev = mkEvent('judgement_declared', {
    nodeId,
    threadId: node.threadId,
    payload: { field, before, after },
  });

  const puts = new Map<string, AnyNode>([[nodeId, updated]]);
  if (isCore) {
    const g = state();
    markUndermined(g, dependencyCone(g, nodeId), ev.id, puts);
  }
  await commit({ putNodes: [...puts.values()], events: [ev] });
}

/** Affirm a stale node's judgements unchanged (§2.7). */
export async function affirmNode(nodeId: string): Promise<void> {
  const node = requireNode(nodeId);
  const fields = declaredJudgements(node);
  const ev = mkEvent('judgement_affirmed', {
    nodeId,
    threadId: node.threadId,
    payload: { fields },
  });
  await commit({
    putNodes: [{ ...node, stale: { kind: 'fresh' } }],
    events: [ev],
  });
}

// ---------------------------------------------------------------------------
// Retype (§2.2, §2.7)
// ---------------------------------------------------------------------------

const TYPE_SPECIFIC_FIELDS = [
  'status', 'mutuallyExclusive', 'priority', 'parentThreadId',
  'likelihood', 'confidence',
  'validity', 'linchpin', 'abandonTrigger',
  'sourceReliability', 'infoCredibility', 'sourceNote',
];

export async function retypeNode(nodeId: string, newType: NodeType): Promise<void> {
  const node = requireNode(nodeId);
  if (node.type === newType) return;
  const g = state();

  if (node.type === 'question') {
    const inhabited = Object.values(g.nodes).some(
      (n) => isLive(n) && n.id !== node.id && (n.threadId === node.id || (n as QuestionNode).parentThreadId === node.id),
    );
    if (inhabited) throw new Error('this question anchors a thread with content — empty it first');
    if (!(node as QuestionNode).parentThreadId) {
      throw new Error('a root question cannot be retyped — it anchors this canvas');
    }
  }

  const before = {
    type: node.type,
    judgements: Object.fromEntries(
      TYPE_SPECIFIC_FIELDS.map((f) => [f, (node as unknown as Record<string, unknown>)[f]]).filter(
        ([, v]) => v !== undefined,
      ),
    ),
  };

  // Keep id, text, note, position, thread, createdAt, derivedFrom; null all
  // old type-specific judgement fields (values preserved in the event's before payload).
  const stripped: Record<string, unknown> = { ...node };
  for (const f of TYPE_SPECIFIC_FIELDS) delete stripped[f];
  delete stripped.note; // re-attach below
  const homeThread =
    node.type === 'question' ? ((node as QuestionNode).parentThreadId as string) : node.threadId;

  let retyped: AnyNode;
  const common = {
    ...(stripped as Omit<AnyNode, 'type'>),
    ...(node.note !== undefined ? { note: node.note } : {}),
    stale: { kind: 'fresh' } as const, // judgements nulled ⇒ derives never_declared
  };
  if (newType === 'question') {
    retyped = {
      ...(common as object),
      type: 'question',
      threadId: node.id, // a question anchors its own thread (§2.6)
      parentThreadId: homeThread,
      status: 'open',
      mutuallyExclusive: false,
    } as QuestionNode;
  } else if (newType === 'claim') {
    retyped = { ...(common as object), type: 'claim', threadId: homeThread, status: 'open' } as ClaimNode;
  } else if (newType === 'assumption') {
    retyped = { ...(common as object), type: 'assumption', threadId: homeThread, linchpin: false } as AssumptionNode;
  } else {
    retyped = { ...(common as object), type: 'evidence', threadId: homeThread } as AnyNode;
  }

  const retypeEv = mkEvent('node_retyped', {
    nodeId,
    threadId: homeThread,
    payload: { before, after: { type: newType } },
  });
  const events: LogEvent[] = [retypeEv];
  if (newType === 'question') {
    events.push(
      mkEvent('thread_created', {
        nodeId,
        threadId: node.id,
        payload: { rootQuestionId: node.id, parentThreadId: homeThread },
      }),
    );
  }

  // Retype is a staling event on X: mark X's cone before edges change.
  const puts = new Map<string, AnyNode>([[nodeId, retyped]]);
  markUndermined(g, dependencyCone(g, nodeId), retypeEv.id, puts);

  // Edges made invalid by the retype are deleted, each deletion logged (§2.2)
  // and staling its consumer's cone (§2.7).
  const delEdges: string[] = [];
  for (const e of Object.values(g.edges)) {
    if (e.from !== nodeId && e.to !== nodeId) continue;
    const fromType = e.from === nodeId ? newType : g.nodes[e.from]?.type;
    const toType = e.to === nodeId ? newType : g.nodes[e.to]?.type;
    if (fromType && toType && validEdgeTypes(fromType, toType).includes(e.type)) continue;
    delEdges.push(e.id);
    const delEv = mkEvent('edge_deleted', {
      edgeId: e.id,
      threadId: homeThread,
      payload: { edge: e, cascadeOf: retypeEv.id },
    });
    events.push(delEv);
    staleConsumerCone(g, e, delEv.id, puts);
  }

  // An adopted claim retyped away: reopen its questions if nothing else answers them.
  if (node.type === 'claim' && (node as ClaimNode).status === 'adopted') {
    reopenOrphanedQuestions(g, node.id, events, puts);
  }

  await commit({ putNodes: [...puts.values()], delEdges, events });
}

// ---------------------------------------------------------------------------
// Delete (soft) — §3 node_deleted
// ---------------------------------------------------------------------------

export async function deleteNode(nodeId: string): Promise<void> {
  const node = requireNode(nodeId);
  const g = state();
  const delEv = mkEvent('node_deleted', {
    nodeId,
    threadId: node.threadId,
    payload: { node: { ...node } },
  });
  const events: LogEvent[] = [delEv];
  const puts = new Map<string, AnyNode>([[nodeId, { ...node, deletedAt: nowISO() }]]);

  markUndermined(g, dependencyCone(g, nodeId), delEv.id, puts);

  const delEdges: string[] = [];
  for (const e of Object.values(g.edges)) {
    if (e.from !== nodeId && e.to !== nodeId) continue;
    delEdges.push(e.id);
    const ev = mkEvent('edge_deleted', {
      edgeId: e.id,
      threadId: node.threadId,
      payload: { edge: e, cascadeOf: delEv.id },
    });
    events.push(ev);
    if (edgeConsumer(e) !== nodeId) staleConsumerCone(g, e, ev.id, puts);
  }

  if (node.type === 'claim' && (node as ClaimNode).status === 'adopted') {
    reopenOrphanedQuestions(g, node.id, events, puts);
  }

  await commit({ putNodes: [...puts.values()], delEdges, events });
}

// ---------------------------------------------------------------------------
// Edges (§2.3)
// ---------------------------------------------------------------------------

export async function createEdge(type: EdgeType, from: string, to: string): Promise<Edge> {
  const fromNode = requireNode(from);
  const toNode = requireNode(to);
  if (from === to) throw new Error('an edge cannot loop');
  if (!validEdgeTypes(fromNode.type, toNode.type).includes(type)) {
    throw new Error(`${type} is not valid from ${fromNode.type} to ${toNode.type}`);
  }
  const g = state();
  const existing = Object.values(g.edges).filter((e) => e.from === from && e.to === to);
  if (existing.some((e) => e.type === type)) throw new Error('this edge already exists');

  const events: LogEvent[] = [];
  const delEdges: string[] = [];
  const puts = new Map<string, AnyNode>();

  // At most one of consistent/inconsistent per evidence–claim pair: creating
  // the other replaces it; both removal and creation are logged (§2.3).
  if (type === 'consistent_with' || type === 'inconsistent_with') {
    const opposite = type === 'consistent_with' ? 'inconsistent_with' : 'consistent_with';
    for (const e of existing.filter((e) => e.type === opposite)) {
      delEdges.push(e.id);
      const ev = mkEvent('edge_deleted', {
        edgeId: e.id,
        threadId: fromNode.threadId,
        payload: { edge: e, replacedBy: type },
      });
      events.push(ev);
      staleConsumerCone(g, e, ev.id, puts);
    }
  }

  const edge: Edge = { id: nanoid(), type, from, to, createdAt: nowISO() };
  const ev = mkEvent('edge_created', {
    edgeId: edge.id,
    threadId: fromNode.threadId,
    payload: { edge },
  });
  events.push(ev);
  staleConsumerCone(g, edge, ev.id, puts);

  await commit({ putNodes: [...puts.values()], putEdges: [edge], delEdges, events });
  return edge;
}

export async function deleteEdge(edgeId: string): Promise<void> {
  const g = state();
  const edge = g.edges[edgeId];
  if (!edge) throw new Error(`edge ${edgeId} does not exist`);
  const ev = mkEvent('edge_deleted', {
    edgeId,
    threadId: g.nodes[edge.from]?.threadId ?? 'store',
    payload: { edge },
  });
  const puts = new Map<string, AnyNode>();
  staleConsumerCone(g, edge, ev.id, puts);
  await commit({ putNodes: [...puts.values()], delEdges: [edgeId], events: [ev] });
}

// ---------------------------------------------------------------------------
// Claim status + adoption ceremony (§5.5)
// ---------------------------------------------------------------------------

export interface GateOverride {
  gate: 'rival_stronger' | 'unsupported_linchpin';
  snapshot: unknown;
  reason: string;
}

export async function setClaimStatus(
  claimId: string,
  status: 'open' | 'adopted',
  opts?: { ceremony?: unknown; gateOverrides?: GateOverride[] },
): Promise<void> {
  const node = requireNode(claimId);
  if (node.type !== 'claim') throw new Error('only claims have adoption status');
  const claim = node as ClaimNode;
  if (claim.status === status) return;
  const g = state();

  const answeredQuestions = Object.values(g.edges)
    .filter((e) => e.type === 'answers' && e.from === claimId)
    .map((e) => g.nodes[e.to] as QuestionNode)
    .filter((q) => isLive(q) && q.type === 'question');

  const events: LogEvent[] = [];
  const puts = new Map<string, AnyNode>();

  if (status === 'adopted') {
    // ME questions allow one adopted answer at a time (§5.5.8) — hard rule, not a gate.
    for (const q of answeredQuestions) {
      if (!q.mutuallyExclusive) continue;
      const otherAdopted = competingSet(g, q.id).find((c) => c.id !== claimId && c.status === 'adopted');
      if (otherAdopted) {
        throw new Error(
          `‘${q.text}’ is marked mutually exclusive and already has an adopted answer — revert it first`,
        );
      }
    }
    for (const ov of opts?.gateOverrides ?? []) {
      if (!ov.reason.trim()) throw new Error('a gate override requires a stated reason');
      events.push(
        mkEvent('gate_overridden', {
          nodeId: claimId,
          threadId: claim.threadId,
          payload: { gate: ov.gate, snapshot: ov.snapshot },
          reason: ov.reason.trim(),
        }),
      );
    }
  }

  const statusEv = mkEvent('claim_status_changed', {
    nodeId: claimId,
    threadId: claim.threadId,
    payload: { before: claim.status, after: status, ceremony: opts?.ceremony ?? null },
  });
  events.push(statusEv);
  puts.set(claimId, { ...claim, status });

  // Question status follows adoption (§5.5.7).
  for (const q of answeredQuestions) {
    if (status === 'adopted' && q.status !== 'answered') {
      puts.set(q.id, { ...q, status: 'answered' });
      events.push(
        mkEvent('question_status_changed', {
          nodeId: q.id,
          threadId: q.id,
          payload: { before: q.status, after: 'answered', byClaim: claimId },
        }),
      );
    }
  }
  if (status === 'open') reopenOrphanedQuestions(g, claimId, events, puts);

  // Claim status change is a staling event on the claim (§2.7).
  markUndermined(g, dependencyCone(g, claimId), statusEv.id, puts);

  await commit({ putNodes: [...puts.values()], events });
}

/** Reopen questions whose only adopted answer was `claimId` (being reverted/removed). */
function reopenOrphanedQuestions(
  g: Graph,
  claimId: string,
  events: LogEvent[],
  puts: Map<string, AnyNode>,
): void {
  const answered = Object.values(g.edges)
    .filter((e) => e.type === 'answers' && e.from === claimId)
    .map((e) => g.nodes[e.to] as QuestionNode)
    .filter((q) => isLive(q) && q.type === 'question' && q.status === 'answered');
  for (const q of answered) {
    const remaining = competingSet(g, q.id).some(
      (c) => c.id !== claimId && c.status === 'adopted' && !puts.has(c.id),
    );
    if (remaining) continue;
    puts.set(q.id, { ...(puts.get(q.id) ?? q), status: 'open' } as QuestionNode);
    events.push(
      mkEvent('question_status_changed', {
        nodeId: q.id,
        threadId: q.id,
        payload: { before: 'answered', after: 'open', byClaim: claimId },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Promotion (§2.6) — manual only.
// ---------------------------------------------------------------------------

export async function promoteAnswer(
  sourceClaimId: string,
  asType: 'evidence' | 'assumption',
  position: { x: number; y: number },
): Promise<AnyNode> {
  const claim = requireNode(sourceClaimId);
  if (claim.type !== 'claim') throw new Error('only claims can be promoted');
  if ((claim as ClaimNode).status !== 'adopted') throw new Error('only an adopted claim can be promoted');
  const subQuestion = state().nodes[claim.threadId] as QuestionNode | undefined;
  const parentThreadId = subQuestion?.parentThreadId;
  if (!parentThreadId) throw new Error('this claim has no parent thread to promote into');

  const id = nanoid();
  const base = {
    id,
    text: claim.text, // copied; the analyst grades it in the parent's own terms
    threadId: parentThreadId,
    x: position.x,
    y: position.y,
    createdAt: nowISO(),
    derivedFrom: sourceClaimId,
    stale: { kind: 'fresh' } as const,
  };
  const node: AnyNode =
    asType === 'evidence'
      ? { ...base, type: 'evidence' }
      : { ...base, type: 'assumption', linchpin: false };

  await commit({
    putNodes: [node],
    events: [
      mkEvent('node_promoted', {
        nodeId: id,
        threadId: parentThreadId,
        payload: { sourceClaimId, asType, node: { ...node } },
      }),
    ],
  });
  return node;
}

// ---------------------------------------------------------------------------
// Position — view-owned data (§0.3): persisted, but not a graph act, no event.
// ---------------------------------------------------------------------------

export async function moveNode(nodeId: string, x: number, y: number): Promise<void> {
  const node = requireNode(nodeId);
  const updated = { ...node, x, y } as AnyNode;
  await db.nodes.put(updated);
  graphStore.setState((s) => ({ nodes: { ...s.nodes, [nodeId]: updated } }));
}

// ---------------------------------------------------------------------------
// Export / import (§1)
// ---------------------------------------------------------------------------

export function exportSnapshot(): StoreSnapshot {
  const g = state();
  return {
    nodes: Object.values(g.nodes).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    edges: Object.values(g.edges).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
    events: [...g.events].sort((a, b) => a.seq - b.seq),
  };
}

export async function importSnapshot(snapshot: StoreSnapshot): Promise<void> {
  if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges) || !Array.isArray(snapshot.events)) {
    throw new Error('not a valid .rcanvas.json file');
  }
  for (const n of snapshot.nodes) {
    if (!n.id || !n.type || typeof n.text !== 'string') throw new Error('invalid node in import');
  }
  const events = [...snapshot.events].sort((a, b) => a.seq - b.seq);
  seqCounter = events.length ? events[events.length - 1].seq + 1 : 0;
  const importEv = mkEvent('store_imported', {
    threadId: 'store',
    payload: {
      nodeCount: snapshot.nodes.length,
      edgeCount: snapshot.edges.length,
      eventCount: events.length,
    },
  });
  // Import replaces the store after confirmation and is itself logged (§1).
  await db.transaction('rw', db.nodes, db.edges, db.events, async () => {
    await Promise.all([db.nodes.clear(), db.edges.clear(), db.events.clear()]);
    await db.nodes.bulkAdd(snapshot.nodes);
    await db.edges.bulkAdd(snapshot.edges);
    await db.events.bulkAdd([...events, importEv]);
  });
  graphStore.setState({
    loaded: true,
    nodes: Object.fromEntries(snapshot.nodes.map((n) => [n.id, n])),
    edges: Object.fromEntries(snapshot.edges.map((e) => [e.id, e])),
    events: [...events, importEv],
  });
}
