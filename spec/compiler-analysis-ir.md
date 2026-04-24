# Compiler Analysis on IR

This document is the Stage A deliverable for issue #1021. It is not a proposal to remove or rename code — nothing in `packages/jsx/` is edited as part of this stage. The document establishes the shared picture Stages B–D will be reviewed against.

## Why this document exists

`packages/jsx/src/ir-to-client-js/generate-init.ts` currently interleaves three concerns: **analysis** (who references whom), **classification** (init scope vs. module scope vs. skip), and **emission** (strings out). Every issue that has landed in this area (#547, #508, #569, #930, #932, #933, #937, #1018, …) added a conditional branch wherever it happened to fit because there is no first-class data structure for "the analysis result of this component". `generate-init.ts` therefore keeps the analysis in local `Set`s and `Array`s — each rule is free to read them and free to add its own.

The consequence is not just that the file is long. It is that:

- Two neighbouring files — `emit-registration.ts` and `ir-to-client-js/index.ts` — **recompute the same facts independently**, with subtly different name sets. A rule change has to be mirrored in all three places, by hand, without the type checker catching divergence.
- New rules cannot be placed by reading the types. They land wherever the existing control flow allows them. That is the mechanical cause of the "whack-a-mole" pattern.
- Cross-cutting facts that could be one graph query today (e.g. "is this declaration reachable from the template closure?") do not exist as a query — they exist as four-or-five lines of imperative set-building every time the question is asked.

Stage A's job is to make that cost legible before Stage B touches any code.

## What IR already carries

All fields below are populated in `packages/jsx/src/analyzer.ts` during the single JSX-to-IR pass. They are read in Phase 2 (`ir-to-client-js/*`) without recomputation.

### Per-declaration metadata

| Field | Type / shape | Who reads it today |
|-------|--------------|--------------------|
| `ConstantInfo.freeIdentifiers` | `Set<string>` — identifiers referenced in initializer, excluding TS keywords, member-property names, bound params | `emit-registration.ts` (template inlining decision), `declaration-sort.ts` (not used; re-extracts via regex — see below) |
| `ConstantInfo.isModule` | `boolean \| undefined` — declared outside the component function | `generate-init.ts` (module-scope seed), `emit-registration.ts` (inlinability) |
| `ConstantInfo.isJsx` | `boolean \| undefined` — initializer is JSX, inlined at IR level (#547) | `generate-init.ts`, `emit-registration.ts` |
| `ConstantInfo.isJsxFunction` | `boolean \| undefined` — JSX-returning function inlined at call sites (#569) | `generate-init.ts`, `emit-registration.ts` |
| `ConstantInfo.containsArrow` | `boolean \| undefined` — AST-derived flag | `emit-registration.ts` (template inlining safety) |
| `ConstantInfo.systemConstructKind` | `'createContext' \| 'weakMap' \| undefined` — unique-identity construct | `generate-init.ts` (route to module scope), `emit-registration.ts` (never inline) |
| `ConstantInfo.templateValue` | `string \| undefined` — pre-rewritten value with destructured prop refs → `_p.xxx` | `emit-registration.ts` |
| `FunctionInfo.isModule` | `boolean \| undefined` | `generate-init.ts` (fixpoint seed — #1018) |
| `FunctionInfo.isJsxFunction` | `boolean \| undefined` — inlined at call sites (#569) | `generate-init.ts` (skipped in emission) |
| `FunctionInfo.isMultiReturnJsxHelper` | `boolean \| undefined` — (#932) preserved in SSR marked template, skipped in client JS | `generate-init.ts` |
| `FunctionInfo.containsJsx` | `boolean` — regex heuristic (see `feedback_containsjsx_regex_gate` in memory); NOT a reliable emission gate on its own | Analyzer internal only; emitters use `isJsxFunction` / `isMultiReturnJsxHelper` instead |
| `InitStatementInfo.freeIdentifiers` | `Set<string>` | `generate-init.ts` (add to `usedIdentifiers` so referenced module-level declarations survive — #933) |
| `InitStatementInfo.assignedIdentifiers` | `Set<string>` | `generate-init.ts` (route assignment targets to module scope — #933) |

### Per-expression AST-derived flags

These live on individual IR nodes in the tree (not in the declaration lists). They are populated by `jsx-to-ir.ts` at AST-walk time.

- `IRExpression.callsReactiveGetters`, `IRExpression.hasFunctionCalls`
- `IRConditional.callsReactiveGetters`, `IRConditional.hasFunctionCalls`
- `IRAttribute.callsReactiveGetters`, `IRAttribute.hasFunctionCalls` (#940)
- `IRProp.callsReactiveGetters`, `IRProp.hasFunctionCalls` (#942)
- `IRLoop.callsReactiveGetters`, `IRLoop.hasFunctionCalls`, `IRLoop.isStaticArray`
- `IRLoop.paramBindings` — destructured `.map()` binding paths (#951)

### IR-level metadata

- `IRMetadata.signals`, `memos`, `effects`, `onMounts`, `initStatements`
- `IRMetadata.propsParams`, `propsObjectName`, `restPropsName`, `restPropsExpandedKeys`
- `IRMetadata.imports`, `IRMetadata.templateImports` (client-side packages stripped)
- `IRMetadata.localFunctions`, `IRMetadata.localConstants`
- `IRMetadata.typeDefinitions`
- `IRMetadata.clientAnalysis?: { needsInit: boolean; usedProps: string[] }` — populated by `analyzeClientNeeds()` before adapter runs, so adapters can optimize `bf-p` serialization. This is the only IR field that today is **filled by Phase 2 analysis** and read later, and it is the shape we want to generalise.

## What `generate-init.ts` recomputes on every compile

Line numbers below refer to `packages/jsx/src/ir-to-client-js/generate-init.ts` as of commit `a4f6b8bd`.

### Contrast table — analysis performed in the emitter

| # | Fact recomputed in the emitter | Location in `generate-init.ts` | Derived from which IR fields | Should it live on IR? |
|---|--------------------------------|--------------------------------|-------------------------------|------------------------|
| 1 | `usedIdentifiers: Set<string>` — every name referenced anywhere in any emitted section | L77 (`collectUsedIdentifiers(ctx)`) + L87 (`collectIdentifiersFromIRTree`) + L96–106 (init-statement frees) | Walks every element collection in `ClientJsContext`, plus the IR tree, plus `InitStatementInfo.freeIdentifiers`. Each walk is a regex over body strings. | **Yes — as a references graph.** Name-level reachability is a pure function of per-node free identifiers, which the analyzer already computes per-declaration. The emitter's "which constants/functions are used" question reduces to graph reachability. |
| 2 | `usedFunctions: Set<string>` — function names used as event handlers (regex over `elem.events[*].handler`) | L78 (`collectUsedFunctions`) | `ctx.interactiveElements[*].events[*].handler` | **Subsumed by #1** once the graph records `context: 'event-handler'` on the edge. |
| 3 | `initStmtAssignedIdentifiers: Set<string>` — union of `InitStatementInfo.assignedIdentifiers` across all init statements | L95–107 | `InitStatementInfo.assignedIdentifiers` (already on IR) | **Yes — as a derived view over IR.** The union itself is the query. It is currently re-merged per compile. |
| 4 | **Per-constant scope decision** (`module` / `init` / `skip`) | L109–151 | `ConstantInfo.{isJsx, isJsxFunction, value, systemConstructKind, isModule}` + `usedIdentifiers` (#1) + `initStmtAssignedIdentifiers` (#3) | **Yes — as `ConstantInfo.scope: 'module' \| 'init' \| 'skip'`** populated by the analyzer. Today this decision is a cascade of ad-hoc `if`s (lines L115–144), each branch a separate issue fix. Moving the decision to a pure function over IR makes the cascade's inputs explicit. |
| 5 | Provider-context hoisting — context constants used by provider setups forced to module scope if not already | L154–164 | `ctx.providerSetups[*].contextName` + `localConstants[*].{name, systemConstructKind}` | **Merges with #4.** This is exactly the "template closure needs this declaration at module level" pattern that would fall out of a references graph with usage-context tags. |
| 6 | `neededProps: Set<string>` — props actually read anywhere in the emitted body | L109–151 (via `valueReferencesReactiveData`) + L166–170 | `ctx.propsParams` + `usedIdentifiers` + `constant.value` scan | **Yes — as a derived view over the graph.** Today this is duplicated a **third** time in `index.ts` (`analyzeClientNeeds`, L83–102) and a **second** time inside constant classification. The "a prop is needed ⇔ reachable from some emitted context" query should have exactly one implementation. |
| 7 | `propsWithPropertyAccess: Set<string>` — props accessed as `prop.X` or `prop[...]` somewhere | L172 (`detectPropsWithPropertyAccess`) | Regex over conditional/loop/dynamic/needed-constant expression strings | **Yes — as a per-prop AST-derived flag at analyzer time.** The analyzer already walks the AST; it can emit `{ propName, accessKind: 'bare' \| 'property' \| 'index' }` per usage. The emitter's question becomes "does this prop have any non-bare access?". |
| 8 | `propsUsedAsLoopArrays: Set<string>` | L174–180 | `ctx.loopElements[*].array` + `propsParams` | **Yes — as a per-loop IR flag** or as a computed view over the graph. Already available at IR level; the emitter re-iterates because there is no typed "prop → usage sites" map. |
| 9 | **Per-function scope decision** (fixpoint, #1018) | L206–280 | `localFunctions[*].{name, isModule, isJsxFunction, isMultiReturnJsxHelper, body, params}` + signals/memos/props/neededConstants as initRequiredNames seed + `usedIdentifiers` | **Yes — as `FunctionInfo.scope: 'module' \| 'init' \| 'skip'`** populated by the analyzer via forward reachability on the graph. The current fixpoint is a shrinking variant of Kahn's algorithm that **re-tokenises every function body** on each iteration. With a graph edge set available at IR time, the computation is one DFS. |
| 10 | Declaration dependency sort (`sortDeclarations`) | L310 (`sortDeclarations`) | Calls `referencedIdentifiers(decl)` — L43–62 of `declaration-sort.ts`, which **re-runs `extractIdentifiers`** on every declaration body | **Yes — as graph-edge consumption.** The sort has all the data it needs; it just re-extracts it. If the graph is a first-class IR field, the sort is a pure function over it. |
| 11 | **Props object name rename via regex on emitted output** (L365–385) | Post-join string hack — splits lines, replaces `\b<srcProps>\b` → `_p`, excluding comments | N/A (runs on the generated string) | **Yes — but as an earlier, IR-level transformation.** The analyzer already tracks `propsObjectName`. Every consumer of `ConstantInfo.value` / `FunctionInfo.body` could receive pre-renamed content, removing the post-emit splitter. This is identified in the issue body as a Stage D item. |
| 12 | `detectUsedImports(generatedCode)` | L387 — regex over the final generated code to pick runtime imports | N/A (runs on the generated string) | **Partially.** The set of DOM helper calls the emitter made is knowable from the emission passes themselves — if each emitter returned a tagged result, the union is a data query. Full elimination is not required for Stage B/C; this is the lowest-priority item. |

### Contrast table — same analyses duplicated in sibling files

| # | Fact | Location A | Location B (duplicate) | What is different between them |
|---|------|-----------|-------------------------|---------------------------------|
| D1 | "What counts as a component-scope name" | `generate-init.ts` L218–226 (`initRequiredNames` seed: signals, memos, props, `propsObjectName`, neededConstants) | `emit-registration.ts` L111–117 (`componentScopeNames`: localConstants, signal getter/setter, memos, localFunctions, propsParams, propsObjectName) | B includes **all** localConstants and localFunctions; A includes only `neededConstants` (post-classification). B is used to decide whether a module-level function's body leaks into template scope (`bodyReferencesComponentScope`). The two sets answer different questions but both are built from the same raw IR and both are rebuilt every compile. |
| D2 | `usedIdentifiers` / `usedProps` | `generate-init.ts` L77–107 | `index.ts` `analyzeClientNeeds` L76–102 | `analyzeClientNeeds` runs **before** adapter emission, so adapters can optimize `bf-p`. It duplicates the collection logic (`collectUsedIdentifiers` + `collectIdentifiersFromIRTree`) and then duplicates the prop-resolution loop. The function even has the comment `// Replicate the props-detection logic from generate-init.ts`. |
| D3 | "Is this constant safe to inline into the SSR template?" | `generate-init.ts` does not answer this (it classifies `module` vs. `init`, a different question) | `emit-registration.ts` `buildInlinableConstants` L100–223 — builds its own `inlinableConstants` / `unsafeLocalNames` with its own cascade: `isJsx` → skip, `containsArrow` → unsafe, `systemConstructKind` → skip, reactive-reference → unsafe, free-names-outside-scope → unsafe, then demote transitively | Each issue about template inlining (#807, others) adds a new `if` inside `buildInlinableConstants`. The shape of the cascade is structurally identical to the scope cascade in #4 above, but the two cascades do not share code. |

### The structural pattern these tables expose

Every row of the first table is the same shape: **"the analyzer has the raw atoms, the emitter recomputes the compound fact on every compile."** The duplication table shows: **the same compound fact is recomputed in more than one emitter file, with slight variations, without a shared source of truth.**

Every issue that has landed in `generate-init.ts` was a rule about "which bucket does this declaration go in?" or "which names are reachable from which context?". Those are both graph questions. Today they are spread across four files (`generate-init.ts`, `emit-registration.ts`, `identifiers.ts`, `declaration-sort.ts`) and expressed as imperative set-building.

## Target IR shape

The goal of Stages B–D is that the analyzer fills a structured analysis result on IR, and the emitter reads from it without re-deriving. The shape below is the **proposed** target; each field is annotated with which contrast-table row(s) it replaces. Exact field names are placeholders — Stage B's PR will lock them.

### 1. References graph

```ts
// packages/jsx/src/types.ts
export type ReferenceContext =
  | 'init-body'          // appears in signal initial value, memo body,
                         // effect body, onMount body, constant value,
                         // function body, init-statement body (unless
                         // reclassified by a more specific tag below)
  | 'event-handler'      // appears in an element event handler
  | 'template-closure'   // appears in a string that the SSR/CSR template
                         // closure reads (loop template, conditional HTML
                         // branch, dynamic-text expression, reactive-attr
                         // expression)
  | 'init-statement'     // bare imperative statement at top of component
                         // body (#930) — distinct so #933 assignments can
                         // still be surfaced as 'assignment' below
  | 'assignment-target'  // LHS of `=` / `+=` / `++` / destructure target
                         // inside an init-statement (#933)

export interface ReferenceEdge {
  /** Source: the declaration that holds the reference. `null` for edges
   *  rooted at a structural position (template closure root, signal
   *  initial value, etc.) that is not tied to a named declaration. */
  from: { kind: 'constant' | 'function' | 'signal' | 'memo' | 'effect' | 'on-mount' | 'init-statement' | 'component-root'; name: string | null } | null
  /** Target: the name being referenced. Must resolve to a declaration
   *  in this component's scope OR be a prop name / builtin. */
  to: string
  context: ReferenceContext
}

export interface ReferencesGraph {
  edges: ReferenceEdge[]
  /** Names declared by this component — filled once, used as the codomain
   *  filter for graph queries (so `console` / `Math` / external imports
   *  are not treated as unresolved references). */
  declaredNames: Set<string>
  /** All prop names (bare + propsObjectName) — for the prop-reachability
   *  query that today lives in three places (table row #6, #D2). */
  propNames: Set<string>
}
```

**Replaces:** table rows #1, #2, #3, #6, #8, #10, #D1 (partially), #D2.

The graph is the **one** data structure Stages B–D hang their queries off. The emitter's `usedIdentifiers` is `reachableFromEmittedContexts(graph)`. `neededProps` is `reachableFromEmittedContexts(graph) ∩ propNames`. The declaration sort is a topological order over `edges.filter(e => e.context === 'init-body')`.

### 2. Per-declaration scope

```ts
// packages/jsx/src/types.ts
export type DeclarationScope = 'module' | 'init' | 'skip'

export interface ConstantInfo {
  // ... existing fields ...
  /** Final emission scope for this constant. Populated by the analyzer
   *  from a pure function over the references graph. Stage C adds this;
   *  `generate-init.ts` then routes by reading `scope`. */
  scope?: DeclarationScope
}

export interface FunctionInfo {
  // ... existing fields ...
  scope?: DeclarationScope
}
```

**Replaces:** table rows #4, #5, #9, #D1 (the remainder).

The rule for `scope`:

```
scope(d) =
  if d.isJsx || d.isJsxFunction || d.isMultiReturnJsxHelper  → 'skip'
  if not reachable from any emitted context                   → 'skip'
  if d is assignment-target in an init-statement (#933)       → 'module'
  if d has systemConstructKind                                → 'module'
  if d is reachable only from template-closure edges          → 'module'
  if d references any init-scoped name (transitive)           → 'init'
  if d.isModule and does not reference init-scoped names      → 'module'
  otherwise                                                    → 'init'
```

The order of the cascade matters — it is the same order that `generate-init.ts` has encoded as `if`s today, but collected in one place and labelled.

### 3. Per-prop usage tags

```ts
// packages/jsx/src/types.ts
export type PropAccessKind = 'bare' | 'property' | 'index'

export interface PropUsage {
  propName: string
  /** All access kinds observed across the component. `['bare']` means the
   *  prop is only read as a value; `['property']` means `.xxx` access is
   *  used somewhere and a `{}` default is needed to avoid the
   *  "cannot read properties of undefined" runtime throw. */
  accessKinds: ReadonlySet<PropAccessKind>
  /** True when the prop is consumed as a loop array (`<loop>.array`). */
  usedAsLoopArray: boolean
}

export interface IRMetadata {
  // ... existing fields ...
  /** Per-prop usage facts, filled in Stage C. Replaces
   *  `detectPropsWithPropertyAccess` (generate-init.ts L172) and
   *  `propsUsedAsLoopArrays` (L174-180). */
  propUsage?: PropUsage[]
}
```

**Replaces:** table rows #7, #8.

### 4. Promoted `clientAnalysis`

`IRMetadata.clientAnalysis` today exists and is filled by `analyzeClientNeeds`. The target shape widens it to carry the graph-derived facts so adapters and emitters read from the same place:

```ts
export interface ClientAnalysis {
  needsInit: boolean
  usedProps: string[]
  references: ReferencesGraph
  propUsage: PropUsage[]
}

export interface IRMetadata {
  clientAnalysis?: ClientAnalysis
}
```

**Replaces:** table row #D2 entirely — `analyzeClientNeeds` and `generate-init.ts` both read the same field.

## Invariants after Stages B–C–D

These are the claims Stage A is staking. Each future PR (Stage B, C, D) should cite the invariants it newly establishes and, where applicable, cite the test(s) that pin them.

1. **Name-level reachability is sourced from `ClientAnalysis.references`, never recomputed.** After Stage B, `collectUsedIdentifiers`, `collectUsedFunctions`, and `collectIdentifiersFromIRTree` do not exist as emitter functions. Their callers read the graph. `identifiers.ts` shrinks to two small helpers: `extractIdentifiers` (token-level, still needed by the analyzer) and `extractTemplateIdentifiers`. Pinned by: jsx unit tests (existing), CSR conformance, per-component IR tests (Stage B adds graph assertions).

2. **Declaration scope (module / init / skip) is sourced from `ConstantInfo.scope` and `FunctionInfo.scope`, never re-derived.** After Stage C, `generate-init.ts` contains **no** cascade of `if (constant.isModule && …)` / `if (systemConstructKind && …)` branches. The scope decision is one lookup per declaration. The fixpoint at L255–278 is replaced by the analyzer's forward reachability. Pinned by: adapter conformance fixtures (byte-identical until Stage C's intentional changes land).

3. **`analyzeClientNeeds` in `index.ts` disappears.** Its output is populated on `IRMetadata.clientAnalysis` during the same analyzer pass that builds the graph. Adapters read the field. Pinned by: existing `bf-p` optimization tests in `packages/adapter-tests/fixtures/`.

4. **Prop-access default behaviour is one IR field.** `detectPropsWithPropertyAccess` does not exist as an emitter function. The "needs `{}` default" question is a per-prop lookup in `IRMetadata.propUsage`. Pinned by: jsx unit tests that exercise `highlightedCommands.pnpm` / bracket-access patterns.

5. **CSR template visibility is a first-class query on the graph, not a post-hoc string scan.** `emit-registration.ts`'s `buildInlinableConstants` cascade is rewritten in Stage C against the graph. The `static-array-children` skip in `packages/adapter-tests/src/__tests__/csr-conformance.test.ts:26-28` is either lifted (because its cause is the per-instance / reactive-data scope decision, which becomes explicit) or documented in a new file as a scope axiom.

6. **Compiled output is byte-identical per Stage B step.** Between `main` and any intermediate commit in Stage B, every file under `packages/adapter-tests/fixtures/` emits the same `.client.js`. This is the safety net for the graph refactor. Stage C introduces one intentional deviation (CSR template scope widens); that deviation is documented in Stage C's PR with a new fixture pinning the new output. No other step should change emission.

7. **`generate-init.ts` collapses to an orchestrator.** After Stage D, the file is the shape sketched in issue #1021: a handful of `emitXxx(analysis)` calls joined by `\n`. The props-rename regex at L365–385 is gone — the analyzer stores already-renamed values on `ConstantInfo.templateValue` (already partially done) and on `FunctionInfo.templateBody` (new, added in Stage D). Pinned by: file length metric (target: under 150 lines) plus CSR conformance.

## Intentionally out of scope for Stage A

- No IR field is added, renamed, or removed in Stage A. The shapes sketched above are proposals; Stage B will land them with tests.
- No emitter code is edited. `generate-init.ts` is the same length at the end of Stage A as at the start.
- The analyzer is not touched. The JSX-to-IR pass in `jsx-to-ir.ts` continues to feed IR the atoms; Stage B adds the compound-fact population on top.
- The decision of whether CSR template visibility should be a two-bucket or three-bucket scope (see issue #1021 Q on "per-instance reactive data") is **not** resolved here. Stage C will decide when the graph exists and the concrete call sites are visible.

## Review checklist for this document

Before moving to Stage B, the following should be true. If any is false, Stage A is not done.

- [ ] Every `if` in `generate-init.ts` L109–280 maps to at least one row in the contrast table. (Some branches cross-cut rows — e.g. the `constant.isModule && initStmtAssignedIdentifiers.has(...)` branch at L138 is both row #3 and row #4.)
- [ ] Every row in the contrast table names the IR field(s) its fact would be derived from.
- [ ] Every proposed new IR field in § Target IR shape is referenced by at least one invariant in § Invariants after Stages B–C–D.
- [ ] No invariant references a field not proposed in § Target IR shape.
- [ ] The duplication table (#D1, #D2, #D3) includes all sibling files that today duplicate analysis — `emit-registration.ts`, `index.ts`, `declaration-sort.ts` — and no more.
