// Home (§2.6, diamond spec §3.0): the workflow chooser and the list of root
// threads. Two named entry points — ACH (question) and Diamond Model
// (incident) — plus load example, import, export.

import { useEffect, useRef, useState } from 'react';
import * as repo from '../model/repo';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';
import type { StoreSnapshot } from '../model/types';
import {
  diamondEvents,
  diamondGaps,
  ownNodes,
  rootIncidents,
  rootQuestions,
  subQuestionsOf,
} from '../model/derive';
import { timeAgo } from './eventText';
import { tourDone } from './Tutorial';
import exampleFixture from '../../fixtures/example.rcanvas.json';

export function Home() {
  const g = useGraph();
  const { openThread, go, showToast } = useUI();
  const [questionText, setQuestionText] = useState('');
  const [incidentText, setIncidentText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const roots = [...rootQuestions(g), ...rootIncidents(g)].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  // First visit: the short what-is-this card (friend feedback #1). The full
  // walkthroughs run on first entry into an ACH or Diamond thread.
  useEffect(() => {
    if (!tourDone('intro') && useUI.getState().tutorial == null) {
      useUI.getState().setTutorial({ kind: 'intro', step: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createQuestion = async () => {
    if (!questionText.trim()) return;
    const node = await repo.createNode({
      threadId: '',
      type: 'question',
      text: questionText,
      x: 320,
      y: 90,
    });
    setQuestionText('');
    openThread(node.id);
  };

  const createIncident = async () => {
    if (!incidentText.trim()) return;
    const node = await repo.createNode({
      threadId: '',
      type: 'incident',
      text: incidentText,
      x: 320,
      y: 90,
    });
    setIncidentText('');
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

      <div className="workflow-row">
        <div className="workflow-card">
          <div className="wf-name">Analysis of Competing Hypotheses</div>
          <div className="wf-desc">
            Line up rival explanations of a question and let disconfirming evidence do the
            judging.
          </div>
          <div className="new-row">
            <input
              type="text"
              placeholder="What question are you working?"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createQuestion()}
            />
            <button className="btn primary" onClick={() => void createQuestion()}>
              New question
            </button>
          </div>
        </div>

        <div className="workflow-card">
          <div className="wf-name">Diamond Model of Intrusion Analysis</div>
          <div className="wf-desc">
            Decompose an intrusion into events — adversary, capability, infrastructure,
            victim — threaded along the kill chain.
          </div>
          <div className="new-row">
            <input
              type="text"
              placeholder="Name the incident under investigation"
              value={incidentText}
              onChange={(e) => setIncidentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createIncident()}
            />
            <button className="btn primary" onClick={() => void createIncident()}>
              New incident
            </button>
          </div>
        </div>
      </div>

      {roots.length === 0 ? (
        <div className="empty">
          <p>No threads yet. Every canvas is anchored by a root question or an incident.</p>
          <button className="btn" onClick={() => void loadExample()}>
            Load example — an ACH attribution question and a Diamond incident thread
          </button>
        </div>
      ) : (
        roots.map((root) => {
          const isIncident = root.type === 'incident';
          const nodes = ownNodes(g, root.id);
          const subs = isIncident ? [] : subQuestionsOf(g, root.id);
          const lastEvent = [...g.events].reverse().find((e) => e.threadId === root.id);
          const events = isIncident ? diamondEvents(g, root.id) : [];
          const gapCount = isIncident ? diamondGaps(g, root.id).length : 0;
          return (
            <button key={root.id} className="thread-card" onClick={() => openThread(root.id)}>
              <div className="title">{root.text}</div>
              <div className="meta">
                <span className={`chip ${isIncident ? 'incident' : 'question'}`}>
                  {isIncident ? 'Diamond' : 'ACH'}
                </span>
                <span>
                  {isIncident
                    ? root.status === 'assessed' ? 'assessed' : 'open'
                    : root.status === 'answered' ? 'answered' : 'open'}
                </span>
                {isIncident ? (
                  <>
                    <span>{events.length} event{events.length === 1 ? '' : 's'}</span>
                    {gapCount > 0 && <span>{gapCount} gap{gapCount === 1 ? '' : 's'}</span>}
                  </>
                ) : (
                  <>
                    <span>{nodes.length - 1} nodes</span>
                    {subs.length > 0 && (
                      <span>{subs.length} sub-question{subs.length === 1 ? '' : 's'}</span>
                    )}
                  </>
                )}
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
        <button
          className="btn small"
          title="The intro card — each workflow runs its own tour when you first open it"
          onClick={() => useUI.getState().setTutorial({ kind: 'intro', step: 0 })}
        >
          Tutorial
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
