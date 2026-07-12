# Reasoning Canvas — User Guide

A local-first tool that turns your analytic reasoning into an explicit, typed,
auditable graph. You declare every judgement yourself — the tool never
computes, suggests, or averages one. Everything you do is recorded in an
append-only log you can inspect at any time.

---

## 1. Launching the app

```sh
cd "THINK GOOD"
npm install        # first time only
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). To pick a port:
`PORT=4000 npm run dev`.

For a production build: `npm run build`, then `npm run preview` to serve it.

**Where your data lives:** entirely in your browser's IndexedDB. Nothing
leaves your machine; there is no server and no network traffic. Different
browsers (or profiles) have separate stores — use **Export ▾ → JSON backup**
to move work between them.

**First run:** a short intro card explains what the tool is and its two
workflows. The full spotlight walkthroughs run on first contact with each
tool: open any ACH thread and the ACH tour starts; open any Diamond incident
and the Diamond tour starts — each over the thread you actually opened.
Rerun the intro from the home screen's **Tutorial** button, and either
walkthrough from the "How to" panel header inside a thread. **Load example**
gives you a worked ACH question and a Diamond incident to explore.

---

## 2. The four node types

| Key | Type | Colour | What it is | Its judgements (all declared by you) |
|-----|------|--------|------------|--------------------------------------|
| `Q` | Question | violet | What you're trying to answer | status, priority, mutually-exclusive flag |
| `C` | Claim | blue | A candidate answer / hypothesis | likelihood (PHIA yardstick), analytic confidence |
| `A` | Assumption | amber | Something you're taking as given | validity (Supported / Caveated / Unsupported), linchpin flag, abandon trigger |
| `E` | Evidence | teal | An observation or report | Admiralty grades: source reliability A–F, information credibility 1–6 |

Node visual grammar, identical in every view:
- **solid blue fill** = adopted claim; outline = open
- **hatched border** = stale (judgements missing or undermined)
- **keystone glyph** (top-right) = linchpin assumption
- **chain-link badge** = promoted from a sub-thread (with a red `!` when its source has changed)

## 3. The four edge types

Only these connections exist — the picker never offers an invalid one:

| Edge | Direction | Meaning |
|------|-----------|---------|
| consistent with | evidence → claim | the evidence is compatible with the claim |
| inconsistent with | evidence → claim | the evidence is hard to square with the claim |
| rests on | claim → assumption | the claim depends on the assumption |
| answers | claim → question | the claim is a candidate answer |

An evidence–claim pair can hold either *consistent* or *inconsistent*, never
both — creating one replaces the other (both acts are logged).

---

## 4. Working the canvas

Every thread is a canvas anchored by one root question.

**Create a node** — press `Q`, `C`, `A`, or `E` (or use the toolbar buttons).
An inline form opens at your cursor: type the text, **Enter** creates it.
Press **Tab** to grade it inline before committing — every dropdown is
skippable. **Esc** cancels. The time from keypress to commit is logged, so
capture stays fast and honest.

**Link two nodes.** A link always connects **two** nodes, so you need at least
two on the canvas — a lone node has nothing to link to. Three equivalent ways
to draw one:
1. **Drag** the small ⊕ handle on a node's right edge onto another node.
2. **Click** the ⊕ handle, then click the target node.
3. Select a node and press **L**, then click the target.

Once you start a link, a **banner across the top tells you what to aim at**
(e.g. "Linking from this claim — now click assumptions or questions"). A picker
then appears listing only the edge types valid for that pair.

**Direction matters** — links only flow one way, so *start from the right end*:
- **from evidence** → to a claim (*consistent* / *inconsistent with*)
- **from a claim** → to an assumption (*rests on*) or a question (*answers*)

So to say "this evidence supports my claim," start the link **from the
evidence**, not the claim. Questions and assumptions never start links — they
only receive them. Press **Esc** to cancel a link in progress.

**Edit a link** — click the edge line: switch consistent↔inconsistent or
remove it.

**The right panel** has two parts: the **Inspector** on top (the selected
node's text, note, and judgement dropdowns — it scrolls if the form is long),
and a permanently-open **"How to"** legend pinned below it: the workflow loop,
node and edge types, views, lenses, and links to the analytic tradecraft the
tool is built on (ACH, Key Assumptions Check, the PHIA yardstick, Admiralty
grading). Its header also carries the **Tutorial** button.

**Everything else:**
- **Click** a node to open it in the Inspector (top of the right panel) — text,
  note, and all judgement dropdowns live there
- **Drag** a node body to reposition (positions are yours; they never change meaning)
- **T** — retype the selected node (its old judgements are preserved in the log; the Inspector shows its type history)
- **Delete / Backspace** — soft-delete (the log keeps a snapshot)
- **F** — fit the view · **scroll** to pan · **⌘/Ctrl + scroll** (or pinch) to zoom
- **▦ Arrange** (toolbar) — snap all nodes into the stratified layout when the
  canvas gets dense; positions stay yours to drag afterwards
- **Esc** — close popup → cancel link → clear lens → deselect, in that order

## 5. Sub-questions and promotion

Press `Q` inside a thread to create a **sub-question**. It appears as a
dashed collapsed node showing its status and, once answered, its adopted
answer. **Double-click it to descend** into its own canvas (breadcrumb at top
left leads back).

When a sub-thread has an adopted answer, select the collapsed node in the
parent and use **"Promote answer to parent as… Evidence / Assumption"**. The
promoted node carries a chain-link badge and starts ungraded — you grade it
in the parent's own terms. If the source answer later changes, the promoted
node is flagged **source changed** and enters the queue.

## 6. Staleness and the queue

Two ways a node goes stale (hatched border):
- **never declared** — required judgements still empty
- **undermined** — something it depends on changed (regrade, retype, edge
  change, status change) since you last declared or affirmed it

The **Queue** badge (top right) counts stale nodes in the current thread
family. Open it to work through them: **Revisit** focuses the node in the
Inspector; **Affirm** records that you re-checked the judgement and stand by
it unchanged. When one change undermined several nodes, they group into a
**cone review** with an "Affirm all remaining" button.

The tool never fixes staleness for you — only your declaration or affirmation
clears it.

## 7. Views (one graph, four renderings)

Switching views never changes data.

- **Canvas** — freeform capture, your positions.
- **Stratified** — the same nodes in bands: Question · Claims · Assumptions ·
  **waterline** · Evidence. Each claim carries a caption naming its weakest
  input (unsupported assumption → stale dependency → caveated assumption →
  lowest evidence grade). Watch the transition — same nodes, new arrangement.
- **Matrix (ACH)** — appears once a question has 2+ answering claims. Claims
  are columns, evidence rows; click a cell to mark C / I. Grey rows are
  **non-diagnostic** (consistent with every hypothesis — they discriminate
  nothing). The footer counts disconfirming evidence per claim and warns when
  none was attempted. After you assess evidence against one claim, a toast
  offers to work it across the unassessed rivals.
- **Audit** — the append-only log, newest first, filterable by node.

**Lenses** (top right) dim or hide everything except what matters right now:
Assumptions check · Spine · Gaps · Disconfirming only · On shaky ground ·
Needs attention. Lenses are ephemeral — Esc or switching views clears them.

**Review** (top right) walks all six lenses in a deliberate order — assumptions
→ disconfirming → shaky → gaps → attention → spine — with a strip explaining
each step. It's the end-of-session discipline: check what you're standing on
before you export.

## 8. Adopting a judgement

Claims start **open**. To adopt one as your judgement, use **"Adopt as
judgement…"** in the Inspector or the matrix column header. One pane shows
everything that should give you pause:

- the claim's declared likelihood and confidence (declare them right there if missing)
- every rival with its inconsistency count and whether disconfirmation was attempted
- the assumptions it rests on, unsupported ones highlighted
- open gaps bearing on the question

Two **soft gates** may fire: *a rival is stronger* (a rival has strictly fewer
inconsistencies) and *unsupported linchpin* (an assumption is Unsupported or
ungraded). A fired gate never blocks you — but it demands a written reason,
which is logged and appears verbatim in the word-picture. Adoption snapshots
the rivals at that moment: your "alternatives considered" record.

Adopting answers the question. Reverting (Inspector → "Revert to open") is a
plain logged act and reopens the question if nothing else answers it. If a
question is marked **mutually exclusive**, a second adoption requires
reverting the first.

## 9. Getting work out

**Export ▾** (top right):
- **Word-picture** — your spine rendered as prose from a fixed template; every
  sentence traces to a node, an enum label, or a logged act. Export as Markdown.
- **Share file** — one self-contained HTML briefing pack: word-picture,
  competing-claims summary (status, likelihood, inconsistency counts,
  disconfirmation coverage), stratified SVG, and a collapsible audit appendix.
  Opens from disk, no network, no JavaScript — the artifact you send a colleague.
- **JSON backup** — the complete store as `.rcanvas.json`; re-import from the
  home screen (import replaces the store and is itself logged).

**Stats** (home screen): median capture time, queue size and age, node counts,
gate overrides.

## 10. Coming back

Reopen a thread after 8+ hours (or with a non-empty queue) and a **re-entry
briefing** greets you: current spine, what changed last session, and the top
of the queue — with a "Start with the queue" shortcut.

## 11. The Diamond Model workflow

The home screen offers a second workflow beside ACH: the **Diamond Model of
Intrusion Analysis** (Caltagirone, Pendergast & Betz, 2013). Name the
**incident** under investigation and decompose it into **events** — each
characterized by up to four **vertices**: Adversary, Capability,
Infrastructure, Victim.

- **Capture** on the same freeform canvas with a per-workflow palette:
  `D` event · `A` adversary · `C` capability · `I` infrastructure · `V` victim
  · `E` evidence · `S` assessment (claim).
- **Vertices are shared nodes**: the same C2 host can *characterize* several
  events — that reuse is the model's pivot move, and the Inspector lists every
  event a vertex appears in.
- **Grade everything**: events carry kill-chain phase, result, and direction
  (plus an optional occurred-on date that orders the lane); vertices carry your
  confidence in the identification; evidence attaches to vertices with the
  usual Admiralty grades. Staleness flows evidence → vertex → event →
  assessment, exactly like the rest of the app.
- **The Kill chain view** (the incident thread's peer of the Matrix) threads
  events into lanes along Lockheed Martin's seven phases. Hollow diamond
  corners are **intelligence gaps**; the Queue lists them, and they clear only
  by filling the missing vertex — never by affirmation.
- **Close the incident** by adopting an assessment claim through the usual
  ceremony. Adopting with open gaps fires a gate that demands a stated reason,
  logged verbatim.

Full specification: `diamond-model-v1-spec.md`.

---

## Keyboard reference

| Key | Where | Action |
|-----|-------|--------|
| `Q` `C` `A` `E` | canvas (question thread) | create node at cursor |
| `D` `A` `C` `I` `V` `E` `S` | canvas (incident thread) | create node at cursor |
| `Enter` / `Tab` / `Esc` | create form | commit / grade inline / cancel |
| `L` | node selected | start a link (click target) |
| `T` | node selected | retype |
| `Delete` | node selected | delete (log keeps snapshot) |
| `F` | canvas | fit view |
| `Esc` | anywhere | close popup → cancel link → clear lens → deselect |
| double-click | sub-question | descend into its thread |
| ⌘/Ctrl + scroll | canvas | zoom at cursor |
