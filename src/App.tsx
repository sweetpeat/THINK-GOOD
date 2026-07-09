import { useEffect, useMemo, useState } from 'react';
import { loadStore } from './model/repo';
import { useGraph } from './ui/useGraph';
import { useUI } from './ui/uiStore';
import { isReentry, queue, threadAncestry, threadEvents } from './model/derive';
import { Home } from './ui/Home';
import { TopBar } from './ui/TopBar';
import { GraphView } from './ui/GraphView';
import { MatrixView } from './ui/MatrixView';
import { AuditView } from './ui/AuditView';
import { RightPanel } from './ui/RightPanel';
import { QueuePanel } from './ui/QueuePanel';
import { CeremonyModal } from './ui/CeremonyModal';
import { Briefing } from './ui/Briefing';
import { WordPictureView } from './ui/WordPictureView';
import { StatsView } from './ui/StatsView';
import { Tutorial } from './ui/Tutorial';
import { ReviewStrip } from './ui/ReviewStrip';

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void loadStore().then(() => setReady(true));
  }, []);
  if (!ready) return null;
  return <Shell />;
}

function Shell() {
  const { route, toast, showToast, queueOpen, ceremonyClaimId } = useUI();
  const g = useGraph();

  if (route.screen === 'home') {
    return (
      <div className="app">
        <Home />
        {toast && <ToastEl />}
        <Tutorial />
      </div>
    );
  }
  if (route.screen === 'stats') {
    return (
      <div className="app">
        <StatsView />
      </div>
    );
  }
  if (route.screen === 'wordpicture') {
    return (
      <div className="app">
        <WordPictureView rootId={route.rootId} />
      </div>
    );
  }

  const { threadId, view } = route;
  const thread = g.nodes[threadId];
  if (!thread || thread.deletedAt) {
    // deleted or unknown thread — fall back home
    return (
      <div className="app">
        <Home />
      </div>
    );
  }
  const rootId = threadAncestry(g, threadId)[0]?.id ?? threadId;

  return (
    <div className="app">
      <TopBar threadId={threadId} view={view} />
      <div className="main">
        <div className="view-area">
          {(view === 'canvas' || view === 'stratified') && (
            <GraphView threadId={threadId} view={view} />
          )}
          {view === 'matrix' && <MatrixView rootThreadId={rootId} />}
          {view === 'audit' && <AuditView rootThreadId={rootId} />}
          <BriefingGate rootId={rootId} threadId={threadId} />
          {queueOpen && <QueuePanel rootThreadId={rootId} />}
          <ReviewStrip />
        </div>
        <RightPanel threadId={threadId} />
      </div>
      {ceremonyClaimId && <CeremonyModal claimId={ceremonyClaimId} />}
      {toast && <ToastEl />}
      <Tutorial />
    </div>
  );

  function ToastEl() {
    return (
      <div className="toast" role="status">
        <span>{toast!.text}</span>
        {toast!.action && <button onClick={toast!.action.run}>{toast!.action.label}</button>}
        <button className="x" onClick={() => showToast(null)} aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }
}

/** Shows the re-entry briefing when opening a root thread (§5.7). */
function BriefingGate({ rootId, threadId }: { rootId: string; threadId: string }) {
  const g = useGraph();
  const { briefingDismissed } = useUI();

  const shouldShow = useMemo(() => {
    if (threadId !== rootId) return false; // only when opening the root thread
    if (briefingDismissed[rootId]) return false;
    const events = threadEvents(g, rootId);
    if (!events.length) return false;
    const stale = queue(g, rootId).length > 0;
    return stale || isReentry(events, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootId, threadId, briefingDismissed]);

  return shouldShow ? <Briefing rootThreadId={rootId} /> : null;
}
