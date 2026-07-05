import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../src/model/repo';
import { queue } from '../src/model/derive';
import { staleStateOf } from '../src/model/types';
import type { ClaimNode, EvidenceNode, QuestionNode } from '../src/model/types';
import { g, makeAssumption, makeClaim, makeEvidence, makeQuestion, resetStore } from './helpers';

beforeEach(resetStore);

describe('P1 — store + log', () => {
  it('every mutation appends at least one event', async () => {
    const q = await makeQuestion();
    expect(g().events.length).toBeGreaterThanOrEqual(2); // thread_created + node_created

    const before = g().events.length;
    const c = await makeClaim(q.id);
    expect(g().events.length).toBe(before + 1);

    await repo.editNodeText(c.id, 'text', 'Edited claim');
    await repo.declareJudgement(c.id, 'likelihood', 'likely');
    await repo.createEdge('answers', c.id, q.id);
    expect(g().events.map((e) => e.type)).toEqual([
      'thread_created',
      'node_created',
      'node_created',
      'node_text_edited',
      'judgement_declared',
      'edge_created',
    ]);
  });

  it('node_created records captureMs', async () => {
    const q = await makeQuestion();
    await repo.createNode({ threadId: q.id, type: 'claim', text: 'timed', x: 0, y: 0, captureMs: 1234 });
    const ev = g().events.filter((e) => e.type === 'node_created').at(-1)!;
    expect((ev.payload as { captureMs: number }).captureMs).toBe(1234);
  });

  it('export → wipe → import round-trips byte-identically (minus the import event)', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id, 'Candidate', { likelihood: 'likely', confidence: 'moderate' });
    const e = await makeEvidence(q.id, 'Signal', { sourceReliability: 'B', infoCredibility: 2 });
    await repo.createEdge('answers', c.id, q.id);
    await repo.createEdge('consistent_with', e.id, c.id);

    const first = repo.exportSnapshot();
    await resetStore();
    expect(g().nodes).toEqual({});

    await repo.importSnapshot(JSON.parse(JSON.stringify(first)));
    const second = repo.exportSnapshot();
    const importEvents = second.events.filter((ev) => ev.type === 'store_imported');
    expect(importEvents).toHaveLength(1);
    expect(JSON.stringify({ ...second, events: second.events.slice(0, -1) })).toBe(
      JSON.stringify(first),
    );
  });

  it('judgement values change only via judgement_declared with after = the selection', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id, 'graded inline', { likelihood: 'unlikely' });
    const declares = g().events.filter((e) => e.type === 'judgement_declared' && e.nodeId === c.id);
    expect(declares).toHaveLength(1);
    expect(declares[0].payload).toEqual({ field: 'likelihood', before: null, after: 'unlikely' });
    // the node_created payload holds the pre-declaration node
    const created = g().events.find((e) => e.type === 'node_created' && e.nodeId === c.id)!;
    expect((created.payload as { node: ClaimNode }).node.likelihood).toBeUndefined();
  });

  it('rejects invalid judgement values and fields', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id);
    await expect(repo.declareJudgement(c.id, 'likelihood', 'certain')).rejects.toThrow();
    await expect(repo.declareJudgement(c.id, 'validity', 'supported')).rejects.toThrow();
  });
});

describe('P1 — edge validity (§2.3)', () => {
  it('enforces the validity matrix', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id);
    const e = await makeEvidence(q.id);
    const a = await makeAssumption(q.id);

    await expect(repo.createEdge('consistent_with', c.id, e.id)).rejects.toThrow();
    await expect(repo.createEdge('rests_on', a.id, c.id)).rejects.toThrow();
    await expect(repo.createEdge('answers', e.id, q.id)).rejects.toThrow();

    await expect(repo.createEdge('consistent_with', e.id, c.id)).resolves.toBeTruthy();
    await expect(repo.createEdge('rests_on', c.id, a.id)).resolves.toBeTruthy();
    await expect(repo.createEdge('answers', c.id, q.id)).resolves.toBeTruthy();
  });

  it('rejects duplicates; consistent/inconsistent replace each other with both events logged', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id);
    const e = await makeEvidence(q.id);
    await repo.createEdge('consistent_with', e.id, c.id);
    await expect(repo.createEdge('consistent_with', e.id, c.id)).rejects.toThrow('already exists');

    await repo.createEdge('inconsistent_with', e.id, c.id);
    const edges = Object.values(g().edges).filter((x) => x.from === e.id && x.to === c.id);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe('inconsistent_with');
    const types = g().events.slice(-2).map((ev) => ev.type);
    expect(types).toEqual(['edge_deleted', 'edge_created']);
  });
});

describe('P2 — retype (§2.2)', () => {
  it('nulls old judgements, logs before-values, deletes invalid edges', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id, 'Will become evidence', {
      likelihood: 'likely',
      confidence: 'high',
    });
    const a = await makeAssumption(q.id);
    await repo.createEdge('answers', c.id, q.id);
    await repo.createEdge('rests_on', c.id, a.id);

    await repo.retypeNode(c.id, 'evidence');
    const node = g().nodes[c.id] as EvidenceNode;
    expect(node.type).toBe('evidence');
    expect((node as unknown as ClaimNode).likelihood).toBeUndefined();
    expect(node.text).toBe('Will become evidence');

    const retypeEv = g().events.find((e) => e.type === 'node_retyped')!;
    const payload = retypeEv.payload as { before: { type: string; judgements: Record<string, unknown> } };
    expect(payload.before.type).toBe('claim');
    expect(payload.before.judgements.likelihood).toBe('likely');
    expect(payload.before.judgements.confidence).toBe('high');

    // claim→question and claim→assumption edges are invalid from evidence
    expect(Object.values(g().edges)).toHaveLength(0);
    expect(g().events.filter((e) => e.type === 'edge_deleted')).toHaveLength(2);
  });

  it('root questions cannot be retyped', async () => {
    const q = await makeQuestion();
    await expect(repo.retypeNode(q.id, 'claim')).rejects.toThrow('root question');
  });
});

describe('P3 — staleness + queue (§2.7, §4.1)', () => {
  it('retyping a node with 3 dependents yields exactly 3 undermined items, zero changed judgements', async () => {
    const q = await makeQuestion();
    const e = await makeEvidence(q.id, 'shared evidence', { sourceReliability: 'B', infoCredibility: 2 });
    const claims: ClaimNode[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await makeClaim(q.id, `H${i + 1}`, { likelihood: 'likely', confidence: 'moderate' });
      await repo.createEdge('consistent_with', e.id, c.id);
      claims.push(c);
    }
    // fresh baseline: re-declare each claim so nothing is stale
    for (const c of claims) await repo.declareJudgement(c.id, 'likelihood', 'unlikely');

    await repo.retypeNode(e.id, 'assumption');
    const items = queue(g());
    const undermined = items.filter((i) => i.stale.kind === 'undermined');
    expect(undermined).toHaveLength(3);
    expect(new Set(undermined.map((i) => i.node.id))).toEqual(new Set(claims.map((c) => c.id)));
    for (const c of claims) {
      const n = g().nodes[c.id] as ClaimNode;
      expect(n.likelihood).toBe('unlikely'); // zero changed judgement values
      expect(n.confidence).toBe('moderate');
    }
    // the retyped node itself derives never_declared (judgements nulled)
    expect(staleStateOf(g().nodes[e.id]).kind).toBe('never_declared');
  });

  it('affirm-all clears undermined items with logged affirmations', async () => {
    const q = await makeQuestion();
    const e = await makeEvidence(q.id, 'ev', { sourceReliability: 'C', infoCredibility: 3 });
    const c1 = await makeClaim(q.id, 'H1', { likelihood: 'likely', confidence: 'low' });
    const c2 = await makeClaim(q.id, 'H2', { likelihood: 'unlikely', confidence: 'low' });
    await repo.createEdge('consistent_with', e.id, c1.id);
    await repo.createEdge('inconsistent_with', e.id, c2.id);
    await repo.declareJudgement(c1.id, 'confidence', 'moderate');
    await repo.declareJudgement(c2.id, 'confidence', 'moderate');

    await repo.declareJudgement(e.id, 'sourceReliability', 'F'); // stales both claims
    const undermined = queue(g()).filter((i) => i.stale.kind === 'undermined');
    expect(undermined).toHaveLength(2);
    // both share one cause: eligible for cone review
    const causes = new Set(undermined.map((i) => (i.stale as { causeEventId: string }).causeEventId));
    expect(causes.size).toBe(1);

    for (const item of undermined) await repo.affirmNode(item.node.id);
    expect(queue(g()).filter((i) => i.stale.kind === 'undermined')).toHaveLength(0);
    const affirmed = g().events.filter((ev) => ev.type === 'judgement_affirmed');
    expect(affirmed).toHaveLength(2);
    expect(g().nodes[c1.id].stale.kind).toBe('fresh');
  });

  it('declaring a judgement clears the node and stales its cone', async () => {
    const q = await makeQuestion();
    const a = await makeAssumption(q.id, 'assumption', { validity: 'supported' });
    const c = await makeClaim(q.id, 'claim', { likelihood: 'likely', confidence: 'high' });
    await repo.createEdge('rests_on', c.id, a.id);
    await repo.declareJudgement(c.id, 'confidence', 'moderate'); // clears edge-staling on c

    await repo.declareJudgement(a.id, 'validity', 'caveated');
    expect(g().nodes[a.id].stale.kind).toBe('fresh');
    expect(g().nodes[c.id].stale.kind).toBe('undermined');
  });

  it('undermined nodes keep their earliest cause', async () => {
    const q = await makeQuestion();
    const a = await makeAssumption(q.id, 'a', { validity: 'supported' });
    const c = await makeClaim(q.id, 'c', { likelihood: 'likely', confidence: 'high' });
    await repo.createEdge('rests_on', c.id, a.id);
    await repo.declareJudgement(c.id, 'confidence', 'moderate');

    await repo.declareJudgement(a.id, 'validity', 'caveated');
    const firstCause = (g().nodes[c.id].stale as { causeEventId: string }).causeEventId;
    await repo.declareJudgement(a.id, 'validity', 'unsupported');
    expect((g().nodes[c.id].stale as { causeEventId: string }).causeEventId).toBe(firstCause);
  });

  it('questions never hold undermined; text edits stale nothing', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id, 'ans', { likelihood: 'likely', confidence: 'high' });
    await repo.createEdge('answers', c.id, q.id);
    await repo.setClaimStatus(c.id, 'adopted');
    await repo.declareJudgement(c.id, 'likelihood', 'highly_likely'); // stales q's cone — q skipped
    expect(g().nodes[q.id].stale.kind).toBe('fresh');

    const before = queue(g()).length;
    await repo.editNodeText(c.id, 'text', 'renamed answer');
    expect(queue(g()).length).toBe(before);
  });
});

describe('P5 — promotion (§2.6)', () => {
  async function promoted() {
    const root = await makeQuestion('Root?');
    const sub = (await makeQuestion('Sub?', root.id)) as QuestionNode;
    const ans = await makeClaim(sub.id, 'Sub answer', { likelihood: 'likely', confidence: 'moderate' });
    await repo.createEdge('answers', ans.id, sub.id);
    await repo.setClaimStatus(ans.id, 'adopted');
    const p = await repo.promoteAnswer(ans.id, 'evidence', { x: 10, y: 10 });
    return { root, sub, ans, p };
  }

  it('creates an ungraded node in the parent with derivedFrom', async () => {
    const { root, ans, p } = await promoted();
    expect(p.threadId).toBe(root.id);
    expect(p.derivedFrom).toBe(ans.id);
    expect(p.type).toBe('evidence');
    expect(p.text).toBe('Sub answer');
    expect(staleStateOf(p).kind).toBe('never_declared');
    expect(g().events.at(-1)!.type).toBe('node_promoted');
  });

  it('source claim changes stale the promoted node (source changed)', async () => {
    const { ans, p } = await promoted();
    await repo.declareJudgement(p.id, 'sourceReliability', 'B');
    await repo.declareJudgement(p.id, 'infoCredibility', 2);
    expect(staleStateOf(g().nodes[p.id]).kind).toBe('fresh');

    await repo.declareJudgement(ans.id, 'likelihood', 'unlikely');
    const s = staleStateOf(g().nodes[p.id]);
    expect(s.kind).toBe('undermined');
    const cause = g().events.find((e) => e.id === (s as { causeEventId: string }).causeEventId)!;
    expect(cause.nodeId).toBe(ans.id);
  });
});

describe('P7 — adoption (§5.5)', () => {
  it('gate overrides require a reason and are logged before the status change', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id, 'H1');
    await repo.createEdge('answers', c.id, q.id);
    await expect(
      repo.setClaimStatus(c.id, 'adopted', {
        gateOverrides: [{ gate: 'rival_stronger', snapshot: {}, reason: '  ' }],
      }),
    ).rejects.toThrow('reason');

    await repo.setClaimStatus(c.id, 'adopted', {
      ceremony: { rivals: [] },
      gateOverrides: [{ gate: 'unsupported_linchpin', snapshot: { assumptions: [] }, reason: 'accepting risk' }],
    });
    const types = g().events.slice(-3).map((e) => e.type);
    expect(types).toEqual(['gate_overridden', 'claim_status_changed', 'question_status_changed']);
    expect(g().events.at(-3)!.reason).toBe('accepting risk');
    expect((g().nodes[q.id] as QuestionNode).status).toBe('answered');
  });

  it('mutually exclusive questions refuse a second adoption; reversal reopens', async () => {
    const q = await makeQuestion();
    await repo.declareJudgement(q.id, 'mutuallyExclusive', true);
    const c1 = await makeClaim(q.id, 'H1');
    const c2 = await makeClaim(q.id, 'H2');
    await repo.createEdge('answers', c1.id, q.id);
    await repo.createEdge('answers', c2.id, q.id);

    await repo.setClaimStatus(c1.id, 'adopted');
    await expect(repo.setClaimStatus(c2.id, 'adopted')).rejects.toThrow('mutually exclusive');

    await repo.setClaimStatus(c1.id, 'open');
    expect((g().nodes[q.id] as QuestionNode).status).toBe('open');
    await expect(repo.setClaimStatus(c2.id, 'adopted')).resolves.toBeUndefined();
  });

  it('ceremony snapshot is stored in the adoption event', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id, 'H1');
    await repo.createEdge('answers', c.id, q.id);
    const snapshot = { rivals: [{ text: 'H2', iCount: 2 }] };
    await repo.setClaimStatus(c.id, 'adopted', { ceremony: snapshot });
    const ev = g().events.find((e) => e.type === 'claim_status_changed')!;
    expect((ev.payload as { ceremony: unknown }).ceremony).toEqual(snapshot);
  });
});

describe('soft delete', () => {
  it('hides the node, deletes its edges, and keeps a snapshot in the log', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id, 'doomed', { likelihood: 'likely', confidence: 'low' });
    const e = await makeEvidence(q.id, 'ev', { sourceReliability: 'A', infoCredibility: 1 });
    await repo.createEdge('consistent_with', e.id, c.id);
    await repo.deleteNode(e.id);

    expect(g().nodes[e.id].deletedAt).toBeTruthy();
    expect(Object.values(g().edges)).toHaveLength(0);
    const ev = g().events.find((x) => x.type === 'node_deleted')!;
    expect((ev.payload as { node: EvidenceNode }).node.text).toBe('ev');
    // the consuming claim was staled by losing its input
    expect(g().nodes[c.id].stale.kind).toBe('undermined');
  });
});
