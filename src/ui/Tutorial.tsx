// First-run walkthrough (friend feedback #1): a spotlight tour over the loaded
// example, in workflow order — capture → link → views → matrix → queue →
// review → inspector → export. Greys out everything except the highlighted
// element; advances with Next/Back; Esc or Skip ends it. Runs once per
// browser (localStorage flag); re-runnable from the Home screen.

import { useCallback, useEffect, useState } from 'react';
import * as repo from '../model/repo';
import type { StoreSnapshot } from '../model/types';
import { rootQuestions } from '../model/derive';
import { graphStore } from '../model/graphStore';
import { useGraph } from './useGraph';
import { useUI, type ViewId } from './uiStore';
import exampleFixture from '../../fixtures/example.rcanvas.json';

export const TUTORIAL_DONE_KEY = 'rc-tutorial-done';
export const markTutorialDone = () => localStorage.setItem(TUTORIAL_DONE_KEY, '1');
export const tutorialDone = () => !!localStorage.getItem(TUTORIAL_DONE_KEY);

interface Step {
  target: string | null; // CSS selector; null = centered card
  title: string;
  body: string;
  view?: ViewId;
  placement?: 'auto' | 'left';
}

const STEPS: Step[] = [
  {
    target: null,
    title: 'Welcome to Reasoning Canvas',
    body:
      'This tool makes your analysis an explicit, auditable graph: you declare every judgement, and every act goes on the record. This 60-second tour walks the intended workflow on a worked example — an intrusion investigation.',
  },
  {
    target: '.toolbar',
    view: 'canvas',
    title: '1 · Capture',
    body:
      'Every thread is anchored by a question. Capture thinking as typed nodes — press Q, C, A or E anywhere on the canvas, type, and hit Enter. Tab lets you grade a node as you create it.',
  },
  {
    target: 'g[data-node-id]',
    view: 'canvas',
    title: '2 · Link your thinking',
    body:
      'Links carry the reasoning, and they flow one way: evidence → claim (consistent / inconsistent with), claim → assumption (rests on), claim → question (answers). Drag the ⊕ handle on a node onto another node, or select one and press L.',
  },
  {
    target: '.view-switch',
    title: '3 · One graph, four views',
    body:
      'The intended path runs left to right: Canvas to capture, Stratified to structure, Matrix to test claims against evidence, Audit to trace every act. Switching views never changes your data.',
  },
  {
    target: '.canvas-wrap',
    view: 'stratified',
    title: '4 · Stratified',
    body:
      'The same nodes, arranged by role: question, claims, assumptions, then the waterline with evidence below it. Each claim is captioned with its weakest input — the first thing to shore up.',
  },
  {
    target: '.matrix-wrap',
    view: 'matrix',
    title: '5 · The matrix (ACH)',
    body:
      'The analytic core. Claims are columns, evidence rows — click a cell to mark C (consistent) or I (inconsistent). Evidence consistent with every claim greys out: it discriminates nothing. The footer warns when a claim has had no disconfirmation attempted.',
  },
  {
    target: '.queue-badge',
    view: 'canvas',
    title: '6 · The queue',
    body:
      'The queue counts stale judgements: ones never declared, and ones undermined by upstream changes. Nothing clears without your say-so — affirm a judgement unchanged, or revisit it.',
  },
  {
    target: '.review-btn',
    title: '7 · Review',
    body:
      'When capture settles, press Review. It walks the six lenses in order — assumptions, disconfirming evidence, shaky claims, open gaps, stale items, and finally your spine of adopted judgements.',
  },
  {
    target: '.right-panel',
    placement: 'left',
    title: '8 · Inspector & How to',
    body:
      'Select any node and declare its judgements here — likelihood, confidence, validity, source grades. The system never computes one for you. The How-to legend below stays open as a reference.',
  },
  {
    target: '.export-btn',
    title: '9 · Get it out',
    body:
      'The word-picture renders your judgement as prose. The share file is a self-contained briefing — conclusion, matrix summary, stratified picture, audit trail — you can send anyone. The JSON backup moves your whole store.',
  },
  {
    target: null,
    title: 'That’s the loop',
    body:
      'Capture → link → matrix → review → export. Head Home and start your own question — you can rerun this tour any time from the Home screen.',
  },
];

const BOX_W = 340;

export function Tutorial() {
  const g = useGraph();
  const { tutorialStep, setTutorialStep, route, openThread, setView } = useUI();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = tutorialStep != null ? STEPS[tutorialStep] : null;

  const end = useCallback(() => {
    markTutorialDone();
    setTutorialStep(null);
  }, [setTutorialStep]);

  // Step 0 → 1: make sure there's something to tour. Empty store: load the
  // example (same import path as the Home button, logged as ever).
  const begin = async () => {
    let roots = rootQuestions(graphStore.getState());
    if (!roots.length) {
      await repo.importSnapshot(exampleFixture as unknown as StoreSnapshot);
      roots = rootQuestions(graphStore.getState());
    }
    if (!roots.length) return end(); // nothing to tour (import failed?)
    openThread(roots[0].id);
    useUI.getState().dismissBriefing(roots[0].id); // the tour replaces the briefing this once
    setTutorialStep(1);
  };

  // Navigate + measure for the current step.
  useEffect(() => {
    if (tutorialStep == null || !step) return;
    if (tutorialStep === 0) return setRect(null);

    const ui = useUI.getState();
    if (ui.route.screen !== 'thread') {
      const roots = rootQuestions(graphStore.getState());
      if (!roots.length) return end();
      openThread(roots[0].id, step.view ?? 'canvas');
    } else if (step.view && ui.route.screen === 'thread' && ui.route.view !== step.view) {
      setView(step.view);
    }

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const el = step.target ? document.querySelector(step.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    // wait out the view transition (stratified animation ≈ 340ms)
    const t = setTimeout(measure, step.view ? 480 : 180);
    window.addEventListener('resize', measure);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialStep, route.screen, g.loaded]);

  // Esc ends the tour.
  useEffect(() => {
    if (tutorialStep == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
      if (e.key === 'ArrowRight' || e.key === 'Enter') advance(1);
      if (e.key === 'ArrowLeft') advance(-1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialStep]);

  const advance = (dir: 1 | -1) => {
    const cur = useUI.getState().tutorialStep;
    if (cur == null) return;
    if (cur === 0 && dir === 1) return void begin();
    const next = cur + dir;
    if (next >= STEPS.length) return end();
    if (next < 1) return;
    setTutorialStep(next);
  };

  if (tutorialStep == null || !step) return null;

  const pad = 6;
  const spot = rect
    ? {
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // tooltip position
  let boxStyle: React.CSSProperties;
  if (!spot) {
    boxStyle = { left: '50%', top: '38%', transform: 'translate(-50%, -50%)' };
  } else if (step.placement === 'left') {
    boxStyle = {
      left: Math.max(12, spot.left - BOX_W - 16),
      top: Math.min(spot.top + 8, window.innerHeight - 260),
    };
  } else {
    const below = spot.top + spot.height + 210 < window.innerHeight;
    boxStyle = {
      left: Math.min(Math.max(12, spot.left), window.innerWidth - BOX_W - 12),
      top: below ? spot.top + spot.height + 14 : Math.max(12, spot.top - 208),
    };
  }

  const isWelcome = tutorialStep === 0;
  const isLast = tutorialStep === STEPS.length - 1;

  return (
    <div className="tour">
      {spot ? (
        <div className="tour-spotlight" style={spot} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-blocker" onClick={() => advance(1)} />
      <div className="tour-box" style={boxStyle} role="dialog" aria-label={step.title}>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-row">
          <span className="tour-dots">
            {tutorialStep > 0 ? `${tutorialStep} / ${STEPS.length - 1}` : ''}
          </span>
          <span className="tour-actions">
            {isWelcome ? (
              <>
                <button className="btn small" onClick={end}>
                  Skip for now
                </button>
                <button className="btn small primary" onClick={() => void begin()}>
                  Take the tour
                </button>
              </>
            ) : (
              <>
                <button className="btn small" onClick={end}>
                  Skip
                </button>
                {tutorialStep > 1 && (
                  <button className="btn small" onClick={() => advance(-1)}>
                    Back
                  </button>
                )}
                <button className="btn small primary" onClick={() => advance(1)}>
                  {isLast ? 'Finish' : 'Next'}
                </button>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
