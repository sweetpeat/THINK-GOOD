// First-run tours. Three pieces: a short "what all this is" card on the Home
// screen (intro), then a spotlight walkthrough per workflow — ACH or Diamond —
// that starts automatically the first time the analyst opens a thread of that
// kind, over their own thread (or the example). Each runs once per browser
// (localStorage flags); the intro re-runs from Home's Tutorial button, the
// walkthroughs from the How-to panel's Tutorial button inside a thread.

import { useCallback, useEffect, useState } from 'react';
import { threadAncestry, threadWorkflow } from '../model/derive';
import { useGraph } from './useGraph';
import { useUI, type TourKind, type ViewId } from './uiStore';

// Legacy key from the single-tour era: treat it as intro + ACH already seen.
const LEGACY_DONE_KEY = 'rc-tutorial-done';
const DONE_KEYS: Record<TourKind, string> = {
  intro: 'rc-intro-done',
  ach: 'rc-tour-ach-done',
  diamond: 'rc-tour-diamond-done',
};

export const markTourDone = (kind: TourKind) => localStorage.setItem(DONE_KEYS[kind], '1');
export const tourDone = (kind: TourKind): boolean =>
  !!localStorage.getItem(DONE_KEYS[kind]) ||
  (kind !== 'diamond' && !!localStorage.getItem(LEGACY_DONE_KEY));

interface Step {
  target: string | null; // CSS selector; null = centered card
  title: string;
  body: string;
  view?: ViewId;
  placement?: 'auto' | 'left';
}

const INTRO_STEPS: Step[] = [
  {
    target: null,
    title: 'Welcome to Reasoning Canvas',
    body:
      'This tool makes your analysis an explicit, auditable graph: you declare every judgement yourself, and every act goes on the record. It offers two workflows — Analysis of Competing Hypotheses for weighing rival answers to a question, and the Diamond Model for decomposing an intrusion into events and vertices. Open either (or load the example below) and a short tour of that tool will walk you through it.',
  },
];

const ACH_STEPS: Step[] = [
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
      'Capture → link → matrix → review → export. Rerun this tour any time from the Tutorial button in the How-to panel.',
  },
];

const DIAMOND_STEPS: Step[] = [
  {
    target: '.toolbar',
    view: 'canvas',
    title: '1 · Capture the intrusion',
    body:
      'An incident thread decomposes an intrusion into events. Press D to capture an event, and A, C, I, V for its four vertices — adversary, capability, infrastructure, victim. E adds evidence, S drafts an assessment claim.',
  },
  {
    target: 'g[data-node-id]',
    view: 'canvas',
    title: '2 · Characterize events',
    body:
      'Drag a vertex’s ⊕ handle onto an event to link it — the vertex characterizes the event. Vertices are shared nodes: the same C2 host can characterize several events. That reuse is the pivot the Diamond Model is built for.',
  },
  {
    target: 'g[data-node-id]',
    view: 'canvas',
    title: '3 · Gaps are information',
    body:
      'The four small diamonds on an event’s shoulder are its role slots — filled means that vertex is known, hollow is an intelligence gap. Early diamonds are mostly hollow; that’s normal, and the tool keeps score until you fill them.',
  },
  {
    target: '.killchain-wrap',
    view: 'killchain',
    title: '4 · The kill chain',
    body:
      'Events threaded into Lockheed Martin’s seven phases, ordered by their occurred-on dates. An empty lane is itself information. Click a diamond to select the event; click a hollow corner to create the missing vertex on the spot.',
  },
  {
    target: '.queue-badge',
    view: 'canvas',
    title: '5 · The queue and the gaps',
    body:
      'Stale judgements queue here as usual — and incident threads add an intelligence-gaps list: every missing vertex, per event. Gaps never affirm away; they clear only when you identify the missing element.',
  },
  {
    target: '.right-panel',
    placement: 'left',
    title: '6 · Grade everything',
    body:
      'Events carry kill-chain phase, result, and direction; vertices carry your confidence in the identification; evidence attaches to vertices with Admiralty grades. Staleness flows evidence → vertex → event → assessment, and the system never computes a judgement for you.',
  },
  {
    target: null,
    title: '7 · Close with an assessment',
    body:
      'When the map is good enough to say something, press S to draft an assessment claim, link it to the incident with answers, and adopt it from the Inspector. Adopting with open gaps fires a gate: you state a reason, and it goes on the record verbatim.',
  },
  {
    target: null,
    title: 'That’s the Diamond loop',
    body:
      'Capture events → link vertices → thread the kill chain → close the gaps → adopt an assessment. Rerun this tour any time from the Tutorial button in the How-to panel.',
  },
];

const TOURS: Record<TourKind, Step[]> = {
  intro: INTRO_STEPS,
  ach: ACH_STEPS,
  diamond: DIAMOND_STEPS,
};

const BOX_W = 340;

export function Tutorial() {
  const g = useGraph();
  const { tutorial, setTutorial, route, setView, dismissBriefing } = useUI();
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = tutorial ? TOURS[tutorial.kind][tutorial.step] : null;

  const end = useCallback(() => {
    const cur = useUI.getState().tutorial;
    if (cur) markTourDone(cur.kind);
    setTutorial(null);
  }, [setTutorial]);

  // Auto-start: first time a thread of a workflow is opened, tour it (the
  // Home intro auto-offers from Home.tsx). The briefing yields this once.
  useEffect(() => {
    if (route.screen !== 'thread' || useUI.getState().tutorial) return;
    const workflow = threadWorkflow(g, route.threadId);
    if (tourDone(workflow)) return;
    const rootId = threadAncestry(g, route.threadId)[0]?.id ?? route.threadId;
    dismissBriefing(rootId);
    setTutorial({ kind: workflow, step: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.screen, route.screen === 'thread' ? route.threadId : null]);

  // Navigate + measure for the current step.
  useEffect(() => {
    if (!tutorial || !step) return;
    if (tutorial.kind === 'intro') return setRect(null);

    const ui = useUI.getState();
    if (ui.route.screen !== 'thread') return end(); // left the thread mid-tour
    if (step.view && ui.route.view !== step.view) setView(step.view);

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
  }, [tutorial, route.screen, g.loaded]);

  // Esc ends the tour; arrows/Enter advance.
  useEffect(() => {
    if (!tutorial) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end();
      if (e.key === 'ArrowRight' || e.key === 'Enter') advance(1);
      if (e.key === 'ArrowLeft') advance(-1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial]);

  const advance = (dir: 1 | -1) => {
    const cur = useUI.getState().tutorial;
    if (!cur) return;
    const next = cur.step + dir;
    if (next >= TOURS[cur.kind].length) return end();
    if (next < 0) return;
    setTutorial({ ...cur, step: next });
  };

  if (!tutorial || !step) return null;

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

  const isIntro = tutorial.kind === 'intro';
  const len = TOURS[tutorial.kind].length;
  const isLast = tutorial.step === len - 1;

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
          <span className="tour-dots">{isIntro ? '' : `${tutorial.step + 1} / ${len}`}</span>
          <span className="tour-actions">
            {isIntro ? (
              <button className="btn small primary" onClick={end}>
                Got it
              </button>
            ) : (
              <>
                <button className="btn small" onClick={end}>
                  Skip
                </button>
                {tutorial.step > 0 && (
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
