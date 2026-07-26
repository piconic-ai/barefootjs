# Slot unification (proposal — not yet implemented)

Status: **draft for review**. Root-cure design prompted by #2389/#2393 review:
the client runtime has grown one content-update mechanism per compiler
feature. This spec inventories them, names the actual design fault, and
proposes a staged unification. No code change ships with this document.

## 1. Current state — the inventory

Mechanisms that reactively update DOM content, by addressing scheme:

| # | Mechanism | Marker / anchor | Value | Update discipline |
|---|-----------|-----------------|-------|-------------------|
| 1 | `$t` + `.textContent` | `<!--bf:sN-->…<!--/-->` pair | text | preserved Text node, `nodeValue` write |
| 2 | `__bfText` (dynamic text/JSX slot) | same pair | text \| live `Node` | region clear + splice; caller tracks current node |
| 3 | `patchSlotRange` (preamble regions, #2389) | same pair | HTML string | range replace between markers |
| 4 | `updateClientMarker` (`@client` exprs) | `<!--bf-client:sN-->` unpaired + `​`-prefixed Text | text | full rescan per update, managed Text node |
| 5 | `patchLeaf` (flatMap descriptor leaves) | element identity (mapArray scope map) | HTML string | attrs diffed, children wholesale |
| 6 | `insert()` (conditional swap) | `bf-c="sN"` attr **or** `<!--bf-cond-start/end:sN-->` | HTML string + `<!--bf-slot:N-->` node side channel | replace on branch change only |
| 7 | `mapArray` / `mapArrayAnchored` | `<!--bf-loop:id-->` pair, `<!--bf-loop-i(:KEY)-->` | keyed list | keyed reconcile, per-item signals |
| 8 | attr effects | `bf="sN"` attr | string/bool | setAttribute/property |
| 9 | `reconcileElements` / `reconcileList` | loop pair + `data-key` | elements | **dead — no compiler emission site** |

Key facts established by survey (file refs in git history of this doc's PR):

- Rows #1–#3 already share ONE marker format with THREE consumers, each
  with its own lookup and its own update discipline.
- `insert()` is **not** a SolidJS-style node-protocol door: its only input
  is an HTML string (plus a node side channel via `__bfSlot`). There is no
  "node world vs string world" split to heal — virtually all content flows
  as compiler-rendered HTML strings. The real divergence is **addressing**
  (five marker grammars) and **per-kind update disciplines**.
- `updateClientMarker` is an outlier twice over: unpaired marker, zero-width
  -space sentinel on the managed Text node, full TreeWalker rescan on every
  update, and no nested-scope ownership guard.

## 2. The design fault

The unit of design should be the **slot** — a marked dynamic position with
an identity contract — not the compiler feature that needed one. Because
each feature added its own mechanism, we have:

- three lookups over the same `bf:sN` pair (`$t`, `__bfText`'s anchor
  tracking, `patchSlotRange`'s lazy scan), with three different ownership
  rules;
- a fourth marker grammar (`bf-client:`) that exists only because the slot
  concept wasn't reusable when `@client` landed;
- dead exported surface (`reconcileElements`, `reconcileList`) nothing emits.

Structural machinery (conditional swap, keyed loops) is NOT part of the
fault: those own *lifecycle and identity of subtrees*, a genuinely different
responsibility from *content of a position*. They stay.

## 3. Target architecture

One slot concept, one addressing scheme, one runtime door for content:

```ts
// @barefootjs/client/runtime — codegen-facing, not public API
updateSlot(scope: Element, id: string, value: string | Node, kind: 'text' | 'markup'): Node | void
```

- **Addressing**: the existing `<!--bf:sN-->…<!--/-->` pair, with ONE
  ownership rule (skip markers under a nested `bf-s` scope; `^`-prefix for
  parent-owned) shared by all consumers.
- **`kind: 'text'`**: preserves the adopted/created Text node and writes
  `nodeValue` — the current `$t` fast path, kept because emission sites
  legally capture Text refs in effect closures and `mapArray`'s same-key
  path depends on them. `updateSlot` guarantees Text-node stability for
  this kind.
- **`kind: 'markup'`**: range replace between the pair (today's
  `patchSlotRange` semantics, warn-on-missing-marker).
- **`value: Node`**: identity splice (today's `__bfText` Node case).
- `patchLeaf` remains separate: its anchor is an *element* identity with an
  attrs-sync obligation — a different contract, not a range.
- `insert`/`mapArray` remain: subtree lifecycle, not content.

## 4. Staged migration (each stage lands green and alone)

**Stage 1 — introduce the door.** Add `updateSlot`; reimplement
`patchSlotRange` as `updateSlot(scope, id, html, 'markup')` internally and
switch the preamble-region emission to it. `$t` stays as the shared
lookup/adoption utility `updateSlot` uses. No SSR byte change. Delete the
`patchSlotRange` export once no emission references it (same release).

**Stage 2 — fold `__bfText`.** Route the dynamic text/JSX slot emissions
(`emit-reactive.ts`, branch/loop-child-arm sites) through `updateSlot`,
collapsing the caller-side `__anchor_sN` trackers. Requires the Node-splice
kind; behavior-pinned by existing dynamic-text tests. No SSR byte change.

**Stage 3 — retire `bf-client:`.** Emit `@client` expressions as ordinary
`bf:sN` pairs on both sides (Hono `bfText` door) and update them via
`updateSlot('text')`. Kills the unpaired grammar, the `​` sentinel,
and the per-update rescan. **SSR byte change** → conformance fixtures and
snapshots regenerate in the same PR (change-time coupling).

**Stage 4 — remove dead surface.** Drop `reconcileElements`/`reconcileList`
exports (changeset; codegen-facing tier, no user-facing API impact).

**Stage 5 (optional, separate proposal).** Normalize the remaining marker
grammars (`bf-cond-*`, `bf-loop*`) under one documented grammar in
`shared/src/markers.ts`; document the full grammar table in `spec/`.

## 5. Constraints and risks

- **SSR/CSR byte parity**: stages 1–2 are client-only; stage 3 changes SSR
  bytes and must regenerate expected HTML through the single doors.
- **Hydration adoption**: `'text'` kind must keep `$t`'s create-if-absent
  adoption; `'markup'` keeps trust-first-run (record, don't patch).
- **Effect-held references**: any migration that changes which node
  survives an update must audit the emission sites that capture nodes in
  closures (`reactive-effects.ts`, `emit-reactive.ts` anchors) — the
  survey's break-list is the checklist.
- **Bundle size**: one shared door replaces three-and-a-half mechanisms;
  expected net shrink after stage 3.

## 6. Non-goals

- Rewriting row rendering off HTML-string templates (a different, much
  larger proposal — and the string architecture is load-bearing for SSR
  byte parity).
- Merging structural reconcilers (`insert`, `mapArray`) into the content
  door.
