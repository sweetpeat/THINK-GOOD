// Home (§2.6): the list of root threads. New question, load example, import.

import { useRef, useState } from 'react';
import * as repo from '../model/repo';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import type { StoreSnapshot } from '../model/types';
import { ownNodes, rootQuestions, subQuestionsOf } from '../model/derive';
import { timeAgo } from './eventText';
import exampleFixture from '../../fixtures/example.rcanvas.json';

export function Home() {
  const g = useGraph();
  const { openThread, go, showToast } = useUI();
  const [text, setText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const roots = rootQuestions(g);

  const createThread = async () => {
    if (!text.trim()) return;
    const node = await repo.createNode({
      threadId: '',
      type: 'question',
      text,
      x: 320,
      y: 90,
    });
    setText('');
    openThread(node.id);
  };

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as StoreSnapshot;
      const ok = window.confirm(
        `Import replaces the entire store with ${parsed.nodes?.length ?? 0} nodes and ${parsed.events?.length ?? 0} events. Continue?`,
      );
      if (ok) await repo.importSnapshot(parsed);
    } catch (err) {
      showToast({ text: `Import failed: ${String((err as Error).message ?? err)}` });
    }
  };

  const loadExample = async () => {
    const ok =
      roots.length === 0 ||
      window.confirm('Loading the example replaces the entire store. Continue?');
    if (ok) await repo.importSnapshot(exampleFixture as unknown as StoreSnapshot);
  };

  return (
    <div className="home">
      <h1>Reasoning Canvas</h1>
      <div className="sub">
        Questions, claims, assumptions, evidence — every judgement declared by you, every act
        on the record.
      </div>

      <div className="new-row">
        <input
          type="text"
          placeholder="What question are you working? (Enter to open a thread)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void createThread()}
        />
        <button className="btn primary" onClick={() => void createThread()}>
          New question
        </button>
      </div>

      {roots.length === 0 ? (
        <div className="empty">
          <p>No threads yet. Every canvas is anchored by a root question.</p>
          <button className="btn" onClick={() => void loadExample()}>
            Load example — “Is APT-Q responsible for the intrusion at ACME?”
          </button>
        </div>
      ) : (
        roots.map((q) => {
          const nodes = ownNodes(g, q.id);
          const subs = subQuestionsOf(g, q.id);
          const lastEvent = [...g.events].reverse().find((e) => e.threadId === q.id);
          return (
            <button key={q.id} className="thread-card" onClick={() => openThread(q.id)}>
              <div className="title">{q.text}</div>
              <div className="meta">
                <span>{q.status === 'answered' ? 'answered' : 'open'}</span>
                <span>{nodes.length - 1} nodes</span>
                {subs.length > 0 && <span>{subs.length} sub-question{subs.length === 1 ? '' : 's'}</span>}
                {lastEvent && <span>active {timeAgo(lastEvent.at)}</span>}
              </div>
            </button>
          );
        })
      )}

      <div className="foot">
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          Import backup…
        </button>
        <button
          className="btn small"
          onClick={() =>
            void import('../export/download').then(({ download }) =>
              download(
                `reasoning-canvas-backup-${new Date().toISOString().slice(0, 10)}.rcanvas.json`,
                JSON.stringify(repo.exportSnapshot(), null, 2),
                'application/json',
              ),
            )
          }
        >
          Export backup
        </button>
        <button className="btn small" onClick={() => go({ screen: 'stats' })}>
          Stats
        </button>
        {roots.length > 0 && (
          <button className="btn small" onClick={() => void loadExample()}>
            Load example
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,.rcanvas.json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
