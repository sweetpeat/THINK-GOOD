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

**First run:** the home screen is empty. Either type a question and press
Enter, or click **Load example** to import a worked intrusion-attribution
problem that demonstrates every feature (staleness, the queue, a sub-question,
an ACH matrix, a promoted answer).

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

**Everything else:**
- **Click** a node to open it in the Inspector (right panel) — text, note, and
  all judgement dropdowns live there
- **Drag** a node body to reposition (positions are yours; they never change meaning)
- **T** — retype the selected node (its old judgements are preserved in the log; the Inspector shows its type history)
- **Delete / Backspace** — soft-delete (the log keeps a snapshot)
- **F** — fit the view · **scroll** to pan · **⌘/Ctrl + scroll** (or pinch) to zoom
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
- **Share file** — one self-contained HTML file: word-picture, stratified
  SVG, and a collapsible audit appendix. Opens from disk, no network, no
  JavaScript — the review artifact you send to a colleague.
- **JSON backup** — the complete store as `.rcanvas.json`; re-import from the
  home screen (import replaces the store and is itself logged).

**Stats** (home screen): median capture time, queue size and age, node counts,
gate overrides.

## 10. Coming back

Reopen a thread after 8+ hours (or with a non-empty queue) and a **re-entry
briefing** greets you: current spine, what changed last session, and the top
of the queue — with a "Start with the queue" shortcut.

---

## Keyboard reference

| Key | Where | Action |
|-----|-------|--------|
| `Q` `C` `A` `E` | canvas | create node at cursor |
| `Enter` / `Tab` / `Esc` | create form | commit / grade inline / cancel |
| `L` | node selected | start a link (click target) |
| `T` | node selected | retype |
| `Delete` | node selected | delete (log keeps snapshot) |
| `F` | canvas | fit view |
| `Esc` | anywhere | close popup → cancel link → clear lens → deselect |
| double-click | sub-question | descend into its thread |
| ⌘/Ctrl + scroll | canvas | zoom at cursor |
