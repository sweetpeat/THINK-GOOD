import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../src/model/repo';
import {
  competingSet,
  coneReviews,
  disconfirmationCoverage,
  isNonDiagnostic,
  latestSessionEvents,
  queue,
  spine,
  stats,
  threadFamily,
  weakestInput,
} from '../src/model/derive';
import type { LogEvent } from '../src/model/types';
import { g, makeAssumption, makeClaim, makeEvidence, makeQuestion, resetStore } from './helpers';

beforeEach(resetStore);

describe('weakest input (§4.2)', () => {
  it('follows the priority ladder', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id, 'C', { likelihood: 'likely', confidence: 'high' });

    const goodEv = await makeEvidence(q.id, 'good', { sourceReliability: 'B', infoCredibility: 2 });
    await repo.createEdge('consistent_with', goodEv.id, c.id);
    const weakEv = await makeEvidence(q.id, 'weak', { sourceReliability: 'D', infoCredibility: 5 });
    await repo.createEdge('consistent_with', weakEv.id, c.id);
    await repo.declareJudgement(c.id, 'likelihood', 'likely'); // refresh c... (set to same? no-op)
    await repo.declareJudgement(c.id, 'confidence', 'moderate'); // clears staling from edges

    // 4th rung: lowest evidence grade (reliability outranks credibility)
    expect(weakestInput(g(), c.id)).toMatchObject({ kind: 'weak_evidence', node: { id: weakEv.id } });

    // 3rd rung: caveated assumption outranks weak evidence
    const cav = await makeAssumption(q.id, 'caveated one', { validity: 'caveated' });
    await repo.createEdge('rests_on', c.id, cav.id);
    expect(weakestInput(g(), c.id)).toMatchObject({ kind: 'caveated_assumption', node: { id: cav.id } });

    // 2nd rung: a stale (ungraded) dependency outranks caveated
    const ungraded = await makeEvidence(q.id, 'ungraded');
    await repo.createEdge('inconsistent_with', ungraded.id, c.id);
    expect(weakestInput(g(), c.id)).toMatchObject({ kind: 'stale_dependency', node: { id: ungraded.id } });

    // 1st rung: an unsupported assumption beats everything
    const unsupported = await makeAssumption(q.id, 'access implies intent', { validity: 'unsupported' });
    await repo.createEdge('rests_on', c.id, unsupported.id);
    expect(weakestInput(g(), c.id)).toMatchObject({
      kind: 'unsupported_assumption',
      node: { id: unsupported.id },
    });
    expect(weakestInput(g(), c.id)!.caption).toContain('access implies intent');
  });

  it('returns null with no dependencies', async () => {
    const q = await makeQuestion();
    const c = await makeClaim(q.id);
    expect(weakestInput(g(), c.id)).toBeNull();
  });
});

describe('diagnosticity + coverage (§4.3–4.4)', () => {
  it('flags evidence consistent with every claim and inconsistent with none', async () => {
    const q = await makeQuestion();
    const c1 = await makeClaim(q.id, 'H1');
    const c2 = await makeClaim(q.id, 'H2');
    await repo.createEdge('answers', c1.id, q.id);
    await repo.createEdge('answers', c2.id, q.id);
    const set = competingSet(g(), q.id);
    expect(set.map((c) => c.id)).toEqual([c1.id, c2.id]);

    const bland = await makeEvidence(q.id, 'bland');
    await repo.createEdge('consistent_with', bland.id, c1.id);
    expect(isNonDiagnostic(g(), bland.id, set)).toBe(false); // not yet linked to all
    await repo.createEdge('consistent_with', bland.id, c2.id);
    expect(isNonDiagnostic(g(), bland.id, competingSet(g(), q.id))).toBe(true);

    const sharp = await makeEvidence(q.id, 'sharp');
    await repo.createEdge('consistent_with', sharp.id, c1.id);
    await repo.createEdge('inconsistent_with', sharp.id, c2.id);
    expect(isNonDiagnostic(g(), sharp.id, competingSet(g(), q.id))).toBe(false);

    expect(disconfirmationCoverage(g(), c1.id)).toEqual({ count: 0, attempted: false });
    expect(disconfirmationCoverage(g(), c2.id)).toEqual({ count: 1, attempted: true });
  });
});

describe('queue ordering (§4.1)', () => {
  it('orders undermined (oldest cause first) before never_declared (oldest node first)', async () => {
    const q = await makeQuestion();
    const a1 = await makeAssumption(q.id, 'a1', { validity: 'supported' });
    const c1 = await makeClaim(q.id, 'c1', { likelihood: 'likely', confidence: 'high' });
    await repo.createEdge('rests_on', c1.id, a1.id);
    await repo.declareJudgement(c1.id, 'confidence', 'moderate');

    const ungradedOld = await makeEvidence(q.id, 'old ungraded');
    const ungradedNew = await makeClaim(q.id, 'new ungraded');

    await repo.declareJudgement(a1.id, 'validity', 'caveated'); // undermines c1
    const items = queue(g());
    expect(items.map((i) => i.node.id)).toEqual([c1.id, a1.id, ungradedOld.id, ungradedNew.id].filter(
      (id) => id !== a1.id, // a1 is fresh (just declared)
    ));
    expect(items[0].stale.kind).toBe('undermined');
    expect(items[0].cause?.type).toBe('judgement_declared');
  });

  it('groups cone reviews by shared cause', async () => {
    const q = await makeQuestion();
    const e = await makeEvidence(q.id, 'shared', { sourceReliability: 'B', infoCredibility: 2 });
    const c1 = await makeClaim(q.id, 'H1', { likelihood: 'likely', confidence: 'high' });
    const c2 = await makeClaim(q.id, 'H2', { likelihood: 'unlikely', confidence: 'high' });
    await repo.createEdge('consistent_with', e.id, c1.id);
    await repo.createEdge('consistent_with', e.id, c2.id);
    await repo.declareJudgement(c1.id, 'confidence', 'moderate');
    await repo.declareJudgement(c2.id, 'confidence', 'moderate');

    await repo.declareJudgement(e.id, 'infoCredibility', 5);
    const groups = coneReviews(queue(g()));
    expect(groups.size).toBe(1);
    const [items] = [...groups.values()];
    expect(items.map((i) => i.node.id).sort()).toEqual([c1.id, c2.id].sort());
  });
});

describe('threads + spine (§4.5)', () => {
  it('walks the family depth-first and collects adopted claims with their questions', async () => {
    const root = await makeQuestion('Root?');
    const rootAns = await makeClaim(root.id, 'Root answer');
    await repo.createEdge('answers', rootAns.id, root.id);
    await repo.setClaimStatus(rootAns.id, 'adopted');

    const sub = await makeQuestion('Sub?', root.id);
    const subAns = await makeClaim(sub.id, 'Sub answer');
    await repo.createEdge('answers', subAns.id, sub.id);
    await repo.setClaimStatus(subAns.id, 'adopted');

    expect(threadFamily(g(), root.id)).toEqual([root.id, sub.id]);
    const s = spine(g(), root.id);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ question: { id: root.id }, depth: 0 });
    expect(s[0].claims.map((c) => c.id)).toEqual([rootAns.id]);
    expect(s[1]).toMatchObject({ question: { id: sub.id }, depth: 1 });
  });
});

describe('stats + sessions (§4.6, §5.7)', () => {
  it('computes median captureMs and counts from the log alone', async () => {
    const q = await makeQuestion();
    for (const ms of [100, 300, 200]) {
      await repo.createNode({ threadId: q.id, type: 'claim', text: `c${ms}`, x: 0, y: 0, captureMs: ms });
    }
    const s = stats(g());
    expect(s.medianCaptureMs).toBe(200);
    expect(s.nodeCounts).toMatchObject({ question: 1, claim: 3 });
    expect(s.gateOverrides).toBe(0);
  });

  it('finds the latest session after an >8h gap', () => {
    const mk = (at: string, seq: number): LogEvent => ({
      id: `e${seq}`, seq, at, type: 'node_created', threadId: 't', payload: null,
    });
    const events = [
      mk('2026-07-01T09:00:00.000Z', 0),
      mk('2026-07-01T09:30:00.000Z', 1),
      mk('2026-07-02T08:00:00.000Z', 2), // >8h later — new session
      mk('2026-07-02T08:10:00.000Z', 3),
    ];
    expect(latestSessionEvents(events).map((e) => e.seq)).toEqual([2, 3]);
  });
});
