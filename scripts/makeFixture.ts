// Generates fixtures/example.rcanvas.json (§7) by driving the real repo
// against an in-memory IndexedDB, then rewriting timestamps so the log spans
// three past sessions (>8h gaps) — making type-history, staleness, the queue,
// cone review, and the re-entry briefing all demo on first load.
//
// Run: npm run fixture

import 'fake-indexeddb/auto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const repo = await import('../src/model/repo');
  await repo.loadStore();

  const mk = (threadId: string, type: 'question' | 'claim' | 'assumption' | 'evidence', text: string, x: number, y: number, judgements?: Record<string, unknown>, captureMs?: number) =>
    repo.createNode({ threadId, type, text, x, y, judgements, captureMs: captureMs ?? 3000 + Math.floor(((x + y) % 70) * 100) });

  // ---- Session 1: capture -------------------------------------------------
  const rootQ = await mk('', 'question', 'Is APT-Q responsible for the intrusion at ACME?', 420, 40);
  await repo.declareJudgement(rootQ.id, 'mutuallyExclusive', true);

  const h1 = await mk(rootQ.id, 'claim', 'APT-Q conducted the intrusion', 140, 230, { likelihood: 'likely', confidence: 'moderate' });
  const h2 = await mk(rootQ.id, 'claim', 'A criminal affiliate reused APT-Q tooling', 430, 230, { likelihood: 'realistic_possibility', confidence: 'low' });
  const h3 = await mk(rootQ.id, 'claim', 'An insider staged the intrusion to look external', 720, 230, { likelihood: 'unlikely', confidence: 'low' });
  await repo.createEdge('answers', h1.id, rootQ.id);
  await repo.createEdge('answers', h2.id, rootQ.id);
  await repo.createEdge('answers', h3.id, rootQ.id);

  const a1 = await mk(rootQ.id, 'assumption', 'Code overlap implies common authorship', 60, 430, { validity: 'caveated', linchpin: true });
  await repo.editNodeText(a1.id, 'abandonTrigger', 'KESTREL source or builder leaks publicly');
  const a2 = await mk(rootQ.id, 'assumption', "ACME's VPN logs are complete and untampered", 640, 430, { validity: 'supported' });
  const a3 = await mk(rootQ.id, 'assumption', 'Access implies intent', 880, 430, { validity: 'unsupported', linchpin: true });
  const a4 = await mk(rootQ.id, 'assumption', 'APT-Q does not share infrastructure with affiliates', 300, 430, { validity: 'caveated' });
  await repo.createEdge('rests_on', h1.id, a1.id);
  await repo.createEdge('rests_on', h1.id, a4.id);
  await repo.createEdge('rests_on', h3.id, a2.id);
  await repo.createEdge('rests_on', h3.id, a3.id);

  // E1 is captured as a claim, then retyped — seeds type-history (§5.1)
  const e1 = await mk(rootQ.id, 'claim', "Loader shares code with APT-Q's KESTREL implant", 80, 640);
  await repo.retypeNode(e1.id, 'evidence');
  await repo.declareJudgement(e1.id, 'sourceReliability', 'B');
  await repo.declareJudgement(e1.id, 'infoCredibility', 2);

  const e2 = await mk(rootQ.id, 'evidence', 'C2 infrastructure overlaps a 2024 APT-Q campaign', 320, 640, { sourceReliability: 'B', infoCredibility: 3 });
  const e3 = await mk(rootQ.id, 'evidence', 'Commodity credential-dumping tools used throughout', 560, 640, { sourceReliability: 'C', infoCredibility: 3 });
  const e4 = await mk(rootQ.id, 'evidence', 'VPN logs show access from inside the HQ subnet', 800, 640, { sourceReliability: 'D', infoCredibility: 4 });
  const e5 = await mk(rootQ.id, 'evidence', 'Phishing lure written in fluent corporate English', 1040, 640, { sourceReliability: 'C', infoCredibility: 3 });
  const e6 = await mk(rootQ.id, 'evidence', 'APT-Q is known to sell tooling to affiliates', 200, 800, { sourceReliability: 'B', infoCredibility: 2 });
  const e7 = await mk(rootQ.id, 'evidence', 'Ransom note demands payment in Monero', 460, 800, { sourceReliability: 'C', infoCredibility: 2 });
  const e8 = await mk(rootQ.id, 'evidence', "Forum chatter claims an insider sold ACME access", 720, 800); // deliberately ungraded
  await repo.editNodeText(e8.id, 'sourceNote', 'Single dark-web forum post, unverified');

  // ---- Session 2: linking + the sub-question ------------------------------
  await repo.createEdge('consistent_with', e1.id, h1.id);
  await repo.createEdge('consistent_with', e1.id, h2.id);
  await repo.createEdge('inconsistent_with', e1.id, h3.id);
  await repo.createEdge('consistent_with', e2.id, h1.id);
  await repo.createEdge('inconsistent_with', e2.id, h3.id);
  // e3 is the deliberately non-diagnostic item: consistent with every claim
  await repo.createEdge('consistent_with', e3.id, h1.id);
  await repo.createEdge('consistent_with', e3.id, h2.id);
  await repo.createEdge('consistent_with', e3.id, h3.id);
  await repo.createEdge('consistent_with', e4.id, h3.id);
  await repo.createEdge('inconsistent_with', e4.id, h1.id);
  await repo.createEdge('consistent_with', e5.id, h3.id);
  await repo.createEdge('consistent_with', e5.id, h2.id);
  await repo.createEdge('consistent_with', e6.id, h2.id);
  await repo.createEdge('consistent_with', e7.id, h2.id);
  await repo.createEdge('inconsistent_with', e7.id, h1.id);
  await repo.createEdge('consistent_with', e8.id, h3.id);

  // grades were declared before linking, so the claims staled by the edge
  // events get re-declared here (fresh judgements after seeing the links)
  await repo.declareJudgement(h1.id, 'likelihood', 'likely');
  await repo.declareJudgement(h1.id, 'confidence', 'moderate');
  await repo.declareJudgement(h2.id, 'likelihood', 'realistic_possibility');
  await repo.declareJudgement(h3.id, 'likelihood', 'unlikely');
  await repo.affirmNode(h2.id);
  await repo.affirmNode(h3.id);

  // Sub-question thread (§2.6): "Was the loader custom-built?"
  const sq = await mk(rootQ.id, 'question', 'Was the loader custom-built?', 60, 60);
  const sc1 = await mk(sq.id, 'claim', 'The loader was custom-built for this intrusion', 160, 240, { likelihood: 'likely', confidence: 'moderate' });
  const sc2 = await mk(sq.id, 'claim', 'The loader was assembled from a leaked builder', 460, 240, { likelihood: 'unlikely', confidence: 'low' });
  await repo.createEdge('answers', sc1.id, sq.id);
  await repo.createEdge('answers', sc2.id, sq.id);
  const se1 = await mk(sq.id, 'evidence', 'No builder artifacts for this loader found in the wild', 300, 480, { sourceReliability: 'C', infoCredibility: 2 });
  await repo.createEdge('consistent_with', se1.id, sc1.id);
  await repo.createEdge('inconsistent_with', se1.id, sc2.id);
  await repo.declareJudgement(sc1.id, 'likelihood', 'likely');
  await repo.declareJudgement(sc1.id, 'confidence', 'moderate');
  await repo.affirmNode(sc2.id);

  await repo.setClaimStatus(sc1.id, 'adopted', {
    ceremony: {
      at: new Date().toISOString(),
      candidate: { id: sc1.id, text: sc1.text, iCount: 0 },
      rivals: [{ id: sc2.id, text: sc2.text, status: 'open', iCount: 1, disconfirmationAttempted: true }],
      linchpins: [],
    },
  });

  const p1 = await repo.promoteAnswer(sc1.id, 'evidence', { x: 90, y: 980 });
  await repo.declareJudgement(p1.id, 'sourceReliability', 'B');
  await repo.declareJudgement(p1.id, 'infoCredibility', 3);
  await repo.createEdge('consistent_with', p1.id, h1.id);
  await repo.declareJudgement(h1.id, 'confidence', 'moderate'); // no-op guard
  await repo.affirmNode(h1.id);

  // an open collection gap with priority (Gaps lens + word-picture)
  const gap = await mk(rootQ.id, 'question', 'Who had physical access to the build server?', 1040, 60);
  await repo.declareJudgement(gap.id, 'priority', 'high');

  // ---- The Diamond incident thread (diamond spec §4) ----------------------
  // Same ACME story, worked as an intrusion decomposition: events along the
  // kill chain, a shared C2 infrastructure vertex (the pivot), a deliberately
  // unphased event, missing-adversary gaps, and an open assessment.
  const inc = await repo.createNode({ threadId: '', type: 'incident', text: 'Intrusion at ACME — June 2026', x: 420, y: 40 });

  const dmk = (type: 'diamond_event' | 'adversary' | 'capability' | 'infrastructure' | 'victim' | 'evidence' | 'claim', text: string, x: number, y: number, judgements?: Record<string, unknown>) =>
    repo.createNode({ threadId: inc.id, type, text, x, y, judgements, captureMs: 3000 + Math.floor(((x + y) % 70) * 100) });

  // events sit a diamond-and-a-half apart so corner labels have room to breathe
  const de1 = await dmk('diamond_event', 'Finance-themed phishing lure delivered to 41 staff', 80, 260, { phase: 'delivery', result: 'success', direction: 'infrastructure_to_victim', occurredAt: '2026-06-09' });
  const de2 = await dmk('diamond_event', 'KESTREL loader executed on FIN-WS-041', 540, 260, { phase: 'exploitation', result: 'success', direction: 'infrastructure_to_victim', occurredAt: '2026-06-09' });
  const de3 = await dmk('diamond_event', 'Beaconing to bulletproof host 45.155.87.12', 1000, 260, { phase: 'command_and_control', result: 'success', direction: 'bidirectional', occurredAt: '2026-06-10' });
  const de4 = await dmk('diamond_event', 'Staged archive exfiltrated over HTTPS', 1460, 260, { phase: 'actions_on_objectives', result: 'success', direction: 'victim_to_infrastructure', occurredAt: '2026-06-11' });
  // deliberately unphased + ungraded (and unlinked): shows the Unphased lane and the gaps list
  await dmk('diamond_event', 'RDP login from dormant service account', 1920, 260);

  const vAdv = await dmk('adversary', 'Unattributed — tracked as UNC-ACME', 1010, 40, { confidence: 'low' });
  const vCap = await dmk('capability', 'KESTREL loader (custom build)', 470, 540, { confidence: 'moderate' });
  const vLure = await dmk('capability', 'Spear-phish lure, finance theme', 40, 540, { confidence: 'moderate' });
  const vInfra = await dmk('infrastructure', 'Bulletproof host 45.155.87.12 (C2)', 1220, 540, { confidence: 'high' });
  const vVic = await dmk('victim', 'ACME finance workstation FIN-WS-041', 760, 700, { confidence: 'high' });

  // the pivot: one infrastructure vertex characterizes two events
  await repo.createEdge('characterizes', vLure.id, de1.id);
  await repo.createEdge('characterizes', vVic.id, de1.id);
  await repo.createEdge('characterizes', vCap.id, de2.id);
  await repo.createEdge('characterizes', vVic.id, de2.id);
  await repo.createEdge('characterizes', vAdv.id, de3.id);
  await repo.createEdge('characterizes', vInfra.id, de3.id);
  await repo.createEdge('characterizes', vInfra.id, de4.id);
  await repo.createEdge('characterizes', vVic.id, de4.id);

  // evidence graded on the Admiralty scale, cited against vertex identifications
  const dev1 = await dmk('evidence', 'Mail gateway logs: 41 lure deliveries, 3 clicks', 40, 880, { sourceReliability: 'B', infoCredibility: 2 });
  const dev2 = await dmk('evidence', 'Passive DNS ties 45.155.87.12 to a 2024 APT-Q campaign', 1220, 880, { sourceReliability: 'C', infoCredibility: 3 });
  const dev3 = await dmk('evidence', 'Host serves dozens of unrelated bulletproof clients', 1400, 40, { sourceReliability: 'C', infoCredibility: 3 });
  await repo.createEdge('consistent_with', dev1.id, vLure.id);
  await repo.createEdge('consistent_with', dev2.id, vInfra.id);
  await repo.createEdge('inconsistent_with', dev3.id, vAdv.id);

  // an open (not adopted) assessment, so Gate C — open diamond gaps — is demoable
  const assess = await dmk('claim', 'Initial access was via the finance-themed phishing wave', 1920, 700, { likelihood: 'likely', confidence: 'moderate' });
  await repo.createEdge('answers', assess.id, inc.id);

  // the linking staled the graded diamond nodes — affirm back to a clean baseline
  for (const n of [de1, de2, de3, de4, vAdv, vCap, vLure, vInfra, vVic, assess]) {
    await repo.affirmNode(n.id);
  }

  // ---- Session 3 (10h ago): late changes that stale things ---------------
  // Regrading e1 undermines H1/H2/H3 in one stroke → cone review; then H2 is
  // affirmed, leaving a shared-cause pair in the queue.
  await repo.declareJudgement(e1.id, 'infoCredibility', 3);
  await repo.affirmNode(h2.id);
  // The sub-thread's adopted answer firms up → the promoted node stale-flags
  // with a "source changed" badge (§2.6)
  await repo.declareJudgement(sc1.id, 'confidence', 'high');

  // ---- rewrite timestamps into three past sessions ------------------------
  const snapshot = repo.exportSnapshot();
  const events = snapshot.events;
  const DAY = 86_400_000;
  const now = Date.now();
  const s1 = now - 4 * DAY; // capture
  const s2 = now - 2 * DAY; // linking + sub-thread
  const s3 = now - 10 * 3_600_000; // late changes, >8h ago → re-entry briefing
  const lastSession = events.length - 3;
  const session2Start = events.findIndex((e) => e.type === 'edge_created');

  events.forEach((e, i) => {
    const base = i >= lastSession ? s3 : i >= session2Start ? s2 : s1;
    const offset = (i - (i >= lastSession ? lastSession : i >= session2Start ? session2Start : 0)) * 47_000;
    e.at = new Date(base + offset).toISOString();
  });
  const createdAtOf = new Map<string, string>();
  for (const e of events) {
    if ((e.type === 'node_created' || e.type === 'node_promoted') && e.nodeId) {
      createdAtOf.set(e.nodeId, e.at);
      const payload = e.payload as { node?: { createdAt?: string } };
      if (payload?.node) payload.node.createdAt = e.at;
    }
    if (e.type === 'edge_created' && e.edgeId) createdAtOf.set(e.edgeId, e.at);
    if (e.type === 'thread_created') {
      // keep thread_created aligned with its question's node_created
    }
  }
  for (const n of snapshot.nodes) n.createdAt = createdAtOf.get(n.id) ?? n.createdAt;
  for (const ed of snapshot.edges) ed.createdAt = createdAtOf.get(ed.id) ?? ed.createdAt;

  const out = join(root, 'fixtures', 'example.rcanvas.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2));

  const { queue, coneReviews } = await import('../src/model/derive');
  await repo.importSnapshot(JSON.parse(JSON.stringify(snapshot)));
  const { graphStore } = await import('../src/model/graphStore');
  const g = graphStore.getState();
  const q = queue(g, rootQ.id);
  console.log(`fixture written: ${out}`);
  console.log(`  nodes=${snapshot.nodes.length} edges=${snapshot.edges.length} events=${snapshot.events.length}`);
  console.log(`  queue=${q.length} (${q.filter((i) => i.stale.kind === 'undermined').length} undermined) coneReviews=${coneReviews(q).size}`);
}

void main();
