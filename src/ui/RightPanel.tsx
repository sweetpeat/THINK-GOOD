// The right-hand panel: the Inspector on top (takes the remaining space and
// scrolls), with the always-open "How to" legend pinned to the bottom.

import { Inspector } from './Inspector';
import { HowTo } from './HowTo';

export function RightPanel({ threadId }: { threadId: string }) {
  return (
    <aside className="right-panel">
      <div className="inspector-slot">
        <Inspector threadId={threadId} />
      </div>
      <HowTo threadId={threadId} />
    </aside>
  );
}
