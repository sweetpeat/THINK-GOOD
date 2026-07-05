# Reasoning Canvas — v1 Build Specification

**Audience:** Claude Code. This document is the complete authority for the v1 build. Where it is silent, choose the simplest option consistent with §0. Where it is explicit, follow it exactly.

---

## 0. What this is, and the invariants

A local-first, single-user web app that makes human analytic reasoning an explicit, typed, auditable graph. The analyst captures Questions, Claims, Assumptions, and Evidence as typed nodes; connects them with a closed set of reasoning edges; declares every judgement themselves; and renders the same graph as a freeform canvas, a stratified tier view, filtered lenses, an ACH matrix, and a prose "word-picture." Every consequential act is an immutable event in an append-only log. Reaching a conclusion is a gated, logged, reversible ceremony.

### Non-negotiable invariants — violating any of these is a build failure

1. **No computed judgement.** The system never calculates, suggests, averages, propagates, or defaults any likelihood, confidence, validity, or source grade. Every judgement value in the store was typed or selected by the user. The system may *compute reachability, counts, and displays* (which nodes are stale, which evidence is non-diagnostic, what a claim's weakest input is) — never judgement values.
2. **No AI anywhere in v1.** No API calls, no embeddings, no classifiers, no generated prose. The word-picture is a deterministic template fill.
3. **One graph, many renderings.** Every view is a pure function of (graph, log). Views hold no content and never mutate state. The only view-owned data is each node's `x,y` position on the co-located canvas.
4. **Append-only log.** Log events are never updated or deleted. All history features (type-history, audit trail, adoption record) are filters over the log.
5. **Closed enums, open text.** Fields the machine consumes (type, status, grades, edge type) are closed enums selected from constrained controls. Free-text fields never affect any sort, layout, lens, gate, or computation.
6. **Non-destructive lenses.** Filtering/arranging never edits. Any operation that edits is an explicit, logged act.
7. **Human-owned semantics.** Retyping, regrading, grouping, adopting, and overriding are user acts, each logged. Gates are soft: they demand a stated reason, never block.

### Non-goals for v1 (do not build)

No AI/disagreement engine; no auth, accounts, multi-user, or server sync; no world/entity layer or user-defined edge labels; no support groups or enforced confidence caps; no Indicator node type; no Brier/calibration; no depth/x-ray view; no side-by-side frames; no real-time collaboration; no mobile layout (desktop-width responsive floor is enough).

---

## 1. Architecture and stack

- **Stack:** Vite + React + TypeScript SPA. State via a single store (Zustand or equivalent). Rendering of both canvas views in SVG (no canvas-2D; SVG keeps the share export trivial). No backend.
- **Persistence:** IndexedDB (Dexie or idb) holding exactly three tables: `nodes`, `edges`, `events`. Plus **Export/Import**: one-click download of the full store as a single JSON file (`.rcanvas.json`), and import of same (import replaces the store after confirmation; the import is itself logged).
- **Repository layer:** all mutations go through a single module (`repo.ts`) that (a) validates against the schemas in §2, (b) writes the mutation, and (c) appends the corresponding event(s) atomically. UI code never touches Dexie directly. `events` has no update/delete methods — do not implement them.
- **IDs:** `nanoid`. **Timestamps:** ISO-8601 UTC.
- **Derived state** (staleness, queue, competing sets, diagnosticity, spine, weakest-input) is computed by pure functions in `derive.ts` from (nodes, edges, events) and memoised. Nothing derived is persisted except as noted for staleness (§2.7).

---

## 2. Data model

### 2.1 Node — common shape

```ts
type NodeType = 'question' | 'claim' | 'assumption' | 'evidence';

interface BaseNode {
  id: string;
  type: NodeType;              // mutable via retype (logged)
  text: string;                // the free-text content; never machine-read
  note?: string;               // optional free text; never machine-read
  threadId: string;            // the question-thread this node belongs to (§2.6)
  x: number; y: number;        // co-located canvas position
  createdAt: string;
  derivedFrom?: string;        // provenance: claim id this node was promoted from (§2.6)
  stale: StaleState;           // §2.7
}
```

### 2.2 Type-specific judgement fields (all nullable = undeclared)

```ts
interface QuestionNode extends BaseNode {
  type: 'question';
  status: 'open' | 'answered';
  mutuallyExclusive: boolean;          // default false; flags its competing set as ME
  priority?: 'low' | 'moderate' | 'high';  // diagnostic/collection priority
}

interface ClaimNode extends BaseNode {
  type: 'claim';
  status: 'open' | 'adopted';
  likelihood?: Likelihood;             // PHIA yardstick
  confidence?: 'low' | 'moderate' | 'high';   // PHIA AnCR
}

interface AssumptionNode extends BaseNode {
  type: 'assumption';
  validity?: 'supported' | 'caveated' | 'unsupported';  // Key Assumptions Check
  linchpin: boolean;                   // default false
  abandonTrigger?: string;             // free text; optional; never machine-read
}

interface EvidenceNode extends BaseNode {
  type: 'evidence';
  sourceReliability?: 'A'|'B'|'C'|'D'|'E'|'F';   // Admiralty part 1
  infoCredibility?: 1|2|3|4|5|6;                  // Admiralty part 2
  sourceNote?: string;                 // free text ("where this came from")
}

type Likelihood =
  | 'remote_chance'          // Remote chance
  | 'highly_unlikely'        // Highly unlikely
  | 'unlikely'               // Unlikely
  | 'realistic_possibility'  // Realistic possibility
  | 'likely'                 // Likely / probable
  | 'highly_likely'          // Highly likely
  | 'almost_certain';        // Almost certain
```

Enum display labels (use everywhere, including exports):

- **Likelihood:** Remote chance · Highly unlikely · Unlikely · Realistic possibility · Likely / probable · Highly likely · Almost certain.
- **Analytic confidence:** Low · Moderate · High.
- **Source reliability:** A Completely reliable · B Usually reliable · C Fairly reliable · D Not usually reliable · E Unreliable · F Cannot be judged.
- **Information credibility:** 1 Confirmed by other sources · 2 Probably true · 3 Possibly true · 4 Doubtful · 5 Improbable · 6 Cannot be judged.
- **Assumption validity:** Supported · Caveated · Unsupported.

**Retyping** a node keeps `id`, `text`, `note`, position, thread, edges (subject to edge-validity cleanup below) and **nulls all type-specific judgement fields** of the old type (the values are preserved in the log via the retype event's `before` payload). Any edges made invalid by the retype (per §2.3 matrix) are deleted, each deletion logged.

**Fully graded** (used by the queue): question — always (no judgements); claim — `likelihood` and `confidence` both set; assumption — `validity` set (linchpin/abandonTrigger optional); evidence — both Admiralty dials set.

### 2.3 Edges — closed set

```ts
type EdgeType = 'consistent_with' | 'inconsistent_with' | 'rests_on' | 'answers';

interface Edge {
  id: string;
  type: EdgeType;
  from: string;   // node id
  to: string;     // node id
  createdAt: string;
}
```

Validity matrix (enforce in `repo.ts`; the edge-creation UI only ever offers valid types):

| Edge | from → to | Meaning |
|---|---|---|
| `consistent_with` | evidence → claim | evidence is compatible with the claim |
| `inconsistent_with` | evidence → claim | evidence is hard to square with the claim |
| `rests_on` | claim → assumption | claim depends on the assumption |
| `answers` | claim → question | claim is a candidate answer to the question |

No other (type, endpoint) combinations exist. No claim→claim edges: chains of reasoning are expressed through sub-questions and promotion (§2.6). Duplicate edges (same type, from, to) are rejected. At most one of consistent/inconsistent may exist between a given evidence–claim pair (creating the other replaces it; both the removal and creation are logged).

### 2.4 Dependency direction (for staleness)

"B depends on A" means a change to A undermines B's judgement:

- claim depends on: every assumption it `rests_on`; every evidence with a consistent/inconsistent edge to it; the source claim of any node carrying `derivedFrom` that supports it (transitively through that promoted node).
- question depends on: its adopted answering claim(s).
- a promoted node (`derivedFrom` set) depends on its source claim.

The **dependency cone of X** = all nodes reachable from X by repeatedly following "depends on" in reverse (i.e., everything that ultimately consumes X).

### 2.5 Competing sets (derived)

For a question Q: `competingSet(Q) = all claims with an answers-edge to Q`. A set is "live" when it has ≥ 2 members. `Q.mutuallyExclusive` annotates the set's display; it changes no computation in v1.

### 2.6 Threads and nesting

- Every canvas is a **thread**, anchored by exactly one root question. `threadId` = the anchoring question's node id. The app opens on a "home" list of root threads.
- A **sub-question** is a question node created inside a parent thread. It renders in the parent as a single collapsed node showing its text, status, and (when answered) its adopted answer's text + likelihood/confidence. **Double-click descends** into the sub-question's own thread (breadcrumb trail at top; sub-question's `threadId` is its own id; its `parentThreadId`—add this nullable field to QuestionNode—points up).
- **Promotion (manual only):** when a sub-thread has an adopted claim, the collapsed node in the parent offers "Promote answer to parent as… [Evidence | Assumption]". This creates a new node in the parent thread with `text` copied from the adopted claim, `derivedFrom` = that claim's id, judgements null (the analyst grades it in the parent's own terms). Logged as `node_promoted`. If the source claim later changes status, likelihood, confidence, or is retyped, the promoted node stale-flags (§2.7) and renders a "source changed" badge.

### 2.7 Staleness

```ts
type StaleState =
  | { kind: 'fresh' }
  | { kind: 'never_declared' }                    // required judgement fields null
  | { kind: 'undermined'; causeEventId: string }; // upstream change since last declaration/affirmation
```

- `never_declared` is **derived** on the fly from null judgement fields (do not store it).
- `undermined` **is stored** on the node (the one exception to "derived not persisted", because it must survive reload cheaply): when a **staling event** occurs on node X, `repo.ts` computes X's dependency cone and marks every cone member that currently has ≥1 declared judgement as `undermined` (recording the causing event id; an already-undermined node keeps its earliest cause).
- **Staling events:** retype; any judgement-field change; claim status change; edge create/delete of any reasoning edge (stales the `to`/consumer side and its cone); promotion-source changes as in §2.6.
- **Clearing:** a node returns to `fresh` when the user either re-declares any judgement field on it (a `judgement_declared` event) or explicitly **affirms** it unchanged (`judgement_affirmed` event). Both are available per-node and in batch (§5.6).
- Question nodes never hold `undermined` (they carry no judgement); text edits log but stale nothing.

---

## 3. Event log

```ts
interface Event {
  id: string;
  at: string;                 // ISO timestamp
  type: EventType;
  nodeId?: string;
  edgeId?: string;
  threadId: string;
  payload: unknown;           // before/after snapshots as relevant
  reason?: string;            // REQUIRED for gate overrides; optional elsewhere
}

type EventType =
  | 'node_created'            // payload: full node; plus captureMs (§5.7)
  | 'node_text_edited'
  | 'node_retyped'            // payload: { before: {type, judgements}, after: {type} }
  | 'judgement_declared'      // payload: { field, before, after }
  | 'judgement_affirmed'      // payload: { fields }  (stale cleared, values unchanged)
  | 'node_deleted'            // soft-delete: node gets deletedAt, hidden everywhere; log keeps snapshot
  | 'edge_created' | 'edge_deleted'
  | 'claim_status_changed'    // open<->adopted; payload includes ceremony snapshot on adopt (§5.5)
  | 'gate_overridden'         // payload: { gate: 'rival_stronger'|'unsupported_linchpin', snapshot }, reason required
  | 'node_promoted'           // payload: { sourceClaimId, asType }
  | 'question_status_changed'
  | 'store_imported'
  | 'thread_created';
```

Rules: every repo mutation appends ≥1 event in the same transaction; events are immutable; the **Audit view** (a simple reverse-chronological list per thread, filterable by node) is just this table rendered.

---

## 4. Derived computations (all deterministic; implement in `derive.ts` with unit tests)

1. **Queue** (§5.6): all nodes where `stale.kind !== 'fresh'`, ordered: `undermined` (oldest cause first) → `never_declared` (oldest node first).
2. **Weakest-input annotation** for a claim C: among C's direct dependencies (assumptions via rests_on; evidence via consistent/inconsistent), the "weakest" is chosen by this priority: any Unsupported assumption → any never-declared/undermined dependency → any Caveated assumption → lowest evidence grade (order F→A within reliability, 6→1 within credibility; reliability outranks credibility) → none. Display only; never gates, never alters values.
3. **Diagnosticity (display):** in a live competing set, an evidence node is **non-diagnostic** iff it has consistent_with edges to every claim in the set and no inconsistent_with edge to any. Rendered grey in the matrix.
4. **Disconfirmation coverage** per claim in a set: count of inconsistent_with edges into it, plus a boolean "disconfirmation attempted" (count ≥ 1).
5. **Spine:** all adopted claims across a root thread and its descendant threads, each with its question, arranged by thread hierarchy (root first, then depth-first).
6. **Stats page (minimal):** median `captureMs`; queue size and oldest item age; per-type node counts; count of gate overrides. All from the log — no extra instrumentation beyond `captureMs`.

---

## 5. Views and interaction

### 5.0 Global frame

Left: breadcrumb (Home / root question / …sub-question). Center: view switcher — **Canvas · Stratified · Matrix · Audit**. Right: **queue badge** (count; click opens Queue panel), Lens menu, Export menu (Word-picture · Share file · JSON backup). A right-hand **Inspector** panel shows the selected node's form: type, text, note, and its type-specific judgement dropdowns; every dropdown change is a `judgement_declared` event; an "Affirm unchanged" button appears on stale nodes.

### 5.1 Capture (co-located canvas)

- Freeform pan/zoom SVG canvas. Node positions persist.
- **Keyboard-first creation:** with the canvas focused, pressing **Q / C / A / E** opens an inline node form at the cursor: a text input (focused), the type shown as a chip. **Enter commits** (creates node, logs `node_created` with `captureMs` = ms from keypress to commit). **Esc cancels.** **Tab** cycles into the type's judgement dropdowns *before* committing for analysts who want to grade inline — every one skippable; Enter commits from any field.
- Toolbar buttons duplicate Q/C/A/E for mouse users.
- **Edges:** drag from node edge-handle to target node → a picker appears listing **only** the edge types valid for that (from,to) type pair (§2.3); one click creates. Keyboard: select node, press **L**, click target.
- **Retype:** select node, press **T** (or Inspector) → type picker → logs `node_retyped`, triggers staleness per §2.7. The node's **type-history** (filter of the log) is visible in the Inspector.
- Node visual grammar (consistent across all views): type = colour + small glyph; claim status adopted = filled/solid vs open = outline; **stale (either kind) = hatched border**; linchpin assumption = keystone glyph; `derivedFrom` = small chain-link badge (with "source changed" variant when undermined by its source).

### 5.2 Stratified view

Deterministic layout of the same thread; smooth-animated transition from canvas positions (positions here are computed, never stored):

- Bands top→bottom: **Question** (root question + sub-question collapsed nodes) · **Claims** · **Assumptions** · **waterline (drawn horizontal rule)** · **Evidence**.
- Within-band order: barycentric by connected neighbours' positions (minimise crossings, one pass is fine), tie-break by `createdAt`. Edges drawn as verticals/curves crossing bands.
- Each claim renders its **weakest-input annotation** (§4.2) as a one-line caption, e.g. "⚠ rests on unsupported assumption: 'access implies intent'". Advisory text only.
- Clicking any node selects it (Inspector opens); double-click a sub-question descends.

### 5.3 Lens engine

One generic mechanism: `lens = { predicate(node, derived) , dim | hide }` applied over the current view (works on both Canvas and Stratified; non-matching nodes are dimmed to 15% by default, hidden on toggle). Ship these **presets** in the Lens menu:

1. **Assumptions** (Key Assumptions Check): only assumptions, captioned with validity + linchpin.
2. **Spine / Answers:** adopted claims + their questions.
3. **Gaps:** open questions that sit in a live competing-set context or have priority set.
4. **Disconfirming only:** evidence with ≥1 inconsistent_with edge (and those edges).
5. **On shaky ground:** claims whose weakest input is an Unsupported assumption or a stale node.
6. **Needs attention:** all stale nodes (mirrors the queue spatially).

Lenses are ephemeral; switching view or pressing Esc clears them. No custom lens builder in v1.

### 5.4 Matrix view (ACH)

Available when the current thread's root (or a selected) question has a live competing set:

- Grid: claims as columns (header shows text, status, declared likelihood/confidence); evidence rows (header shows text + Admiralty grade or "ungraded" hatch). Cell = C (consistent), I (inconsistent), or blank. **Clicking a blank cell creates the edge** via a two-option picker (C/I); clicking an existing cell offers switch/remove. All logged as edge events.
- Non-diagnostic rows (§4.3) render grey with a "non-diagnostic" tag.
- Column footer: disconfirmation coverage (count of I; "no disconfirmation attempted" warning when zero).
- **Work-across prompt (non-blocking):** whenever an evidence→claim edge is created (any view) and the claim is in a live set, show a dismissible toast: "Assessed against *H2*. Unassessed: *H1, H3* — open matrix row?" Clicking focuses that evidence row in the Matrix. Dismissal is not logged; this is a courtesy, not a queue item.

### 5.5 Adoption ceremony

Triggered by attempting claim status open→adopted (Inspector button "Adopt as judgement" or matrix column header):

One modal pane, everything pre-computed, no wizard steps:

1. The claim, with its declared likelihood + confidence ("undeclared" shown loudly if null — declaring them right here is allowed and logged).
2. **Rivals table** (competing set minus candidate): each rival's text, status, I-count, disconfirmation-attempted flag.
3. **Linchpins:** assumptions the candidate rests on, with validity; Unsupported ones highlighted.
4. **Open gaps** bearing on the set (Gaps-lens result scoped to this question).
5. Gate area:
   - **Gate A — rival stronger:** fires if any rival has a strictly lower I-count than the candidate.
   - **Gate B — unsupported linchpin:** fires if any rests-on assumption is `unsupported` **or** has never-declared validity.
   - A fired gate shows its evidence and a **required reason** textarea; the Adopt button stays enabled — clicking it with fired gates logs `gate_overridden` (one per gate, with reason) then `claim_status_changed`.
6. Adopting stores a **ceremony snapshot** in the event payload: rivals + I-counts + linchpin states at that moment. This is the "alternatives considered" record the word-picture reads.
7. Adoption also sets the question's status to `answered` (logged). **Reversal** (adopted→open) is a plain logged status change from the Inspector, and reopens the question if no other adopted answer remains.
8. Multiple adopted claims on one question are allowed only when `mutuallyExclusive` is false; if true, adopting a second requires reverting the first (the pane says so).

### 5.6 Queue and batch affirmation

The Queue panel (from the badge) lists stale items per §4.1, each row: node text, type chip, stale kind, cause ("undermined by: retype of 'X' 2d ago"). Clicking focuses the node with Inspector open.

**Batch affirmation:** when ≥2 undermined items share one `causeEventId`, the queue groups them as a **cone review**: header shows the causing change; body lists affected nodes with their current judgements; per-row choice **Affirm** (unchanged) or **Revisit** (opens Inspector); a top **"Affirm all remaining"** button. Affirmations log `judgement_affirmed` per node.

### 5.7 Re-entry briefing

On opening a root thread when (queue > 0) OR (events exist since the previous session — session boundary: >8h since last event), show a dismissible briefing pane before the canvas: current **spine**, **what changed** (log entries since last session, condensed), and the **queue** top items in priority order. One button: "Start with the queue" / "Dismiss".

### 5.8 Word-picture (deterministic template)

Export menu → renders the root thread's spine into prose-shaped plain sections. **Template (fill slots verbatim from data; omit a bullet only when its source is empty; never invent text):**

```
# {root question text}

**Judgement:** {adopted claim text} — assessed as {Likelihood label},
{Confidence label} confidence. {If undeclared: "(likelihood/confidence not yet declared)"}

**Basis:**
- Rests on {n} assumption(s): {for each: text — Validity label, "linchpin" if flagged}.
- Evidence consistent: {for each consistent evidence: text [grade]}.
- Evidence inconsistent with this judgement: {…} {or "None recorded — no
  disconfirmation survives against this judgement." only if I-edges exist to rivals;
  else "No disconfirmation was recorded against this judgement."}

**Alternatives considered** (from the adoption record of {date}):
- {rival text} — {I-count} inconsistent item(s). {Override reason if gate A fired: "Adopted over this rival: {reason}"}

**Sub-judgements this rests on:** {for each promoted node: parent text ← source thread question + adopted answer, with its likelihood/confidence}

**Outstanding gaps:** {open questions w/ priority}

**Assumption watch:** {linchpins with abandon-trigger text}

---
Audit: {n} events · {n} retypes · {n} gate overrides · generated {timestamp}
```

Rendered in-app as a read-only page; exportable as Markdown.

### 5.9 Share file

Export menu → single self-contained static **HTML file**: the word-picture, an inline SVG of the stratified view (current lens cleared), and a collapsible audit appendix (the thread's event list, human-readable). No JS required to read it. This file is the v1 transfer/review artifact.

---

## 6. Design direction (brief, binding where stated)

Keyboard-first, information-dense, calm. This is an analyst's instrument, not a dashboard — no gradients-and-big-number aesthetics, no decorative animation; the one permitted motion is the canvas↔stratified transition, because it carries meaning (same nodes, new arrangement). Pick a restrained palette where **node-type colours are the only saturated hues** and mean the same thing in every view, caption, matrix header, and export. Typography: one legible UI face + a monospaced face for grades/labels (grades like "B2" should read as data). Stale hatching, the waterline rule, and the keystone/linchpin glyph are the signature visual devices — make those three excellent and keep everything else quiet. Visible keyboard focus throughout; every mouse action has a keyboard path.

---

## 7. Fixture dataset (ship as a loadable example)

Include `fixtures/example.rcanvas.json`: a small intrusion-attribution problem. Root question "Is APT-Q responsible for the intrusion at ACME?"; competing set of 3 claims (APT-Q / criminal affiliate / insider); ~8 evidence nodes with mixed Admiralty grades incl. one deliberately non-diagnostic item and one ungraded; 4 assumptions incl. one Unsupported linchpin; one sub-question ("Was the loader custom-built?") with an adopted answer promoted into the parent as evidence; a handful of retype and affirmation events pre-seeded so type-history, staleness, the queue, and the briefing all demo on first load. "Load example" appears on the empty home screen.

---

## 8. Build order and acceptance criteria

Build in this order; each phase has a demoable checkpoint. Write unit tests for `derive.ts` and `repo.ts` as you go (Vitest).

**P1 — Store + log.** Schemas, repo, Dexie tables, JSON export/import, audit view. ✓ Every mutation produces an event; events table has no update/delete path; export→wipe→import round-trips byte-identically (minus import event).

**P2 — Capture canvas.** Q/C/A/E inline creation with captureMs, drag positions, edge creation with validity-constrained picker, inspector with judgement dropdowns, retype with type-history. ✓ Creating a node takes one keypress + text + Enter; invalid edge types are never offered; retype nulls old judgements and logs before-values.

**P3 — Staleness + queue.** Cone computation, undermined marking, never-declared derivation, queue panel, batch/cone affirmation, hatched rendering. ✓ Retyping a node with 3 dependents yields exactly 3 undermined queue items and zero changed judgement values; affirm-all clears them with logged affirmations.

**P4 — Stratified + lenses.** Band layout, waterline, animated transition, weakest-input captions, six lens presets. ✓ Toggling views changes no data; lens dim/hide changes no data; weakest-input caption matches §4.2 priority on the fixture.

**P5 — Nesting + promotion.** Sub-question threads, breadcrumb, collapsed node, manual promotion with derivedFrom, source-changed staling. ✓ Changing the sub-thread's adopted claim stales the promoted node in the parent.

**P6 — Matrix.** Grid over competing set, cell click edge-editing, non-diagnostic greying, coverage footer, work-across toast. ✓ Matrix is a pure pivot: creating an edge in canvas view appears in matrix and vice versa.

**P7 — Adoption ceremony.** Pane, both gates, required override reasons, ceremony snapshot, ME handling, reversal. ✓ Adopting with a stronger rival is possible only with a reason; the reason appears verbatim in the word-picture.

**P8 — Outputs + briefing + stats.** Word-picture template, share HTML, re-entry briefing, stats page. ✓ Share file opens from disk in a browser with no network and shows word-picture + SVG + audit; briefing appears after a simulated 8h gap with a non-empty queue.

### Global acceptance tests (assert throughout)

- Grep-level: no `fetch`/network calls; no arithmetic ever writes to a judgement field.
- A judgement field's value can change only inside a `judgement_declared` event whose `after` equals the user's selection.
- Deleting any view/lens code path leaves the stored graph and log untouched (renderings are pure).
- The word-picture contains only strings drawn from node fields, enum labels, log payloads, and the fixed template scaffolding.

---

## 9. Deferral ladder (context, not tasks)

v1.1: AI disagreement engine (flags enter the existing queue as a third, lowest-priority species; every flag must carry inspectable structural/textual grounds; user retype quiets it and is logged) + optional AI prose polish over the word-picture template. v1.2: support-group construct (linked vs convergent lines) + soft confidence-cap gate. Later: Indicator type, Brier calibration, multi-user review, entity layer. Nothing in v1 may foreclose these — which the three-primitive architecture already guarantees.
