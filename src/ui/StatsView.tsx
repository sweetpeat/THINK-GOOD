// Stats page (§4.6) — minimal, all from the log.

import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import { stats } from '../model/derive';
import { NODE_TYPE_LABELS } from '../model/labels';
import { timeAgo } from './eventText';

export function StatsView() {
  const g = useGraph();
  const go = useUI((s) => s.go);
  const s = stats(g);

  return (
    <div className="prose-page">
      <div className="sheet">
        <button className="btn small" onClick={() => go({ screen: 'home' })}>
          ← Home
        </button>
        <h1 style={{ marginTop: 14 }}>Stats</h1>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="k">Median capture time</div>
            <div className="v">
              {s.medianCaptureMs != null ? (
                <>
                  {(s.medianCaptureMs / 1000).toFixed(1)}
                  <small> s keypress → commit</small>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
          <div className="stat-card">
            <div className="k">Queue</div>
            <div className="v">
              {s.queueSize}
              <small>
                {' '}
                stale item{s.queueSize === 1 ? '' : 's'}
                {s.oldestQueueAt ? ` · oldest ${timeAgo(s.oldestQueueAt)}` : ''}
              </small>
            </div>
          </div>
          <div className="stat-card">
            <div className="k">Nodes</div>
            <div className="v">
              {Object.values(s.nodeCounts).reduce((a, b) => a + b, 0)}
              <small>
                {' '}
                {Object.entries(s.nodeCounts)
                  .map(([t, n]) => `${n} ${NODE_TYPE_LABELS[t as keyof typeof NODE_TYPE_LABELS].toLowerCase()}`)
                  .join(' · ')}
              </small>
            </div>
          </div>
          <div className="stat-card">
            <div className="k">Gate overrides</div>
            <div className="v">{s.gateOverrides}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
