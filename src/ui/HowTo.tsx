// Permanently-open reference legend, pinned to the bottom of the right panel.
// Written to be worked from, not just read: the loop first, then the
// vocabulary, then the tradecraft this tool is built on. The Tutorial button
// re-runs the current thread's workflow walkthrough.

import type { ReactNode } from 'react';
import { threadAncestry, threadWorkflow } from '../model/derive';
import { useGraph } from './useGraph';
import { useUI } from './uiStore';

const NODE_ROWS: { chip: string; cls: string; text: ReactNode }[] = [
  {
    chip: 'Q',
    cls: 'question',
    text: <><b>Question</b> — what you're trying to answer. Every canvas hangs off one; sub-questions nest inside and report back.</>,
  },
  {
    chip: 'C',
    cls: 'claim',
    text: <><b>Claim</b> — a possible answer. You grade how likely it is and how confident you are; adopting one as your judgement is a deliberate, logged act.</>,
  },
  {
    chip: 'A',
    cls: 'assumption',
    text: <><b>Assumption</b> — what you're taking on trust to proceed. Grade its validity honestly, and flag the linchpins your whole case leans on.</>,
  },
  {
    chip: 'E',
    cls: 'evidence',
    text: <><b>Evidence</b> — what you've actually observed. Grade the source A–F and the information 1–6, so “B2” reads as data, not vibes.</>,
  },
];

const EDGE_ROWS: { name: string; dir: string; text: string }[] = [
  { name: 'consistent with', dir: 'evidence → claim', text: 'this observation fits the claim' },
  { name: 'inconsistent with', dir: 'evidence → claim', text: 'this observation cuts against it' },
  { name: 'rests on', dir: 'claim → assumption', text: 'if the assumption falls, the claim falls' },
  { name: 'answers', dir: 'claim → question', text: 'the claim is a candidate answer' },
];

const VIEW_ROWS: { name: string; text: string }[] = [
  { name: 'Canvas', text: 'think freely — position is yours and means nothing to the machine.' },
  { name: 'Stratified', text: 'the argument by role: question over claims over assumptions, evidence below the waterline. Every claim is captioned with its weakest input.' },
  { name: 'Matrix', text: 'the honesty table. Does each piece of evidence actually discriminate between rivals? Grey rows fit everything and prove nothing; the footer shows who has never faced disconfirmation.' },
  { name: 'Audit', text: 'every act you took, timestamped, unerasable.' },
];

const LENS_ROWS: { name: string; text: string }[] = [
  { name: 'Assumptions', text: 'only the load-bearing beliefs — check each validity still holds.' },
  { name: 'Spine / Answers', text: 'the judgements you\'ve adopted and the questions they settle.' },
  { name: 'Gaps', text: 'open questions worth collecting against.' },
  { name: 'Disconfirming only', text: 'the evidence that says no. If this view is empty, worry.' },
  { name: 'On shaky ground', text: 'claims standing on unsupported assumptions or stale inputs.' },
  { name: 'Needs attention', text: 'everything stale, shown in place — the Queue, spatially.' },
];

const DIAMOND_ROWS: { chip: string; cls: string; text: ReactNode }[] = [
  {
    chip: '◆',
    cls: 'incident',
    text: <><b>Incident</b> — the intrusion under investigation. Anchors a Diamond thread; closes by adopting an assessment.</>,
  },
  {
    chip: 'D',
    cls: 'diamond_event',
    text: <><b>Event</b> — one adversary action. Graded with kill-chain phase, result, and direction; its four corners show which vertices are known.</>,
  },
  {
    chip: 'Ad',
    cls: 'adversary',
    text: <><b>Adversary</b> · <b>Capability</b> · <b>Infrastructure</b> · <b>Victim</b> — the four vertices. Shared nodes: the same C2 host can characterize several events (that's the pivot). Grade your confidence in each identification; back it with evidence.</>,
  },
];

const THEORY_ROWS: { name: string; href: string; text: string }[] = [
  {
    name: 'Analysis of Competing Hypotheses',
    href: 'https://en.wikipedia.org/wiki/Analysis_of_competing_hypotheses',
    text: 'Heuer\'s method behind the Matrix: line up rival explanations and let disconfirming evidence do the judging.',
  },
  {
    name: 'Key Assumptions Check',
    href: 'https://www.cia.gov/resources/csi/static/Tradecraft-Primer-apr09.pdf',
    text: 'CIA tradecraft behind the validity grades: assumptions are Supported, Caveated, or Unsupported — and unsupported ones become collection priorities.',
  },
  {
    name: 'PHIA Probability Yardstick',
    href: 'https://www.gov.uk/government/publications/explaining-uncertainty-in-uk-intelligence-assessment/explaining-uncertainty-in-uk-intelligence-assessment',
    text: 'The UK standard behind the seven likelihood terms — and the separate low/moderate/high confidence scale.',
  },
  {
    name: 'Admiralty system',
    href: 'https://en.wikipedia.org/wiki/Admiralty_code',
    text: 'NATO\'s two-axis evidence grading: source reliability (A–F) × information credibility (1–6).',
  },
  {
    name: 'Diamond Model of Intrusion Analysis',
    href: 'https://apps.dtic.mil/sti/pdfs/ADA586960.pdf',
    text: 'Caltagirone, Pendergast & Betz (2013): every intrusion event has an adversary, capability, infrastructure, and victim — and events thread into activity chains.',
  },
  {
    name: 'Cyber kill chain',
    href: 'https://www.lockheedmartin.com/en-us/capabilities/cyber/cyber-kill-chain.html',
    text: 'Lockheed Martin\'s seven phases, from reconnaissance to actions on objectives — the ordering behind the Kill chain view.',
  },
];

export function HowTo({ threadId }: { threadId: string }) {
  const g = useGraph();
  const setTutorial = useUI((s) => s.setTutorial);
  const workflow = threadWorkflow(g, threadId);
  return (
    <section className="howto" aria-label="How to">
      <div className="howto-titlebar">
        <h2 className="howto-title">How to</h2>
        <button
          className="btn small"
          onClick={() => {
            const rootId = threadAncestry(g, threadId)[0]?.id ?? threadId;
            useUI.getState().dismissBriefing(rootId);
            setTutorial({ kind: workflow, step: 0 });
          }}
          title={`Re-run the ${workflow === 'diamond' ? 'Diamond Model' : 'ACH'} walkthrough`}
        >
          Tutorial
        </button>
      </div>
      <div className="howto-scroll">
        <h3>The loop</h3>
        <p className="howto-lead">
          <b>Capture → link → matrix → review → export.</b> Get thoughts down fast, wire them
          into an argument, test claims against evidence, walk the lenses, then hand over a
          word-picture someone can actually audit. The <b>Tutorial</b> button above walks it live.
        </p>

        <h3>Nodes</h3>
        <p className="howto-lead">
          Four kinds of thought. Press the key on the canvas, type, <kbd>Enter</kbd>. Every
          judgement on them is yours — the tool never computes one.
        </p>
        <ul className="howto-nodes">
          {NODE_ROWS.map((r) => (
            <li key={r.chip}>
              <span className={`chip ${r.cls}`}>{r.chip}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
        <p className="howto-note">
          Reading a node: solid fill = adopted · hatched border = stale · keystone = linchpin ·
          chain-link = promoted from a sub-thread.
        </p>

        <h3>Edges</h3>
        <p className="howto-lead">
          Four links, fixed directions. Evidence and claims <em>give</em>; questions and
          assumptions <em>receive</em> — so start the drag (⊕ or <kbd>L</kbd>) from the giving end.
        </p>
        <ul className="howto-edges">
          {EDGE_ROWS.map((r) => (
            <li key={r.name}>
              <span className="howto-edge-name mono">{r.name}</span>
              <span className="howto-edge-dir mono">{r.dir}</span>
              <span className="howto-edge-text">{r.text}</span>
            </li>
          ))}
        </ul>

        <h3>Diamond Model threads</h3>
        <p className="howto-lead">
          The second workflow, for intrusions: <b>capture events → link vertices → thread the
          kill chain → close the gaps → adopt an assessment.</b> Hollow diamond corners are
          intelligence gaps; the Queue lists them until you fill them.
        </p>
        <ul className="howto-nodes">
          {DIAMOND_ROWS.map((r) => (
            <li key={r.chip}>
              <span className={`chip ${r.cls}`}>{r.chip}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
        <p className="howto-note">
          New links: a vertex <em>characterizes</em> an event; evidence is
          consistent/inconsistent with a vertex; an assessment claim <em>answers</em> the
          incident.
        </p>

        <h3>Views</h3>
        <p className="howto-lead">
          Four renderings of the same graph — switching never touches your data.
        </p>
        <ul className="howto-defs">
          {VIEW_ROWS.map((r) => (
            <li key={r.name}>
              <b>{r.name}</b> — {r.text}
            </li>
          ))}
        </ul>

        <h3>Lenses</h3>
        <p className="howto-lead">
          Six ways to interrogate the canvas. They dim or hide, never edit; <kbd>Esc</kbd>{' '}
          clears. <b>Review</b> (top bar) walks all six in order — do it before you export.
        </p>
        <ul className="howto-defs">
          {LENS_ROWS.map((r) => (
            <li key={r.name}>
              <b>{r.name}</b> — {r.text}
            </li>
          ))}
        </ul>

        <h3>Where this comes from</h3>
        <p className="howto-lead">
          Nothing here is invented. The tool is a working surface for four pieces of
          published analytic tradecraft:
        </p>
        <ul className="howto-defs howto-theory">
          {THEORY_ROWS.map((r) => (
            <li key={r.name}>
              <a href={r.href} target="_blank" rel="noopener noreferrer">
                {r.name}
              </a>{' '}
              — {r.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
