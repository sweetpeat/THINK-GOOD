# Reasoning Canvas

A local-first, single-user web app that makes human analytic reasoning an
explicit, typed, auditable graph. Questions, Claims, Assumptions, and Evidence
are typed nodes connected by a closed set of reasoning edges; every judgement
is declared by the analyst — the system never computes one; every consequential
act is an immutable event in an append-only log.

Built to [reasoning-canvas-v1-spec.md](reasoning-canvas-v1-spec.md).

## Run

```sh
npm install
npm run dev        # open the printed localhost URL
```

Data lives entirely in your browser's IndexedDB — no backend, no network.
Use **Export ▾ → JSON backup** for a portable `.rcanvas.json`; import it from
the home screen. **Load example** on the home screen imports a worked
intrusion-attribution problem.

## Working the canvas

- **Q / C / A / E** — create a node at the cursor (Enter commits, Tab grades inline, Esc cancels)
- **drag the ○ handle** or select + **L** — link two nodes (only valid edge types are offered)
- **T** — retype the selected node (old judgements preserved in the log)
- **F** — fit view · **double-click** a sub-question descends into its thread
- Views: **Canvas · Stratified · Matrix · Audit** — all pure renderings of the same graph

## Develop

```sh
npm test           # Vitest suite for repo.ts + derive.ts
npm run build      # type-check + production bundle
npm run fixture    # regenerate fixtures/example.rcanvas.json
```
