// Diamond Model workflow (diamond spec §5): model-layer acceptance tests.

import { beforeEach, describe, expect, it } from 'vitest';
import * as repo from '../src/model/repo';
import {
  diamondEvents,
  diamondGaps,
  killChain,
  missingRoles,
  eventsCharacterizedBy,
  stats,
  threadWorkflow,
  verticesOf,
} from '../src/model/derive';
import { staleStateOf } from '../src/model/types';
import type { ClaimNode, DiamondEventNode, IncidentNode, VertexNode } from '../src/model/types';
import {
  g,
  makeClaim,
  makeEvent,
  makeEvidence,
  makeIncident,
  makeQuestion,
  makeVertex,
  resetStore,
} from './helpers';

beforeEach(resetStore);

describe('D1 — creation and placement rules (diamond spec §1.1)', () => {
  it('an incident is root-only and anchors its own thread', async () => {
    const inc = await makeIncident();
    expect(inc.threadId).toBe(inc.id);
    expect(inc.status).toBe('open');
    const threadEv = g().events.find((e) => e.type === 'thread_created')!;
    expect(threadEv.payload).toMatchObject({ workflow: 'diamond' });
    expect(threadWorkflow(g(), inc.id)).toBe('diamond');

    await expect(
      repo.createNode({ threadId: inc.id, type: 'incident', text: 'nested', x: 0, y: 0 }),
    ).rejects.toThrow('home screen');
  });

  it('events and vertices only exist inside incident threads', async () => {
    const q = await makeQuestion();
    await expect(makeEvent(q.id)).rejects.toThrow('incident thread');
    await expect(makeVertex(q.id, 'adversary')).rejects.toThrow('incident thread');

    const inc = await makeIncident();
    await expect(makeEvent(inc.id)).resolves.toMatchObject({ type: 'diamond_event' });
    await expect(makeVertex(inc.id, 'victim')).resolves.toMatchObject({ type: 'victim' });
  });

  it('questions cannot be created inside an incident thread; claims and evidence can', async () => {
    const inc = await makeIncident();
    await expect(makeQuestion('Sub?', inc.id)).rejects.toThrow('not supported');
    await expect(makeClaim(inc.id, 'Assessment')).resolves.toBeTruthy();
    await expect(makeEvidence(inc.id, 'Pcap')).resolves.toBeTruthy();
  });

  it('retype guards: incidents immovable, diamond types stay in incident threads', async () => {
    const inc = await makeIncident();
    const q = await makeQuestion();
    const ev = await makeEvidence(q.id, 'in ACH thread');
    const vert = await makeVertex(inc.id, 'adversary');

    await expect(repo.retypeNode(inc.id, 'question')).rejects.toThrow('cannot be retyped');
    await expect(repo.retypeNode(ev.id, 'adversary')).rejects.toThrow('incident thread');
    await expect(repo.retypeNode(vert.id, 'question')).rejects.toThrow('not supported');
    await expect(repo.retypeNode(vert.id, 'incident')).rejects.toThrow('home screen');
  });

  it('retyping a vertex between roles keeps its characterizes edges; out of the family deletes them', async () => {
    const inc = await makeIncident();
    const event = await makeEvent(inc.id);
    const v = await makeVertex(inc.id, 'adversary');
    await repo.createEdge('characterizes', v.id, event.id);

    await repo.retypeNode(v.id, 'infrastructure');
    expect(Object.values(g().edges)).toHaveLength(1); // edge survives, diamond re-slots
    expect(verticesOf(g(), event.id).infrastructure.map((x) => x.id)).toEqual([v.id]);

    await repo.retypeNode(v.id, 'evidence');
    expect(Object.values(g().edges)).toHaveLength(0);
    expect(g().events.filter((e) => e.type === 'edge_deleted')).toHaveLength(1);
  });
});

describe('D1 — edge validity (diamond spec §1.2)', () => {
  it('enforces the extended matrix', async () => {
    const inc = await makeIncident();
    const event = await makeEvent(inc.id);
    const adv = await makeVertex(inc.id, 'adversary');
    const ev = await makeEvidence(inc.id, 'SSL cert reuse');
    const claim = await makeClaim(inc.id, 'Assessment');

    await expect(repo.createEdge('characterizes', adv.id, event.id)).resolves.toBeTruthy();
    await expect(repo.createEdge('characterizes', ev.id, event.id)).rejects.toThrow();
    await expect(repo.createEdge('characterizes', adv.id, claim.id)).rejects.toThrow();
    await expect(repo.createEdge('consistent_with', ev.id, adv.id)).resolves.toBeTruthy();
    await expect(repo.createEdge('answers', claim.id, inc.id)).resolves.toBeTruthy();
    await expect(repo.createEdge('answers', claim.id, event.id)).rejects.toThrow();
  });

  it('consistent/inconsistent replace each other on evidence→vertex pairs', async () => {
    const inc = await makeIncident();
    const infra = await makeVertex(inc.id, 'infrastructure');
    const ev = await makeEvidence(inc.id, 'passive DNS');
    await repo.createEdge('consistent_with', ev.id, infra.id);
    await repo.createEdge('inconsistent_with', ev.id, infra.id);
    const edges = Object.values(g().edges).filter((e) => e.from === ev.id && e.to === infra.id);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe('inconsistent_with');
    expect(g().events.slice(-2).map((e) => e.type)).toEqual(['edge_deleted', 'edge_created']);
  });
});

describe('D1 — judgements on diamond nodes', () => {
  it('accepts the closed enums and rejects strays', async () => {
    const inc = await makeIncident();
    const event = await makeEvent(inc.id);
    const v = await makeVertex(inc.id, 'capability');

    await repo.declareJudgement(event.id, 'phase', 'delivery');
    await repo.declareJudgement(event.id, 'result', 'success');
    await repo.declareJudgement(event.id, 'direction', 'adversary_to_infrastructure');
    await repo.declareJudgement(v.id, 'confidence', 'moderate');

    await expect(repo.declareJudgement(event.id, 'phase', 'lateral_movement')).rejects.toThrow();
    await expect(repo.declareJudgement(v.id, 'validity', 'supported')).rejects.toThrow();
    await expect(repo.declareJudgement(inc.id, 'phase', 'delivery')).rejects.toThrow();

    expect((g().nodes[event.id] as DiamondEventNode).phase).toBe('delivery');
    expect(staleStateOf(g().nodes[event.id]).kind).toBe('fresh'); // fully graded
    expect(staleStateOf(g().nodes[v.id]).kind).toBe('fresh');
  });

  it('occurredAt is a structured ISO date and an annotation (logs, never stales or clears)', async () => {
    const inc = await makeIncident();
    const event = await makeEvent(inc.id);
    await expect(repo.declareJudgement(event.id, 'occurredAt', 'last tuesday')).rejects.toThrow('ISO-8601');
    await repo.declareJudgement(event.id, 'occurredAt', '2026-06-12');
    expect((g().nodes[event.id] as DiamondEventNode).occurredAt).toBe('2026-06-12');
    // still never_declared: occurredAt is not a grade
    expect(staleStateOf(g().nodes[event.id]).kind).toBe('never_declared');
    const ev = g().events.at(-1)!;
    expect(ev.type).toBe('judgement_declared');
    expect(ev.payload).toMatchObject({ field: 'occurredAt', after: '2026-06-12' });
  });
});

describe('D1 — the staling chain (diamond spec §1.3)', () => {
  async function freshChain() {
    const inc = await makeIncident();
    const event = await makeEvent(inc.id, 'C2 beaconing', {
      phase: 'command_and_control', result: 'success', direction: 'bidirectional',
    });
    const infra = await makeVertex(inc.id, 'infrastructure', 'bulletproof host', { confidence: 'moderate' });
    const ev = await makeEvidence(inc.id, 'netflow to host', { sourceReliability: 'B', infoCredibility: 2 });
    const assess = await makeClaim(inc.id, 'APT-Q ran this intrusion', { likelihood: 'likely', confidence: 'moderate' });
    await repo.createEdge('consistent_with', ev.id, infra.id);
    await repo.createEdge('characterizes', infra.id, event.id);
    await repo.createEdge('answers', assess.id, inc.id);
    await repo.setClaimStatus(assess.id, 'adopted');
    // edge creation staled the consumers — affirm to a fresh baseline
    for (const id of [infra.id, event.id, assess.id]) await repo.affirmNode(id);
    return { inc, event, infra, ev, assess };
  }

  it('evidence regrade undermines vertex → event → assessment; incident stays fresh; no values change', async () => {
    const { inc, event, infra, ev, assess } = await freshChain();
    for (const id of [infra.id, event.id, assess.id]) {
      expect(staleStateOf(g().nodes[id]).kind).toBe('fresh');
    }

    await repo.declareJudgement(ev.id, 'sourceReliability', 'E');
    const cause = g().events.at(-1)!.id;
    for (const id of [infra.id, event.id, assess.id]) {
      const s = staleStateOf(g().nodes[id]);
      expect(s.kind).toBe('undermined');
      expect((s as { causeEventId: string }).causeEventId).toBe(cause);
    }
    expect(staleStateOf(g().nodes[inc.id]).kind).toBe('fresh'); // incidents never stale
    // zero judgement values changed by the system
    expect((g().nodes[infra.id] as VertexNode).confidence).toBe('moderate');
    expect((g().nodes[event.id] as DiamondEventNode).result).toBe('success');
    expect((g().nodes[assess.id] as ClaimNode).likelihood).toBe('likely');
  });

  it('regrading a vertex undermines only its events and the assessment', async () => {
    const { event, infra, assess } = await freshChain();
    await repo.declareJudgement(infra.id, 'confidence', 'low');
    expect(staleStateOf(g().nodes[infra.id]).kind).toBe('fresh'); // declaring clears self
    expect(staleStateOf(g().nodes[event.id]).kind).toBe('undermined');
    expect(staleStateOf(g().nodes[assess.id]).kind).toBe('undermined');
  });
});

describe('D2 — derivations (diamond spec §2)', () => {
  it('orders events by phase → occurredAt → createdAt and assembles lanes', async () => {
    const inc = await makeIncident();
    const c2 = await makeEvent(inc.id, 'beaconing', { phase: 'command_and_control' });
    const del2 = await makeEvent(inc.id, 'second lure', { phase: 'delivery', occurredAt: '2026-06-14' });
    const del1 = await makeEvent(inc.id, 'first lure', { phase: 'delivery', occurredAt: '2026-06-12' });
    const unphased = await makeEvent(inc.id, 'odd artifact');

    expect(diamondEvents(g(), inc.id).map((e) => e.id)).toEqual([del1.id, del2.id, c2.id, unphased.id]);

    const lanes = killChain(g(), inc.id);
    expect(lanes).toHaveLength(8); // 7 phases + unphased
    expect(lanes[2].phase).toBe('delivery');
    expect(lanes[2].events.map((e) => e.id)).toEqual([del1.id, del2.id]);
    expect(lanes[0].events).toHaveLength(0); // empty lanes render
    expect(lanes[7].phase).toBeNull();
    expect(lanes[7].events.map((e) => e.id)).toEqual([unphased.id]);

    await repo.declareJudgement(unphased.id, 'phase', 'exploitation');
    expect(killChain(g(), inc.id)).toHaveLength(7); // unphased lane only when needed
  });

  it('derives missing roles, gaps, and the pivot list', async () => {
    const inc = await makeIncident();
    const e1 = await makeEvent(inc.id, 'delivery', {
      phase: 'delivery', result: 'success', direction: 'infrastructure_to_victim',
    });
    const e2 = await makeEvent(inc.id, 'C2', {
      phase: 'command_and_control', result: 'success', direction: 'bidirectional',
    });
    const infra = await makeVertex(inc.id, 'infrastructure', 'shared C2 host', { confidence: 'high' });
    const vic = await makeVertex(inc.id, 'victim', 'ACME mail server', { confidence: 'high' });
    await repo.createEdge('characterizes', infra.id, e1.id);
    await repo.createEdge('characterizes', infra.id, e2.id);
    await repo.createEdge('characterizes', vic.id, e1.id);
    for (const id of [e1.id, e2.id]) await repo.affirmNode(id);

    expect(missingRoles(g(), e1.id)).toEqual(['adversary', 'capability']);
    expect(eventsCharacterizedBy(g(), infra.id).map((e) => e.id)).toEqual([e1.id, e2.id]); // the pivot

    const gaps = diamondGaps(g(), inc.id);
    const missing = gaps.filter((x) => x.kind === 'missing_vertex');
    expect(missing).toHaveLength(5); // 2 on e1, 3 on e2
    expect(gaps.filter((x) => x.kind === 'ungraded')).toHaveLength(0);

    const ungraded = await makeVertex(inc.id, 'adversary', 'unknown actor');
    await repo.createEdge('characterizes', ungraded.id, e1.id);
    await repo.affirmNode(e1.id);
    const gaps2 = diamondGaps(g(), inc.id);
    expect(gaps2.filter((x) => x.kind === 'missing_vertex')).toHaveLength(4);
    expect(gaps2.filter((x) => x.kind === 'ungraded').map((x) => (x as { node: { id: string } }).node.id)).toEqual([ungraded.id]);
  });

  it('counts every node type in stats', async () => {
    const inc = await makeIncident();
    await makeEvent(inc.id);
    await makeVertex(inc.id, 'adversary');
    const s = stats(g());
    expect(s.nodeCounts).toMatchObject({ incident: 1, diamond_event: 1, adversary: 1, victim: 0 });
    expect(Number.isNaN(s.nodeCounts.diamond_event)).toBe(false);
  });
});

describe('D4 — assessment adoption (diamond spec §3.4)', () => {
  it('adoption flips the incident to assessed; reversal reopens when no assessment remains', async () => {
    const inc = await makeIncident();
    const a1 = await makeClaim(inc.id, 'APT-Q did it');
    const a2 = await makeClaim(inc.id, 'A criminal affiliate did it');
    await repo.createEdge('answers', a1.id, inc.id);
    await repo.createEdge('answers', a2.id, inc.id);

    await repo.setClaimStatus(a1.id, 'adopted');
    expect((g().nodes[inc.id] as IncidentNode).status).toBe('assessed');
    const flip = g().events.find((e) => e.type === 'incident_status_changed')!;
    expect(flip.payload).toMatchObject({ after: 'assessed', byClaim: a1.id });

    // multiple adopted assessments are allowed (no ME on incidents in v1)
    await repo.setClaimStatus(a2.id, 'adopted');
    await repo.setClaimStatus(a1.id, 'open');
    expect((g().nodes[inc.id] as IncidentNode).status).toBe('assessed'); // a2 remains

    await repo.setClaimStatus(a2.id, 'open');
    expect((g().nodes[inc.id] as IncidentNode).status).toBe('open');
  });

  it('the diamond_gaps gate override requires a reason and lands in the log', async () => {
    const inc = await makeIncident();
    const a = await makeClaim(inc.id, 'Assessment');
    await repo.createEdge('answers', a.id, inc.id);

    await expect(
      repo.setClaimStatus(a.id, 'adopted', {
        gateOverrides: [{ gate: 'diamond_gaps', snapshot: {}, reason: '' }],
      }),
    ).rejects.toThrow('reason');

    await repo.setClaimStatus(a.id, 'adopted', {
      ceremony: { gaps: 3 },
      gateOverrides: [{ gate: 'diamond_gaps', snapshot: { gaps: 3 }, reason: 'time-boxed assessment; collection continues' }],
    });
    const gate = g().events.find((e) => e.type === 'gate_overridden')!;
    expect(gate.payload).toMatchObject({ gate: 'diamond_gaps' });
    expect(gate.reason).toBe('time-boxed assessment; collection continues');
    expect(g().events.at(-1)!.type).toBe('incident_status_changed');
  });

  it('deleting the adopted assessment reopens the incident', async () => {
    const inc = await makeIncident();
    const a = await makeClaim(inc.id, 'Assessment');
    await repo.createEdge('answers', a.id, inc.id);
    await repo.setClaimStatus(a.id, 'adopted');
    await repo.deleteNode(a.id);
    expect((g().nodes[inc.id] as IncidentNode).status).toBe('open');
  });
});
