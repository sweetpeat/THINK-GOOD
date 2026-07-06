// Data model per spec §2–§3. Closed enums, open text: every field the machine
// consumes is a closed enum; free-text fields never affect computation.

export type NodeType = 'question' | 'claim' | 'assumption' | 'evidence';

export type Likelihood =
  | 'remote_chance'
  | 'highly_unlikely'
  | 'unlikely'
  | 'realistic_possibility'
  | 'likely'
  | 'highly_likely'
  | 'almost_certain';

export type Confidence = 'low' | 'moderate' | 'high';
export type Validity = 'supported' | 'caveated' | 'unsupported';
export type SourceReliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type InfoCredibility = 1 | 2 | 3 | 4 | 5 | 6;
export type Priority = 'low' | 'moderate' | 'high';

// 'never_declared' is derived on the fly from null judgement fields and is
// never stored; only 'fresh' | 'undermined' persist on the node (§2.7).
export type StaleState =
  | { kind: 'fresh' }
  | { kind: 'never_declared' }
  | { kind: 'undermined'; causeEventId: string };

export interface BaseNode {
  id: string;
  type: NodeType;
  text: string; // free text; never machine-read
  note?: string; // free text; never machine-read
  threadId: string;
  x: number;
  y: number;
  createdAt: string;
  derivedFrom?: string; // claim id this node was promoted from (§2.6)
  stale: { kind: 'fresh' } | { kind: 'undermined'; causeEventId: string };
  deletedAt?: string; // soft delete
}

export interface QuestionNode extends BaseNode {
  type: 'question';
  status: 'open' | 'answered';
  mutuallyExclusive: boolean;
  priority?: Priority;
  parentThreadId?: string; // set on sub-questions; null/absent on root questions
}

export interface ClaimNode extends BaseNode {
  type: 'claim';
  status: 'open' | 'adopted';
  likelihood?: Likelihood;
  confidence?: Confidence;
}

export interface AssumptionNode extends BaseNode {
  type: 'assumption';
  validity?: Validity;
  linchpin: boolean;
  abandonTrigger?: string; // free text; never machine-read
}

export interface EvidenceNode extends BaseNode {
  type: 'evidence';
  sourceReliability?: SourceReliability;
  infoCredibility?: InfoCredibility;
  sourceNote?: string; // free text; never machine-read
}

export type AnyNode = QuestionNode | ClaimNode | AssumptionNode | EvidenceNode;

export type EdgeType = 'consistent_with' | 'inconsistent_with' | 'rests_on' | 'answers';

export interface Edge {
  id: string;
  type: EdgeType;
  from: string;
  to: string;
  createdAt: string;
}

export type EventType =
  | 'node_created'
  | 'node_text_edited'
  | 'node_retyped'
  | 'judgement_declared'
  | 'judgement_affirmed'
  | 'node_deleted'
  | 'edge_created'
  | 'edge_deleted'
  | 'claim_status_changed'
  | 'gate_overridden'
  | 'node_promoted'
  | 'question_status_changed'
  | 'store_imported'
  | 'thread_created';

export interface LogEvent {
  id: string;
  seq: number; // monotonic insertion order (timestamps may collide)
  at: string; // ISO-8601 UTC
  type: EventType;
  nodeId?: string;
  edgeId?: string;
  threadId: string;
  payload: unknown;
  reason?: string; // REQUIRED for gate overrides; optional elsewhere
}

export interface StoreSnapshot {
  nodes: AnyNode[];
  edges: Edge[];
  events: LogEvent[];
}

// Edge validity matrix (§2.3). The only (type, from-type, to-type) triples that exist.
export const EDGE_VALIDITY: Record<EdgeType, { from: NodeType; to: NodeType }> = {
  consistent_with: { from: 'evidence', to: 'claim' },
  inconsistent_with: { from: 'evidence', to: 'claim' },
  rests_on: { from: 'claim', to: 'assumption' },
  answers: { from: 'claim', to: 'question' },
};

export function validEdgeTypes(fromType: NodeType, toType: NodeType): EdgeType[] {
  return (Object.keys(EDGE_VALIDITY) as EdgeType[]).filter(
    (t) => EDGE_VALIDITY[t].from === fromType && EDGE_VALIDITY[t].to === toType,
  );
}

/** The node types a given type may link *to* (outgoing edges only). Used to
    tell the user what to aim a link at before they draw it. */
export function edgeTargetsFrom(fromType: NodeType): NodeType[] {
  const targets = new Set<NodeType>();
  for (const t of Object.keys(EDGE_VALIDITY) as EdgeType[]) {
    if (EDGE_VALIDITY[t].from === fromType) targets.add(EDGE_VALIDITY[t].to);
  }
  return [...targets];
}

// Core judgement fields per type: these are what "fully graded" (§2.2) means,
// what staling watches, and what declaring/affirming clears (§2.7).
export const JUDGEMENT_FIELDS: Record<NodeType, string[]> = {
  question: [],
  claim: ['likelihood', 'confidence'],
  assumption: ['validity'],
  evidence: ['sourceReliability', 'infoCredibility'],
};

export function declaredJudgements(node: AnyNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of JUDGEMENT_FIELDS[node.type]) {
    const v = (node as unknown as Record<string, unknown>)[f];
    if (v !== undefined && v !== null) out[f] = v;
  }
  return out;
}

export function isFullyGraded(node: AnyNode): boolean {
  return JUDGEMENT_FIELDS[node.type].every(
    (f) => (node as unknown as Record<string, unknown>)[f] != null,
  );
}

// Display staleness (§2.7): stored 'undermined' wins; otherwise a missing
// required judgement derives 'never_declared'; questions are always fresh.
export function staleStateOf(node: AnyNode): StaleState {
  if (node.stale.kind === 'undermined') return node.stale;
  if (node.type !== 'question' && !isFullyGraded(node)) return { kind: 'never_declared' };
  return { kind: 'fresh' };
}
