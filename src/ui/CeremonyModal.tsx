// Adoption ceremony (§5.5): one modal pane, everything pre-computed, no wizard.
// Gates are soft — they demand a stated reason, never block (§0.7). The only
// hard rule is mutual exclusivity (§5.5.8).

import { useMemo, useState } from 'react';
import * as repo from '../model/repo';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import type { AssumptionNode, ClaimNode, IncidentNode, QuestionNode } from '../model/types';
import { staleStateOf } from '../model/types';
import {
  competingSet,
  diamondEvents,
  diamondGaps,
  disconfirmationCoverage,
  isLiveSet,
  liveEdges,
  threadFamily,
  type GapItem,
} from '../model/derive';
import {
  CONFIDENCE_LABELS,
  LIKELIHOOD_LABELS,
  NODE_TYPE_LABELS,
  PHASE_LABELS,
  VALIDITY_LABELS,
} from '../model/labels';

function gapCaption(gap: GapItem): string {
  return gap.kind === 'missing_vertex'
    ? `‘${gap.event.text}’ — missing ${NODE_TYPE_LABELS[gap.role].toLowerCase()}`
    : `‘${gap.node.text}’ — ${NODE_TYPE_LABELS[gap.node.type].toLowerCase()} not fully graded`;
}

export function CeremonyModal({ claimId }: { claimId: string }) {
  const g = useGraph();
  const { openCeremony, showToast } = useUI();
  const claim = g.nodes[claimId] as ClaimNode | undefined;
  const [reasonA, setReasonA] = useState('');
  const [reasonB, setReasonB] = useState('');
  const [reasonC, setReasonC] = useState('');

  const ceremony = useMemo(() => {
    if (!claim) return null;
    const targets = liveEdges(g)
      .filter((e) => e.type === 'answers' && e.from === claimId)
      .map((e) => g.nodes[e.to])
      .filter(
        (t): t is QuestionNode | IncidentNode =>
          !!t && !t.deletedAt && (t.type === 'question' || t.type === 'incident'),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const questions = targets.filter((t): t is QuestionNode => t.type === 'question');
    const incidents = targets.filter((t): t is IncidentNode => t.type === 'incident');

    const rivalMap = new Map<string, ClaimNode>();
    for (const q of targets) {
      for (const c of competingSet(g, q.id)) if (c.id !== claimId) rivalMap.set(c.id, c);
    }
    const rivals = [...rivalMap.values()].map((r) => ({
      claim: r,
      cov: disconfirmationCoverage(g, r.id),
    }));
    const candidateCov = disconfirmationCoverage(g, claimId);

    const assumptions = liveEdges(g)
      .filter((e) => e.type === 'rests_on' && e.from === claimId)
      .map((e) => g.nodes[e.to] as AssumptionNode)
      .filter((a) => a?.type === 'assumption');

    // Gaps-lens result scoped to this question (§5.5.4)
    const gaps: QuestionNode[] = [];
    for (const q of questions) {
      for (const tid of threadFamily(g, q.id)) {
        const sub = g.nodes[tid] as QuestionNode | undefined;
        if (!sub || sub.deletedAt || sub.type !== 'question' || sub.status !== 'open') continue;
        if (sub.id === q.id && !sub.priority) continue; // the question being answered
        if (sub.priority || isLiveSet(competingSet(g, sub.id)) || isLiveSet(competingSet(g, q.id))) {
          gaps.push(sub);
        }
      }
    }

    // Gate A — rival stronger: any rival with strictly lower I-count (§5.5.5)
    const gateA = rivals.filter((r) => r.cov.count < candidateCov.count);
    // Gate B — unsupported linchpin: unsupported OR never-declared validity
    const gateB = assumptions.filter((a) => a.validity === 'unsupported' || a.validity == null);
    // Gate C — open diamond gaps (diamond spec §3.4.5): missing vertices or
    // ungraded diamond nodes on any incident this claim assesses.
    const diamondState = incidents.map((inc) => ({
      incident: inc,
      events: diamondEvents(g, inc.id),
      gaps: diamondGaps(g, inc.id),
    }));
    const gateC = diamondState.filter((d) => d.gaps.length > 0);

    const meBlock = questions.find(
      (q) =>
        q.mutuallyExclusive &&
        competingSet(g, q.id).some((c) => c.id !== claimId && c.status === 'adopted'),
    );

    return { questions, incidents, rivals, candidateCov, assumptions, gaps, diamondState, gateA, gateB, gateC, meBlock };
  }, [g, claim, claimId]);

  if (!claim || !ceremony) return null;
  const { rivals, candidateCov, assumptions, gaps, diamondState, gateA, gateB, gateC, meBlock } = ceremony;

  // The Adopt button stays enabled with fired gates (§5.5.5); the required
  // reason is enforced by repo.setClaimStatus, surfaced as a toast.
  const adopt = async () => {
    const snapshot = {
      at: new Date().toISOString(),
      candidate: { id: claim.id, text: claim.text, iCount: candidateCov.count },
      rivals: rivals.map((r) => ({
        id: r.claim.id,
        text: r.claim.text,
        status: r.claim.status,
        iCount: r.cov.count,
        disconfirmationAttempted: r.cov.attempted,
      })),
      linchpins: assumptions.map((a) => ({
        id: a.id,
        text: a.text,
        validity: a.validity ?? null,
        linchpin: a.linchpin,
      })),
    };
    const overrides: repo.GateOverride[] = [];
    if (gateA.length) {
      overrides.push({
        gate: 'rival_stronger',
        snapshot: snapshot.rivals.filter((r) => gateA.some((a) => a.claim.id === r.id)),
        reason: reasonA,
      });
    }
    if (gateB.length) {
      overrides.push({
        gate: 'unsupported_linchpin',
        snapshot: snapshot.linchpins.filter((l) => gateB.some((b) => b.id === l.id)),
        reason: reasonB,
      });
    }
    if (gateC.length) {
      overrides.push({
        gate: 'diamond_gaps',
        snapshot: gateC.map((d) => ({
          incidentId: d.incident.id,
          gaps: d.gaps.map(gapCaption),
        })),
        reason: reasonC,
      });
    }
    try {
      await repo.setClaimStatus(claim.id, 'adopted', { ceremony: snapshot, gateOverrides: overrides });
      openCeremony(null);
    } catch (err) {
      showToast({ text: String((err as Error).message ?? err) });
    }
  };

  const declared = (v: string | undefined, labels: Record<string, string>) =>
    v ? labels[v] : null;

  return (
    <div className="modal-backdrop" onClick={() => openCeremony(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Adopt as judgement</h2>
        <div style={{ fontSize: 14 }}>‘{claim.text}’</div>
        <div style={{ marginTop: 6, display: 'flex', gap: 16, alignItems: 'center' }}>
          <span>
            {declared(claim.likelihood, LIKELIHOOD_LABELS) ?? (
              <span className="undeclared-loud">likelihood UNDECLARED</span>
            )}
            {' · '}
            {declared(claim.confidence, CONFIDENCE_LABELS) ? (
              `${CONFIDENCE_LABELS[claim.confidence!]} confidence`
            ) : (
              <span className="undeclared-loud">confidence UNDECLARED</span>
            )}
          </span>
        </div>
        {(claim.likelihood == null || claim.confidence == null) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select
              className="judgement"
              value={claim.likelihood ?? ''}
              onChange={(e) => void repo.declareJudgement(claim.id, 'likelihood', e.target.value || null)}
            >
              <option value="">declare likelihood…</option>
              {Object.entries(LIKELIHOOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              className="judgement"
              value={claim.confidence ?? ''}
              onChange={(e) => void repo.declareJudgement(claim.id, 'confidence', e.target.value || null)}
            >
              <option value="">declare confidence…</option>
              {Object.entries(CONFIDENCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        )}

        <h3>Rivals ({rivals.length})</h3>
        {rivals.length ? (
          <table>
            <thead>
              <tr>
                <th>Claim</th>
                <th>Status</th>
                <th>I-count</th>
                <th>Disconfirmation attempted</th>
              </tr>
            </thead>
            <tbody>
              {rivals.map((r) => (
                <tr key={r.claim.id}>
                  <td>{r.claim.text}</td>
                  <td>{r.claim.status}</td>
                  <td className="mono">{r.cov.count}</td>
                  <td>{r.cov.attempted ? 'yes' : 'no'}</td>
                </tr>
              ))}
              <tr style={{ color: 'var(--muted)' }}>
                <td>this candidate</td>
                <td>{claim.status}</td>
                <td className="mono">{candidateCov.count}</td>
                <td>{candidateCov.attempted ? 'yes' : 'no'}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)', margin: 0 }}>No rival claims answer this question.</p>
        )}

        <h3>Linchpins — assumptions this claim rests on</h3>
        {assumptions.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {assumptions.map((a) => (
              <li key={a.id} style={{ color: a.validity === 'unsupported' || a.validity == null ? 'var(--danger)' : undefined }}>
                {a.text} — {a.validity ? VALIDITY_LABELS[a.validity] : 'validity never declared'}
                {a.linchpin ? ' · linchpin' : ''}
                {staleStateOf(a).kind === 'undermined' ? ' · stale' : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--muted)', margin: 0 }}>None linked (rests-on edges).</p>
        )}

        {diamondState.length === 0 && (
          <>
            <h3>Open gaps bearing on this set</h3>
            {gaps.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {gaps.map((q) => (
                  <li key={q.id}>
                    {q.text}
                    {q.priority ? ` — priority ${q.priority}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: 'var(--muted)', margin: 0 }}>None.</p>
            )}
          </>
        )}

        {diamondState.map((d) => (
          <div key={d.incident.id}>
            <h3>The diamond map — ‘{d.incident.text}’</h3>
            <p style={{ margin: '0 0 4px', fontSize: 12.5 }}>
              {d.events.length} event{d.events.length === 1 ? '' : 's'}
              {d.events.length
                ? `: ${d.events
                    .map((e) => (e.phase ? PHASE_LABELS[e.phase] : 'unphased'))
                    .join(' → ')}`
                : ' recorded'}
            </p>
            {d.gaps.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {d.gaps.map((gap, i) => (
                  <li key={i} style={{ color: 'var(--danger)' }}>{gapCaption(gap)}</li>
                ))}
              </ul>
            ) : (
              <p style={{ color: 'var(--muted)', margin: 0 }}>No open intelligence gaps.</p>
            )}
          </div>
        ))}

        {gateA.length > 0 && (
          <div className="gate">
            <div className="gate-title">Gate — a rival is stronger</div>
            <div style={{ fontSize: 12.5 }}>
              {gateA.map((r) => (
                <div key={r.claim.id}>
                  ‘{r.claim.text}’ has {r.cov.count} inconsistent item{r.cov.count === 1 ? '' : 's'} vs the
                  candidate’s {candidateCov.count}.
                </div>
              ))}
            </div>
            <textarea
              placeholder="Required: why adopt over the stronger rival?"
              value={reasonA}
              onChange={(e) => setReasonA(e.target.value)}
            />
          </div>
        )}

        {gateB.length > 0 && (
          <div className="gate">
            <div className="gate-title">Gate — unsupported linchpin</div>
            <div style={{ fontSize: 12.5 }}>
              {gateB.map((a) => (
                <div key={a.id}>
                  ‘{a.text}’ is {a.validity == null ? 'never-declared' : 'Unsupported'}.
                </div>
              ))}
            </div>
            <textarea
              placeholder="Required: why adopt despite this assumption?"
              value={reasonB}
              onChange={(e) => setReasonB(e.target.value)}
            />
          </div>
        )}

        {gateC.length > 0 && (
          <div className="gate">
            <div className="gate-title">Gate — open diamond gaps</div>
            <div style={{ fontSize: 12.5 }}>
              {gateC.map((d) => (
                <div key={d.incident.id}>
                  ‘{d.incident.text}’ still has {d.gaps.length} intelligence gap
                  {d.gaps.length === 1 ? '' : 's'} (listed above). A gap clears only by
                  filling the missing vertex or declaring the missing judgement.
                </div>
              ))}
            </div>
            <textarea
              placeholder="Required: why assess now, with these gaps open?"
              value={reasonC}
              onChange={(e) => setReasonC(e.target.value)}
            />
          </div>
        )}

        {meBlock && (
          <div className="me-note">
            ‘{meBlock.text}’ is marked mutually exclusive and already has an adopted answer —
            revert it before adopting this one.
          </div>
        )}

        <div className="foot-row">
          <button className="btn" onClick={() => openCeremony(null)}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!meBlock} onClick={() => void adopt()}>
            Adopt as judgement
          </button>
        </div>
      </div>
    </div>
  );
}
