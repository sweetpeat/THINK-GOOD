import { db } from '../src/model/db';
import { graphStore } from '../src/model/graphStore';
import * as repo from '../src/model/repo';
import type {
  AnyNode,
  ClaimNode,
  DiamondEventNode,
  EvidenceNode,
  IncidentNode,
  QuestionNode,
  VertexNode,
  VertexType,
} from '../src/model/types';

export async function resetStore(): Promise<void> {
  await Promise.all([db.nodes.clear(), db.edges.clear(), db.events.clear()]);
  await repo.loadStore();
}

export const g = () => graphStore.getState();

export async function makeQuestion(text = 'Root question?', threadId = ''): Promise<QuestionNode> {
  return (await repo.createNode({ threadId, type: 'question', text, x: 0, y: 0 })) as QuestionNode;
}

export async function makeClaim(
  threadId: string,
  text = 'A claim',
  judgements?: Record<string, unknown>,
): Promise<ClaimNode> {
  return (await repo.createNode({ threadId, type: 'claim', text, x: 0, y: 0, judgements })) as ClaimNode;
}

export async function makeEvidence(
  threadId: string,
  text = 'Some evidence',
  judgements?: Record<string, unknown>,
): Promise<EvidenceNode> {
  return (await repo.createNode({ threadId, type: 'evidence', text, x: 0, y: 0, judgements })) as EvidenceNode;
}

export async function makeAssumption(
  threadId: string,
  text = 'An assumption',
  judgements?: Record<string, unknown>,
): Promise<AnyNode> {
  return repo.createNode({ threadId, type: 'assumption', text, x: 0, y: 0, judgements });
}

export async function makeIncident(text = 'Intrusion at ACME'): Promise<IncidentNode> {
  return (await repo.createNode({ threadId: '', type: 'incident', text, x: 0, y: 0 })) as IncidentNode;
}

export async function makeEvent(
  threadId: string,
  text = 'An intrusion event',
  judgements?: Record<string, unknown>,
): Promise<DiamondEventNode> {
  return (await repo.createNode({
    threadId, type: 'diamond_event', text, x: 0, y: 0, judgements,
  })) as DiamondEventNode;
}

export async function makeVertex(
  threadId: string,
  role: VertexType,
  text = `A ${role}`,
  judgements?: Record<string, unknown>,
): Promise<VertexNode> {
  return (await repo.createNode({ threadId, type: role, text, x: 0, y: 0, judgements })) as VertexNode;
}
