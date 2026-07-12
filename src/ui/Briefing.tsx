// Re-entry briefing (§5.7): spine, what changed since the previous session,
// and the queue's top items. Dismissible; shown once per thread per app session.

import { useMemo } from 'react';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import {
  competingSet,
  diamondGaps,
  latestSessionEvents,
  queue,
  spine,
  threadEvents,
  threadWorkflow,
} from '../model/derive';
import { CONFIDENCE_LABELS, LIKELIHOOD_LABELS, NODE_TYPE_LABELS } from '../model/labels';
import { eventText, timeAgo } from './eventText';

export function Briefing({ rootThreadId }: { rootThreadId: string }) {
  const g = useGraph();
  const { dismissBriefing, toggleQueue } = useUI();

  const workflow = threadWorkflow(g, rootThreadId);

  const data = useMemo(() => {
    const events = threadEvents(g, rootThreadId);
    const q = queue(g, rootThreadId);
    const changed = latestSessionEvents(events).slice(-14).reverse();
    const assessments =
      workflow === 'diamond'
        ? competingSet(g, rootThreadId).filter((c) => c.status === 'adopted')
        : [];
    const gapCount = workflow === 'diamond' ? diamondGaps(g, rootThreadId).length : 0;
    return {
      spine: workflow === 'ach' ? spine(g, rootThreadId) : [],
      assessments,
      gapCount,
      queue: q.slice(0, 8),
      queueTotal: q.length,
      changed,
    };
  }, [g, rootThreadId, workflow]);

  return (
    <div className="briefing">
      <div className="inner">
        <h2>Re-entry briefing — ‘{g.nodes[rootThreadId]?.text}’</h2>

        {workflow === 'ach' ? (
          <section>
            <h3>Current spine</h3>
            {data.spine.length ? (
              <ul>
                {data.spine.map((entry) => (
                  <li key={entry.question.id} style={{ marginLeft: entry.depth * 16 }}>
                    {entry.question.text} →{' '}
                    {entry.claims.map((c) => (
                      <span key={c.id}>
                        <strong>{c.text}</strong>
                        {c.likelihood ? ` — ${LIKELIHOOD_LABELS[c.likelihood]}` : ''}
                        {c.confidence ? `, ${CONFIDENCE_LABELS[c.confidence]} confidence` : ''}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: 'var(--muted)', margin: 0 }}>No adopted judgements yet.</p>
            )}
          </section>
        ) : (
          <section>
            <h3>Current assessment</h3>
            {data.assessments.length ? (
              <ul>
                {data.assessments.map((c) => (
                  <li key={c.id}>
                    <strong>{c.text}</strong>
                    {c.likelihood ? ` — ${LIKELIHOOD_LABELS[c.likelihood]}` : ''}
                    {c.confidence ? `, ${CONFIDENCE_LABELS[c.confidence]} confidence` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: 'var(--muted)', margin: 0 }}>
                No adopted assessment yet
                {data.gapCount
                  ? ` — ${data.gapCount} intelligence gap${data.gapCount === 1 ? '' : 's'} open.`
                  : '.'}
              </p>
            )}
          </section>
        )}

        <section>
          <h3>What changed last session</h3>
          {data.changed.length ? (
            <ul>
              {data.changed.map((e) => (
                <li key={e.id}>
                  {eventText(g, e)} <span style={{ color: 'var(--faint)' }}>{timeAgo(e.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--muted)', margin: 0 }}>No recorded changes.</p>
          )}
        </section>

        <section>
          <h3>Queue — {data.queueTotal} item{data.queueTotal === 1 ? '' : 's'}</h3>
          {data.queue.length ? (
            <ul>
              {data.queue.map((item) => (
                <li key={item.node.id}>
                  <span className={`chip ${item.node.type}`}>{NODE_TYPE_LABELS[item.node.type]}</span>{' '}
                  {item.node.text} —{' '}
                  <span style={{ color: 'var(--muted)' }}>
                    {item.stale.kind === 'undermined' ? 'undermined' : 'never declared'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--muted)', margin: 0 }}>Empty.</p>
          )}
        </section>

        <div className="row-actions">
          {data.queueTotal > 0 && (
            <button
              className="btn primary"
              onClick={() => {
                dismissBriefing(rootThreadId);
                toggleQueue(true);
              }}
            >
              Start with the queue
            </button>
          )}
          <button className="btn" onClick={() => dismissBriefing(rootThreadId)}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
