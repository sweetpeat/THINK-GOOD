# Reasoning Canvas — Diamond Model Workflow, v1 Build Specification

**Audience:** Claude Code. This document is the authority for the Diamond Model of Intrusion Analysis workflow. It is a sibling to `reasoning-canvas-v1-spec.md`; everything in that document — the invariants of §0, the architecture of §1, the log rules of §3 — applies here unchanged unless this document explicitly extends it. Where this document is silent, follow the parent spec; where both are silent, choose the simplest option consistent with the parent's §0.

---

## 0. What this adds, and what it must not break

A second analytic workflow beside ACH: the analyst investigates an **incident** by decomposing it into **diamond events** — each characterized by up to four **vertices** (Adversary, Capability, Infrastructure, Victim) — and threading those events along the Lockheed Martin kill chain into an **activity thread**. The workflow ends when the analyst adopts an overall **assessment claim** against the incident, through the same gated, logged, reversible ceremony as ACH adoption.

Same store, same engine. Diamond content lives in the existing three tables, flows through `repo.ts`, appends to the same append-only log, and obeys every §0 invariant of the parent spec:

1. **No computed judgement.** Kill-chain phase, event result, direction, and vertex confidence are all declared by the analyst. The system derives only reachability, counts, orderings, and gap lists.
2. **No AI.**
3. **One graph, many renderings.** The kill-chain view is a pure function of (graph, log), exactly as the matrix is.
4. **Append-only log.**
5. **Closed enums, open text.** Phase, result, direction, confidence are closed enums. `occurredAt` is a structured ISO-8601 date field (machine-sortable, analyst-entered, logged); it is *not* free text and free text never affects the kill-chain ordering.
6. **Non-destructive lenses/views.**
7. **Human-owned semantics.** Closing an incident with open intelligence gaps is a soft gate: a required reason, never a block.

### Decisions of record (from scoping, 2026-07-10)

- **Scope:** diamond events + activity threads. **Deferred:** activity groups, cross-incident vertex sharing, ACH↔Diamond linking, ATT&CK mapping, methodology/resources meta-features, socio-political and technology axes, word-picture/share-file export for incidents, sub-questions inside incident threads.
- **Entry point:** the home page becomes a two-workflow chooser — *Analysis of Competing Hypotheses* (the existing question flow, now named) and *Diamond Model of Intrusion Analysis* (a new incident flow). Existing question threads are untouched.
- **Vertices are first-class shared nodes**, owned by their incident thread; the same vertex may characterize any number of that incident's events (the pivot move).
- **Rigor parity:** vertices and events carry declared judgements; staleness, the queue, affirmation, and the audit log all apply.
- **Partial diamonds are allowed**; missing vertices render as explicit gap slots and feed a derived intelligence-gaps list.
- **End state:** adopt an assessment claim against the incident; incident status flips to `assessed`; reversal reopens it.

---

## 1. Data model extensions

### 1.1 New node types

```ts
type NodeType =
  | 'question' | 'claim' | 'assumption' | 'evidence'          // parent spec
  | 'incident' | 'diamond_event'
  | 'adversary' | 'capability' | 'infrastructure' | 'victim'; // the four vertex roles

type VertexType = 'adversary' | 'capability' | 'infrastructure' | 'victim';

interface IncidentNode extends BaseNode {
  type: 'incident';
  status: 'open' | 'assessed';
  // threadId === id: an incident anchors its own thread, exactly as a root question does.
  // No judgement fields: like questions, incidents are never stale.
}

interface DiamondEventNode extends BaseNode {
  type: 'diamond_event';
  phase?: KillChainPhase;        // judgement — closed enum
  result?: EventResult;          // judgement — closed enum
  direction?: EventDirection;    // judgement — closed enum
  occurredAt?: string;           // ISO-8601 date; declarable annotation, sorts the lane
}

interface VertexNode extends BaseNode {
  type: VertexType;
  confidence?: 'low' | 'moderate' | 'high';  // judgement — how sure is the identification
}

type KillChainPhase =
  | 'reconnaissance' | 'weaponization' | 'delivery' | 'exploitation'
  | 'installation' | 'command_and_control' | 'actions_on_objectives';

type EventResult = 'success' | 'failure' | 'unknown';

type EventDirection =
  | 'adversary_to_infrastructure' | 'infrastructure_to_adversary'
  | 'infrastructure_to_victim'    | 'victim_to_infrastructure'
  | 'infrastructure_to_infrastructure'
  | 'bidirectional' | 'unknown';
```

Enum display labels (use everywhere, including exports):

- **Kill-chain phase:** Reconnaissance · Weaponization · Delivery · Exploitation · Installation · Command & control · Actions on objectives.
- **Result:** Success · Failure · Unknown.
- **Direction:** Adversary → infrastructure · Infrastructure → adversary · Infrastructure → victim · Victim → infrastructure · Infrastructure → infrastructure · Bidirectional · Unknown.
- **Vertex confidence:** Low · Moderate · High (reuses the existing confidence enum and labels).
- **Node types:** Incident · Event · Adversary · Capability · Infrastructure · Victim.

Note the distinction between *declared* `unknown` (the analyst looked and cannot tell — a judgement) and *undeclared* `null` (nobody has judged yet — derives `never_declared`).

**Fully graded:** incident — always (no judgements); diamond_event — `phase`, `result`, `direction` all set (`occurredAt` optional); vertex — `confidence` set.

**Creation rules (enforced in `repo.ts`):**
- `incident` is root-only: created with empty `threadId`, anchors its own thread, logs `thread_created` (payload marks `workflow: 'diamond'`).
- `diamond_event` and vertex nodes may only be created inside an incident thread.
- `question` nodes may **not** be created inside an incident thread (sub-questions deferred); `claim`, `assumption`, `evidence` are allowed anywhere.
- An incident cannot be retyped (it anchors the canvas, same rule as a root question); nothing can be retyped *to* `incident`; nothing inside an incident thread can be retyped to `question`.

### 1.2 Edge extensions

`EDGE_VALIDITY` becomes a list of valid (from, to) type pairs per edge type:

| Edge | from → to | Meaning |
|---|---|---|
| `characterizes` **(new)** | adversary \| capability \| infrastructure \| victim → diamond_event | this vertex plays its role in the event |
| `consistent_with` | evidence → claim *(parent)*; **evidence → any vertex type (new)** | the observation supports the identification |
| `inconsistent_with` | evidence → claim *(parent)*; **evidence → any vertex type (new)** | the observation cuts against it |
| `rests_on` | claim → assumption *(unchanged)* | |
| `answers` | claim → question *(parent)*; **claim → incident (new)** | the claim is a candidate assessment of the incident |

Rules carried over: duplicates rejected; at most one of consistent/inconsistent per (evidence, target) pair — creating the other replaces it, both logged. A vertex's role in an event **is its node type**; retyping a vertex between the four roles keeps its `characterizes` edges valid (the diamond re-slots), while retyping it out of the vertex family deletes them (each deletion logged, staling consumers).

### 1.3 Dependency direction (staleness, §2.4 parent)

New "B depends on A" pairs:

- a **vertex** depends on every evidence node with a consistent/inconsistent edge to it;
- a **diamond_event** depends on every vertex that `characterizes` it;
- an **incident** depends on its adopted assessment claim(s) — same rule as questions (but incidents hold no judgements, so they are never marked undermined; the dependency exists for completeness);
- an **assessment claim** (any claim with an `answers` edge to an incident) depends on **every live diamond_event in that incident's thread**. This is the one non-edge dependency besides `derivedFrom`: the assessment summarizes the diamond map, so any staling change to the map undermines it.

Everything else (cone computation, earliest-cause retention, affirmation, the queue) is the parent machinery applied unchanged. The canonical chain to test: regrading evidence undermines the vertex it supports → the vertex's cone pulls in every event it characterizes → the events' cone pulls in the adopted assessment.

`edgeConsumer` for `characterizes` and evidence→vertex edges is the `to` side (the general rule); `rests_on` remains the exception.

### 1.4 Log extensions

New event type: `incident_status_changed` (payload `{ before, after, byClaim }`) — appended when adoption/reversal of an assessment claim flips the incident between `open` and `assessed`, mirroring `question_status_changed`.

New gate kind for `gate_overridden`: `'diamond_gaps'` (see §4). The reason remains REQUIRED.

`occurredAt` changes are logged as `judgement_declared` events (field `occurredAt`); the value must be a valid ISO-8601 date (`YYYY-MM-DD`) or null. It is an annotation like `linchpin`: logged, but it neither clears nor causes staleness.

---

## 2. Derived computations (extend `derive.ts`; all deterministic, unit-tested)

1. **Thread workflow:** `threadWorkflow(g, threadId)` = `'diamond'` if the anchoring node is an incident, else `'ach'`. Every conditional surface (view switcher, palettes, ceremony panels) keys off this.
2. **Events of an incident:** live `diamond_event` nodes with `threadId === incidentId`, ordered by phase (kill-chain order, unphased last) → `occurredAt` (missing last) → `createdAt`.
3. **Vertices of an event:** the live vertex nodes with a `characterizes` edge into it, grouped by role. Multiple vertices per role are legal (rival identifications); a role with none is a **gap**.
4. **Pivot list of a vertex:** the live events it characterizes — the display that makes shared infrastructure across events visible.
5. **Intelligence gaps** of an incident: per event, its missing roles; plus every diamond node (event or vertex) in the thread that is not fully graded. Rendered in the queue panel and the ceremony pane; never a queue item that can be "affirmed" away — a gap clears only by creating/linking the missing vertex or declaring the missing judgement.
6. **Kill-chain lanes:** the seven phases in order, each with its events (ordering per #2), plus an "unphased" lane when any event lacks a declared phase. Empty phase lanes render — an empty lane is itself information.
7. **Assessment set:** `competingSet(g, incidentId)` — the parent derivation applied to an incident target (claims with `answers` edges into it). Live when ≥2; rivals, I-counts, and disconfirmation coverage all reuse parent machinery.
8. **Stats:** per-type node counts must cover all ten node types.

---

## 3. Views and interaction

### 3.0 Home — the workflow chooser

Two named entry points, replacing the single generic input:

- **Analysis of Competing Hypotheses** — prompt: "What question are you working?" → creates a root question thread (the existing flow, unchanged underneath).
- **Diamond Model of Intrusion Analysis** — prompt: "Name the incident under investigation" → creates an incident thread.

Thread cards carry a workflow tag (ACH / Diamond). Incident cards show event count and open-gap count. Import/export/stats/tutorial unchanged.

### 3.1 Incident canvas

The same freeform SVG canvas. Per-workflow creation palette (canvas keys and toolbar):

| Key | Creates |
|---|---|
| **D** | Event (diamond_event) |
| **A** | Adversary vertex |
| **C** | Capability vertex |
| **I** | Infrastructure vertex |
| **V** | Victim vertex |
| **E** | Evidence |
| **S** | Assessment (claim) |

(Q/C/A/E remain the palette in question threads; the letters are per-context.) Inline create form offers the type's judgement dropdowns exactly as in the parent flow. Linking, retype (constrained to the palette's types, minus incident/question per §1.1), delete, pan/zoom, and the Inspector all behave per the parent spec.

**Event node rendering:** events draw as **true diamond glyphs** — the classic Diamond Model picture — with the event's text and phase/result grading inside, and the four vertex sections at the compass corners (Adversary top, Capability right, Victim bottom, Infrastructure left). A filled corner carries the linked vertex's name alongside; a hollow corner is an intelligence gap. Clicking a corner selects the vertex (or creates it plus its characterizes edge, both logged). Events never start links (nothing valid flows *from* an event), so they carry no ⊕ handle; edges anchor to the diamond border. Vertex nodes render as cards with their role colour + glyph and confidence — they stay first-class on the canvas because they are shared (the pivot). Stale hatching, selection, and lens-free behaviour as parent. The stratified view, lenses, review walk, matrix, word-picture, and share file are **not offered** in incident threads in v1 (view switcher shows Canvas · Kill chain · Audit; export menu shows JSON backup only).

### 3.2 Kill-chain view (the thread lens)

The incident-thread peer of the Matrix: a structured, computed layout (positions never stored):

- Seven horizontal lanes in kill-chain order (plus "Unphased" at the bottom when needed), each labelled; empty lanes visibly empty.
- Events placed left→right within their lane by `occurredAt` then `createdAt`, rendered as **diamond glyphs**: Adversary at top, Capability and Infrastructure on the sides, Victim at bottom; each corner filled when the role is characterized, hollow when it is a gap; hatched overlay when the event is stale; result/direction summarized under the glyph.
- Clicking a diamond selects the event (Inspector opens); clicking a corner selects that vertex; a hollow corner offers "add [role]" which creates the vertex and its `characterizes` edge (both logged, position near the event).
- Purely a rendering: no reordering by drag, no layout persistence.

### 3.3 Inspector extensions

- **Event:** phase / result / direction dropdowns (each a `judgement_declared`), `occurredAt` date input, and its vertex list by role with gaps flagged.
- **Vertex:** confidence dropdown, the pivot list ("characterizes n event(s)", each clickable), and its supporting/contradicting evidence.
- **Incident:** status, assessment set with adopt/revert (via ceremony), open-gaps summary.
- Affirm-unchanged, type history, delete: parent behaviour.

### 3.4 Assessment ceremony (extends §5.5 parent)

Adopting a claim whose `answers` target is an incident shows, in the one-pane ceremony:

1. The claim with declared likelihood + confidence (declare-in-place allowed), exactly as parent.
2. **Rivals table** — other assessment claims on the incident, with I-counts and disconfirmation flags (parent Gate A applies unchanged).
3. **Linchpins** — parent Gate B applies unchanged (assessment claims may rest on assumptions).
4. **The diamond map's state:** event count by phase, and the intelligence-gaps list (§2.5).
5. **Gate C — open diamond gaps (new):** fires when the incident has ≥1 intelligence gap (missing role or ungraded diamond node). Shows the gaps; requires a stated reason; never blocks. Logged as `gate_overridden` with gate `'diamond_gaps'` and a snapshot of the gap list.
6. Adopting sets the incident's status to `assessed` (logged as `incident_status_changed`). Reversal is a plain logged status change and reopens the incident if no other adopted assessment remains. Multiple adopted assessments are allowed (incidents have no mutual-exclusivity flag in v1).

### 3.5 Queue, briefing, audit

- The queue panel gains an **Intelligence gaps** section when scoped to an incident thread: one row per gap, clicking focuses the event. Gap rows have no Affirm button (§2.5).
- The re-entry briefing for an incident shows: current assessment (adopted claims), what changed last session, the queue, and the gaps count.
- Audit view: unchanged (new event types render through `eventText`).

---

## 4. Fixture

Extend `fixtures/example.rcanvas.json` (regenerated by `scripts/makeFixture.ts`): alongside the ACH thread, one incident thread — "Intrusion at ACME — June 2026" — with 4–5 events spanning delivery → actions-on-objectives, one infrastructure vertex shared by two events (the pivot demo), an unphased event, at least one missing-adversary gap, evidence attached to vertices with mixed Admiralty grades, and one open assessment claim. The incident stays unassessed so Gate C is demonstrable. The "Load example" copy mentions both threads.

---

## 5. Build order and acceptance criteria

**D1 — Model.** Types, labels, edge-validity pairs, repo creation/validation/retype rules, dependency extensions, incident adoption. ✓ Every new mutation appends events; invalid placements (incident in a thread, vertex outside an incident thread, question inside one) throw; the evidence→vertex→event→assessment staling chain marks exactly the cone, changes zero judgement values.

**D2 — Derivations.** Workflow detection, event ordering, gaps, lanes, stats fix. ✓ Unit tests cover ordering (phase → occurredAt → createdAt), gap lists, and lane assembly on a fixture-shaped graph.

**D3 — Capture.** Home chooser, incident canvas palette, inline forms, inspector forms, event-node role slots. ✓ One keypress + text + Enter creates each diamond type; the palette never offers an invalid type; linking offers only valid edge types.

**D4 — Kill-chain view + queue gaps + ceremony.** ✓ The view is a pure pivot (creating a characterizes edge on canvas appears in the lane view and vice versa); adopting with open gaps demands a reason that lands verbatim in the log; adoption flips the incident to assessed and reversal reopens it.

**D5 — Fixture + polish.** Regenerated example, HowTo section with the Diamond Model reference (Caltagirone, Pendergast & Betz, 2013), copy updates. ✓ Load example demos both workflows; all parent acceptance greps still pass (no fetch; no arithmetic writes a judgement).

---

## 6. Deferral ladder

v1.1: activity groups (cluster incident threads; cross-incident vertex identity); ACH↔Diamond linking (cite a diamond event as evidence in a question thread — the natural join is promotion-like, with `derivedFrom` provenance). v1.2: ATT&CK technique tagging on events; methodology/resources meta-features; extended socio-political/technology axes; incident word-picture and share file. Nothing in this build may foreclose those — vertex-as-node and event-as-node already guarantee the graph shapes they need.
