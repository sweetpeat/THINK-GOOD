// Inspector (§5.0): the selected node's form. Every dropdown change is a
// judgement_declared event; stale nodes offer "Affirm unchanged"; the node's
// type-history (a filter of the log) is shown at the bottom.

import { useEffect, useState } from 'react';
import * as repo from '../model/repo';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import type {
  AnyNode,
  AssumptionNode,
  ClaimNode,
  DiamondEventNode,
  EvidenceNode,
  IncidentNode,
  NodeType,
  QuestionNode,
} from '../model/types';
import { isVertexType, staleStateOf, VERTEX_TYPES } from '../model/types';
import {
  admiraltyGrade,
  CONFIDENCE_LABELS,
  CREDIBILITY_LABELS,
  DIRECTION_LABELS,
  LIKELIHOOD_LABELS,
  NODE_TYPE_LABELS,
  PHASE_LABELS,
  PRIORITY_LABELS,
  RELIABILITY_LABELS,
  RESULT_LABELS,
  VALIDITY_LABELS,
} from '../model/labels';
import {
  competingSet,
  diamondGaps,
  eventsCharacterizedBy,
  liveEdges,
  threadWorkflow,
  typeHistory,
  verticesOf,
} from '../model/derive';
import { retypeOptions } from './palette';
import { eventText, timeAgo } from './eventText';

function JudgementSelect({
  node,
  field,
  label,
  options,
  numeric,
}: {
  node: AnyNode;
  field: string;
  label: string;
  options: [string, string][];
  numeric?: boolean;
}) {
  const value = (node as unknown as Record<string, unknown>)[field];
  return (
    <label className="field">
      <span>{label}</span>
      <select
        className={`judgement${value == null ? ' undeclared' : ''}`}
        value={String(value ?? '')}
        onChange={(e) => {
          const raw = e.target.value;
          void repo
            .declareJudgement(node.id, field, raw === '' ? null : numeric ? Number(raw) : raw)
            .catch((err) => useUI.getState().showToast({ text: String(err.message ?? err) }));
        }}
      >
        <option value="">— undeclared</option>
        {options.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  node,
  field,
  label,
  placeholder,
}: {
  node: AnyNode;
  field: string;
  label: string;
  placeholder?: string;
}) {
  const stored = ((node as unknown as Record<string, unknown>)[field] as string) ?? '';
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [node.id, stored]);
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== stored) {
            void repo
              .editNodeText(node.id, field, draft)
              .catch((err) => {
                useUI.getState().showToast({ text: String(err.message ?? err) });
                setDraft(stored);
              });
          }
        }}
      />
    </label>
  );
}

export function Inspector({ threadId }: { threadId: string }) {
  const g = useGraph();
  const { selectedId, select, openCeremony, openThread } = useUI();
  const node = selectedId ? g.nodes[selectedId] : null;

  if (!node || node.deletedAt) {
    return (
      <div className="inspector-body">
        <div className="subhead">Inspector</div>
        <p style={{ color: 'var(--muted)' }}>
          Select a node to see its judgements. Every value here is declared by you — the
          system never computes one.
        </p>
      </div>
    );
  }

  const stale = staleStateOf(node);
  const cause = stale.kind === 'undermined' ? g.events.find((e) => e.id === stale.causeEventId) : null;
  const history = typeHistory(g, node.id);
  const isCollapsedSub = node.type === 'question' && (node as QuestionNode).parentThreadId === threadId;
  const adoptedAnswer = isCollapsedSub
    ? competingSet(g, node.id).find((c) => c.status === 'adopted')
    : null;

  return (
    <div className="inspector-body">
      <div className="head">
        <span className={`chip ${node.type}`}>{NODE_TYPE_LABELS[node.type]}</span>
        <RetypeControl node={node} />
      </div>

      {stale.kind !== 'fresh' && (
        <div className="stale-note">
          {stale.kind === 'never_declared' ? (
            <>Judgements not yet declared.</>
          ) : (
            <>
              Undermined{cause ? <> by: {eventText(g, cause)} ({timeAgo(cause.at)})</> : null}.
              <div style={{ marginTop: 6 }}>
                <button className="btn small" onClick={() => void repo.affirmNode(node.id)}>
                  Affirm unchanged
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <TextField node={node} field="text" label="Text" />
      <TextField node={node} field="note" label="Note" placeholder="free text — never machine-read" />

      {node.type === 'claim' && (
        <>
          <JudgementSelect node={node} field="likelihood" label="Likelihood (PHIA yardstick)" options={Object.entries(LIKELIHOOD_LABELS)} />
          <JudgementSelect node={node} field="confidence" label="Analytic confidence" options={Object.entries(CONFIDENCE_LABELS)} />
          <div className="field">
            <span>Status: {(node as ClaimNode).status}</span>
            {(node as ClaimNode).status === 'open' ? (
              <button className="btn primary" onClick={() => openCeremony(node.id)}>
                Adopt as judgement…
              </button>
            ) : (
              <button
                className="btn"
                onClick={() => void repo.setClaimStatus(node.id, 'open')}
                title="Reversal is a plain logged status change (§5.5.7)"
              >
                Revert to open
              </button>
            )}
          </div>
        </>
      )}

      {node.type === 'assumption' && (
        <>
          <JudgementSelect node={node} field="validity" label="Validity (Key Assumptions Check)" options={Object.entries(VALIDITY_LABELS)} />
          <label className="checkline">
            <input
              type="checkbox"
              checked={(node as AssumptionNode).linchpin}
              onChange={(e) => void repo.declareJudgement(node.id, 'linchpin', e.target.checked)}
            />
            Linchpin assumption
          </label>
          <TextField node={node} field="abandonTrigger" label="Abandon trigger" placeholder="what would make you drop this?" />
        </>
      )}

      {node.type === 'evidence' && (
        <>
          <JudgementSelect node={node} field="sourceReliability" label="Source reliability (Admiralty)" options={Object.entries(RELIABILITY_LABELS)} />
          <JudgementSelect node={node} field="infoCredibility" label="Information credibility (Admiralty)" options={Object.entries(CREDIBILITY_LABELS)} numeric />
          <TextField node={node} field="sourceNote" label="Source note" placeholder="where this came from" />
        </>
      )}

      {node.type === 'diamond_event' && (
        <>
          <JudgementSelect node={node} field="phase" label="Kill-chain phase" options={Object.entries(PHASE_LABELS)} />
          <JudgementSelect node={node} field="result" label="Result" options={Object.entries(RESULT_LABELS)} />
          <JudgementSelect node={node} field="direction" label="Direction" options={Object.entries(DIRECTION_LABELS)} />
          <label className="field">
            <span>Occurred (date — orders the kill-chain lane)</span>
            <input
              type="date"
              className="judgement"
              value={(node as DiamondEventNode).occurredAt ?? ''}
              onChange={(e) =>
                void repo
                  .declareJudgement(node.id, 'occurredAt', e.target.value || null)
                  .catch((err) => useUI.getState().showToast({ text: String(err.message ?? err) }))
              }
            />
          </label>
          <div className="field">
            <span>Vertices</span>
            {VERTEX_TYPES.map((role) => {
              const present = verticesOf(g, node.id)[role];
              return (
                <div key={role} style={{ marginTop: 3 }}>
                  <span className={`chip ${role}`}>{NODE_TYPE_LABELS[role]}</span>{' '}
                  {present.length ? (
                    present.map((v) => (
                      <button key={v.id} className="btn small" onClick={() => select(v.id)}>
                        ‘{v.text.slice(0, 26)}’
                      </button>
                    ))
                  ) : (
                    <span style={{ color: 'var(--danger)', fontSize: 12 }}>
                      gap — no vertex linked
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {isVertexType(node.type) && (
        <>
          <JudgementSelect
            node={node}
            field="confidence"
            label="Confidence in this identification"
            options={Object.entries(CONFIDENCE_LABELS)}
          />
          <div className="field">
            <span>Characterizes {eventsCharacterizedBy(g, node.id).length || 'no'} event(s) — the pivot list</span>
            {eventsCharacterizedBy(g, node.id).map((ev) => (
              <button key={ev.id} className="btn small" style={{ marginTop: 3 }} onClick={() => select(ev.id)}>
                ‘{ev.text.slice(0, 30)}’{ev.phase ? ` · ${PHASE_LABELS[ev.phase]}` : ''}
              </button>
            ))}
          </div>
          <VertexEvidence vertexId={node.id} onSelect={select} />
        </>
      )}

      {node.type === 'incident' && (
        <>
          <div className="field">
            <span>Status: {(node as IncidentNode).status}</span>
          </div>
          <div className="field">
            <span>Assessments (claims answering this incident)</span>
            {competingSet(g, node.id).length ? (
              competingSet(g, node.id).map((c) => (
                <button key={c.id} className="btn small" style={{ marginTop: 3 }} onClick={() => select(c.id)}>
                  {c.status === 'adopted' ? '● ' : '○ '}‘{c.text.slice(0, 32)}’
                </button>
              ))
            ) : (
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                None yet — press <kbd>S</kbd> on the canvas to draft one, then link it here
                with <em>answers</em>.
              </span>
            )}
          </div>
          <div className="field">
            <span>
              Intelligence gaps: {diamondGaps(g, node.id).length} (see the Queue panel)
            </span>
          </div>
        </>
      )}

      {node.type === 'question' && (
        <>
          <div className="field">
            <span>Status: {(node as QuestionNode).status}</span>
          </div>
          <JudgementSelect node={node} field="priority" label="Collection priority" options={Object.entries(PRIORITY_LABELS)} />
          <label className="checkline">
            <input
              type="checkbox"
              checked={(node as QuestionNode).mutuallyExclusive}
              onChange={(e) => void repo.declareJudgement(node.id, 'mutuallyExclusive', e.target.checked)}
            />
            Answers are mutually exclusive
          </label>
          {isCollapsedSub && (
            <div className="field">
              <span>Sub-question thread</span>
              <button className="btn" onClick={() => openThread(node.id)}>
                Descend into thread
              </button>
              {adoptedAnswer && <PromoteControl claim={adoptedAnswer} subQuestion={node as QuestionNode} />}
            </div>
          )}
        </>
      )}

      {node.derivedFrom && (
        <div className="field">
          <span>Promoted from</span>
          <button
            className="btn small"
            onClick={() => {
              const src = g.nodes[node.derivedFrom!];
              if (src) {
                openThread(src.threadId);
                select(src.id);
              }
            }}
          >
            ‘{g.nodes[node.derivedFrom]?.text.slice(0, 34) ?? 'removed claim'}’
          </button>
        </div>
      )}

      {history.length > 0 && (
        <>
          <div className="subhead">Type history</div>
          <ul className="history">
            {history.map((e) => (
              <li key={e.id}>
                {(e.payload as { before: { type: string } }).before.type} →{' '}
                {(e.payload as { after: { type: string } }).after.type}{' '}
                <span style={{ color: 'var(--faint)' }}>{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 10 }}>
        <button
          className="btn small danger"
          onClick={() => {
            if (window.confirm(`Delete ‘${node.text}’? The log keeps its history.`)) {
              void repo.deleteNode(node.id).then(() => select(null));
            }
          }}
        >
          Delete node
        </button>
      </div>
    </div>
  );
}

/** The evidence supporting/contradicting a vertex identification (diamond spec §3.3). */
function VertexEvidence({ vertexId, onSelect }: { vertexId: string; onSelect: (id: string) => void }) {
  const g = useGraph();
  const rows = liveEdges(g)
    .filter((e) => (e.type === 'consistent_with' || e.type === 'inconsistent_with') && e.to === vertexId)
    .map((e) => ({ edge: e, ev: g.nodes[e.from] as EvidenceNode }))
    .filter((r) => r.ev?.type === 'evidence');
  if (!rows.length) return null;
  return (
    <div className="field">
      <span>Evidence on this identification</span>
      {rows.map(({ edge, ev }) => (
        <button key={edge.id} className="btn small" style={{ marginTop: 3 }} onClick={() => onSelect(ev.id)}>
          {edge.type === 'inconsistent_with' ? '✕ ' : '✓ '}‘{ev.text.slice(0, 26)}’ [
          {admiraltyGrade(ev.sourceReliability, ev.infoCredibility)}]
        </button>
      ))}
    </div>
  );
}

function RetypeControl({ node }: { node: AnyNode }) {
  const g = useGraph();
  if (node.type === 'incident') return null; // anchors the canvas; not retypeable
  const workflow = threadWorkflow(g, node.threadId);
  const options = retypeOptions(workflow, node.type);
  return (
    <select
      className="judgement"
      style={{ width: 'auto' }}
      value={node.type}
      title="Retype (T) — logged; old judgements preserved in the log"
      onChange={(e) => {
        void repo
          .retypeNode(node.id, e.target.value as NodeType)
          .catch((err) => useUI.getState().showToast({ text: String(err.message ?? err) }));
      }}
    >
      <option value={node.type}>{NODE_TYPE_LABELS[node.type]}</option>
      {options.map((t) => (
        <option key={t} value={t}>
          {NODE_TYPE_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

function PromoteControl({ claim, subQuestion }: { claim: ClaimNode; subQuestion: QuestionNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
        Adopted answer: ‘{claim.text.slice(0, 40)}’
      </span>
      {!open ? (
        <button className="btn small" style={{ marginTop: 4 }} onClick={() => setOpen(true)}>
          Promote answer to parent as…
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {(['evidence', 'assumption'] as const).map((t) => (
            <button
              key={t}
              className="btn small"
              onClick={() => {
                void repo
                  .promoteAnswer(claim.id, t, { x: subQuestion.x + 30, y: subQuestion.y + 140 })
                  .then(() => setOpen(false))
                  .catch((err) => useUI.getState().showToast({ text: String(err.message ?? err) }));
              }}
            >
              {NODE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
