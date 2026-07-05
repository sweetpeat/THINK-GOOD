// Audit view (§3): the append-only log rendered — reverse-chronological per
// thread family, filterable by node. Nothing here mutates anything.

import { useMemo, useState } from 'react';
import { useGraph } from './useGraph';
import { threadEvents } from '../model/derive';
import { eventText, fmtTime } from './eventText';

export function AuditView({ rootThreadId }: { rootThreadId: string }) {
  const g = useGraph();
  const [nodeFilter, setNodeFilter] = useState('');
  const events = useMemo(
    () => [...threadEvents(g, rootThreadId)].reverse(),
    [g, rootThreadId],
  );

  const nodeOptions = useMemo(() => {
    const ids = new Set(events.map((e) => e.nodeId).filter(Boolean) as string[]);
    return [...ids]
      .map((id) => g.nodes[id])
      .filter(Boolean)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [events, g.nodes]);

  const shown = nodeFilter ? events.filter((e) => e.nodeId === nodeFilter) : events;

  return (
    <div className="audit-wrap">
      <div className="filter-bar">
        <span>
          {shown.length} event{shown.length === 1 ? '' : 's'} — append-only, immutable
        </span>
        <select className="judgement" style={{ width: 'auto' }} value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)}>
          <option value="">All nodes</option>
          {nodeOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.text.slice(0, 48)}
            </option>
          ))}
        </select>
      </div>
      <table>
        <tbody>
          {shown.map((e) => (
            <tr key={e.id}>
              <td className="when">{fmtTime(e.at)}</td>
              <td className="etype">{e.type}</td>
              <td>{eventText(g, e)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
