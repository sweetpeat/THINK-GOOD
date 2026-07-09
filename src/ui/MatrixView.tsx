// ACH matrix (§5.4): a pure pivot of the same graph. Claims as columns,
// evidence as rows; clicking cells creates/switches/removes C-I edges.

import { useEffect, useMemo, useRef, useState } from 'react';
import * as repo from '../model/repo';
import { graphStore } from '../model/graphStore';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import type { ClaimNode, EvidenceNode, QuestionNode } from '../model/types';
import { staleStateOf } from '../model/types';
import {
  competingSet,
  disconfirmationCoverage,
  displayedNodes,
  isLiveSet,
  isNonDiagnostic,
  liveEdges,
  questionsWithLiveSets,
} from '../model/derive';
import { admiraltyGrade, CONFIDENCE_LABELS, LIKELIHOOD_LABELS } from '../model/labels';
import { maybeWorkAcrossToast } from './workAcross';

export function MatrixView({ rootThreadId }: { rootThreadId: string }) {
  const g = useGraph();
  const { openCeremony, matrixFocusEvidenceId, setMatrixFocus } = useUI();
  const liveQuestions = questionsWithLiveSets(g, rootThreadId);
  const [questionId, setQuestionId] = useState<string | null>(null);
  const q = (questionId && g.nodes[questionId] ? g.nodes[questionId] : liveQuestions[0]) as
    | QuestionNode
    | undefined;

  const [cellPick, setCellPick] = useState<{ evidenceId: string; claimId: string; x: number; y: number } | null>(null);
  const focusRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (matrixFocusEvidenceId && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center' });
      setMatrixFocus(null);
    }
  }, [matrixFocusEvidenceId, setMatrixFocus]);

  const set = useMemo(() => (q ? competingSet(g, q.id) : []), [g, q]);
  const evidence = useMemo(() => {
    if (!q) return [];
    // rows: every evidence node displayed on the set's home canvas (a question's
    // answering claims and their evidence live in its own thread)
    return displayedNodes(g, q.id)
      .filter((n): n is EvidenceNode => n.type === 'evidence')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [g, q]);

  if (!q || !isLiveSet(set)) {
    // Smart empty-state (friend feedback #2): say exactly what's missing.
    const root = g.nodes[rootThreadId];
    const rootSet = competingSet(g, rootThreadId);
    const unlinkedClaims = displayedNodes(g, rootThreadId).filter(
      (n) => n.type === 'claim' && !rootSet.some((c) => c.id === n.id),
    );
    return (
      <div className="matrix-wrap">
        <div style={{ maxWidth: 520 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 14 }}>The matrix needs rival claims</h3>
          <p style={{ color: 'var(--muted)', margin: '0 0 10px' }}>
            It opens when a question has a <b>live competing set</b>: at least two claims
            linked to it with <em>answers</em> edges. Right now
            {rootSet.length === 0 ? (
              <> no claim answers ‘{root?.text}’.</>
            ) : (
              <> only ‘{rootSet[0].text}’ answers ‘{root?.text}’ — it has no rival.</>
            )}
          </p>
          <ol style={{ color: 'var(--muted)', margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {unlinkedClaims.length > 0 && (
              <li>
                You already have {unlinkedClaims.length} unlinked claim
                {unlinkedClaims.length === 1 ? '' : 's'} on the canvas (e.g. ‘
                {unlinkedClaims[0].text.slice(0, 40)}’) — link {unlinkedClaims.length === 1 ? 'it' : 'each'} to the
                question: drag its ⊕ handle onto the question and pick <em>answers</em>.
              </li>
            )}
            <li>
              On the Canvas, press <kbd>C</kbd> to add {rootSet.length ? 'a rival' : 'competing'} claim
              {rootSet.length ? '' : 's'} — every plausible explanation, not just your favourite.
            </li>
            <li>
              Drag each claim’s ⊕ handle onto the question → <em>answers</em>.
            </li>
            <li>
              Come back here: claims become columns, evidence becomes rows, and cells mark
              C (consistent) or I (inconsistent).
            </li>
          </ol>
        </div>
      </div>
    );
  }

  const edgeBetween = (evidenceId: string, claimId: string) =>
    liveEdges(g).find(
      (e) =>
        e.from === evidenceId &&
        e.to === claimId &&
        (e.type === 'consistent_with' || e.type === 'inconsistent_with'),
    );

  const createCI = (type: 'consistent_with' | 'inconsistent_with', from: string, to: string) => {
    void repo
      .createEdge(type, from, to)
      .then((edge) => maybeWorkAcrossToast(graphStore.getState(), edge))
      .catch((err) => useUI.getState().showToast({ text: String(err.message ?? err) }));
  };

  return (
    <div className="matrix-wrap" onClick={() => setCellPick(null)}>
      {liveQuestions.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <select
            className="judgement"
            style={{ width: 'auto' }}
            value={q.id}
            onChange={(e) => setQuestionId(e.target.value)}
          >
            {liveQuestions.map((lq) => (
              <option key={lq.id} value={lq.id}>
                {lq.text}
              </option>
            ))}
          </select>
        </div>
      )}
      <table className="matrix">
        <thead>
          <tr>
            <th className="corner" />
            {set.map((c) => (
              <ClaimHeader key={c.id} claim={c} onAdopt={() => openCeremony(c.id)} />
            ))}
          </tr>
        </thead>
        <tbody>
          {evidence.map((ev) => {
            const nondiag = isNonDiagnostic(g, ev.id, set);
            const graded = ev.sourceReliability != null && ev.infoCredibility != null;
            return (
              <tr
                key={ev.id}
                className={nondiag ? 'nondiag' : undefined}
                ref={matrixFocusEvidenceId === ev.id ? focusRef : undefined}
              >
                <th>
                  {ev.text}
                  <span className={`tag mono${graded ? '' : ' hatch-chip'}`}>
                    {admiraltyGrade(ev.sourceReliability, ev.infoCredibility)}
                  </span>
                  {nondiag && <span className="tag">non-diagnostic</span>}
                  {staleStateOf(ev).kind === 'undermined' && <span className="tag">stale</span>}
                </th>
                {set.map((c) => {
                  const edge = edgeBetween(ev.id, c.id);
                  const mark = edge ? (edge.type === 'consistent_with' ? 'C' : 'I') : '';
                  return (
                    <td
                      key={c.id}
                      className="cell"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCellPick({ evidenceId: ev.id, claimId: c.id, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <span className={mark.toLowerCase()}>{mark}</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {evidence.length === 0 && (
            <tr>
              <th colSpan={set.length + 1} style={{ color: 'var(--muted)' }}>
                No evidence nodes on this canvas yet — capture some with <kbd>E</kbd>.
              </th>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <th>Disconfirmation coverage</th>
            {set.map((c) => {
              const cov = disconfirmationCoverage(g, c.id);
              return (
                <td key={c.id} style={{ textAlign: 'center' }}>
                  <span className="mono">{cov.count} I</span>
                  {!cov.attempted && <div className="warn">no disconfirmation attempted</div>}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>

      {cellPick && (
        <CellPicker
          pick={cellPick}
          existing={edgeBetween(cellPick.evidenceId, cellPick.claimId)?.type ?? null}
          onCreate={(t) => {
            createCI(t, cellPick.evidenceId, cellPick.claimId);
            setCellPick(null);
          }}
          onRemove={() => {
            const edge = edgeBetween(cellPick.evidenceId, cellPick.claimId);
            if (edge) void repo.deleteEdge(edge.id);
            setCellPick(null);
          }}
          onClose={() => setCellPick(null)}
        />
      )}
    </div>
  );
}

function ClaimHeader({ claim, onAdopt }: { claim: ClaimNode; onAdopt: () => void }) {
  const lk = claim.likelihood ? LIKELIHOOD_LABELS[claim.likelihood] : 'undeclared';
  const cf = claim.confidence ? CONFIDENCE_LABELS[claim.confidence] : 'undeclared';
  return (
    <th>
      <div>{claim.text}</div>
      <div className="grade" style={{ marginTop: 3 }}>
        {lk} · {cf}
      </div>
      <div style={{ marginTop: 5 }}>
        {claim.status === 'adopted' ? (
          <span className="chip claim">adopted</span>
        ) : (
          <button className="btn small" onClick={onAdopt}>
            Adopt…
          </button>
        )}
      </div>
    </th>
  );
}

function CellPicker({
  pick,
  existing,
  onCreate,
  onRemove,
  onClose,
}: {
  pick: { x: number; y: number };
  existing: string | null;
  onCreate: (t: 'consistent_with' | 'inconsistent_with') => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="overlay-pop picker"
      style={{ position: 'fixed', left: pick.x, top: pick.y + 8 }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      {existing !== 'consistent_with' && (
        <button onClick={() => onCreate('consistent_with')}>C — consistent with</button>
      )}
      {existing !== 'inconsistent_with' && (
        <button onClick={() => onCreate('inconsistent_with')}>I — inconsistent with</button>
      )}
      {existing && <button onClick={onRemove}>Remove mark</button>}
    </div>
  );
}
