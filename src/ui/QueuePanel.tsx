// Queue panel + batch/cone affirmation (§5.6).

import * as repo from '../model/repo';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import { coneReviews, queue, type QueueItem } from '../model/derive';
import { NODE_TYPE_LABELS } from '../model/labels';
import { eventText, timeAgo } from './eventText';

export function QueuePanel({ rootThreadId }: { rootThreadId: string }) {
  const g = useGraph();
  const { toggleQueue, select, openThread } = useUI();
  const items = queue(g, rootThreadId);
  const groups = coneReviews(items);
  const grouped = new Set([...groups.values()].flat().map((i) => i.node.id));
  const singles = items.filter((i) => !grouped.has(i.node.id));

  const focus = (item: QueueItem) => {
    openThread(item.node.threadId);
    select(item.node.id);
    toggleQueue(false);
  };

  return (
    <div className="queue-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Queue — {items.length} stale item{items.length === 1 ? '' : 's'}</h3>
        <button className="btn small" onClick={() => toggleQueue(false)}>
          Close
        </button>
      </div>
      <p style={{ margin: '0 0 10px', color: 'var(--muted)', fontSize: 12 }}>
        Two kinds of stale: <b>never declared</b> (judgements still empty) and{' '}
        <b>undermined</b> (something upstream changed since you judged). Affirm a judgement
        unchanged, or revisit it — nothing clears without your say-so.
      </p>
      {items.length === 0 && <p style={{ color: 'var(--muted)' }}>Nothing stale. Every judgement is either fresh or affirmed.</p>}

      {[...groups.entries()].map(([causeId, group]) => {
        const cause = g.events.find((e) => e.id === causeId);
        return (
          <div className="cone-review" key={causeId}>
            <header>
              <span>
                Cone review — {cause ? eventText(g, cause) : 'upstream change'}{' '}
                <span style={{ color: 'var(--faint)' }}>{cause ? timeAgo(cause.at) : ''}</span>
              </span>
              <button
                className="btn small"
                onClick={() => {
                  for (const item of group) void repo.affirmNode(item.node.id);
                }}
              >
                Affirm all remaining
              </button>
            </header>
            {group.map((item) => (
              <QueueRow key={item.node.id} item={item} onFocus={() => focus(item)} showCause={false} g={g} />
            ))}
          </div>
        );
      })}

      {singles.map((item) => (
        <QueueRow key={item.node.id} item={item} onFocus={() => focus(item)} showCause g={g} />
      ))}
    </div>
  );
}

function QueueRow({
  item,
  onFocus,
  showCause,
  g,
}: {
  item: QueueItem;
  onFocus: () => void;
  showCause: boolean;
  g: ReturnType<typeof useGraph>;
}) {
  const undermined = item.stale.kind === 'undermined';
  return (
    <div className="queue-item" onClick={onFocus}>
      <div>
        <span className={`chip ${item.node.type}`}>{NODE_TYPE_LABELS[item.node.type]}</span>{' '}
        {item.node.text.length > 60 ? `${item.node.text.slice(0, 59)}…` : item.node.text}
      </div>
      <div className="why">
        {undermined ? (
          showCause && item.cause ? (
            <>undermined by: {eventText(g, item.cause)} ({timeAgo(item.cause.at)})</>
          ) : (
            'undermined'
          )
        ) : (
          'never declared — judgements missing'
        )}
      </div>
      <div className="actions" onClick={(e) => e.stopPropagation()}>
        {undermined && (
          <button className="btn small" onClick={() => void repo.affirmNode(item.node.id)}>
            Affirm
          </button>
        )}
        <button className="btn small" onClick={onFocus}>
          Revisit
        </button>
      </div>
    </div>
  );
}
