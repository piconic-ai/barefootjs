# @barefootjs/mojolicious

## 0.33.6

### Patch Changes

- @barefootjs/shared@0.33.6

## 0.33.5

### Patch Changes

- 651659a: Fix #2822: on every DSL (non-JSX-runtime) adapter, a client component referenced under an import alias (`import { Foo as Bar } from './Foo'`, `<Bar/>`) compiled with no diagnostics, but the SSR cross-template/partial call was built from the caller-LOCAL alias name (`Bar`) instead of the child's own DECLARED/exported name (`Foo`, what the child's own module registers its template under). This broke the call at runtime — confirmed on real Ruby ERB, Python Jinja2, Perl Mojolicious, PHP Twig, PHP Blade, Perl/Text::Xslate (which silently DROPPED the child, the worst variant), Rust minijinja, and Go `html/template`.
  
  This is the SSR-side counterpart of #2777 (fixed for the client-JS registry key in a prior PR): `initChild`/`renderChild`/`@bf-child:` emission was already correct, but each DSL adapter's own cross-template-call-name builder (`toTemplateName`-equivalent) was not.
  
  Exports `buildImportAliasMap` (local alias -> declared name, built from `ir.metadata.imports`) from `@barefootjs/jsx`'s public API — previously internal to the client-JS generator (`ir-to-client-js/component-scope.ts`) — so every DSL adapter package can build one alias map per compile and resolve `aliasMap.get(comp.name) ?? comp.name` at each cross-template-call-name site, rather than each adapter growing its own alias-resolution implementation (`CLAUDE.md`'s "one decision, two implementations" rule).
  
  The Go template adapter needed the widest set of fixes since `IRComponent.name` (the caller-local alias) also drives the parent-side `New<Name>Props`/`<Name>Input` constructor call, several cross-file shape lookups (`childComponentShapes`, `childContextConsumers`, `childDerivedFieldDeps`, `childPropFieldNames`, `childRepropsReady`), and the static-child struct field's Go TYPE (as opposed to its field NAME, which stays keyed by the alias — that field is parent-private and self-consistent). The adapter's own real-Go-backend test harness (`test-render.ts`) also had a latent bug in `collectImportedComponentNames`, which computed the "reachable child" set from the caller-local alias instead of the declared name — an aliased import's compiled artifact was silently excluded from the combined build even once the adapter itself emitted the correct declared-name reference.
  
  Graduates the `aliased-import-child-component` shared-corpus fixture (added alongside #2777) on all eight DSL adapters, each verified against its real backend (Ruby, Python, Perl, PHP x2, Rust/cargo, Go), closing #2822.
- @barefootjs/shared@0.33.5

## 0.33.4

### Patch Changes

- @barefootjs/shared@0.33.4

## 0.33.3

### Patch Changes

- da77d25: Collapse the row-key attribute (`data-key` / `data-key-N`) onto one IR-resolved field, `IRElement.keyAttr`, fixing #2753's two measured shapes: the client runtime stamping a positional-index `data-key` onto an unkeyed loop's rows that SSR never emits (Shape A), and the client stamping a second, plain `data-key` alongside SSR's depth-suffixed `data-key-N` on a nested loop's rows (Shape B).
  
  `IRElement.keyAttr` replaces the `carriesDataKey` boolean (#2732/#2744) and is now the single decision every adapter and the client runtime reads, resolved once in `jsx-to-ir.ts`:
  
  - Mechanism 1 (`applyLoopKeyAttr`): an element directly inside a `.map()` this component compiles inline gets `{ name: keyAttrName(loop.depth), value: <the key expression> }` — absent entirely for an unkeyed loop.
  - Mechanism 2 (`resolveRootKeyAttr` + the existing `markDataKeyCarrier`): one of this component's own possible render roots (a plain element/if-statement-branch root, or a `needsScopeComment` fragment's first eligible element) gets `{ name: 'data-key' }` (no local value) to relay a key its OWN caller supplies at runtime.
  
  All 9 SSR adapters now emit from `element.keyAttr` alone. Deleted per-adapter duplication this replaces: Hono's `loopKeyStack` (a mutated stack of loop keys) and its parallel `carriesDataKey`/`__dataKey` branch; every one of the other 8 adapters' `currentLoopKeyDepth` field (Go template: `loopKeyDepthStack`) and their `attr.name === 'key'` rewrite in `renderAttributes`; and the `rootScopeNodes`/`collectRootScopeNodes` duplication (byte-identical across 8 `lib/ir-scope.ts` copies) that fed each adapter's own `carriesDataKey` gate — that walk now lives once, in `jsx-to-ir.ts`'s `resolveRootKeyAttr`.
  
  On the client runtime side (`map-array.ts`, `map-array-lazy.ts`, `component.ts`), every `data-key` stamp is now gated on the loop actually being keyed (`getKey` non-null) and reads/writes the SAME compiler-resolved attribute NAME (a new `keyAttrName` parameter, defaulting to `'data-key'` so every depth-0 call site is unchanged) instead of a hardcoded `BF_KEY`. An unkeyed loop's rows are never touched at all — `mapArray` keeps positional identity in its own `scopes` Map. The stale hydration-detection check this replaced (`!existingRanges[0]?.primaryEl.hasAttribute('data-key') || scopes.size === 0`) was already vacuous (`scopes` is always empty the one time that line runs); the new signal is simply `existingRanges.length > 0`.
- 82c3b11: Restore the caller-key relay (`IRElement.keyAttr`, #2753's "mechanism 2") on components whose root is a `<Ctx.Provider>`.
  
  `resolveRootKeyAttr` looked for the component's render root by walking down from the IR root through `element` / `if-statement` / `fragment` and stopping at anything else. A provider is none of those, but `transformProviderElement` passes `ctx.isRoot` through to its children — so the element under the provider IS a render root, carries `needsScope`/`bf-s`, and the walk never reached it. Every adapter then emitted that root without the relay, and a caller rendering such a component as a keyed loop row got a row with no key attribute for `mapArray` to reconcile against.
  
  The relay is now resolved by testing `needsScope` throughout the tree rather than by an enumeration of the constructs `ctx.isRoot` passes through, which is the same predicate the reference adapter applied at emit time before the decision moved into the IR, and matches the client runtime's own CSR half (`renderChild` / `materializeComponent` splice `data-key` onto the rendered markup's first element whatever wrapper nodes sit above it).
  
  Affects every provider-rooted component, including `select`, `popover`, `accordion`, `carousel`, `combobox`, `command`, `dropdown-menu` and `radio-group`. The DSL adapters had never emitted the relay for this shape; Hono had, and regressed when the decision was centralized.
- Updated dependencies [da77d25]
  - @barefootjs/shared@0.33.3

## 0.33.2

### Patch Changes

- c44edaf: Honour `IRElement.carriesDataKey` in the eight non-Hono adapters. The #2732 fix taught the compiler to mark the element a fragment root's `data-key` belongs on, but only `hono-adapter.ts` read the flag; every other adapter still gated `data-key` purely on `rootScopeNodes.has(element) && element.needsScope`, which is false for a fragment root's wrapped child by construction. A fragment-rooted keyed loop row therefore lost its key in eight of the nine backends — the same silent divergence #2732 fixed for Hono, left in place everywhere else.
  
  `carriesDataKey` is an independent reason to emit, not a refinement of the root-scope test, so the condition is widened rather than replaced.
  
  go-template needs one extra guard the other adapters do not. It bakes a hoisted children value into a static Go string, and `extractScopedHtmlChildren` rejects any surviving `{{` action as "genuinely dynamic" — so a `{{if .BfDataKey}}` emission there made the bake return `null`, whereupon the caller dropped the field silently (#2746). A `bakingStaticChildren` flag suppresses only the `carriesDataKey` emission during that bake: `data-key` is a keyed-loop-row contract, and a value baked into a caller's props at compile time is by construction not a loop row.
- @barefootjs/shared@0.33.2

## 0.33.1

### Patch Changes

- @barefootjs/shared@0.33.1

## 0.33.0

### Patch Changes

- af82c38: #2696 Step 2: object-literal spread (`{ ...t, editing: false }`) is admitted at value position; `todo-app`/`todo-app-ssr` graduate off `renderDivergences` on all 7 template-stash adapters.
  
  `ObjectLiteralProperty` (expression-parser.ts) becomes an order-preserving discriminated union — `{ kind: 'prop'; key; keyKind; shorthand; value }` alongside a new `{ kind: 'spread'; expr }` — instead of a flat `{ key; shorthand; value }` shape. Order is significant (`{...t, k: v}` and `{k: v, ...t}` differ in which value wins a shared key), so spread and prop entries share one list rather than splitting into parallel arrays. `convertNode` now converts a `SpreadAssignment` into a `spread` entry instead of falling through to `unsupported` (a computed key, method, or getter/setter still refuses). `checkSupport`'s `object-literal` arm (value position) now checks a spread entry's source expression the same way it checks a prop's value. Every direct consumer of `properties` — `toEvalNode`, `freeVarsInBody`/`freeIdentifiers`, `inlineBinding`, `materializeGetterCalls`, the rewrite walkers, adapter `objectLiteralTo*` helpers, Go's static-literal bakers — is exhaustive over the new `kind` discriminant, so this PR is the complete TS-side fallout of the type change (drift defence: a missed site is a compile error, not a runtime gap).
  
  **Runtime evaluator** (Go `eval.go`, shared Perl `Evaluator.pm`, Python `evaluator.py`, Ruby `evaluator.rb`, PHP `Evaluator.php`, Rust `evaluator.rs`) — all six backends now decode a `spread` entry in an `object-literal` node (the SAME `kind`-tagged shape `toEvalNode` emits for a compiled `*_eval` payload and the raw `ParsedExpr` the `eval-vectors.json` golden corpus carries) by evaluating its source and shallow-merging the result's own keys; a non-object result (including a null/undefined JS spread source) is a no-op. Later entries win on a shared key, in source order, matching JS object-spread exactly — pinned by six new `eval-vectors.json` cases (spread-then-override, override-then-spread, double-spread, the todo-app shape, and two null/undefined-spread no-op cases), proven isomorphic across all six language harnesses.
  
  **Direct value-position lowering** (the 7 template-stash adapters' `objectLiteral` `ParsedExprEmitter` case, for an object-literal spread reached OUTSIDE any evaluator-serialized callback body): each adapter's own merge idiom, folding an order-preserving list of segments (a maximal run of `prop` entries collapses into one native literal; each `spread` entry contributes its own emitted source) — Blade/Twig via a new shared `BarefootJS.php::merge(...$args)` (NOT PHP's own `array_merge()` / Twig's `merge` filter, neither of which accepts the `stdClass` representation a `json_decode()`-sourced object prop uses), ERB via chained `Hash#merge`, real-Perl Mojolicious via a single flattened hashref literal (`{ %{$t}, 'k' => v }`, relying on Perl's own last-write-wins list-to-hash construction), Kolon/Xslate via chained `.merge()`, real Jinja2 via chained `dict(acc, **seg)`, and Go via a new variadic `bf_merge` runtime helper (`bf_map`'s sibling, `runtime/eval.go`) — null-safe (skips a non-map argument) for consistency with the evaluator's semantics. minijinja (Rust) has no `**expr` call-site unpacking (only the power operator), so its builtin `dict(value, **kwargs)` can only express a spread as the FIRST entry followed by identifier-keyed props; any other arrangement self-reports BF101 rather than silently dropping keys (`groupObjectLiteralSegments`, exported from `@barefootjs/jsx`'s `parsed-expr-emitter.ts`, is the one backend-neutral helper every non-Go adapter above builds its fold on; Go reuses it too).
  
  `todo-app` / `todo-app-ssr` graduate off `renderDivergences` on all 7 template-stash adapters: their `todos` signal seeds from `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`, and the spread inside that `.map()` callback body now resolves through the runtime evaluator instead of refusing — `computeSsrSeedPlan` classifies the signal `derived`, closing the null-seed gap `#2696` tracked. New fixture `signal-object-spread-init` pins the DIRECT (non-`.map()`) value-position spread with an override (`{ ...base, done: true }`), passing on all 7 template-stash adapters plus Hono — except Go, where it surfaces a PRE-EXISTING, unrelated gap (a `derived` OBJECT-typed signal/memo has no live-template-expression lowering on Go at all, spread or not — every other backend can emit `{% set merged = dict(...) %}`-equivalent live template code, but Go always bakes an object-typed signal/memo field into Go SOURCE at `NewXxxProps` time, and that baker is static-only), pinned in Go's own `renderDivergences` with the reproduction (identical failure with the spread removed).
  
  Also fixes a latent `ssr-seed-plan.ts` bug this step's own fixture exposed: `classify()`'s signal path re-parsed `signal.initialValue` WITHOUT the paren-wrap `analyzer.ts`'s own `signal.parsed` pass already applies, so a bare object-literal initializer (`createSignal({ ...base, done: true })`) misread as a block statement and silently opaqued instead of classifying `derived` — invisible before object-literal could classify `derived` at all. Now prefers the analyzer's already-parenthesised `signal.parsed` (falling back to a parenthesised re-parse, not the bare string).
- #2696 Step 1: value-position object literals are admitted by the SSR seed support gate; `callback-param-shadows-prop` graduates, `todo-app`/`todo-app-ssr` remain pinned.
  
  `checkSupport` (expression-parser.ts) gains a `pos: 'rendered' | 'value'` parameter: an `object-literal` was refused unconditionally as a standalone template expression, which also blocked it at every VALUE position reachable through it — an array-literal element, an object-literal property value, and the receiver/callback-body/args of a `.map()`-family call or `array-method` (all container-CONTENTS positions; every other recursive site inherits the position it was entered at, so `cond ? {a:1} : {b:2}` at a rendered position stays refused). `isSupported` keeps checking at `'rendered'` (unchanged, byte-identical refusal reason — Roadmap A-1); the new `isSupportedValue` checks at `'value'`, admitting an object literal there when every property value is itself supported. `computeSsrSeedPlan`'s `classify` now uses `isSupportedValue` (a signal/memo initializer is an assignment, never a render).
  
  This makes `[{ a: 'p' }].map(t => t.a).join(',')` (`callback-param-shadows-prop`'s `first` signal) classify `derived` instead of `opaque`. Its free set is empty (a compile-time constant), so every template-stash adapter's derived-seed generator still degrades to the STATIC `extractSsrDefaults` value rather than emitting an in-template recompute (no free var survives into the lowered text) — exactly the graduation path #2696 calls out, so `extractSsrDefaults`'s static evaluator (`ssr-defaults.ts`) gains `.map()` support (single-param expression-bodied arrow over a resolved array) and its property-access arm now reads a resolved plain-object base instead of unconditionally refusing, closing the gap the `renderDivergences` entries named ("`.map()` is unsupported for any receiver").
  
  Each of the 7 template-stash adapters' `objectLiteral` `ParsedExprEmitter` case — previously reachable ONLY as the empty (`?? {}`) fallback and refusing any populated literal — now lowers a populated object literal to its language's native dict/hash/hashref (PHP/Perl array, Ruby Hash, Jinja/Twig/minijinja dict, Kolon hashref), keyed the same way each adapter's existing spread-path `objectLiteralTo*` helper quotes keys. `@barefootjs/go-template` has no map-literal template syntax at all, so its `objectLiteral` case instead lowers through a new variadic `bf_map` runtime helper (`packages/adapter-go-template/runtime/bf.go`), the object counterpart of the existing `bf_arr`; the pre-existing `?? {}` self-reported BF101 (Go genuinely can't render an empty map literal as a template action either) is unchanged.
  
  `callback-param-shadows-prop` graduates off `renderDivergences` on all 7 template-stash adapters. `todo-app` / `todo-app-ssr` remain pinned — their `.map(t => ({ ...t, editing: false }))` uses object SPREAD, which `checkSupport`'s `object-literal` arm still refuses regardless of `pos` (out of scope for this step; spreads, computed keys, methods, and getters/setters all still fall through to `unsupported`).
  
  New fixture `map-object-literal-body`: a `.map()` callback body returning an object literal with a NON-EMPTY free set (a sibling signal), forcing a genuine in-template recompute (not the constant-skip path above) on every template-stash adapter and Go's `bf_map`.
- @barefootjs/shared@0.33.0

## 0.32.0

### Patch Changes

- 40cec78: The 7 template-stash adapters' conformance test harnesses (`test-render.ts`) now seed a root component's signal/memo template vars EXCLUSIVELY from `deriveStashFromDefaults(extractSsrDefaults(...), props)` — the same manifest-driven value a real before_render-equivalent plugin/integration consumes at runtime. Removes the harness's own `evaluateSignalInit` re-evaluation of a signal's initializer against raw props, and the `?? 0` fallback a memo used to get when the manifest had no entry for it; the #2669 self-derivation propName-skip these loops carried is gone too, since `deriveStashFromDefaults` already resolves a propName-carrying entry correctly on its own. Root-path seeding is now the same semantics the child-component-renderer path already had.
  
  `@barefootjs/jsx` removes `evaluateSignalInit`/`tryEvaluateSignalInit`/`SignalInitEvalResult` (`signal-init-eval.ts`, added for #2209): a test-harness-only sandboxed real-JS evaluator (`new Function`) strictly more powerful than production's own static `extractSsrDefaults`/`tryStaticEval`, which has no support for `.map()` on any receiver shape. That extra power was silently masking a real production gap — a signal/memo initialized via a `.map()` chain never gets a working SSR seed in production either, on any of the 7 backends. The 7 harnesses were its only remaining callers.
  
  This export removal is a breaking change, bumped **minor** rather than patch: pre-1.0 (0.31.x), a minor is this repo's breaking-change slot under semver §4 (precedent: the `renderImportMapHtml`/`BfImportMap`/`TemplateAdapter.importMapInjection` removal, 0.31.0). #2209, which ADDED this export, was correctly patch — adding an export isn't breaking — but removing one is.
  
  Surfaced (and pinned via `renderDivergences`, `#2696`) on all 7 adapters:
  
  - `todo-app` / `todo-app-ssr`: the `todos` signal (`(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`) seeds `null`/`nil`/`undef`/`None` — `extractSsrDefaults` can't statically resolve the `.map()` over a differently-named prop, and `computeSsrSeedPlan` classifies it opaque (no in-template recompute). `todo-app-ssr`'s unmarked todo-list loop throws on Python/Ruby/Perl (jinja, erb, mojolicious) and silently renders empty on Kolon/PHP/minijinja (xslate, blade, twig, rust); `todo-app`'s unmarked toggle-all conditional silently renders as if there are zero todos on every backend.
  - `callback-param-shadows-prop`: the `first` signal (`[{ a: 'p' }].map((title) => title.a).join(',')`) is a constant expression that's still unresolvable the same way, and — unlike the fixture's sibling `joined` memo, whose structurally similar `.map().join()` chain over a signal getter DOES get an in-template recompute — also classifies opaque, so `<span>{first()}</span>` SSRs empty instead of `p`.
  
  `@barefootjs/mojolicious`'s child-renderer path (`buildChildDefaultsPerl`) had one further leftover `evaluateSignalInit(..., undefined)` call for an ordinary (non-propName) child signal default, inconsistent with the memo loop right beside it (which already used the static `ssrDefaults` value verbatim) — fixed to match; no currently-covered fixture exercises a child component with a non-statically-resolvable signal, so this is not a new pinned divergence.
  
  Graduation path per entry: fix `extractSsrDefaults`'s static evaluator (or add an in-template recompute for the affected signal shapes) so the manifest's own seed is correct, regenerate `expectedHtml` from the fixed reference, delete the `renderDivergences` entries.
- @barefootjs/shared@0.32.0

## 0.31.10

### Patch Changes

- 032e6dd: A signal or memo whose name collides with the prop its own initializer derives from now seeds its SSR template variable from the RAW prop instead of the derived value (#2669)
  
  `extractSsrDefaults` builds its manifest map in three passes — prop entries, then signals, then memos — and the last two unconditionally overwrote a same-named prop entry, discarding its `propName`. The collision only arises in the bare-props-arg form (`function C(props: P)`), since `function C({ label })` alongside `const [label] = …` is a redeclaration error.
  
  Template-stash adapters lower such a signal to an in-template recompute that READS the stash variable as its input (the raw caller prop) and OVERWRITES it with the derived value under the same name — `{% set label = (label if (label is defined and label is not none) else 'Default') %}`. With `propName` discarded, the manifest consumer (`_derive_stash_from_defaults` and its per-language twins) seeded that variable with the DERIVED value, so the recompute saw a non-nullish value and kept it: a caller-supplied `label='Hello'` could never win, and the SSR body rendered `Default` while `bf-p` correctly carried `Hello`. A non-idempotent derivation was wrong even with no caller props at all — `createSignal((props.count ?? 1) * 2)` seeded with the evaluated `2` re-derived to `2 * 2 = 4`.
  
  Such an entry is now a prop entry (`propName` set, `value: null`), letting the template's own `?? <default>` guard supply the fallback and a caller-supplied prop win. This establishes an invariant consumers can rely on: a signal/memo entry carries `propName` if and only if it is one of these self-derivation collisions. A collision whose initializer does NOT read the same-named prop is unchanged.
  
  **Text::Xslate is the exception.** Kolon's `: my $x = …` is a fresh lexical already in scope inside its own initializer, so a self-referencing derived step cannot be lowered to an in-template recompute at all and the adapter skips it. Xslate therefore has nowhere to perform the derivation at SSR time: a caller-supplied prop passes through un-derived, and an absent prop now renders empty rather than the static default it previously reached by coincidence. That gap is declared in the adapter's published fixture divergences and tracked in #2679.
- 57d936b: The #2669 self-derivation fix now sees THROUGH a component-scope `const` sitting between a signal/memo's initializer and the prop it derives from, closing the gap found in review
  
  ```tsx
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function C(props: { label?: string }) {
    const mid = props.label
    const [label, setLabel] = createSignal(mid ?? 'Default')
    return <span>{label()}</span>
  }
  ```
  
  #2669's fix (`referencesOwnProp` in `packages/jsx/src/ssr-defaults.ts`) only recognized a DIRECT `props.<name>` access in the initializer expression. One hop of pure indirection defeated it on both sides of the pipeline:
  
  - **Manifest**: `collectPropRefs` (both the self-derivation check and the bare-props-arg safety net that seeds a prop a signal/memo initializer reads, #1297/#2126) never looked through a local `const` — the `label` entry lost `propName` and fell back to `{ value: 'Default' }`, so a caller-supplied `label='Hello'` could never win.
  - **Template**: even with `propName` restored, `computeSsrSeedPlan` (`packages/jsx/src/ssr-seed-plan.ts`) classified the signal as `opaque` because `mid` (a component-scope const) wasn't part of its `baseScope` — no adapter emitted an in-template recompute at all, so an absent prop rendered permanently empty instead of falling back to `'Default'`.
  
  Both now resolve transitively through any chain of component-scope `const` locals (`collectPropRefsTransitive` on the manifest side; `resolveThroughLocalConsts`, reusing the same structural `inlineBinding` let-inline step `foldBlockToExpr` already performs for a block-bodied memo's own locals, on the seed-plan side) — never string splicing, per this repo's write-side rule. The seed-plan fix lives in the shared `computeSsrSeedPlan`, so every template-stash adapter's existing self-referencing-lowering handling (Jinja/Twig/Blade/Rust's re-read-before-reassign `{% set %}` semantics, Xslate's capture-before-shadow `: my $__bf_seed_*` lowering) picks it up with no adapter-side changes.
  
  **go-template**: the manifest/seed-plan fix applies equally, but the pre-existing #2683 props-struct field-name-collision bug (keyed on the signal's name colliding with its prop field, independent of how the initializer reaches that prop) still drops the derivation for the non-idempotent via-const shape — pinned in `render-divergences.ts` alongside the direct-access form #2683 already covers.
- @barefootjs/shared@0.31.10

## 0.31.9

### Patch Changes

- abe5d6f: Fixed the conformance test harnesses (`test-render.ts`) so every adapter now actually exercises `props_attr`'s `bf-p` hydration-props contract during SSR rendering, matching production's `Renderer.renderComponentInto` (Go) / `_props` accessor (ERB, Jinja, Mojolicious): previously none of these harnesses seeded the caller-facing props the way a real route handler does, so `bf-p` was silently absent from every rendered fixture regardless of what the adapter itself emitted. No adapter runtime behavior changed — only the harness code used by the test suite.
  - @barefootjs/shared@0.31.9

## 0.31.8

### Patch Changes

- @barefootjs/shared@0.31.8

## 0.31.7

### Patch Changes

- @barefootjs/shared@0.31.7

## 0.31.6

### Patch Changes

- 6469e4c: `ConformancePin` gains an optional `unescapable?: { issue: string }` field, and every adapter's own `conformance-pins.ts` now declares it where a refusal has no verified escape yet (#2613).

  This is the declaration an adapter uses to say "I refuse this fixture and there is no working `/* @client */` (or other) escape for it yet, tracked here." It matters for adapter authors: the escape-coverage floor test derives its entire domain from `loadCompatAdapters()`, so **a new adapter package declares its own escape debt in its own `conformance-pins.ts` and needs no change to `@barefootjs/compat`**. Previously the equivalent ledger was a set of hardcoded `"adapterId/fixtureId"` strings inside a core test, which would have required editing core to land a community adapter.

  No runtime or emission behavior changes; this is a declaration surface only.

- 2004fc3: Fix a real SSR/CSR divergence in the compiled client JS for a bare (non-loop) `/* @client */` text expression: the standalone CSR template — `generateCsrTemplateWithOpts` in `packages/jsx/src/ir-to-client-js/html-template.ts`, used for `registerTemplate()`'s CSR fallback — never consulted `IRExpression.markerless` before emitting the `<!--bf:sN-->…<!--/-->` marker pair, so it kept the markers even where `client-only-elision.ts` had already decided (before either SSR or CSR generation runs) that the whole marker pair could be dropped. SSR already elided the marker pair correctly for this shape; a fresh (non-hydrating) CSR mount did not, and a hydrating mount claiming via `elidedPath` also embedded the extra dead marker comments. `generateCsrTemplateWithOpts` now emits nothing for a markerless `clientOnly && slotId` expression, matching SSR byte-for-byte and matching what `irToHtmlTemplate`'s own `markerless` check already did for its (different) domain (#2617).

  **Emitted-output effect**: any bare, non-loop `/* @client */` text expression compiled today loses two marker comments from its compiled client JS template (e.g. `<strong bf="s1"><!--bf:s0--><!--/--></strong>` becomes `<strong bf="s1"></strong>`). This is strictly a byte-size/parity fix — no behavioral change for hydration or fresh-mount rendering, since the claim plan already resolves this position via a precomputed child-index path (`elidedPath`), not a marker scan.

  `@barefootjs/jsx`'s escape-coverage-adjacent adapter packages (`blade`, `erb`, `go-template`, `jinja`, `mojolicious`, `rust`, `twig`, `xslate`) each drop `unescapable: { issue: '.../2613' }` from seven `conformance-pins.ts` entries (`fill-unsupported`, `find-typeof-predicate`, `some-typeof-predicate`, `every-typeof-predicate`, `reduce-typeof-body`, `reduce-right-typeof-body`, `flatmap-typeof-projection`) now that each fixture's `/* @client */` escape twin is a verified, CSR-conformant escape — declaration-only, no runtime behavior change on these packages themselves (their own SSR output was never affected by this bug).

- a2e5540: `ErrorSuggestion` gains an optional `escape?: ReadonlyArray<{ kind: EscapeKind }>` — the structured half of a refusal's suggestion (#2613, #2614). `EscapeKind` and `ESCAPE_SSR_COST` are exported from `@barefootjs/jsx` alongside it.

  This is what lets a tool answer "how does the user get out of this refusal?" without parsing prose. `suggestion.message` stays authoritative for humans — several sites have site-specific wording no enum should flatten — while `escape` is authoritative for machines, and `ESCAPE_SSR_COST` is the one place the trade each kind makes is defined (`'client-directive'` renders nothing at SSR until hydration; `'prop-precompute'` and `'rewrite'` keep full server output). Consumers surfacing an escape should surface its cost from that map rather than restating it, so the trade cannot be quietly dropped on the way to a user.

  The field is additive and one-way: it is populated at the BF101 refusal sites behind #2320/#2321 in every DSL adapter, and absent elsewhere. **Absent means "not declared yet", never "no escape exists"** — do not infer unescapability from its absence.

  Adapter authors: what you claim here is checked. `escape-coverage.test.ts` verifies that every kind a diagnostic claims is demonstrated by a conformance twin that actually compiles clean on the refusing adapter, so a claim can no longer outrun its proof.

  No emission or runtime behavior changes.

- 93f83cc: Removes the `unescapable` declaration from each adapter's `map-array-builder-body` / `map-array-builder-escaping` conformance pins (#2613). These two fixtures still refuse the imperative array-builder `.map()` body with BF021 on every DSL adapter, but the `/* @client */` escape is now verified with an executable twin (`map-array-builder-body-client`) rather than merely asserted in a docstring: it compiles clean and produces zero diagnostics on all 8 DSL adapters, and its CSR template renders the empty host correctly.

  No runtime or emission behavior changes — the BF021 refusal is unchanged; only the escape-coverage declaration is corrected from "owed but unverified" to "verified."

- 5ad9418: Removes the `unescapable` declaration from each adapter's `static-array-from-props` / `static-array-from-props-with-component` conformance pins (#2321). These two fixtures still refuse the props-derived, function-scope computed-const loop array with BF101 on every DSL adapter — no DSL template adapter can bind `Object.entries(props.x ?? {}).filter(...)` as a template variable, and that SSR capability gap is unchanged. The `/* @client */` escape is now verified with executable twins (`static-array-from-props-client`, `static-array-from-props-with-component-client`) rather than merely asserted: both are byte-for-byte copies of their bases (plus the one `/* @client */` insertion) that compile clean with zero diagnostics on all 8 DSL adapters, and their CSR templates render the empty host correctly with the loop deferred to the browser.

  No runtime or emission behavior changes — the BF101 refusal is unchanged; only the escape-coverage declaration is corrected from "owed but unverified" to "verified." #2321 stays open as the underlying SSR capability gap.

  - @barefootjs/shared@0.31.6

## 0.31.5

### Patch Changes

- 59cce78: Migrate the seven template-string adapters (Twig, Jinja, Blade, Xslate, Rust/minijinja, ERB, Mojolicious) onto `BindingScope` for loop-callback shadow guards (#2482 stage 2). Each adapter's ad-hoc device pair — a coarse whole-component shadow-name `Set` plus a ref-counted, position-accurate `Map<string, number>` (or, for ERB/Mojolicious, a single already-live map) — collapses into one threaded, immutable `this.scope: BindingScope`, entered/exited by reference around `renderLoop`'s body exactly like the Stage 1a/1b `ctx.scope` precedent in `jsx-to-ir.ts`. `IRLoop` already structurally satisfies `LoopBindingSource`, so `renderLoop` passes the loop node straight to `enterLoopRow`.

  This ends a real coarse/live drift: `resolveStaticLoopSource`'s `isNameShadowed` callback previously received the coarse whole-component set from five adapters (twig/jinja/blade/xslate/rust) but the live, position-accurate map from ERB/Mojolicious — same shared function, two different meanings depending on caller. All seven adapters now feed the same canonical, position-accurate predicate (`scope.asShadowPredicate()`). The five Twig-family adapters' `_resolveLiteralConst`/`_resolveStaticRecordLiteral` module-const-inlining guards are also canonicalized from a coarse whole-component exclusion to the position-accurate scope, matching ERB/Mojolicious's existing (already-correct) behavior: a same-named const outside any shadowing loop now inlines even when a same-named loop param exists elsewhere in the component — previously an accepted-but-imprecise trade-off, now fixed.

  `@barefootjs/jsx`: `lookupStaticRecordLiteral` (`augment-inherited-props.ts`) gains a required `isShadowed` guard parameter instead of leaving the shadow check to caller discipline — every one of the seven call sites now passes its threaded scope's `isBound` predicate.

  - @barefootjs/shared@0.31.5

## 0.31.4

### Patch Changes

- @barefootjs/shared@0.31.4

## 0.31.3

### Patch Changes

- @barefootjs/shared@0.31.3

## 0.31.2

### Patch Changes

- 1c38212: Template-adapter SSR seeding now honors an aliased destructured prop's caller-facing key (#2524 SSR half)

  A renaming destructure (`{ n: count }`) keys template variables by the LOCAL
  binding (`count`, correctly — the template body reads `count`) but the
  caller only ever supplies the CALLER-facing name (`n`). `extractSsrDefaults`
  already emitted that mapping as `SsrDefault.propName`
  (`{"count":{"propName":"n","value":null}}`), but nothing consumed it: every
  template-string adapter's conformance harness (and 3 shipped production
  sites) either discarded `propName` outright or keyed its seeding loop off
  the local name, so a renamed prop's caller value was silently dropped and
  the slot rendered its static default (`null`/`undefined`/`0`) instead.

  - New shared helper `deriveStashFromDefaults` (`@barefootjs/jsx`) — the TS
    twin of the runtime `derive_vars_from_defaults` /
    `_derive_stash_from_defaults` family that already ships in the Ruby,
    Python, PHP, Perl, and Rust runtime ports. For each defaults entry, prefers
    `props[propName]` when the caller supplied a non-nullish value, else the
    static fallback; `isRestProps` entries pass the caller's assembled rest bag
    through; propName-less entries (signal/memo locals) always use the static
    value.
  - All 7 template-string adapters' conformance harnesses (blade, erb, jinja,
    mojolicious, rust/minijinja, twig, xslate) now derive both root-level and
    child-component seeding through this helper (or the matching PRODUCTION
    runtime function, when the harness already drives one) instead of
    hand-flattening `SsrDefault.value`. Child-defaults seeding now carries the
    FULL `{value, propName?, isRestProps?}` shape into the generated render
    script/payload and resolves it per-call against the real caller props, the
    same way `@barefootjs/erb`'s harness already did.
  - Rest-bag "keep" sets (which caller-supplied keys are declared params vs.
    undeclared extras routed into `...rest`) now key off `sourceName ?? name`
    (the caller-facing spelling) instead of the local binding.
  - Three shipped PRODUCTION sites had the same defect class and are fixed
    too: `@barefootjs/rust`'s runtime (`register_components_from_manifest`
    used to flatten `ssrDefaults` with an EMPTY props document at
    registration time, before any caller was known — resolution now happens
    per-call, inside `render_child`, against the real caller props);
    `@barefootjs/mojolicious`'s plugin (`before_render` hook's top-level
    stash seeding); and `@barefootjs/cli`'s Text::Xslate scaffold
    (`app.psgi`'s `ssr_defaults`/`render_component` helpers). All three now
    route through the corresponding runtime's `derive_stash_from_defaults` /
    `_derive_stash_from_defaults`.
  - `Barefoot\BarefootJS::deriveStashFromDefaults` (`@barefootjs/php`) is now
    `public` (was `private`) so the blade/twig conformance harnesses — and any
    caller composing a render by hand, mirroring the Ruby port's own public
    `derive_vars_from_defaults` — can route through the real production logic
    instead of re-deriving it.

  `sourceName ?? name` is an identity for every un-aliased prop, so the rename
  visibility fix itself has no effect on the non-aliased corpus. The merge
  ORDER flip that makes `propName` resolution possible (defaults-derived
  `extra` now applies LAST, over the caller's raw props, instead of first)
  does have two deliberate, narrower behavior changes even for non-aliased
  props — both intentional alignments with the semantics every other runtime
  port (`derive_vars_from_defaults` / `_derive_stash_from_defaults` /
  `derive_stash_from_defaults`) already had, not regressions introduced here:

  - A caller prop passed as explicit `null`/`undefined` now loses to the
    static default, instead of the explicit nullish value winning. This
    matches `deriveStashFromDefaults`'s (and every runtime port's)
    "present and non-nullish" check on `props[propName]` — a flat
    `{...defaults, ...callerProps}` merge can't express that distinction (any
    own key wins, nullish or not); routing through the shared helper can.
  - A caller prop whose name collides with a `propName`-less entry (a
    signal/memo local, e.g. a prop happens to be named the same as an
    internal signal getter) now loses to the signal/memo's static value
    instead of overriding it — `propName`-less entries are, by construction,
    never sourced from `props` in any port; a flat merge accidentally let a
    same-named caller prop shadow one anyway.

  Both changes only bite an existing caller relying on one of these two
  narrow, previously-inconsistent-with-every-other-port behaviors; the common
  case (a caller prop with a concrete, non-nullish value and no name
  collision with an internal signal/memo) is unaffected. Graduates the
  `aliased-destructured-prop` / `composite-row-child-aliased-prop`
  render-divergence pins for all 7 adapters (erb graduates
  `aliased-destructured-prop` only — its child-seeding path was already
  correct). Go's `go run` exit-1 failure (#2525) is untouched by this change
  and stays pinned.

  - @barefootjs/shared@0.31.2

## 0.31.1

### Patch Changes

- @barefootjs/shared@0.31.1

## 0.31.0

### Minor Changes

- 3a44cd2: Emit `<link rel="modulepreload">` hints for a component's transitively-shared chunks

  A compiled template registers exactly ONE script — the component's own entry:

  ```js
  registerComponentScripts([
    "/integrations/hono/static/components/assets/TodoApp.tsx-CtatJ74J.js",
  ]);
  ```

  But that entry is not a leaf. Vite's build manifest for the same component says:

  ```json
  "../shared/components/TodoApp.tsx": {
    "file": "assets/TodoApp.tsx-CtatJ74J.js",
    "imports": ["_index-xrhpkKRC.js", "../shared/components/TodoItem.tsx"]
  }
  ```

  and `TodoItem.tsx` in turn imports `_index-xrhpkKRC.js` (the shared runtime
  chunk, a leaf). So the browser's real load sequence was two sequential waves:

  1. fetch + parse `TodoApp.tsx-<hash>.js`
  2. only now discover, and fetch, `TodoItem.tsx-<hash>.js` and `index-<hash>.js`

  Nothing emitted a `modulepreload` hint anywhere in the repo, so wave 2 always
  cost a full extra round trip. On localhost that is invisible — which is
  exactly why the benchmark suite does not catch this win — but on a
  100ms-RTT connection it is 100ms of dead time before an island can hydrate.

  `AdapterGenerateOptions.preloadAssets` (a sibling of `scriptAssets`) carries
  an ordered, fully-resolved list of the entry's transitive chunk URLs,
  excluding the entry's own file. `@barefootjs/vite`'s `resolvePreloadAssets`
  resolves it from the build manifest by walking `entry.imports`
  breadth-first (deterministic order, deduped, cycle-safe) — deliberately NOT
  following `dynamicImports`, since a dynamic import is by definition not
  needed for first paint. Every adapter emits a `<link rel="modulepreload"
crossorigin href="…">` immediately before its `scriptAssets` registrations,
  in each adapter's own native form. `undefined` means "no preload
  information" (emits nothing); `[]` means "resolved, nothing to preload"
  (also emits nothing) — the same `undefined`/`[]` distinction `scriptAssets`
  already draws. `skipScriptRegistration` still wins over both unconditionally.

  In dev, Vite serves unbundled modules with its own on-demand dependency
  pre-bundling — there is no stable, hashed chunk graph to preload, so
  `preloadAssets` is always `[]` there.

  Purely additive: with `preloadAssets` unset (the default) every existing
  caller keeps byte-identical output.

  ## How the other eight get it

  They don't emit script tags inline — they call a collector
  (`bf.register_script(...)`) whose output the app's layout renders elsewhere.
  So the preloads travel the same path: a `register_preload` collector in each
  of the six native runtimes (Rust, PHP, Ruby, Perl, Python, Go), with its own
  dedup set, and the EXISTING script-render helper extended to emit the
  `<link rel="modulepreload" crossorigin>` tags ahead of the
  `<script type="module">` tags it already emits. Extending that helper is what
  keeps this non-breaking: no integration's layout changes.

  The adapters emit a no-output register statement, never a literal `<link>` —
  `{% set %}` produces nothing, while a `<link>` element renders and would
  inject a node before the component's root, breaking hydration's DOM claim
  paths.

  An app that also threads the collector into its child renderers (two lines
  mirroring the `_scripts`/`_script_seen` threading already there) gets hints
  for chunks registered inside a child too. Skipping that keeps the app
  working, just with fewer hints — verified against four integrations left
  unmodified on purpose (fastapi, sinatra, xslate, gin), all green.

- 844ce9c: Remove the externals-importmap subsystem — `renderImportMapHtml`, `BfImportMap`, `TemplateAdapter.importMapInjection`

  `BfImportMap`'s built-in default mapped `@barefootjs/client` to
  `<base>/barefoot.js`. After the Vite migration no `barefoot.js` exists in
  any build output — the runtime is a content-hashed shared ESM chunk — so
  the component's default output pointed at a URL that never existed. It had
  zero production callers, and `renderImportMapHtml` had exactly one caller
  (`BfImportMap`) besides its own contract test. Every importmap the repo
  actually emits (`site/core/renderer.tsx`, `site/ui/renderer.tsx`, the CSR
  and xyflow docs examples) is, and always was, hand-written — this subsystem
  was dead weight pointing at broken output.

  This is a **breaking** change, bumped as a MINOR, not a major: BarefootJS is
  pre-1.0 (0.31.x), where a minor is the breaking-change slot under semver's
  §4, and 1.0 is a stability commitment this release does not make.

  ## Removed

  - **`@barefootjs/jsx`**: `renderImportMapHtml`, `ImportMapManifest`,
    `ExternalsManifest`, and the `./import-map` export subpath.
    `TemplateAdapter.importMapInjection`.
  - **`@barefootjs/hono`**: `BfImportMap` and `BfImportMapProps` from
    `@barefootjs/hono/app`. `BfScripts` and `BfDevReload` are unaffected.
  - **`importMapInjection` declarations** on every adapter that had one:
    blade, erb, go-template, hono, jinja, mojolicious, rust, twig, xslate.
    None of them read the field — only the adapter-tests contract test
    (also removed) did.

  ## Corrected alongside it

  `@barefootjs/router`'s `defaultRehydrate` / `defaultDispose` keep
  `'@barefootjs/client/runtime'` in a _variable_ so bundlers cannot resolve it —
  that is what keeps the client runtime an optional peer for a static-shell
  site. The comment there said the browser resolves it "through the page's
  import map", and the error message told users to make sure the runtime was
  "mapped in the page's import map". Neither is actionable: nothing emits such
  a map, and `BfImportMap` would have mapped that specifier to
  `<base>/barefoot.js`, which does not exist. The fallback is unreachable in a
  correctly-wired app anyway — `setupStreaming()` installs the
  `__bf_hydrate_within` / `__bf_dispose_within` seams the code checks first.
  The message now names that call instead.

  ## What to do instead

  An app that deliberately externalizes a dependency
  (`build.rollupOptions.external`) and loads it from a CDN hand-writes its
  own `<script type="importmap">`, the same way every importmap this repo
  actually ships already does. See `docs/core/advanced/xyflow-browser-bundle.md`
  for a worked example, including the two correctness rules that used to live
  only in the deleted `renderImportMapHtml` (escaping `<` inside the importmap
  JSON; `crossorigin` on a cross-origin `modulepreload`) — both now documented
  there, where the hand-written pattern is actually taught.

- c29e8b5: Add `@barefootjs/mojolicious/vite`, a composed Vite plugin for Perl/Mojolicious

  A new subpath exporting `barefoot` (named AND default, matching core's own
  `packages/vite/src/index.ts` shape, and this PR's other template-string
  adapters' naming, exactly):

  ```ts
  import { barefoot } from "@barefootjs/mojolicious/vite";

  export default defineConfig({
    base: "/integrations/mojolicious/client/",
    build: { outDir: "dist/client" },
    plugins: barefoot({
      components: ["../shared/components", "../shared/blog"],
      templates: "dist/templates",
    }),
  });
  ```

  No `adapter` option — this constructs `MojoAdapter` itself. Byte-for-byte
  the same shape as `@barefootjs/blade/vite`/`@barefootjs/jinja/vite`/
  `@barefootjs/erb/vite`/`@barefootjs/twig/vite`: no `afterEmit`-driven type
  combination (`MojoAdapter.generate()` never produces a `types` section —
  `./build.ts`'s `createConfig` has no default `postBuild` either), no
  `adapterOptions` (`MojoAdapterOptions`'s two fields are dead once
  `scriptAssets` is always resolved), and `assets` ports over unchanged
  except the generated file is plain JSON (`dist/bf-assets.json`, gitignored,
  regenerated every build) — Perl reads it at request time, nothing to
  commit.

  Also carries the same fix the port needed to actually build: `@barefootjs/
mojolicious/src/adapter/expr/emitters.ts` has the identical TS-constructor-
  parameter-property shape — `MojoFilterEmitter`/`MojoTopLevelEmitter`'s
  constructors rewritten as plain field declarations + explicit assignment.

  Mojolicious was not preinstalled in this environment; installed via
  `cpanm --notest Mojolicious` to get a real E2E run rather than an assumed
  one. That real run surfaced a pre-existing, unrelated bug in
  `integrations/mojolicious/app.pl`'s `/blog` route (a missing `root` seed —
  see that migration's own commit), never exercised before because `bun
test` always skips Mojo rendering when Mojolicious isn't installed.

  `integrations/mojolicious` moves onto this package's `/vite` in this PR.
  Its 104-test Playwright E2E suite passes end-to-end against the migrated
  build.

- c92097b: Remove the legacy build pipeline — `bf build`, `barefoot.config.ts`, and every adapter's `createConfig`

  The last PR of the Vite migration (7a resolved `bf`'s project config from
  `vite.config.ts`; 7b made every scaffold emit `vite.config.ts`). All
  nineteen integrations run on `@barefootjs/vite`, and nothing depends on the
  second implementation any more — this deletes it.

  This is a **breaking** change, shipped as one release with the rest of the
  migration. It is bumped as a MINOR, not a major: BarefootJS is pre-1.0
  (0.30.x), where a minor is the breaking-change slot under semver's §4, and
  1.0 is a stability commitment this release does not make. Read the "Removed"
  and "Moved" sections below as the upgrade checklist regardless of the
  version digit that moves.

  ## Removed

  - **`bf build` and `bf build --watch`** — the CLI command, its arg parsing,
    and its `--help` listing are gone. Compile through `vite build` /
    `vite dev` via `@barefootjs/vite`'s `barefoot()` plugin instead.
  - **`packages/cli/src/lib/build.ts`** (2469 lines) and everything that
    existed only to serve it: `runtime-treeshake.ts`, `build-cache.ts`,
    `emit-ledger.ts`, `config-loader.ts`, `assets-ignore.ts`. `resolve-imports.ts`
    is the one file on the original removal list that turned out to still be
    load-bearing — see "What surfaced" below — it stays.
  - **`barefoot.config.ts`** as a config source. `bf`'s project-context
    resolution (`context.ts`) now reads `vite.config.ts` only; the
    `barefoot.config.ts` fallback branch added in 7a (for a transition period
    where both files could exist) is pruned along with the types
    (`BarefootBuildConfig`, `defineConfig`) that only served it. The 19
    `integrations/*/barefoot.config.ts` files — unused since 7b, kept only so
    this PR could delete them cleanly — are gone.
  - **Every adapter's `createConfig` factory and `./build` export subpath**
    (`@barefootjs/hono/build`, `@barefootjs/go-template/build`, and the
    blade/erb/jinja/mojolicious/rust/twig/xslate/client equivalents). Configure
    the Vite plugin directly instead: `import { barefoot } from
'@barefootjs/<adapter>/vite'` in `vite.config.ts`.
  - **`@barefootjs/hono/dev`** (`dev.tsx`) — dead since `dev-worker.ts`
    superseded it; imported only by its own test.
  - **`addScriptCollection`** (Hono's regex/paren-counting rewrite of
    compiled TS, forbidden by CLAUDE.md's parsing convention) — superseded by
    `scriptAssets` codegen (#2509).

  ## Moved

  - **`CSRAdapter`** moves from `@barefootjs/client/build` to
    `@barefootjs/client/csr-adapter` — the adapter class itself was never
    legacy-pipeline-specific (it's the `TemplateAdapter` every CSR
    `vite.config.ts` passes to `barefoot({ adapter: new CSRAdapter() })`);
    only `createConfig`, which lived in the same file, was.
  - **Go's type-combination helpers** (`combineGoTypes`, `deduplicateGoTypes`,
    `stripGoPackageHeader`) move from `@barefootjs/go-template/build` to a new
    internal `go-types.ts` — still wired into `components.go` generation via
    `@barefootjs/go-template/vite`'s `afterEmit` hook, unchanged behavior.

  ## What surfaced

  Latent dependencies on the "second implementation," found by deleting and
  following the breakage rather than guessing:

  - **`packages/cli/src/lib/resolve-imports.ts` looked build-only and wasn't.**
    `site/ui/build.ts` and `site/core/build.ts` — the component-registry and
    marketing/docs sites' own hand-rolled compiler-invocation scripts, which
    predate the Vite migration and were never in its scope — call
    `resolveRelativeImports` directly to inline sibling `.ts` helper modules
    into their compiled client JS. It stays, now genuinely used only by those
    two site scripts (`bf build` itself is gone).
  - **The same two site scripts also imported `hasUseClientDirective`,
    `discoverComponentFiles`, `generateHash` from the deleted `build.ts`, and
    `addScriptCollection` from the deleted Hono `build.ts`.** These four are
    pure text/text-discovery helpers with no other live caller post-migration
    — copied to a new `site/shared/lib/site-build-helpers.ts` rather than
    resurrected as shared CLI/adapter infrastructure.
  - **The BarefootJS benchmark app** (`benchmarks/apps/barefoot/`, gated into
    CI by `.github/workflows/benchmark.yml` on `packages/client/**` /
    `benchmarks/**` changes) spawned `bf build` directly against its own
    `barefoot.config.ts`. Migrated to a `vite.config.ts` mirroring
    `integrations/csr`'s own CSR setup; `build.ts` now shells out to `vite
build` instead.

  ## Verified

  - Full-repo `bun run build` and `bun scripts/smoke-publish.mjs` (packs every
    publishable tarball, scaffolds a project from them with no workspace
    refs, and runs the full `bf` CLI surface plus `npm run build` / `npm test`
    against it) green.
  - `gin` (Go), `hono` (JS/Cloudflare Workers), and `csr` built explicitly
    (`bun run build`, since not every `playwright.config.ts` builds for you)
    with their E2E suites green: `gin` 104/104, `hono` 105/105, `csr` 78/79
    (the one failure — `ToggleItem` ScopeID format — is pre-existing and
    unrelated to this PR, reproduced identically against the legacy build
    per the CSR migration's own changeset).
  - Per-package `bun test`: `cli` 729/729, `client` 625/625, `go-template`
    1545/1545 (19 skipped — needs `GOTOOLCHAIN=go1.25.6` in this sandbox,
    which ships go1.24.7 by default), `hono` 1322/1323 (one 5s-timeout flake
    under concurrent load, passes in isolation), `blade` 1281/1281, `jinja`
    1260/1260 (21 skipped). `erb`'s 57 failures are a pre-existing sandbox
    gap (`LANG`/`LC_ALL` unset → Ruby's JSON parser defaults to US-ASCII,
    rejecting multibyte fixtures) — not introduced by this PR.
    `mojolicious`/`rust`/`twig`/`xslate` build clean; not run to completion
    given the identical, low-risk shape of their edits (package.json export
    removal + an orphaned `build.ts` deletion with no test file referencing
    it in any of the four) and the consistent clean/environment-only-failure
    pattern across the seven packages that were run to completion.

### Patch Changes

- 09bf535: Accept a caller-resolved script URL list via `AdapterGenerateOptions.scriptAssets`

  Adapters computed their client-JS `<script>` URLs at codegen time from two
  adapter-construction options — `barefootJsPath` for the shared runtime and
  `clientJsBasePath + name + '.client.js'` for the component itself. That
  computation bakes in three assumptions a bundler-driven pipeline breaks: that
  the URLs are knowable before bundling (they are content-hashed after), that
  there are exactly two of them (a dev-server client script makes three, a
  server-only component zero), and that the runtime is a separately-registered
  script (as an ESM import of a shared chunk it is not registered at all).

  `scriptAssets` is an ordered list of fully-resolved absolute URLs, supplied
  per-generate, that each adapter emits as one module-script registration per
  entry in its own native form — `{{.Scripts.Register "…"}}` for Go templates,
  `<%- bf.register_script('…') -%>` for ERB, `@php($bf->register_script('…'))`
  for Blade, and so on. The caller owns all resolution.

  Precedence: `skipScriptRegistration` still wins unconditionally; then
  `scriptAssets` when present; then today's computed paths. `undefined` means
  "fall back to the legacy computation" and is distinct from `[]`, which means
  "this component needs no scripts at all".

  Purely additive — with `scriptAssets` unset every existing caller keeps
  byte-identical output, which the unchanged conformance-fixture corpus
  confirms.

- 5b05b4b: Fix `./vite` entry points crashing on Node versions without native TypeScript stripping

  Every adapter's `./vite` subpath (and `@barefootjs/vite`'s own `.` entry)
  pointed at `.ts` source, e.g. `{"types": "./src/vite.ts", "import":
"./src/vite.ts"}`. That copied the shape of `./build` — which is only ever
  loaded by `bf build` running under bun, a runtime that reads `.ts`
  natively — but Vite's own config loader is a different kind of consumer:
  it externalizes bare imports like `import { barefoot } from
'@barefootjs/hono/vite'` and lets **Node**, not bun, resolve and load them.
  This only ever worked in a container whose Node happens to have native
  type-stripping on by default (22.18+); on any older Node it fails with
  `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"` the
  moment a downstream app's `vite.config.ts` does `import { barefoot } from
'@barefootjs/<adapter>/vite'`.

  Fix, per package:

  - Every `./vite` subpath (`@barefootjs/blade`, `@barefootjs/erb`,
    `@barefootjs/go-template`, `@barefootjs/hono`, `@barefootjs/jinja`,
    `@barefootjs/mojolicious`, `@barefootjs/rust`, `@barefootjs/twig`,
    `@barefootjs/xslate`) now SPLITS its two conditions instead of pointing
    both at the same file: `{"types": "./src/vite.ts", "import":
"./dist/vite.js"}`. TypeScript reads `types`, Node reads `import` — they
    never had to be the same file, and keeping `types` on real source means
    every consumer that only ever needed to _type-check_ against this entry
    (an adapter's own `build:types`, a downstream app's `tsc`) keeps doing so
    straight from source, with nothing built, exactly as before. Only the
    condition Node's ESM loader actually resolves (`import`) needs to be
    built JS. `publishConfig` is untouched — it already swapped both
    conditions to `dist` at pack time, which is correct: nothing outside
    this workspace should type-check against source.
  - `@barefootjs/vite`'s own `.` entry gets the same split (top-level `types`
    → `./src/index.ts`, `import` → `./dist/index.js`; `publishConfig` keeps
    swapping both to dist at pack time, restored to its original shape).
  - Each adapter's `build:js` now bundles `src/vite.ts` in its own `bun
build` invocation, separate from the `index.ts`/`adapter/index.ts`/
    `build.ts` invocation those subpaths keep sharing. The `./vite` build
    does NOT externalize `@barefootjs/jsx` / `@barefootjs/shared` — Node
    would otherwise hit the exact same `.ts`-extension failure one hop
    later, resolving `@barefootjs/jsx`'s own (still src-pointing, unchanged)
    `.` export. `@barefootjs/vite`'s own build drops the same two externals
    for the same reason. Both keep `typescript` external (a real npm
    package, already Node-loadable) to avoid bundling the whole TS compiler
    into every adapter's `./vite` output.
  - `--target node` on both of the above: bun's default bundle target is
    `browser`, which polyfills `node:fs/promises` et al. into browser stubs
    — silently turning every `readFile`/`writeFile`/`mkdir` call into
    `undefined` at runtime (`TypeError: readFile is not a function`) instead
    of failing to build. Only surfaces once something (Vite's config loader)
    actually calls the plugin's manifest-reading code, so it hid behind the
    same "nothing loads dist under Node" gap as the `.ts`-extension bug.
  - `@barefootjs/client`'s `./build` entry (already dist-only on both
    conditions, unchanged by this PR — its consumers always needed it
    built) had the identical latent runtime bug one level removed:
    `CSRAdapter` (`csr-adapter.ts`) imports `BaseAdapter` from
    `@barefootjs/jsx` as a real value, and `build:js` externalized it — so
    `integrations/csr`'s `vite.config.ts` (`import { CSRAdapter } from
'@barefootjs/client/build'`) hit the same crash one hop further down the
    chain. Fixed the same way: stop externalizing `@barefootjs/jsx`, add
    `--target node`.
  - Root `build` script keeps `@barefootjs/vite` as an explicit early build
    step, before the `@barefootjs/hono` / `@barefootjs/go-template` /
    `@barefootjs/mojolicious` trio and the rest of `--filter '*'`. This is
    NOT for type resolution (the `types`/`import` split above already
    decouples that from build order — a scoped `build:types` run, e.g. `cd
packages/blade && bun run build`, never needs `@barefootjs/vite` built).
    It's for the RUNTIME resolution real `vite build`/`vite dev` invocations
    need: `--filter '*'` does not reliably build `@barefootjs/vite` before
    workspace packages whose OWN build step actually executes a Vite config
    that imports it (`integrations/nethttp`, `integrations/chi`, and any
    other integration whose `build` script runs `vite build` for real, not
    just type-checks) — confirmed by dropping this step and watching a
    clean `bun run build` fail with `ERR_MODULE_NOT_FOUND` resolving
    `@barefootjs/vite/dist/index.js` from `adapter-go-template/dist/vite.js`
    partway through `--filter '*'`.
  - `packages/vite/tsconfig.json` gains `DOM`/`DOM.Iterable` lib entries
    (every sibling adapter tsconfig already had them) — still needed
    independent of the above: `packages/vite`'s OWN `build:types` walks real
    (non-type-only) imports from `@barefootjs/jsx`, whose `html-types.ts`
    needs DOM lib to resolve `HTMLButtonElement` and friends. Confirmed by
    reverting just this file and rebuilding — `tsgo` fails the same way
    whether or not the root build ordering or the `types`/`import` split are
    in place.

  **DX cost**: every one of these packages' `./vite` (or `@barefootjs/vite`'s
  `.`) entry now needs `bun run build` before `vite dev` / `vite build` can
  actually load and run it — the `import` condition was always meant to be a
  build artifact, this just stops it accidentally working off raw source.
  Type-checking (`tsc`/`tsgo` against the `types` condition) needs no build
  step at all, in any of these packages, scoped or full — that's the whole
  point of the split. Running an integration's `vite dev`/`vite build`
  without building workspace packages first fails the same
  `ERR_UNKNOWN_FILE_EXTENSION` / `ERR_MODULE_NOT_FOUND` way it always would
  have on a stricter Node; the fix removes the accidental "works because
  dist happens to already exist from an unrelated build" case rather than
  adding a new requirement.

  Backstop: `__tests__/vite-entry-node-loadable.test.ts` reads every
  workspace package's manifest and fails if any `./vite` (or
  `@barefootjs/vite`'s `.`) export's `import`/`default` condition — the ones
  Node's ESM loader itself resolves — points at raw `.ts` source. `types` is
  deliberately exempt (see above); a `.d.ts` declaration file is fine on
  either condition. A future adapter that copies the old fully-`.ts`-pointing
  shape, or that regresses `import` back onto source, fails loudly here
  instead of silently depending on a new-enough Node.

  - @barefootjs/shared@0.31.0

## 0.30.6

### Patch Changes

- 307729e: Re-point render-divergence citations from the now-closed #2460 to its open per-adapter trackers (#2524/#2525)

  No behavior change — this only updates `renderDivergences` reason strings
  (published to `ui/compat.lock.json` and the docs compatibility matrix). The
  shared-layer defect these entries originally cited (#2460, an aliased
  destructured prop `{ n: count }` losing its rename) is now FIXED
  (b4f5075) for the shared compiler layer and the Hono reference adapter.
  The `aliased-destructured-prop` / `composite-row-child-aliased-prop`
  divergences remain live per-adapter:

  - The 7 template-string adapters (`blade`, `erb`, `jinja`, `mojolicious`,
    `rust`/minijinja, `twig`, `xslate`) still silently drop the rename in
    their emitted templates — tracked by #2524.
  - `go-template`'s generated Go fails `go run` outright (unknown Input
    struct field) — tracked by #2525.

  Each entry's docstring is rewritten to stop claiming Hono still emits the
  broken form (it doesn't) and to point at the correct open tracker.

  - @barefootjs/shared@0.30.6

## 0.30.5

### Patch Changes

- 2654bf9: Fix a dynamic-key element access on a loop row (`tone[k]`, #2491) that rendered empty on ERB/Go/Twig and threw a fatal `Not an ARRAY reference` on Mojolicious. All four adapters previously made a compile-time GUESS about whether the index was a string key or a numeric index — a guess the shared analyzer can't resolve for a destructured `.map()` param, since it types the binding `{kind:'unknown'}` — and each guess failed for a different reason (exact-case map lookup, symbol-vs-string key mismatch, wrong deref form). The fix routes every dynamic index access through a runtime-polymorphic accessor instead, mirroring the passing engines (Jinja/minijinja `[]`, Blade's `data_get()`, Xslate's native `[]`): Go's `indexAccess` now emits `bf_get`, and `getFieldValue` gained a slice/array/string branch so it's a strict superset of the `index` builtin; Twig's `indexAccess` emits the built-in `attribute()` function instead of `[]` (which is not polymorphic against a `stdClass` receiver, unlike `.`); ERB and Mojolicious each gained a new `get(collection, key)` runtime helper (`bf.get` / `bf->get`) that dispatches on the receiver's runtime type. The existing numeric-index case (`selected()[index]`, data-table) keeps working unchanged on every adapter.
  - @barefootjs/shared@0.30.5

## 0.30.4

### Patch Changes

- 0e22502: Fix a `.map()` callback param that shares a boolean-typed or nullable-optional prop's name being misclassified in attribute position: the row's string value was routed through the boolean/nullable-optional lowering (rendering "true"/"false", or gaining a spurious null guard) instead of the row's own value. The five Twig-family adapters (twig, jinja, blade, xslate, rust/minijinja) gain a position-accurate, ref-counted `loopBoundNames` map — ported from the ERB/Mojolicious adapters, which already had the map but were missing the guard at these two call sites. All seven adapters now check loop-bound position before routing through the boolean/nullable-optional lowering (#2488).
  - @barefootjs/shared@0.30.4

## 0.30.2

### Patch Changes

- eeab76b: Ship the full test suite in the Perl CPAN tarballs.

  Only MANIFEST-listed files are packaged, and `make test` runs `t/*.t` off the
  working tree — so a test missing from MANIFEST passes in CI forever while never
  once running for a CPAN tester. Seven had accumulated in the `BarefootJS` dist
  (`eval_vectors`, `evaluator`, `omit`, `props_attr`, `query`, `render_child`,
  `scope_comment`) and one in `Mojolicious-Plugin-BarefootJS` (`scope_comment`).
  All eight are now listed.

  Each was checked against what a CPAN tester actually has: every dependency is
  either core or already declared in the dist's `cpanfile`, and no test reads a
  monorepo path at runtime. `t/eval_vectors.t` reads golden vectors from
  `packages/adapter-tests/`, which is monorepo-only, but guards them with
  `plan skip_all` exactly as the already-shipped `t/helper_vectors.t` does.
  `Mojolicious-Plugin-BarefootJS`'s `t/scope_comment.t` carries a
  `use lib "$Bin/../../adapter-perl/lib"` for monorepo runs; a missing directory
  is a no-op for `lib.pm`, and `requires 'BarefootJS'` resolves the module from
  `@INC` instead.

  Two CI checks in `ci-perl-dist.yml` keep this true. One fails if any `t/*.t` is
  absent from its dist's MANIFEST. The other extracts each built tarball outside
  the checkout and runs its suite there — the working-tree run has the whole
  monorepo on disk, so a shipped test that reaches outside its own dist passes
  there and only fails for a real user.

  - @barefootjs/shared@0.30.2

## 0.30.1

### Patch Changes

- ea054b9: Declare the render divergences found by probing the #2482 loop-scope audit's unguarded name-resolution sites: the Twig-family boolean-prop misroute for loop params (#2488) and the `emitSpread` local-const shadow (#2489); ERB's symbol-vs-string dynamic row-key lookup (#2491); and Go's condition-position destructured bindings (#2486), nested-loop `inLoop` clobber (#2487), row-spread attribute-name mangling (#2490), dynamic row-key lookup (#2491), and JS-computed initializer seeding (#2492). Each entry carries its issue URL and graduates when the fix lands.
- 43eb782: Fix `BarefootJS::Date` dropping out of the CPAN index.

  `BarefootJS-0.30.0` was the first release to ship META `provides` (built by
  `Module::Metadata` in `Makefile.PL`). A dist with `provides` makes PAUSE index
  from META instead of scanning the `.pm` files, and the two disagree about
  inline packages: the file scanner hands every package in a file that file's
  `$VERSION`, while `Module::Metadata` reports each package's _own_ `$VERSION`.
  `BarefootJS::Date`, declared inline in `lib/BarefootJS.pm`, has none — so it
  reached PAUSE with a version of `undef`, which compares as _lower_ than the
  `0.029000` indexed from 0.29.0 and was rejected with "Decreasing version
  number". It would have stayed pinned at 0.29.0 through every future release.

  `BarefootJS::Date` now carries its own literal `$VERSION`, and
  `scripts/sync-perl-versions.ts` bumps every `our $VERSION` line in a module
  rather than only the first, so a file holding more than one package stays in
  lockstep. That rewrite now also runs unconditionally: it used to sit behind a
  skip that reads only the primary module's _first_ `$VERSION`, which would have
  let a drifted line hide behind an in-sync one indefinitely. The skip now gates
  only the once-per-release bookkeeping (the `Changes` entry and the `cpanfile`
  pin). A `t/meta_provides.t` in each of the three Perl dists asserts that every
  package in META `provides` declares a version and that they all match.

  - @barefootjs/shared@0.30.1

## 0.30.0

### Patch Changes

- d95eb19: Fix scope id derivation for a child component nested inside a dynamic loop row

  A component nested below a loop row root (e.g. `<li><Badge/></li>` inside
  `{rows().map(row => <li>…</li>)}`) now derives its `bf-s` scope id from
  `<parentScope>_<slot>`, matching the Hono reference, instead of getting a
  freshly randomized `Name_<id>` on every other adapter and on CSR. A row-root
  component (`{rows().map(row => <Row/>)}`) is unaffected — it keeps its own
  randomized id.

  The fix is IR-driven: a new `IRComponent.loopItemRoot` flag (set once, in the
  loop-IR builder, only on a DIRECT loop-body member) backs a single shared
  predicate, `derivesScopeFromSlot()`, that every backend now consults instead
  of a mutable "am I inside a loop" flag that couldn't distinguish a row root
  from a component nested below it. Hono's own `renderComponent` branch
  selector is refactored onto the same IR flag, so the policy is expressed once
  rather than approximated per adapter.

  On the client runtime, `createComponent`/`materializeComponent` now derives a
  slotted component's own scope id from its mount slot. (A companion fix in
  `renderChild` — pushing that derived scope while its template evaluates, so a
  THIRD composition level derives its own scope instead of collapsing onto the
  second — was tried but reverted: it collided with `comment: true` wrapper
  transparency, e.g. a `renderNode`-style callback prop, whenever the wrapped
  component's own first slot id coincides with the wrapper's slot number.
  `grandchild-composition` stays a known limitation.)

  Since a slotted child was previously unreachable by the primary
  `(bf-h, bf-m)` SSR-scope lookup on every non-Hono adapter, this also fixes a
  latent SSR-hydration bug: such a child was silently never initialized on the
  client.

  Graduates the `composite-row-child-component` conformance fixture (still
  skipped on Go — that adapter's divergence is a different failure, tracked in
  #2445) and the `composite-row-child-component` CSR conformance skip.

  Fixes https://github.com/piconic-ai/barefootjs/issues/2444.

- 07aecae: Declare render divergences for three new correct-output conformance fixtures (#2460, #2464, #2465)

  No behavior change — this adds `renderDivergences` entries (published to
  `ui/compat.lock.json` and the docs compatibility matrix) for gaps found in the
  onboarding TSX-fidelity exploration (PR #2461), all of which live in the shared
  compiler layer and affect every adapter including the Hono reference:

  - `aliased-destructured-prop` (#2460): an aliased destructured prop
    (`{ n: count }`) loses its rename — template vars, `ssrDefaults`, and the
    props bridge key off the local name (on Go, the caller-side Input struct
    literal fails `go run` outright with `unknown field N`).
  - `select-value-ssr` (#2464): controlled `<select>` SSRs an invalid `value`
    attribute instead of `selected` on the matching option.
  - `textarea-value-ssr` (#2465): controlled `<textarea>` SSRs a `value`
    attribute instead of element content.

  Each entry documents its graduation path: fix the shared emission, regenerate
  the fixture's `expectedHtml` from the fixed reference, delete the entry.

- 0dfec18: Fix CPANTS Kwalitee issues flagged on the published CPAN dists (cpants.cpanauthors.org):

  - `no_pod_errors` — `BarefootJS::DevReload`'s POD used an em dash before
    declaring `=encoding utf8`, which `Test::Pod`/CPANTS parse as a raw
    non-ASCII byte in POD. Added the missing `=encoding utf8`.
  - `consistent_version` — `BarefootJS::Evaluator` and `BarefootJS::SearchParams`
    were stuck at `0.14.0` because `scripts/sync-perl-versions.ts` only listed
    `BarefootJS.pm` and `DevReload.pm` for the `packages/adapter-perl` dist, so
    releases never bumped their `$VERSION`. Both are now synced with the rest of
    the distribution, and the script tracks them going forward.
  - `meta_yml_has_provides` — plain `ExtUtils::MakeMaker` (unlike Module::Build
    or Dist::Zilla) does not auto-populate META's `provides`. Each `Makefile.PL`
    now builds it via `Module::Metadata->provides`.
  - `has_security_doc` / `security_doc_contains_contact` / `has_contributing_doc`
    — the repository's root `SECURITY.md`/`CONTRIBUTING.md` were never part of
    the packaged CPAN tarballs (only files listed in each dist's `MANIFEST` are
    shipped). Copied both into each Perl dist directory, same as the existing
    `LICENSE` copies, and added them to `MANIFEST`.

- 8569610: Lower a `.map()` callback preamble's value declarations to per-row template locals (#2447)

  A block-body `.map()` whose preamble computes a value used in the row —

  ```tsx
  {
    rows().map((row) => {
      const cls = row.done ? "done" : "open";
      return (
        <li key={row.id} class={cls}>
          {row.label}
        </li>
      );
    });
  }
  ```

  — carried that preamble only as JS text, which a template language cannot
  execute. Every DSL adapter emitted the row anyway, reading a name it never
  assigned: ERB read `v[:cls]` (an unseeded vars-Hash key), Go read `$.Cls` (a
  parent-struct field, the same hoisted-to-parent defect class as #2445), and
  Blade / Twig / Jinja / minijinja / Kolon / Mojo each read a bare undefined
  local. All eight rendered `class=""`, with no diagnostic. Hono and CSR were
  correct throughout, so the divergence only showed up against a real DSL
  runtime.

  Fixed by giving the preamble a second, backend-neutral carrier:
  `MapCallbackPreamble.declarations`, one `{ name, valueParsed }` per
  declaration. Each adapter emits it as a per-row local in its own syntax
  (`{% set %}`, `@php()`, `<%- … -%>`, `: my $x = …;`, `{{$x := …}}`) through the
  same `ParsedExpr` door it already uses for the loop array, the filter
  predicate, and the sort comparator — no new expression path, and no
  per-adapter interpretation of the JS text. Declarations render in source
  order, so a later initializer sees an earlier local; on a
  `.filter(p).map(cb)` chain they render inside the filter guard, matching JS
  evaluation order. The declared names are registered as loop-bound, so a
  same-named module const can't inline over the local the loop just declared.

  Lowering is all-or-nothing. A preamble is an order-dependent statement
  sequence, so carrying its declarable prefix and dropping the rest would put
  the missing statement's effect nowhere — the same silent divergence in a new
  disguise. One statement that is not a value declaration (an assignment, an
  imperative loop, a destructuring binding, an initializer outside the
  expression subset) therefore refuses on a DSL target with `BF021` and the
  `/* @client */` escape, alongside the existing filter / sort / array-builder /
  flatMap gates. A JS runtime keeps running any preamble verbatim.

  Two behaviour changes fall out of this:

  - **`map-preamble-branch-body` now renders on every adapter.** Its `BF021`
    pins are removed from all eight DSL adapters. They existed on the premise
    that a loop-local cannot be carried into a conditional branch template; that
    stopped being true once a value preamble lowers, because the if/else fold
    puts the conditional _inside_ the loop body, where the local is in scope in
    both arms. The refusal now keys off whether the preamble is declarable, not
    whether the body branches.
  - **A non-declarable preamble that used to compile is now a build error on DSL
    targets.** It previously produced a template that read unassigned names, so
    the change is from silently-wrong output to a diagnostic with a documented
    escape.

  The `loop-preamble-attr-value` fixture's render divergences are graduated
  (deleted from all eight `render-divergences.ts` files). Both fixtures now pass
  on all nine adapters and CSR conformance.

  Unchanged and tracked separately: an attribute whose value comes from a
  preamble local is still not classified as reactive on the client, so it is
  interpolated into the row template and not rewritten on a same-key item
  update. That is a client-side classification question, pinned as the current
  contract in `packages/client/__tests__/runtime/lazy-row-preamble.test.ts`.

  - @barefootjs/shared@0.30.0

## 0.29.0

### Patch Changes

- f96d0af: Declare the composite-loop-row nested-child render divergence

  A new conformance fixture (`composite-row-child-component`) covers a shape the
  corpus had no coverage for: a signal-driven `.map()` whose row root is a plain
  element and whose subtree contains a child component. Every one of these
  adapters diverges from the Hono reference on it, so each declares the
  divergence in its exported `renderDivergences`.

  No adapter behaviour changes — the divergences pre-date the fixture, which is
  why they had gone unrecorded. What changes is the published declaration, and
  with it the compatibility-matrix page, which now reports the gap instead of
  implying parity.

  Seven of the eight (blade, erb, jinja, mojolicious, rust, twig, xslate) share
  one cause: the nested child renders through the runtime's `render_child`, which
  mints its own `Badge_<random>` scope id instead of deriving the parent-scope +
  mount-slot id (`<parent>_s0`) Hono emits. Content is correct; only `bf-s`
  diverges. Tracked in
  https://github.com/piconic-ai/barefootjs/issues/2444.

  Go is a different, worse failure: one hoisted child-props field is built on the
  parent outside the loop with no per-row data and passed for every row, so every
  row renders the child with zero-value props. Tracked in
  https://github.com/piconic-ai/barefootjs/issues/2445.

  - @barefootjs/shared@0.29.0

## 0.28.1

### Patch Changes

- @barefootjs/shared@0.28.1

## 0.28.0

### Patch Changes

- @barefootjs/shared@0.28.0

## 0.27.0

### Patch Changes

- @barefootjs/shared@0.27.0

## 0.26.4

### Patch Changes

- @barefootjs/shared@0.26.4

## 0.26.3

### Patch Changes

- 87d5508: Adapter-gate the Phase-1 `BF021` refusal for off-subset `filter` predicates and `sort` comparators (callback-body fidelity, Stage 1 of `spec/callback-fidelity.md`).

  An off-catalogue `filter` predicate or `sort` comparator (`typeof`, a function call, a nested higher-order method, …) previously raised `BF021` in Phase 1 — before any adapter was consulted — rejecting the code for every target, including JS runtimes whose template engine could run the callback verbatim. The refusal is now adapter-conditional via a new `acceptsCallbackBody` capability on `TemplateAdapter`:

  - JS-runtime adapters (`JsxAdapter` — Hono, CSR) accept any `filter`/`sort` callback body and run it as written.
  - DSL adapters keep the `BF021` refusal and the explicit `/* @client */` escape to defer the shape to client-only rendering.

  SSR/CSR parity is unchanged: per-backend fidelity means per-backend SSR coverage, with the browser as the common fully-faithful floor. Each DSL adapter declares the expected diagnostic for the new `filter-typeof-predicate` conformance fixture via its `conformancePins`.

- 30a5cfb: Fold `.map()` bodies with a leading `const`/`let` preamble, adapter-gated (callback-body fidelity, Stage 2 of `spec/callback-fidelity.md`).

  A `.map()` callback body with a leading `const` before an if/else-if chain or `switch` (`{ const label = fmt(it); if (it.on) return <b/>; return <span/> }`) now folds into a nested `IRConditional` with the declarations emitted once per iteration, so the local is in scope in every branch. Because a DSL backend can't carry a loop-local into a conditional branch template, the fold is adapter-gated like the off-subset filter/sort predicates: a JS-runtime adapter (Hono, CSR) folds and runs it, while a DSL adapter refuses with `BF021` + the `/* @client */` escape rather than rendering the local `undefined` (a silent divergence). Covered by the `map-preamble-branch-body` conformance fixture (JS-runtime faithful, pinned BF021 on every DSL adapter) and the `map-multi-return-body` compiler-unit test (fold / refuse / `@client`-escape). A branch-local `const` (inside a branch block or case) and statement-level imperative nested loops remain unfolded — the latter is Stage 3's verbatim-JS territory.

- 06dc399: Close the latent `.fill()` gap and correct stale `reduce` documentation (callback-body fidelity, Stage 1 of `spec/callback-fidelity.md`).

  `Array.prototype.fill(value)` had no template lowering on any DSL adapter but was reported "supported" by `isSupported`, so the DSL adapters emitted a raw `.fill(...)` method call with no build diagnostic — a silent footgun that only surfaced as a crash at template-render time. `fill` is now in the `UNSUPPORTED_METHODS` gate, so a DSL build fails loudly with BF101 and points at the `/* @client */` escape; a JS-runtime adapter (Hono, CSR) still runs it verbatim, since those skip `isSupported`. Covered by the `fill-unsupported` conformance fixture (JS-runtime faithful / DSL-diagnostic, pinned BF101 on every DSL adapter).

  Also corrects two stale comments in `expression-parser.ts` (the claim that `find`/`some`/`every`/… are "intercepted as `higher-order` IR", and that `reduce` folds into a structured `ReduceOp` before the gate — neither is true; both flow through the runtime evaluator as a generic `call`) and removes the dead, never-referenced `ReduceMethod` type from `parsed-expr-emitter.ts`.

- dd098fa: Render arbitrary array-builder `.map()` bodies verbatim on JS-runtime adapters (callback-body fidelity, Stage 3 / D4 + D5 of `spec/callback-fidelity.md`).

  A `.map()` callback that constructs JSX in a statement before its `return` — the imperative array-builder `{ const out = []; for (const c of r.cells) out.push(<td>{c}</td>); return <tr key={r.id}>{out}</tr> }` — previously refused on every backend (it would otherwise leak raw JSX into the plain-JS bundle). On a JS-runtime adapter it now renders verbatim: each JSX leaf lowers to a template-literal HTML string (reusing the flatMap-callback fragment mechanism), the imperative control flow runs as-is, and the `{out}` element-array child is joined into the row so SSR, hydration, and CSR all render identical markup. The loop key is hoisted (D5): it is derived from the raw item and evaluated before the body runs, so a key that reads a preamble-computed local is refused rather than compiled to an unbound `keyFn`. A leaf that carries an event handler, a component, a nested loop, a reactive expression, or a spread is refused loudly (no silent divergence). A DSL adapter refuses the whole shape with `BF021` + the `/* @client */` escape (which renders the loop client-only, where the browser runs the same verbatim body). Covered by the `map-array-builder-body` conformance fixture (JS-runtime faithful, pinned BF021 on every DSL adapter) and the rewritten `map-arbitrary-body` compiler-unit test (verbatim lowering, `{out}` join, keyFn hoist, key-derivability and leaf-scope refusals). Also fixes a latent bug where `TestAdapter.renderLoop` dropped the `.map()` preamble entirely.

- 5b65cf2: Lock the per-backend fidelity split for off-subset `.find()` / `.some()` / `.every()` predicates (callback-body fidelity, Stage 1 of `spec/callback-fidelity.md`).

  These search/predicate methods already render verbatim on JS-runtime adapters (Hono, CSR) and refuse with BF101 + the `/* @client */` escape on DSL adapters — the split existed but had no conformance coverage. Adds `find-typeof-predicate`, `some-typeof-predicate`, and `every-typeof-predicate` fixtures (a `typeof` guard the evaluator can't lower) and pins each BF101 on all eight DSL adapters, so a regression that either silently mis-lowered them on a DSL backend or refused them on a JS runtime is caught.

- a855122: Lock the per-backend fidelity split for off-subset `.reduce()` / `.reduceRight()` reducers and `.flatMap()` projections (callback-body fidelity, Stage 1 of `spec/callback-fidelity.md`).

  These fold/projection methods already run verbatim on JS-runtime adapters (Hono, CSR) and refuse with BF101 + the `/* @client */` escape on DSL adapters — the split existed but had no conformance coverage. Adds `reduce-typeof-body`, `reduce-right-typeof-body`, and `flatmap-typeof-projection` fixtures (a `typeof` guard the evaluator can't lower) and pins each BF101 on all eight DSL adapters, so a regression that either silently mis-lowered them on a DSL backend or refused them on a JS runtime is caught. Completes Stage 1's callback-method coverage.

  - @barefootjs/shared@0.26.3

## 0.26.2

### Patch Changes

- @barefootjs/shared@0.26.2

## 0.26.1

### Patch Changes

- @barefootjs/shared@0.26.1

## 0.26.0

### Minor Changes

- cc54226: Dynamic `dangerouslySetInnerHTML={{ __html: expr }}` now lowers on every template adapter (#2319, successor to #2215). A prop-/signal-derived `__html` value is serialized by the adapter and emitted through that language's runtime raw-output sink — Blade `{!! !!}`, ERB unescaped `<%= %>`, Go `template.HTML` via the new `bf_raw_html` helper, Jinja/MiniJinja `| safe`, Twig `| raw`, Mojolicious `<%== %>`, Xslate `mark_raw` — instead of refusing with BF101. The value is evaluated at request time and never spliced into template source, so no template-metacharacter guard applies, matching React's "dangerously = the caller owns the value's safety" contract and the existing Hono/CSR behavior. The compile-time string-literal case (#2207) is unchanged; a value that is not a `{ __html: … }` object literal still refuses with BF101.

### Patch Changes

- @barefootjs/shared@0.26.0

## 0.25.0

### Patch Changes

- @barefootjs/shared@0.25.0

## 0.24.1

### Patch Changes

- @barefootjs/shared@0.24.1

## 0.24.0

### Patch Changes

- @barefootjs/shared@0.24.0

## 0.23.0

### Patch Changes

- @barefootjs/shared@0.23.0

## 0.22.0

### Patch Changes

- 0034de7: Repoint conformance-pin tracking URLs at open successor issues (#2319, #2320, #2321) — the previous trackers (#2215, #2038, #2087) are closed. Metadata only: no diagnostic codes, severities, or refusal behavior change.
  - @barefootjs/shared@0.22.0

## 0.21.4

### Patch Changes

- @barefootjs/shared@0.21.4

## 0.21.3

### Patch Changes

- @barefootjs/shared@0.21.3

## 0.21.2

### Patch Changes

- @barefootjs/shared@0.21.2

## 0.21.1

### Patch Changes

- f89ddfb: Fix #2305: the Xslate and Mojolicious CPAN dists declared `requires
'BarefootJS'` without a version floor (Xslate) or with a stale one
  (Mojolicious, 0.15.0), so CPAN testers with an older BarefootJS runtime
  failed at render time with `Can't locate object method "scope_comment_end"`
  (added in 0.21.0). Both cpanfiles now require BarefootJS 0.21.0, and
  `scripts/sync-perl-versions.ts` bumps the floor to the dist's own version on
  every release — the Perl dists ship from one fixed changeset group, so the
  same-version floor always exists on CPAN and the declaration can never fall
  behind the runtime methods that generated templates call.
  - @barefootjs/shared@0.21.1

## 0.21.0

### Patch Changes

- 1b782c2: Extend #2274 (Date as the first catalogued rich type) into the oracle
  conformance harness: a `Date`-typed prop can now be a data-point value,
  rendered through every backend and compared live against the JS reference.

  - The adapter test-render prop-bakers transport a `Date` prop as its
    ISO-8601 string, which each backend's shipped `date` runtime helper
    parses — source-literal emitters (Go, Python/Jinja, Perl/Xslate+Mojo)
    gain an explicit `Date` branch; the JSON-payload serializers (Rust's
    `encodeSpecials`, and Ruby/PHP which stringify props directly) carry the
    ISO string through `Date.prototype.toJSON`.
  - `assertJsonDomain` admits the catalogued `Date` type (a real instance, or
    the `{ $date: ISO }` envelope the generated catalogue uses so a `Date`
    survives the committed JSON artifact); the data-point runner materializes
    the envelope back into a `Date` before both render legs, and the
    type-derived adversarial catalogue synthesizes the epoch / pre-1970 /
    leap-day / four-digit-year grid for any `Date`-typed prop.
  - New `date-catalogued` fixture with data points covering `toISOString()`
    and `getUTCFullYear()`.

- ea50cdc: Fix #2289: a fragment-rooted child component (`'use client'` component returning `<>…</>`) now hydrates with its parent's live props — callbacks and reactive getters included — instead of silently losing every function-valued prop.

  - `@barefootjs/client`: `$c` / `findSsrScopeBySlotIn` gain a comment-scope fallback (`findCommentChildScope`) that resolves a child declared by a `<!--bf-scope:<parentId>_<slotId>|h=…|m=…-->` marker, registers its proxy element, and hands it to `initChild` — so the child's init runs with the parent's real prop object rather than never running at all (the props JSON in the marker only ever carried the JSON-safe subset). `getCommentScopeBoundary` now honours a paired `<!--bf-/scope:<scopeId>-->` end marker so a fragment scope's queries stop at its real last root instead of leaking onto later parent-owned siblings (the reported misattached-aria symptom); HTML without the end marker falls back to the old heuristic.
  - `@barefootjs/shared`: new `BF_SCOPE_COMMENT_END_PREFIX` constant.
  - `@barefootjs/hono`, `@barefootjs/go-template`, `@barefootjs/erb`, `@barefootjs/jinja`, `@barefootjs/twig`, `@barefootjs/xslate`, `@barefootjs/mojolicious`, `@barefootjs/blade`, `@barefootjs/rust`, `@barefootjs/php`, `@barefootjs/perl`: fragment-rooted templates emit the paired `bf-/scope` end marker after the fragment's last root.
  - `@barefootjs/router`: region diffing normalizes the new end marker's volatile scope id.

- Updated dependencies [ea50cdc]
  - @barefootjs/shared@0.21.0

## 0.20.0

### Patch Changes

- 35945c6: Fix #2273: refuse a method call on a prop typed as a built-in host rich type (`Date`, `Map`, `Set`, `URL`, …) with no catalogued lowering, instead of silently transliterating it into template syntax that dies at request time.

  `Date` props (and the other host rich types) previously lowered as an opaque passthrough: `createdAt.toISOString()` compiled cleanly and rendered correctly on Hono/CSR, but on the SSR text-template adapters transliterated verbatim into the target syntax (a Go template method-value panic, a Jinja `AttributeError`, …) — a failure only visible once someone actually rendered the page. `checkRichTypeMethodCalls` (`packages/jsx/src/rich-type-refusal.ts`) closes that gap at compile time: it walks every expression position the compiler already lowers into a template and refuses with BF021 as soon as a call's receiver is provably a host rich type (`Date`, `Map`, `Set`, `WeakMap`, `WeakSet`, `URL`, `URLSearchParams`, `RegExp`, `Promise`, `Error`, `Symbol`, `BigInt`, `Function`) with no catalogued lowering. Verified against the full 2500+-unit `packages/jsx` suite and the `ui/components` corpus with zero false positives — the refusal only fires when `rich-type-evidence.ts`'s type resolution can _prove_ the receiver's type from `propsType`/`typeDefinitions`; any receiver it can't prove a type for (signal getter results, untyped/generic receivers, computed access, …) is silently allowed through, matching the existing BF021 filter/sort-comparator refusal's conservative-by-construction design.

  Two exemptions keep the escape hatches intact:

  - `/* @client */` opts the expression out of SSR lowering, same as every other BF021 shape.
  - A call a registered lowering plugin claims (`lowering-registry.ts`, #2057) is exempt — cataloguing an individual rich-type API (e.g. `Date.prototype.toISOString`) is a plugin's job, not a change to this refusal. That catalogue is tracked separately as #2274.

  All nine adapters' `conformance-pins.ts` now pin the new `date-method-uncatalogued` fixture to `{ code: 'BF021', severity: 'error' }` — including Hono, since the refusal runs ahead of `adapter.generate()` and applies even to adapters whose own runtime could otherwise evaluate the call.

- 39a82a9: Fix #2272: graduate the remaining catalogue pins on Blade, Twig, Xslate, and Mojolicious.

  - **#2260** (controlled/derived boolean SSR seeds) — Blade and Twig (PHP) and Xslate and Mojolicious (Perl, via the shared `BarefootJS.pm` runtime) already picked up the shared-layer `freeIdentifiers()` fix from the original #2260 landing; their `toggle`/`switch`/`checkbox` `skipDataPoints` pins were simply never removed. Verified against real conformance runs — no code changes needed for this part.
  - **#2261** (dynamic style value sanitization) — Xslate's `style-object-dynamic` pin was likewise a leftover: the adapter and shared Perl runtime were already fixed when #2261 landed across all 8 adapters, but this one pin was missed.
  - **#2262** (`.flat(dynamicDepth)` stringification) — Mojolicious's `.join()` lowering called Perl's native `join()` builtin directly on the dereferenced array, bypassing the shared runtime's `join` method entirely; a nested-array element (e.g. `.flat(0)`'s shallow copy) stringified to its Perl memory address (`ARRAY(0x...)`) instead of JS's recursive comma-join. Now routes through `bf->join(...)`, matching Xslate's existing `$bf.join(...)` routing. The shared Perl runtime's own `string()`/`join()` methods also gained the same recursive-array-stringification fix Go/ERB already had (`.flat`'s shallow copy stringified via `Array.prototype.toString`'s `join(',')` semantics, applied recursively), since neither previously handled a nested ARRAY-ref element at all.

  Removes every remaining `toggle:gen:pressed:true` / `switch:gen:checked:true` / `checkbox:gen:checked:true` / `style-object-dynamic:gen:color:markup` / `array-flat-dynamic-depth:gen:depth:zero` / `array-flat-dynamic-depth:gen:depth:negative` pin across the four adapters — all four `skipDataPoints` sets are now empty.

  - @barefootjs/shared@0.20.0

## 0.19.1

### Patch Changes

- 3eebfb5: Fix #2266: `Slot`'s `asChild` pattern with a plain-text child (`<Button asChild>Submit</Button>`) no longer hard-errors on Go or diverges on Mojolicious.

  Both adapters previously lowered the framework's `isValidElement(x)` predicate as bare truthiness on `x`. A passed-through JSX child is represented as pre-rendered markup on both SSR models, so a non-empty plain-text child was truthy and wrongly took `Slot`'s element-merge branch (`children.tag`/`children.props`) — Go hard-erred dereferencing `.Props` on a string (`can't evaluate field Props in type interface {}`); Mojolicious had no `isValidElement` primitive mapping at all and died on an undeclared `$isValidElement` stash lookup under `use strict`.

  - Go: new `bf_is_element` runtime helper (`IsValidElement`, `bf.go`) does a real reflect-based shape check (a map/struct carrying both `tag`+`props`, case-insensitively) — mirrors JS's `'tag' in x && 'props' in x`. `isValidElement(x)`'s lowering now calls it instead of a bare truthiness check.
  - Mojolicious: new `is_element` method on the shared `adapter-perl` runtime (`BarefootJS.pm`, also used by Xslate), and a new `isValidElement` → `bf->is_element(...)` entry in `MOJO_TEMPLATE_PRIMITIVES`.

  ERB/Jinja/Rust/Twig/Blade/Xslate already passed this fixture's data points and are unaffected.

  Removes the `button:gen:asChild:true` / `kbd:gen:asChild:true` `skipDataPoints` pins on Go and Mojolicious.

- 1c2b116: Fix #2255: `.length` on a string now counts UTF-16 code units, matching JS `String.prototype.length`, on all 8 template adapters — previously each backend counted either bytes (Go's native `len`) or Unicode codepoints (every other backend's native string-length primitive), both of which diverge from JS for an astral-plane character (a surrogate pair in UTF-16, e.g. '👍' — length 2 in JS, 1 under codepoint-counting).

  - Go: new `Length`/`bf_length` runtime helper (`bf.go`), used by the `.length` member lowering's generic (non-array, non-loop-slice) fallback. The array-only specialized `.length` shapes (filter-result count, memo-backed loop slice count) are unaffected and stay on native `len`.
  - ERB: the `.length` lowering now routes through the shared `bf.length` runtime helper (previously called Ruby's native `.length` directly) so both call sites share one UTF-16-aware implementation.
  - Jinja/Rust/Twig/Blade/Xslate/Mojolicious: fixed in place in each backend's shared `bf.length` runtime function (already the uniform `.length` dispatch point on 5 of the 6); Mojolicious additionally had a second `.length` lowering (a string-receiver fast path emitting Perl's native `length()` directly) now routed through the shared `bf->length` helper too.

  All fixes implement the same UTF-16 code-unit count: iterate codepoints, count 1 for a Basic-Multilingual-Plane codepoint and 2 for an astral one (U+10000-U+10FFFF).

  Out of scope: the separate `ParsedExpr` Evaluator subsystem (used for `.sort()`/`.filter()`/`.reduce()` callback bodies) has its own `.length` implementation with a documented, deliberate astral-plane divergence (`spec/compiler.md`, "byte-isomorphic between backends" contract) — unrelated to and unaffected by this fix.

  Removes the `string-length-text:multibyte` (Go only) and `string-length-text:astral` (all 8 backends) `skipDataPoints` pins.

- cff038f: Fix #2261: dynamic `style={{ … }}` object-literal values that could break out of a CSS declaration now match Hono's oracle behavior — the unsafe `key:value` pair is dropped entirely — instead of being kept (merely HTML-escaped) as every non-Hono adapter previously did.

  Hono's own `hasUnsafeStyleValue` guard (`hono/jsx/utils.ts`) is a hand-rolled structural scan for characters that could escape a CSS declaration (unbalanced quotes/brackets, bare `;`/`{`/`}`, unterminated comments) — NOT real CSSOM property validation. It is the contract every adapter's SSR output must match byte-for-byte.

  Each adapter gains a single `style_object`/`bf_style_object`/`StyleObjectToCSS` runtime helper (ported byte-for-byte from Hono's scan) that builds the whole CSS string at once: unsafe pairs are omitted, safe values are still HTML-escaped afterward (a structurally "safe" value can still carry a literal `"`/`'`/`&`). `tryLowerStyleObject` in each adapter now emits a single call to this helper instead of per-pair string interpolation.

  - Go: `hasUnsafeStyleValue` + `StyleObjectToCSS` in `bf.go`, registered as `bf_style_object`.
  - ERB/Rust/Jinja/Twig/Blade/Xslate/Mojolicious: analogous `style_object` runtime methods (Rust and PHP and Perl runtimes are each shared across two adapters — minijinja, Twig+Blade, and Xslate+Mojolicious respectively).

  Removes the `style-object-dynamic:gen:color:markup` `skipDataPoints` pin from all eight adapters' conformance tests.

  - @barefootjs/shared@0.19.1

## 0.19.0

### Patch Changes

- 2246d40: Destructured optional props keep their TypeInfo and optional flag (#2259). `{ size }: { size?: number }` now resolves in `propsParams` exactly like the props-object style: primitive members carry their concrete type, every member carries `optional` derived from the type's `?` (or a destructure default), and generated export signatures render the `?` again. The client JS no longer synthesizes a zero default when extracting a defaultless optional prop — the binding stays `undefined` when absent, matching JS destructuring semantics and the SSR seed.

  The Go adapter additionally recognises the destructured `x ?? <literal>` signal seed (matched structurally on the signal's `ParsedExpr`), so the #2248/#2252 hoisted-fallback/nillable machinery now fires for destructured components instead of seeding the signal with a literal zero, and an optional no-default scalar consumed as a bare omittable attribute (`rows={rows}`) takes the same `interface{}` flip so the `{{if ne .X nil}}` omission guard keeps firing now that the field would otherwise resolve concrete.

  The dynamic-template adapters (ERB / Jinja / Mojolicious / Rust / Twig / Blade / Xslate) widen `collectNullableOptionalProps` to declared-optional primitives, keeping Hono-style attribute omission for optional props that previously arrived untyped — this also extends the omission guard to props-object-style optional primitives, matching the reference render.

  Known output change on Go: a destructured optional scalar consumed as a bare TEXT expression now renders its zero value when absent (the pre-existing props-object behavior) instead of empty — tracked as #2267.

- cbe4a79: Fix `test-render`'s prop materialization for explicit-null props: `typeof null === 'object'` fell through every emission branch, so a `user: null` prop never declared its template var and `Mojo::Template`'s strict mode aborted with "Global symbol requires explicit package name" before the `//` fallback could apply. Null props now declare `my $x = undef`, matching how absent optional params are seeded. Found by the data-point oracle conformance suite (`optional-chaining-prop:null-user`).
  - @barefootjs/shared@0.19.0

## 0.18.7

### Patch Changes

- 2243ad8: Fix #2221: every Twig-family adapter's `_resolveLiteralConst` (Mojolicious: `resolveLiteralConst`) is a flat name lookup against `ir.metadata.localConstants` with no notion of AST scope — it inlined an outer same-file const's literal value even at an occurrence that is actually an enclosing `.map()`/`.filter()` loop callback's own (shadowing) parameter of the same name, so every iteration rendered the same hard-coded literal instead of the per-item value. Twig, Jinja, Blade, Xslate, and Rust (minijinja) are guarded with the same coarse `collectLoopBoundNames` exclusion #2212 already established for `collectStringValueNames`: a name any loop binds anywhere in the component never inlines, falling back to the bare identifier — coarse (a genuinely non-shadowed same-named const elsewhere in the component also stops inlining) but safe.

  Mojolicious's own `resolveLiteralConst` / `resolveStaticRecordLiteral` were already immune — they consult a _live_, ref-counted `loopBoundNames` map that `renderLoop` populates/depopulates as it descends/ascends into each loop body (#1749), which is scope-precise rather than coarse, so no change was needed there. The actual gap found in that adapter was a sibling call site: `emitSpread`'s bare-identifier local-const resolution (`{...attrs}` forwarding a function-scope conditional-object const's hashref, #checkbox/icon) read `localConstants` directly with no loop-shadowing guard at all. Fixed with the same `loopBoundNames` guard as its neighboring call sites.

  Not fixed here (reported, tracked separately): a `key={name}` (or any bare-identifier JSX attribute value) shadowed by an enclosing loop param of the same name is folded to the OUTER const's literal at IR-generation time (`tryResolveIdentifierAsTemplateLiteral` → `findLocalConst` in `packages/jsx/src/jsx-to-ir.ts`), before any adapter runs — this affects every adapter, including Hono's native JSX re-emission, and needs a shared-compiler fix rather than a per-adapter guard. The Go template adapter has its own independent instance of this issue's bug class in `convertExpressionToGo`'s bare-identifier fast path (`packages/adapter-go-template/src/adapter/go-template-adapter.ts`), which lacks the loop-shadowing guards its sibling `resolveModuleStringConst`/`resolveModuleNumericConst` already have. The Twig-family's `_resolveStaticRecordLiteral` / `lookupStaticRecordLiteral` (module-scope object-literal consts, e.g. `variantClasses.ghost`) have the identical unguarded flat-lookup hazard when the object name itself is loop-bound (confirmed reproducible on Twig). None of these are fixed in this patch.

- 1cab45b: Fix #2209: the conformance test harness (`test-render.ts`, not any build/compile path) can now seed a signal initializer or prop default whose source is a compound expression over `props` — e.g. `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))` — instead of only recognizing a small fixed catalogue of regex-matched shapes (`props.x`, `props.x ?? default`, a bare literal).

  `@barefootjs/jsx` adds `evaluateSignalInit`/`tryEvaluateSignalInit` (`signal-init-eval.ts`), a test-harness-only sandboxed real-JS evaluator (`new Function`, with a blocked-globals allowlist and a JSON-shaped-value transport check) that replaces 7 near-duplicate regex-based evaluators previously copy-pasted across each template-string adapter's `test-render.ts`. Every prior recognized shape still works identically; the compound `.map()`/spread shape (and any future shape over `props` + literals) now resolves correctly instead of silently seeding `null`/unset.

  Go template additionally replicates, in its generated test-harness render program, the documented "the route handler populates a signal-backed loop-body child-component slice at request time" contract (`buildDynamicChildLoopSeeding`) — the constructor already seeded the loop's datum slice correctly; only the child-component Props slice the template ranges over had no harness-side population path.

  `todo-app` / `todo-app-ssr` graduate out of `render-divergences.ts` on all 8 adapters and now render byte-correct against the Hono reference.

- 752ee52: Fix #2208: a `.map()` loop source that is a fully-static array/object literal — either inline (`[{ label: 'Alpha' }, ...].map(...)`) or a function-scope local `const` with no prop/signal/function-call dependency in its initializer — no longer refuses with BF101 on any of the 8 non-Hono template adapters.

  `@barefootjs/jsx` adds `evaluateStaticLiteral`/`resolveStaticLoopSource` (`static-literal.ts`), a shared compile-time evaluator for a `ParsedExpr` that resolves to a fully compile-time-known JS value. The 7 template-string adapters (Jinja, minijinja/Rust, Twig, Blade, ERB, Mojolicious, Xslate) each serialize the resolved value into their own native array/object literal syntax and inline it directly in the loop header, the same way a module-scope const's value is already seeded. A runtime-computed local (`Object.entries(props.tags).filter(...)`, #2069) is unaffected and still refuses.

  Go template additionally bakes each item's child-component props and `data-key` directly into the generated `New<Name>Props` constructor when the loop body is a single child component with a plain-value prop set (`analyzeBakeableStaticChildLoop`), since Go's `{{range .ListItems}}` template already exists for that shape and only needed the constructor data. A plain-element loop body (no child component) is out of scope for this fix on Go — see the follow-up issue for that narrower gap.

  - @barefootjs/shared@0.18.7

## 0.18.6

### Patch Changes

- 4144cb2: Lower `dangerouslySetInnerHTML={{ __html: '...' }}` on the 8 non-Hono template adapters (blade, erb, go-template, jinja, minijinja, mojolicious, twig, xslate) when `__html` is a compile-time string literal — previously this refused with `BF101` on every template adapter (Hono/CSR already rendered it correctly). The literal is spliced directly into the adapter's own template source as trusted text, guarded per-adapter against that language's own template metacharacters (`{{`/`{%`/`{#` for Go/Jinja/minijinja/Twig, `<%` for ERB/Mojolicious, `{{`/`{!!`/`<?`/`@directive` for Blade, `<:` for Xslate) so a literal containing one of those sequences refuses loudly instead of being silently reinterpreted as a live template construct. A dynamic (non-literal — signal, prop, template literal with substitutions, local `const`) `__html` value still refuses with a purpose-built `BF101` on all 8 template adapters; Hono/CSR continue to support it. Recognition, static-literal extraction, and the per-adapter metachar guards all live in one shared module (`packages/jsx/src/adapters/dangerous-inner-html.ts`) so the injection-safety-relevant policy is defined in exactly one place. Dynamic-value support on template adapters is tracked separately: https://github.com/piconic-ai/barefootjs/issues/2215.
- 20a3d27: Resolve a bare-identifier callback passed to a value-position higher-order array method (`tags.map(format).join(' ')`, where `format` is a same-file `const`/`function` declaration rather than an inline arrow) to its declaration, one hop, reusing the same scope-resolution machinery #2090 established for `.sort(fnref)` comparators. Previously this refused with `BF101` on every non-Hono template adapter since there was no arrow body to serialize into the runtime evaluator. Generalizes to every method in the higher-order callback set (`map`, `filter`, `sort`, `toSorted`, `reduce`, `reduceRight`, `every`, `some`, `find`, `findIndex`, `findLast`, `findLastIndex`, `flatMap`), not just `.map`. Resolution respects lexical scoping — a bare identifier bound by an enclosing callback arrow's own parameter, or by an enclosing loop's item/index variable, is left unresolved rather than mis-resolved against a same-named module-scope const/function. Also fixes all 7 non-go-template adapters (Blade, Twig, Jinja, minijinja, ERB, Mojolicious, Xslate) whose text-position expression rendering wasn't threading the IR-carried pre-parsed expression tree through, silently discarding the resolution (and any other future `.parsed`-carried optimization) for that position.
- 3c42d3f: Fix the conformance test harness (`test-render.ts`, `conformance-pins.ts`, `render-divergences.ts`) to pass `siblingTemplatesRegistered: true` when rendering fixtures with sibling components, matching `bf build`'s real semantics. This was a test-only gap — no adapter runtime or codegen behavior changes — that spuriously refused `static-array-children`, `todo-app`, and `todo-app-ssr` with `BF103` in the conformance suite even though the shape works in real usage (#2205).
- 60a0919: Fix #2212: `a + b` where BOTH operands are bare identifiers (destructured string props, or same-file string `const`s) — not a string literal, template literal, zero-arg getter, or `props.x` member — now correctly lowers to Twig's `~`, Blade's `.`, Mojolicious's `.`, or Xslate's `~` concat operator instead of falling through to native numeric `+`, which fatals at PHP render time and silently coerces to `0` at Perl render time. Residual of #2163/#2176: `isStringTypedOperand` (`@barefootjs/jsx`) had no `identifier` arm, so a component's own destructured string props (`{ first, last }: { first: string; last: string }`) and same-file string consts were never recognized even though `isStringConcatBinary` already existed to route them correctly. Jinja/minijinja and ERB are unaffected — their native `+`/string interpolation already concatenates strings correctly without any static compile-time decision, so this issue's original "Twig, Blade only" scope is corrected to include Mojolicious and Xslate (Perl's `+`, like PHP's, is numeric-only).
  - @barefootjs/shared@0.18.6

## 0.18.5

### Patch Changes

- 7bd1762: Decode JSX character references in Phase 1 and escape static content on emit. JSX defines `&copy;` in literal text (and in quoted attribute values) as the character `©` — Babel, esbuild, and TypeScript's JSX emit all decode at parse time — but the compiler carried the RAW source text through the IR, so every template adapter re-emitted the undecoded entity (`html-entity-text` divergence) and none escaped HTML metacharacters in static attribute values (`static-attr-escape`: `title="Fish & Chips"` reached the output unescaped). Phase 1 now decodes via the new `decodeEntities` (`@barefootjs/shared`; numeric references fully, named references from a curated table — unknown names degrade consistently on every backend), so `IRText.value` and static attribute values carry the semantics. Emission escapes per context: the eight template adapters and the client-JS `innerHTML` template builders route static text and attribute values through the shared `escapeHtml` (`& < > "`), and the Hono adapter re-encodes for JSX source (adding `{`/`}`). Both fixtures graduate from all eight adapters' `renderDivergences` declarations and from the CSR conformance skip list.
- 69bfd35: Thread the `.map()` index param through the list-item event-delegation dispatcher. When a delegated handler closed over the callback's index (`items().map((item, i) => <button onClick={() => handle(i)} />)`), `bf build` lowered the per-item handler into a single delegated listener that re-derived the _item_ from `data-key`/DOM position but dropped the _index_ — so `i` was a dangling reference and the handler threw `ReferenceError: i is not defined` the first time it fired (item-property access like `item.id` worked because that was re-derived). The dispatcher now re-derives the index from the same runtime source the item comes from — `arr.findIndex(...)` for keyed lookups, the already-computed DOM position for the index-based lookups — and binds it under the user's param name. Output is unchanged for handlers that don't reference the index.
- 73927ab: Support a JSX element passed as a non-`children` prop (`<Card header={<strong>Title</strong>}>`, the slot / render-prop-lite pattern) on all 8 template adapters. Every adapter already had a mechanism to forward the reserved `children` slot from a parent template into a child render (a captured buffer slice, a `{% set %}` block, a Kolon macro, a Go struct field, ...); named JSX-valued props reuse that exact same mechanism, keyed by the prop's own name instead of `children`, rather than inventing a new shared capture path.

  - **Go**: bakes the value the same way real children are baked (`extractTextChildren` / `extractHtmlChildren`, falling back to `extractScopedHtmlChildren` when the root needs the parent's runtime scope id) and emits it as its own struct field.
  - **Jinja / Twig / Rust (minijinja)**: a `{% set captureName %}...{% endset %}` block per named slot, passed as a dict/hash entry.
  - **Text::Xslate**: a Kolon `macro NAME -> () { ... }` per named slot, called immediately in the hash literal.
  - **Blade**: a PHP output-buffering capture (`ob_start()` / `ob_get_clean()`), wrapped in `$bf->backend->mark_raw(...)` so the child's `{{ }}` doesn't re-escape it.
  - **Mojolicious / Text::Xslate (Perl)**: a `begin %>...<% end` capture (Mojo) / immediate macro call (Xslate) passed into `render_child`'s named-arg list. The shared `BarefootJS.pm` runtime's `render_child` now materializes _every_ prop value (previously only the reserved `children` key) — a no-op for any value that isn't a captured CODE ref, so this generalizes safely to both backends.
  - **ERB**: the same output-buffer-slice capture already used for `children`, but ERB's `<%=` (unlike every other adapter's template tag) has no built-in "safe string" wrapper it can bypass escaping on for a read-back, so the runtime gains one: a new `BarefootJS::SafeString` marker class, returned by `Backend::Erb#mark_raw` (previously an identity no-op) and recognized by `Context#h` to skip re-escaping already-finished HTML forwarded across a parent/child template boundary.

  `jsx-element-prop` graduates from a render divergence to a passing render on all 8 template adapters.

- e5814a3: Support `Math.min(a, b)` / `Math.max(a, b)` / `Math.abs(v)` over a signal on all 8 template adapters. `Math.floor`/`Math.ceil`/`Math.round` were already registered in each adapter's `templatePrimitives` map (the per-adapter "identifier-path callees rendered in template scope" registry — the shared parser already recognized all six `Math.*` methods uniformly), but `min`/`max`/`abs` were missing entries, so calling them over a signal silently rendered empty.

  Added `Math.min` (arity 2), `Math.max` (arity 2), and `Math.abs` (arity 1) to each adapter's `templatePrimitives` constants table, backed by a runtime helper per language: Go's new `Abs` (`bf.go`, alongside the existing `Min`/`Max`), the shared Perl runtime's `min`/`max`/`abs` (Mojolicious + Text::Xslate, `CORE::abs` to avoid an ambiguous-call warning against the package's own `abs` sub), Python's `min`/`max`/`abs` (native `min`/`max`/`abs`-shaped logic with explicit NaN guards), Ruby's `min`/`max`/`abs` (guarding `#nan?` calls the way `finite_number?` already does, since `number()` can return a plain Integer), the shared PHP runtime's `min`/`max`/`abs` (Twig + Blade), and Rust's `js_min`/`js_max`/`js_abs` (`num.rs`) wired into the minijinja adapter's method dispatch.

  Every `min`/`max` implementation propagates NaN explicitly rather than relying on native comparison operators or built-ins: JS `Math.min(NaN, 5)` is `NaN`, but a native `<`/`>` comparison against NaN is always false in IEEE-754 (silently picking the non-NaN operand), and Rust's `f64::min`/`f64::max` specifically follow IEEE-754 `minNum`/`maxNum` semantics (return the non-NaN operand when only one side is NaN) rather than JS's either-NaN-wins-NaN rule. Fixed a related, previously-uncaught bug this exposed in Go's **existing** `Min`/`Max` (predating this PR, only surfaced once these methods gained golden-vector coverage): they converted operands via `toFloat64`, which silently coerces an unrecognized type (e.g. a non-numeric string) to `0` instead of `NaN` — switched to `Number` plus explicit `math.IsNaN` guards.

  New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) cover order-independence, negative operands, and NaN propagation for `min`/`max`, plus negative/positive/zero/NaN for `abs`, run against Go, Perl, Python, Ruby, and PHP via the shared cross-language harness, with a matching Rust vector test. Hand-written unit test coverage added to each runtime's `template_primitives`-style suite (Perl, Python) mirroring the same cases.

  `math-methods` graduates from a render divergence to a passing render on 7 of 8 template adapters. Go alone keeps the divergence, now with an updated, accurate reason: the fixture's fractional signal value (`-7.6`) is typed as Go `int` (zero value) rather than `float64` — the same root cause already tracked as the separate `number-tofixed` divergence (`typeInfoToGo`'s `kind: 'primitive'` branch hard-codes any TS `number` to Go `int`, never consulting the literal value), not a registry gap; `Math.min`/`Math.max`/`Math.abs` are now correctly registered and lowered on Go.

- d7e3fe5: Dispatch `.length` on receiver type in the Mojolicious top-level emitter. A `.length` access lowered unconditionally to Perl's array form `scalar(@{$x})`, which dereferences the value as an array ref and returns 0 for a scalar string — so `word.length` on a `string` prop rendered `0` instead of the character count. The emitter now emits Perl's scalar `length($x)` when the receiver is string-typed (a known string prop/getter via `isStringTypedOperand`, or a bare identifier bound to one via the `_isStringValueName` witness the `eq`/concat lowering already consults) and keeps `scalar(@{...})` for array receivers. The `string-length-text` fixture graduates from Mojolicious's `renderDivergences`.
- 9a9f7ce: Fix nested-loop `data-key` attributes to carry the depth suffix (`data-key-1`, `data-key-2`, ...) that the Hono/JS reference already emits for a `.map()` nested inside another `.map()`. Both the CSR client-JS path (`ir-to-client-js`'s `loopDepth` recursion counter) and the Hono SSR adapter (a `loopKeyStack`) already derived this independently at render time; the eight template (non-JS) adapters had no such mechanism at all and always emitted plain `data-key` regardless of nesting, so an inner loop's items were indistinguishable from the outer loop's for client-side reconciliation.

  `IRLoop` gains a `depth` field (0 = outermost), computed once in Phase 1 (`jsx-to-ir.ts`, a `ctx.loopDepth` counter incremented/decremented in lockstep with `ctx.loopParams` around each `.map()` callback) — the single IR-computed source of truth every adapter now reads instead of re-deriving nesting depth on its own. Each of the eight adapters threads the loop's own `depth` through its `renderLoop`/`renderAttributes` call (a per-adapter save/restore field mirroring the existing `inLoop` boolean), so `key` → `data-key`/`data-key-N` matches `keyAttrName()` in `ir-to-client-js/utils.ts` exactly.

  Also fixes a related, previously-undiscovered Jinja bug this fixture exposed: the adapter's member-access emitter lowered `obj.field` through Jinja's `.` (attribute-then-item) resolution, so a dict-shaped JS object with a field literally named `items`/`keys`/`values`/`get`/... resolved to Python's _built-in dict method_ of the same name instead of the field's value (`group.items` → `TypeError: 'builtin_function_or_method' object is not iterable`). Both Jinja member-access emitters now lower to bracket/item access (`obj['field']`, Jinja's `getitem`, key-first), which cannot collide with a dict method name.

  `nested-loop-outer-binding` graduates from a render divergence to a passing render on all eight template adapters.

- 3779c8d: Fix `Object.entries(prop).map(([k, v]) => …)` (and `.keys()`/`.values()`) over an object-shaped prop — previously broken on all 8 template adapters (empty output, wrong keys, or a Go runtime crash).

  The compiler only recognized the array instance-method form (`arr.entries()`/`.keys()`/`.values()`, zero-arg property access) as an iteration-shape loop source — never the static method form `Object.entries(x)`/`.keys(x)`/`.values(x)` on a plain object (one argument, callee `Object.<method>`). Unrecognized, it silently parsed as a generic call and fell through every adapter's expression lowering treating the literal `Object` identifier as a bogus prop reference.

  - Added `IRLoop.objectIteration?: 'entries' | 'keys' | 'values'`, a shared IR field distinct from the existing array-only `iterationShape` (the object case's "index" is a string key, and the collection is a map/dict/hash, not an array/slice — a genuinely different lowering shape, not a variant of the array one). A new `isObjectIteratorCall` recognizer (mirroring the existing `isIteratorShapeCall`) strips the `Object.<method>(...)` wrapper in `transformMapCall`.
  - **Jinja / Twig / minijinja(Rust) / Blade**: lower straight to native map/dict iteration (Python `dict.items()`, PHP `foreach`, minijinja's `|items` filter) — these four preserve JS `Object.entries()`'s insertion-order semantics natively, verified per-language.
  - **Text::Xslate**: `.kv()`/`.keys()`/`.values()` Kolon methods — verified to give deterministic alphabetically-sorted order.
  - **Go**: needed no adapter code changes — the existing generic `{{range $k, $v := .Field}}` lowering already works, since Go's `range` is polymorphic over maps (sorted-by-key via the stdlib's own `fmtsort`).
  - **Mojolicious**: `sort keys %{$hash}`, mirroring the existing `sort keys` convention already used elsewhere in the shared Perl runtime for the same reason (hashes have no native order).
  - **Blade / Twig (PHP)**: added `entries()`/`keys()`/`values()` helper methods to the shared `@barefootjs/php` runtime (`BarefootJS.php`) — Twig's `{% for %}` can't iterate a plain `stdClass` (not `Traversable`); these do a defensive `(array)` cast, which preserves PHP's own insertion order.
  - Go, Rust, and Mojolicious/Xslate lower to a **deterministic sorted-by-key** iteration rather than true JS insertion order, which is physically unrecoverable from those languages' native map types once constructed — documented as a permanent known limitation on `IRLoop.objectIteration`'s docstring, not a follow-up.
  - Fixed a related client-JS regression this surfaced: an object-shaped loop source that happens to be a static module-scope const (e.g. `const chartConfig = {...}`) was previously miscategorized as a "static array" (which assumes a real array, calling `.forEach()`/`.map()` on it) — `isStaticArray` now excludes any `objectIteration`-shaped loop, routing it through the dynamic `mapArray()` reconciliation path instead, whose array-expression reconstruction (`applyObjectIterationWrap`) already handles it correctly.

  `object-entries-map` graduates from a render divergence to a passing render on all 8 adapters; `ui/compat.lock.json` and the divergence declarations are updated accordingly.

  Also fixed the SAME gap in `@barefootjs/hono` (the JSX/JS reference renderer used for `expectedHtml` generation and real Hono apps) — it re-emits real JS for SSR, so it needed the identical `Object.entries/keys/values(x)` reconstruction as the client-JS emitter, caught by its own conformance suite in CI.

- 7e12b55: Fix `user?.name ?? '…'` (optional chaining into an object-shaped prop) failing at render time on the Go and Ruby ERB adapters.

  The shared `ParsedExpr` `member` variant gains an `optional: boolean` field, set from the source `?.` token (`ts.isPropertyAccessExpression`/`ts.isElementAccessExpression`'s `questionDotToken`) and threaded through every rewrite/copy site so it survives destructure and callback-body rewrites. `ParsedExprEmitter.member()` now receives this flag; six of the eight adapters (Jinja, Twig, minijinja, Text::Xslate, Blade, Mojolicious) ignore it outright because their existing member-access lowering is already null-safe by construction — Jinja/Twig/minijinja/Xslate's `[]`/`.` accessor swallows a `None`/`undef` receiver, and Blade already routes every access through the null-safe `data_get()` helper.

  Go and ERB act on the flag:

  - **Go**: an `optional` access routes through the runtime's existing nil-safe reflection getter (`bf_get`/`getFieldValue`, `bf.go`) instead of a literal `.Field` dot-chain, which panics evaluating a field on a nil interface/pointer (`nil pointer evaluating interface {}.Name`).
  - **ERB**: an `optional` access emits Ruby's native safe-navigation form (`obj&.[](:key)`) instead of plain `obj[:key]`, which raises `NoMethodError` on a `nil` receiver.

  Both routes only guard the single hop actually written with `?.` — a following plain `.c` after an optional `a?.b` is not (yet) short-circuited, so this does not yet match JS's whole-chain short-circuit semantics; see the `member` variant's docstring.

  `optional-chaining-prop` graduates from a render divergence to a passing render on both adapters.

- be2b48d: Support `String.prototype.replaceAll(pattern, replacement)` with a string pattern. Previously refused at compile time with BF101 (no lowering existed); the string-pattern form now lowers through a new `replaceAll` `ArrayMethod` IR member — parsed with the same arity/regex/object-literal gates as `.replace` (a regex-literal pattern stays refused, matching `.replace`'s deferred-form treatment) — to a dedicated all-occurrences helper on every backend: Go `bf_replace_all` (`strings.ReplaceAll`), the shared Perl runtime's `replace_all` (Mojolicious + Text::Xslate, index/substr loop keeping the replacement literal), Python's `bf.replace_all` (native `str.replace`, already global by default), Ruby's `bf.replace_all` (an index/splice loop — deliberately not `String#gsub`, which interprets `\1`/`\&` backreferences in the replacement even for a literal pattern), the shared PHP runtime's `replace_all` (`str_replace`, with the empty-pattern case hand-rolled since PHP's `str_replace("")` is a no-op unlike JS), and Rust's `bf.replace_all` (native `str::replace`, already global by default).

  A dedicated helper, not the existing `.replace` lowering with a flag — reusing the first-occurrence helper would have silently truncated the replacement to one match. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) mirror `.replace`'s cases with a multi-occurrence receiver as the flagship, catching that exact swapped-lowering bug on every runtime that consumes the shared corpus (Go, Perl, Python, Ruby, PHP) plus a matching Rust vector. The `string-replaceall` fixture graduates from a BF101 refusal to a passing render on all eight template adapters.

- 56241b8: Dispatch `.slice()` to a string branch in every backend's runtime helper. `word.slice(0, 4)` on a `string` prop rendered empty (Go/Ruby/Perl/PHP/Rust) or `[]` (Python/Perl EP text) instead of the substring — the adapter can't disambiguate a string receiver from an array receiver at compile time (both lower through the same `bf_slice`/`bf.slice` call), so the compiled template already emits the correct polymorphic call; only the runtime helper itself needed a string branch, the same way `.includes()` already dispatches on the runtime value's type. Negative start (`slice(-4)`), an absent end (`slice(4)`), out-of-range clamping, and multi-byte characters (indexed by code point, not byte offset) all match the JS reference. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts`) pin the string-receiver shape across every runtime that consumes the shared corpus (Go, Perl, Python, Ruby, PHP), plus a matching Rust test. The `string-slice` fixture graduates from all eight template adapters' `renderDivergences` declarations.
- 9b3707a: Support `String.prototype.trimStart()` / `.trimEnd()`. Previously refused at compile time with BF101 (no lowering existed); each now lowers through a dedicated `trimStart` / `trimEnd` `ArrayMethod` IR member — separate members, not a shared `trim` member with a `side` flag, matching the existing `padStart`/`padEnd` and `startsWith`/`endsWith` precedent — to a dedicated one-sided helper on every backend: Go `bf_trim_start` / `bf_trim_end` (`strings.TrimLeftFunc` / `TrimRightFunc` with `unicode.IsSpace`), the shared Perl runtime's `trim_start` / `trim_end` (Mojolicious + Text::Xslate, one-sided `\s` regex), Python's `bf.trim_start` / `bf.trim_end` (native `str.lstrip()` / `rstrip()`), Ruby's `bf.trim_start` / `bf.trim_end` (one-sided `\p{Space}` regex), the shared PHP runtime's `trim_start` / `trim_end` (one-sided `preg_replace`), and Rust's `bf.trim_start` / `bf.trim_end` (native `str::trim_start()` / `trim_end()`).

  Neither has an array equivalent, so unlike `.slice()` there's no receiver-type ambiguity to resolve — each is a plain new method with runtime-type dispatch shared with `.trim()`. Dedicated one-sided helpers, not the existing `.trim()` lowering with a flag — reusing the both-sides helper would have silently stripped whitespace from the wrong side. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) and hand-written runtime unit tests mirror `.trim()`'s cases with a both-sided-whitespace receiver as the flagship, catching that exact swapped-lowering bug on every runtime. The `string-trim-sided` fixture graduates from a BF101 refusal to a passing render on all eight template adapters.

- Updated dependencies [7bd1762]
  - @barefootjs/shared@0.18.5

## 0.18.4

### Patch Changes

- a9383fd: Lower JS string-concatenation `+` to the target language's concat operator on backends whose `+` is numeric-only. `'Hello, ' + name + '!'` reached Perl `+` (renders `0` — both strings numeric-coerce) and PHP `+` (fatals with "Unsupported operand types: string + string"). The string-typed-operand classification lives in the shared layer (`isStringTypedOperand` / `isStringConcatBinary`, exported from `@barefootjs/jsx` — promoted from the Mojo/Xslate adapters' local copies and extended with template-literal and nested-`+` arms); each emitter only maps the shared decision to its own operator: Perl EP `.`, Kolon `~`, Twig `~`, Blade `.`. The `string-concat-plus` fixture graduates from those four adapters' `renderDivergences` declarations (Jinja, minijinja, and ERB already concatenate natively; the Go adapter has the same symptom but lowers expressions through its own pipeline, so its entry stays for a follow-up).
- 23cc4dc: Normalize intrinsic-element attribute names ONCE in Phase 1: `IRAttribute.name` now carries the HTML/SVG attribute name, so every adapter emits it verbatim. The shared `dom-prop` classifier grows an `HTML_CAMEL_ALIASES` table (React-style camelCase → HTML: `tabIndex` → `tabindex`, `maxLength` → `maxlength`, `autoComplete` → `autocomplete`, `readOnly` → the boolean `readonly`, `spellCheck` → the enumerated `spellcheck`, …) consulted by both `toHTMLAttrName` (now applied in `jsx-to-ir`'s `processAttributes`) and `toHTMLAttrNameRuntime` (spread paths). Previously each adapter mapped at most `className` → `class` itself and every other alias leaked into the emitted HTML as an unknown attribute the browser ignores — `htmlFor` never became `for` (broken label association on template backends), `readOnly` rendered as `readOnly="true"` vs bare presence depending on backend, and SVG `strokeWidth`/`strokeLinecap` passed through unmapped. Component props (`IRProp`) keep the user's API names; unknown names (`data-*`, custom-element attributes, `viewBox`-style case-sensitive SVG XML names) pass through unchanged. The `camelcase-attributes`, `svg-icon`, and `boolean-attr-literals` fixtures graduate from every adapter's `renderDivergences` declaration and the CSR skip list.
- 438f2fe: Preserve source grouping when re-emitting binary expressions as infix template text. `(count() + 2) * 3` parses into an unambiguous `ParsedExpr` tree, but the EP/Jinja-family emitters joined operands textually (`l op r`), re-exposing the text to the target language's precedence — the SSR output silently computed `count + 2 * 3` (10 instead of 18) on Mojolicious, Text::Xslate, Twig, Jinja, Blade, and minijinja (ERB and Go already parenthesized). The grouping decision now lives in the shared layer as `groupBinaryOperand` (exported from `@barefootjs/jsx`): a compound operand (binary/logical/conditional) is parenthesized, leaf operands stay unwrapped so existing simple emissions are byte-identical. The `arithmetic-text` fixture graduates from those six adapters' `renderDivergences` declarations.
- Updated dependencies [23cc4dc]
  - @barefootjs/shared@0.18.4

## 0.18.3

### Patch Changes

- a46d4a5: Fold the JSX render-nothing literals in Phase 1: `{null}`, `{undefined}`, `{true}`, and `{false}` in child position now produce NO IR node, matching JSX semantics (`{0}` still renders "0"). Previously the literal fell through to the scalar-expression fallback and each backend stringified it its own way — the Hono reference rendered the text "null" for `{null}` while template adapters rendered "false" for `{false}` (the `falsy-text-values` divergence from the Priority-12 sweep). With the fold living in the IR producer, every adapter — including CSR client JS — agrees by construction; the fixture graduates from every adapter's `renderDivergences` declaration and the CSR skip list.
  - @barefootjs/shared@0.18.3

## 0.18.2

### Patch Changes

- 31372ca: Declare two build-time refusal contracts in every template adapter's conformance-pins set, surfaced by the Priority-12 edge-case conformance sweep: `dangerouslySetInnerHTML` (raw-HTML output needs a deliberate per-template-language affordance; the compiler already refuses the shape with BF101) and `String.prototype.replaceAll` (only first-occurrence `.replace` is wired to the runtime helpers; already refused with BF101 rather than silently reusing the first-only lowering). Test-contract metadata only — no adapter runtime or codegen behavior changes; the pins make the pre-existing refusals part of each adapter's asserted conformance surface (and visible to `bf compat`).
- 4c722c8: Publish each template adapter's render-level conformance divergences as a machine-readable `renderDivergences` export (new `RenderDivergences` type in `@barefootjs/jsx`) — the render-level sibling of `conformancePins`. The Priority-12 edge-case sweep (#2168) skipped fixtures that render differently from the Hono reference via per-test-file `skipJsx` literals, which made the docs compatibility matrix look all-green while divergences were only visible in test-file comments. Each adapter now declares those fixtures (with a one-line rationale) in `src/render-divergences.ts`; its conformance suite derives `skipJsx` from the same object so the published declaration and the test skips cannot drift, and `packages/compat` publishes both pins and render divergences in a new `fixtureDivergences` section of `ui/compat.lock.json`, rendered honestly on the docs compatibility-matrix page. No adapter runtime or codegen behavior changes.
  - @barefootjs/shared@0.18.2

## 0.18.1

### Patch Changes

- @barefootjs/shared@0.18.1

## 0.18.0

### Minor Changes

- 99cfd04: Support `x ?? {}` (an empty object-literal `??` fallback) on every SSR template adapter (#2087), fixing the `chart` UI component's `<ChartConfigContext.Provider value={{ config: props.config ?? {} }}>`, the last remaining `ui/compat.lock.json` failures (erb, jinja, minijinja, mojolicious, twig, xslate all now `ok: true` — 496/496).

  The shared `isSupported` gate (`packages/jsx/src/expression-parser.ts`) previously refused any expression containing a standalone object literal, including one used only as `??`'s fallback operand. `logical` now narrowly admits an EMPTY object-literal right operand of `??` specifically — not `&&`/`||`, and not a non-empty object literal, both of which still refuse. Every template adapter's `??` lowering already had a correct definedness test; only the right-operand VALUE emit needed to change: erb/jinja/minijinja/twig/xslate/mojolicious's `objectLiteral` dispatcher now emits the language's real empty dict/hashref literal (`{}`) for the zero-property case, matching the `'{}'` convention their spread-codegen (`objectLiteralToXxx`) already used, instead of the filter-context truthy sentinel leaking into value position.

  Go templates have no object/map literal syntax at all, so `GoTemplateAdapter.objectLiteral` now self-reports BF101 for a bare value-position `x ?? {}` (the shared gate no longer does, since it now considers the expression supported) and falls back to the safe `""` string sentinel, so the emitted action stays valid Go template syntax instead of splicing an `[UNSUPPORTED: …]` marker into an `or`/`and` operand.

  Go's own object-shaped context PROVIDER value now actually lowers, closing the gap the first draft of this change left open: `ContextConsumer` (`packages/jsx/src/augment-inherited-props.ts`) gained a `defaultKind: 'object'` marker so the Go adapter can tell an object-shaped `createContext` default apart from "no default" (previously both collapsed to `defaultValue: null`); the other six SSR adapters don't consult it; their consumer seed's default only matters with no enclosing Provider, which none of this fixture's shapes exercise. `GoTemplateAdapter.contextConsumerGoType`/`contextConsumerGoDefault` now type such a consumer field `map[string]interface{}` (default the nil-safe empty map) instead of the scalar `string` fallback that crashed real `go run` execution (`can't evaluate field Config in type string`). `extendProviderContext` now also lowers an OBJECT-LITERAL provider value via the new `providerObjectValueToGoMap` / `lowerProviderMapMemberValue` (reusing `objectLiteralToGoMap` / `parsedLiteralToGo` for literal members, plus a dedicated `props.X ?? {}` type-assert-and-fallback shape for #2087's exact chart pattern) into a `map[string]interface{}` Go expression baked into the descendant's constructor call; any member outside that narrow surface (a getter, a callback, an unresolvable expression) still bails the whole value, leaving the consumer on its `createContext` default — unchanged from before this fix. The consumer's own `ctx.config.label` read now lowers through the runtime's case-tolerant `bf_get` (`getFieldValue`, `runtime/bf.go` — already used by the sort/project helpers, now also registered as a template func) instead of a plain `.Ctx.Config.Label` dot-chain, which would require an exact-cased struct/map field that never exists.

  New conformance fixture `context-provider-nullish-object-fallback` pins the exact chart shape (a context-provider value member falling back to `?? {}`, consumed by a child reading a missing key off it) across all seven template adapters, including go-template — no adapter skips it; `go run` executes the generated component for real.

- 477406d: Dynamic `.flat(depth)` and a widened `ParsedExpr` runtime evaluator, across all six runtime implementations (#2094, refs #2069).

  - **Dynamic `.flat(depth)`**: a non-literal depth expression (a numeric prop, signal read, arithmetic, …) that itself resolves to a supported `ParsedExpr` is now accepted instead of refusing with BF101 — the depth is coerced at render time per JS `ToIntegerOrInfinity` (truncate toward zero; NaN / negative → `0`; `Infinity` / a huge finite value → flatten fully). The `array-method`/`flat` IR node gains an optional `depthExpr`; the shared `flatMethod` emitter interface widens to `FlatDepth | { expr: ParsedExpr }`. Every runtime routes a dynamic depth through a NEW `flat_dynamic`-family helper (Go `bf_flat_dynamic`/`FlatDynamicDepth`, Perl `bf->flat_dynamic`, Ruby/Python/PHP `flat_dynamic`, Rust `bf.flat_dynamic`) — deliberately separate from the existing `flat` helper (whose `-1` argument is a compile-time sentinel meaning "flatten fully", the opposite of what a genuinely dynamic `-1` means per JS). Coercion parity is pinned by new `flat_dynamic` golden helper vectors run by every backend.
  - **Evaluator nested-callback widening**: the higher-order-callback runtime evaluator (`serializeParsedExpr`/`toEvalNode`) now serializes `.map(cb)` / `.filter(cb)` (1- or 2-param arrows, recursively — nesting is unbounded) and `.join(sep?)` instead of refusing them, so a predicate/projection body like `x => x.tags.filter(t => t.active).length > 0` or `posts.flatMap(p => p.tags.map(t => '#' + t)).join(' ')` now lowers on every template adapter instead of surfacing BF101. `.map`/`.filter` reuse the ordinary `call`/`member`/`arrow` node shape (not a bespoke wrapper), matching the shape the `eval-vectors.json` golden corpus already carries. A nested `.some`/`.find`/`.every`/`.sort`/`.reduce`/`.flat`/`.flatMap` inside a callback body is still refused. All six runtime evaluators implement the new node shapes (Go `eval.go` as the reference, ported to Perl `BarefootJS::Evaluator` — shared by Mojolicious and Xslate — plus Ruby, Python, PHP, and Rust), with 11 new golden eval-vector cases pinning cross-backend parity (join semantics incl. null→`''`, 2-param arrows, the `.length` composition, and a doubly-nested map+join).
  - **`.flatMap(fn, thisArg)`**: the already-correct 2-arg form (the parser has always kept `thisArg`, and every adapter has always ignored it — arrows ignore `this`) is now pinned by a conformance fixture.

  New conformance fixtures (`array-flat-dynamic-depth`, `array-flatmap-nested-map`, `array-flatmap-nested-filter-join`, `array-flatmap-thisarg`) run on every adapter.

- 36fec0e: Lower array-index / nested / rest destructure `.map()` callback params on all template adapters (#2087, refs #2069).

  `LoopParamBinding` gains a structured `segments` path (field/index steps with `isIdent` classification) and the shared gate — renamed `isLowerableLoopDestructure`, old name kept as a deprecated alias — now admits fixed bindings at any path depth (`([k, v])`, `{ cells: [head] }`, `{ user: { name } }`), array-rest (`[first, ...tail]`, lowered as the exact slice), and object-rest used as member access or as a `{...rest}` spread onto an intrinsic element (lowered as a true residual bag via a new per-adapter `omit` runtime helper feeding the existing `spread_attrs` pipeline; ERB uses native `Hash#except`).

  The `rest-destructure-{object-spread,array,nested}-in-map` conformance fixtures graduate from BF104 pins to real-engine HTML comparison on all seven template adapters, alongside the new `destructure-array-index-in-map` / `destructure-nested-object-in-map` fixtures. Still refused (BF104): bare value uses of an object-rest name, spreads onto components/providers, `.filter().map(destructure)` chains, and `__bf_`-prefixed binding names.

  Collateral hardening: `static-array-from-props(-with-component)`'s destructure no longer trips BF104, which exposed an orthogonal gap — a loop array bound to a computed function-scope const would silently render empty. Template adapters now raise a narrow BF101 for that shape instead.

- fa03384: Fix multi-component registry modules (Toast/Dialog/Tabs/DropdownMenu) 500ing on the Perl (mojo) adapter (#2132). A registry module exporting several components from one file compiles to one EP template per component, but the build manifest carried a single `markedTemplate` per entry, so `register_components_from_manifest` never registered the sub-components and every `render_child('toast_provider')` died with "No renderer registered".

  - **`@barefootjs/cli`**: for `templatesPerComponent` adapters, each manifest entry now carries a `components` map — one row per exported component with its own `markedTemplate` and `ssrDefaults`, keyed by the component name. The key comes from the compiler's new structural `componentName` stamp, not the template basename (a single-component file's template is named after the source file, e.g. `index.html.ep`). Additive: every runtime parses manifest entries key-by-key, so older runtimes ignore the new field.
  - **`@barefootjs/jsx`**: `FileOutput` gains an optional `componentName`, set on `markedTemplate` / `ssrDefaults` outputs so the build pipeline can pair them per component without basename guessing.
  - **`@barefootjs/perl`**: `register_components_from_manifest` registers one child renderer per `components` row under the snake_cased component name the compiled templates call (`toast_provider`, `toast_title`, …), seeding each child from its own per-component `ssrDefaults`. Per-component registrations win over the directory-name key — for `ui/toast/index` the key `toast` now resolves to Toast's own template instead of the module's first template (ToastProvider). Manifests from older builds (no `components` map) keep the directory-name behaviour.
  - **`@barefootjs/mojolicious`** (`BarefootJS::Backend::Mojo`): `render_named` now dies when `render_to_string` returns undef (missing template) instead of letting the calling template's `<%==` silently render the child subtree as an empty string, and the active `bf.instance` swap is `local`ized so it's restored when a nested render dies.

- fa393c0: Template-primitive registry V2: user-imported helpers via the lowering-plugin registry (#2069, catalog entry for #1187).

  - **`RelocateEnv.loweringMatchers`**: `isCallAcceptedByAdapter` (`packages/jsx/src/relocate.ts`) now consults a component's bound `LoweringPlugin` matchers (`prepareLoweringMatchers`, #2057) as a third acceptance path alongside `templatePrimitives` / `acceptsTemplateCall`. A bespoke user-imported helper (`const serialized = customSerialize(props.config)`) that was never — and can never be — added to any adapter's string-keyed `templatePrimitives` map now inlines into the generated client template instead of falling back to `(undefined)`, provided a `LoweringPlugin` recognises the call (import-aware via `prepare(metadata)`, same seam the built-in `queryHref` plugin uses). The shadow guard applies identically: a local binding that shadows the plugin's expected import name is not accepted.
  - **One-hop alias resolution (`RelocateEnv.aliasTargets`)**: `const fmt = customSerialize; fmt(x)` now resolves `fmt` to `customSerialize` for both the `templatePrimitives` key lookup and the matcher dispatch — exactly one hop (an alias-of-an-alias, or an alias to a still-component-scoped name, stays refused; there is no transitive chain resolution).
  - **Fixed a `_p._p` double-rewrite latent bug** in the props-object bare-lift path (`relocate.ts`'s `decideAction`) that the `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` conformance case pins against, for the case where an accepted call's object-literal argument mixes bare-props-object and per-key member access.
  - **Generic `helper-call` rendering**: all 7 template adapters (Go, Mojolicious, Xslate, ERB, Jinja, Rust/MiniJinja, Twig) render the neutral `LoweringNode` `helper-call` variant (previously unused) alongside the existing `guard-list` — a plugin's `helper` id maps to the adapter's own runtime-helper naming convention (Go `bf_<helper>`, Perl `bf-><helper>`, Kolon `$bf.<helper>`, everyone else `bf.<helper>`), mirroring exactly how the built-in `query` helper (`queryHref`) already renders. The framework renders the invocation; the plugin author is responsible for registering the backend function (e.g. into Go's `FuncMap`). Client-side, the call is left untouched — the browser executes the real imported function, same as `queryHref`.
  - Conformance: `USER_IMPORT_VIA_CONST` and `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` (`packages/adapter-tests/src/cases/template-primitives.ts`) now register a small test-only `customSerialize` `LoweringPlugin` around each compile (restored via `try`/`finally` so a failure can't leak the plugin into unrelated suites) and are unskipped on all 7 template adapters — Hono, whose broad `acceptsTemplateCall` already covered this shape, stays green with the same case setup.

  `TemplatePrimitiveRegistry` / `TemplateCallAcceptor` remain V1 (identifier-path, fixed at adapter-construction time) — see the updated doc comments on `packages/jsx/src/adapters/interface.ts` and the `spec/compiler.md` capability-flags section for the full V1/V2 split.

### Patch Changes

- 6c13ce7: `@barefootjs/jsx` exports `ConformancePin` / `ConformancePins` types, and each adapter package now exports its conformance `expectedDiagnostics` pin set as a structured `conformancePins` module (with `issue:` URLs) consumed by its own conformance test. These structured pins also feed a repo-internal component × adapter compile-compatibility matrix (`ui/compat.lock.json`, regenerated with `bun run compat:lock` and drift-checked in CI) that is not part of the published CLI or any published package's runtime surface.
- e76405d: Fix the Mojo scaffold's stock `/` route 500ing with `Global symbol "$initial" requires explicit package name` (#2126):

  - `Mojolicious::Plugin::BarefootJS` now resolves the build manifest lazily per render (cached on the file's mtime/size) instead of once at plugin-register time. The scaffold's dev script starts `bf build --watch` and morbo concurrently, so the app routinely boots before the first build writes `dist/templates/manifest.json` — previously that startup race disabled ssrDefaults stash seeding for the server's lifetime and every top-level render died under strict. Rebuilt manifests (`bf build --watch`, `bf add`) are now also picked up without a server restart.
  - `extractSsrDefaults` seeds every prop declared on a bare-props parameter's type (`function Foo(props: Props)`), not just the ones a signal/memo initializer references. Template-stash adapters flatten `props.X` to a bare scalar (`$X`), so a direct template read of an unseeded, unpassed prop was a strict-mode compile error rather than a soft `undef`.
  - The mojo scaffold's `/` route now passes `initial => 0` explicitly, keeping the starter page self-sufficient and doubling as the worked example of how props reach a component (they're stash values).
  - @barefootjs/shared@0.18.0

## 0.17.1

### Patch Changes

- 56e00aa: Emit the `<!--bf-loop:<id>-->` / `<!--bf-/loop:<id>-->` boundary marker pair for clientOnly (`/* @client */`) loops (#2066). Both adapters previously rendered nothing at the loop position, so the client runtime's `mapArray()` resolved `anchor = null` and appended hydrated items after sibling markers (#872 defect class). The pair now matches Hono / Go emission, with per-call-site marker ids (#1087) keeping sibling `.map()` ranges distinct.
- 6b3bba3: Lower value-producing `.map(cb)` on the template-string adapters via the #2018 runtime evaluator (#2073). A `.map()` whose callback returns a value (the blog-showcase shape `` p.tags.map((t) => `#${t}`).join(' ') ``) previously refused with BF101 on Go / Mojo / Xslate; `map` now joins `CALLBACK_METHODS`, the projection body serializes per element through the new `map_eval` helpers (`bf->map_eval` / `$bf.map_eval` / `bf_map_eval` + `BarefootJS::Evaluator::map_json` / Go `MapEval`), one result per element with no flatten, composing through the existing `.join` lowering. The JSX-returning `.map` is an IRLoop upstream and unaffected; the fall-throughs (a bare `arr.map` reference or a function-reference callback) still refuse loudly.
- d0fde8a: Surface BF101 for a filter predicate whose body contains a nested higher-order callback the adapter can only degrade (#2038). The runtime evaluator refuses nested arrows, and the legacy predicate fallbacks silently rewrote such predicates — Xslate's Kolon-lambda emit collapsed the inner call to its receiver (`!other.some(r => …)` → `!other`), Mojo degraded nested `find*` / sort / reduce / flatMap the same way, and the Go filter-expr `call` arm dropped the arrow argument entirely. Each adapter is now loud at its exact degrade points, with `/* @client */` as the escape hatch. Faithful nested lowerings are untouched: Mojo's inline `grep` for nested `filter` / `every` / `some` and Go's `len (bf_filter_eval …)` for `.filter(cb).length` still render (pinned by the new `filter-nested-callback-predicate` conformance fixture).
- 882847c: SSR-compute memos derived from the `createSearchParams()` env signal (#2075), building on the #1922 per-request readers — including LIST-valued filter memos on Go. Env-signal handling is now open-closed: a new `ENV_SIGNAL_READERS` registry in `@barefootjs/jsx` (`envSignalReaderFor` / `envSignalLocalNames`) supplies the canonical reader name and method set, so a future env signal registers once instead of growing per-adapter branches. Mojo/Xslate seed derived memos in-template from the registry-resolved canonical reader (aliased getters canonicalise), with the seed-availability check allowing lowering-internal bindings (arrow/lambda params, Perl's `$_`, Kolon's `$bf`). Go lowers scalar derived memos (`get('k')` bare and `?? '<lit>'` defaulted) and list-filter memos (`props.items.filter(p => …tag()…)` → `bf.FilterEval` with the predicate's getter calls materialized into the env) in the generated constructor, typing filter memos `[]any`. The runtime evaluator gains its first `array-method` — `.includes` (array SameValueZero membership / string substring) — implemented isomorphically in Go and Perl and pinned by new golden vectors; `.every`/`.some` predicates using `.includes` now route through the evaluator on the Perl adapters too. The pre-existing template-position helpers (`bf_includes`, `$bf->includes`) now share the same SameValueZero equality — previously Go used `reflect.DeepEqual` (int/float64 never matched, `[NaN].includes(NaN)` was false) and Perl used stringy `eq` (`[2].includes("2")` was wrongly true) — so `.includes` returns the JS answer regardless of position.
  - @barefootjs/shared@0.17.1

## 0.17.0

### Minor Changes

- ec6072b: Add the shared Perl ParsedExpr evaluator for both backends (#2018, Track C).

  `BarefootJS::Evaluator` lands in `packages/adapter-perl/lib/BarefootJS/`
  (the engine-agnostic core, alongside `SearchParams.pm`) as **one**
  implementation both the Mojo and Xslate backends share. It evaluates a
  pure `ParsedExpr` callback body (`reduce` / `sort` / `map` / `filter` /
  `find`) against an environment (`{acc, item, …captured free vars}`),
  plus `fold` / `sort_by` — the evaluator-driven generalization of the
  `bf->reduce` / `bf->sort` callback catalogue (any reducer / comparator
  body, lifting the op and pattern restrictions).

  The coercion is JS-faithful (ToNumber / ToString / ToBoolean, strict
  equality, `Math.round` half-toward-+Infinity) and deliberately distinct
  from the divergent `bf->string` / `number` helpers. It distinguishes a JS
  _string_ `"10"` from a JS _number_ `10` via SV flags, so relational
  comparison and the `+` overload match JS even for numeric strings —
  proven isomorphic with the Go evaluator by the shared Track A golden
  vectors (a new `t/eval_vectors.t` runs every `eval-vectors.json` case and
  matches the JS reference exactly; same input → same output as Go).

  Purely additive (core Perl only: `B` / `POSIX` / `Scalar::Util`); not yet
  wired into emit, so existing template output is unchanged. The emit
  migration is the follow-up integration (Track E).

- 59b4efc: `queryHref` SSR parity for the Mojolicious and Xslate adapters (#2042).

  `queryHref(base, { … })` now lowers to a `query` runtime helper on the Perl adapters, matching the go-template `bf_query` lowering shipped in #2044:

  - **Mojolicious** lowers it to `bf->query(base, …)`, **Xslate** to `$bf.query(base, …)`. Each object property becomes a `(guard, key, value)` triple; the helper includes a pair iff its guard is truthy AND its value is a non-empty string — so a plain `key: v` passes guard `1`, and a conditional `key: cond ? v : undefined` passes the lowered condition (mirroring the client's `if (value)`).
  - A new `query` helper in the shared Perl runtime (`BarefootJS.pm`) builds the URL with `URLSearchParams.set` overwrite semantics and `application/x-www-form-urlencoded` encoding (space → `+`, UTF-8 byte-wise), so the rendered query string equals the browser / Hono render byte-for-byte.
  - `@barefootjs/jsx` gains a backend-neutral `matchQueryHrefCall` / `queryHrefArgs` helper shared by the SSR adapters' lowering.

  Recognition handles aliased imports and both the `@barefootjs/client` and `@barefootjs/client/runtime` entry points. A non-literal params object falls back to the generic lowering.

### Patch Changes

- 679bb2d: Render carousel demos byte-identical to the Hono SSR reference on the Perl adapters (#1971).

  - **Both adapters:** an inline object-literal child prop (carousel's `opts={{ align: 'start' }}`) is now lowered to a Perl/Kolon hashref instead of being refused with BF101, so the child can serialize it for `data-opts`.
  - **Mojolicious:** a `<Ctx.Provider value>` member that references a client-only function — a local handler const (`scrollPrev`) or a signal setter (`setCanScrollPrev`) — is now lowered to `undef` instead of an undeclared `$scrollPrev`, which previously tripped Perl strict mode at render time. Members that resolve to a prop / signal getter / memo are unaffected.

  All three carousel demos now render byte-identical HTML on Mojolicious, Text::Xslate, Go, and Hono (covered by `carousel-cross-adapter.test.ts`).

- e0a8ec6: Collapse the two expression models into a single generic `ParsedExpr` (#2018 P5).

  The compiler carried two parallel expression trees — the folded `ParsedExpr`
  (which pre-extracted higher-order callbacks into specialized `higher-order` /
  structured `array-method` kinds at parse time) and the generic `ParsedExpr2`
  (call + member + multi-param arrow + regex, no folding). Now that the runtime
  evaluator drives every higher-order callback body on both SSR backends (Go
  `eval.go`, Perl `Evaluator.pm`), the folding workaround is retired and the two
  models are unified on the single generic `ParsedExpr`.

  - Higher-order callbacks (`.filter`/`.find`/`.findIndex`/`.findLast`/
    `.findLastIndex`/`.every`/`.some`/`.sort`/`.toSorted`/`.reduce`/`.reduceRight`/
    `.flatMap`) now parse to a generic `call` whose argument is a generic `arrow`;
    the adapter serializes the arrow body to the runtime evaluator (eval-first)
    and recovers a structured comparator (`sortComparatorFromArrow`) only for the
    `localeCompare` sort fallback the evaluator can't model.
  - Deleted the folded kinds (`higher-order`, `arrow-fn`, the structured sort /
    reduce / flatMap `array-method` variants), their `extract*FromTS` extractors,
    the `ParsedExpr2` tree, and the `parseExpression2` / bridge functions. The Go
    constructor lowering now reads the single generic `parsed` tree.

  Behavior-neutral: emitted SSR template text changes (`bf_sort …` →
  `bf_sort_eval … "<json>"`), but rendered HTML is identical across Go, Mojo, and
  Xslate (CSR conformance, real Go/Perl render parity, and `eval-vectors`
  Go==Perl==JS gate it).

- 96696bd: Normalize block-bodied `.filter()` predicates to a single boolean expression at IR-build time (#2040), retiring the per-adapter block-condition renderers.

  A `filter(t => { … })` predicate is now folded with `foldBlockToExpr` (let-inline + early-return/`if` → ternary) and the boolean-context ternary is rewritten to `&&`/`||` via the new `predicateTernaryToLogical`, so it flows through the same expression-predicate path as `filter(t => !t.done)`. The IR's `filterPredicate.blockBody` field is removed — adapters only ever see `filterPredicate.predicate`.

  `foldBlockToExpr` gains an optional `pureCallNames` oracle: an idempotent reactive getter read (`const f = filter()`) counts as pure, so a signal read on several branches still folds (the canonical TodoApp `active`/`completed`/`all` filter). `jsx-to-ir` supplies the analyzer's signal/memo names.

  The Go / Mojolicious / Xslate adapters drop their now-dead `renderBlockBodyCondition` / `collectReturnPaths` / `buildSinglePathCondition` / `buildOrCondition` / `renderConditionsAnd` helpers; the shared expression-predicate renderer subsumes them. Render parity is unchanged (adapter conformance — Go + Perl — green; the boolean condition is truth-table-equivalent to the old OR-of-ANDs). Genuinely imperative filter blocks (loops, `break`, mutation) now refuse with BF021/BF101 instead of falling through.

- b57ed47: Lower `.flatMap(proj)` through the runtime evaluator (#2018, P3). The projection
  body serializes to a ParsedExpr JSON blob and `bf_flat_map_eval` /
  `bf->flat_map_eval` / `$bf.flat_map_eval` projects each element then flattens
  one level, generalizing the structured self / field / tuple
  (`bf_flat_map` / `bf_flat_map_tuple`) catalogue to any pure projection. A
  projection the evaluator can't model falls back to the structured helper. The
  shared runtime gains `BarefootJS::Evaluator::flat_map` / `flat_map_json` and a
  `flat_map_eval` controller helper (Go `FlatMapEval`, registered as
  `bf_flat_map_eval`). Rendered HTML is unchanged; only the emitted template text
  moves to the evaluator helper. (`.flat(depth?)` is a non-callback array method
  and stays folded.)
- b725f3c: Lower the `.sort().map()` loop-hoist comparator through the runtime evaluator
  (#2018, P3). The chained-sort site that wraps a loop's iterable now serializes
  the comparator body and emits `bf_sort_eval` / `bf->sort_eval` / `$bf.sort_eval`
  (the same path the standalone `.sort(cmp)` value call uses since P1), with
  captured free vars threaded as the env argument. A comparator the evaluator
  can't model (e.g. `localeCompare`, including a `||`-chain that ends in one)
  falls back to the legacy structured `bf_sort` / `bf->sort` path, so behavior
  there is unchanged. Rendered HTML is unchanged; only the emitted template text
  moves to the evaluator helper. The `.filter().map()` loop gate stays an inline
  `{{if}}` / `: if` on the raw predicate (already de-folded). This removes the
  last standalone consumer of the structured `SortComparator` outside the parser,
  ahead of collapsing the folded `ParsedExpr` model.
- 25a9c0f: Introduce a backend-neutral call-lowering plugin registry (#2057, part 2).

  The compiler core no longer hardcodes how a pure builder call like `queryHref(base, { … })` is recognized and lowered. A lowering plugin _matches_ a call to a backend-neutral `LoweringNode`; each adapter _renders_ that node in its own template syntax (`bf_query` / `bf->query` / `$bf.query`). This is a two-layer split — recognition is adapter-agnostic, rendering is plugin-agnostic — so SSR/CSR parity is enforced once, not per plugin.

  New `@barefootjs/jsx` exports: `registerLoweringPlugin`, `prepareLoweringMatchers`, `matchLoweringCall`, `getLoweringPlugins`, and the `LoweringPlugin` / `LoweringNode` / `LoweringMatcher` types. `queryHref` is still registered by core for now; a later change relocates that registration to the router layer so core carries no runtime-API names.

  Output is byte-identical: the Go / Mojolicious / Xslate adapters now obtain their query lowering through the registry instead of a hardcoded `queryHref` recognizer, producing the same templates as before.

- f3b26ac: Refactor the Mojolicious and Text::Xslate adapters: decompose the monolithic single-file `MojoAdapter` (~2994 lines) and `XslateAdapter` (~2561 lines) into the same focused domain modules the Go adapter uses, behind a narrow `*EmitContext` seam (issue #2018 track D).

  Internal-only, output byte-identical (verified by the adapter conformance suites — mojo 527 pass / 0 fail, xslate 353 pass / 0 fail). No behavioural or public-API change (`MojoAdapterOptions` / `XslateAdapterOptions` re-exported unchanged):

  - `emit-context.ts` — `*EmitContext` / `*SpreadContext` / `*MemoContext`: the contracts the extracted modules depend on instead of the concrete adapter class.
  - `lib/types.ts` / `lib/constants.ts` / `lib/{perl,kolon}-naming.ts` / `lib/ir-scope.ts` — render-context & options types, the template-primitive tables, Perl/Kolon hash-key quoting, and IR scope traversal.
  - `analysis/component-tree.ts` — `hasClientInteractivity` and the BF103 imported-loop-child check.
  - `value/parsed-literal.ts` — const-initializer string-literal lowering and string-type helpers.
  - `expr/operand.ts` / `expr/array-method.ts` / `expr/emitters.ts` — operand-type classification, the array/string method lowering, and the filter- and top-level `ParsedExpr` emitters.
  - `memo/seed.ts` — in-template derived-memo / context seeding.
  - `spread/spread-codegen.ts` — conditional-spread / object-literal → Perl/Kolon hashref lowering.
  - `props/prop-classes.ts` — per-compile prop classification sets.

  `type/` is intentionally absent: unlike the Go adapter, these template targets are dynamically typed and emit no struct/type codegen.

  Helpers that are byte-identical across the two Perl-family adapters are marked `SHARED CANDIDATE` as groundwork for a future shared Perl-evaluator codegen module.

- b19b256: Lower conditional-spread and inline object-literal expressions from the IR-carried structured `ParsedExpr` tree instead of re-parsing source with `ts.createSourceFile` at emit time (#2018, mirroring go-template's U5/U6/Roadmap-A). Behaviour and output are unchanged — the condition and scalar values still route through `convertExpressionToPerl` / `convertExpressionToKolon`, which re-parse, so the emitted Perl/Kolon stays byte-identical. The now-orphaned `parsePureStringLiteral` (superseded by the shared `collectModuleStringConsts`) was removed from the Mojo adapter.
- dc845ef: Remove the spread-lowering `ParsedExpr` round-trip in the Mojolicious and Xslate adapters (#2018).

  The conditional-spread / object-literal spread codegen previously re-stringified the IR-carried `ParsedExpr` tree (`stringifyParsedExpr`) and routed it back through `convertExpressionToPerl` / `convertExpressionToKolon`, which re-parsed the text. The seam now matches go-template's `convertExpressionToGo(jsExpr, out?, preParsed?)`: the converters accept an optional `preParsed?: ParsedExpr` and thread the carried tree straight through, eliminating the stringify→re-parse round-trip. Output is byte-identical (the carried tree is exactly what re-parsing the stringified text produced). `stringifyParsedExpr` is retained only for BF101 diagnostic message text.

- fd4655c: Add an `object-literal` kind to `ParsedExpr` (Roadmap A-1). The expression
  parser now structures plain object literals (`{ a: 1, b: x }` / shorthand
  `{ a }`) into `{ kind: 'object-literal', properties, raw }` instead of falling
  through to `unsupported`; spread, computed-key, method, and getter/setter
  literals still fall through unchanged. A matching `objectLiteral` method was
  added to the shared `ParsedExprEmitter` dispatcher, so every adapter
  (`go-template`, `mojolicious`, `xslate`) handles the new kind explicitly — the
  same drift defence used for `array-literal` / `array-method`.

  This is the foundational, byte-identical step that unblocks carrying signal
  and local-`const` object/array values structurally on the IR (so the Go
  adapter can drop its remaining `ts.createSourceFile` / value-regex lowering).
  Adapters currently emit the new kind exactly as they emitted an object literal
  before — through their `unsupported` path — and the IR-carry gates still treat
  it like `unsupported`, so no emitted output changes.

- 39fc2ea: Lower standalone `.sort(cmp)` / `.reduce(fn, init)` on the Mojolicious and
  Xslate adapters through the runtime evaluator (#2018, P1 — the Perl half of the
  Go change). The comparator / reducer body is serialized to a ParsedExpr JSON
  blob and evaluated per element by the new `bf->sort_eval` / `bf->reduce_eval`
  (`$bf.sort_eval` / `$bf.reduce_eval` in Xslate) helpers, with captured free
  variables threaded as a `base_env` hashref — generalizing the fixed `bf->sort` /
  `bf->reduce` catalogues to any pure comparator / reducer body. A comparator the
  evaluator can't model (e.g. `localeCompare`) falls back to the legacy `bf->sort`
  path, so behavior there is unchanged. The shared Perl runtime gains
  `BarefootJS::Evaluator::fold_json` / `sort_by_json` (the JSON-string seam the
  templates emit into) and the `sort_eval` / `reduce_eval` controller helpers.
  Rendered HTML is unchanged; only the emitted template text moves to the
  evaluator helpers. The chained `.sort().map()` / `.filter().map()` loop-hoist
  keeps the legacy path until its own phase (P3).
- 6147144: Lower higher-order methods (`.filter` / `.find` / `.findIndex` / `.findLast` /
  `.findLastIndex` / `.every` / `.some`) on the Mojolicious and Xslate adapters
  through the runtime evaluator (#2018, P2 — the Perl half of the Go change). The
  predicate body serializes to a ParsedExpr JSON blob and emits
  `bf->filter_eval` / `bf->find_eval` / `bf->find_index_eval` / `bf->every_eval` /
  `bf->some_eval` (`$bf.…` in Xslate), with captured free vars threaded as a
  `base_env` hashref — the same JS-faithful evaluator the Go adapter uses, so the
  two SSR backends stay byte-isomorphic. A predicate the evaluator can't model
  (e.g. a method-call predicate) falls back to the inline `grep` / Kolon-lambda /
  `bf->find` lowering, and `.filter(Boolean)` keeps its inline truthiness form.

  The shared `BarefootJS` runtime gains `filter_eval` / `every_eval` / `some_eval`
  / `find_eval` / `find_index_eval` controller helpers, delegating to the
  `BarefootJS::Evaluator` predicate helpers. Rendered HTML is unchanged; only the
  emitted template text moves to the evaluator helpers.

- d330fe1: Lower `queryHref` through a default-applied built-in `LoweringPlugin` instead of a per-adapter recognition branch (#2057). Its runtime stays in `@barefootjs/client`; the compiler registers `queryHrefPlugin` by default, so each adapter (go-template / mojolicious / xslate) recognises `queryHref(base, { … })` through the same registry matcher loop as any userland plugin and renders it to its query helper (`bf_query` / `bf->query` / `$bf.query`). Adapters no longer carry a queryHref-specific branch. Output is unchanged — `queryHref` still lowers identically.
- c8c7d50: Recognize the `searchParams` env signal structurally via `createSearchParams()` (#2057, part 1).

  The request-scoped query env signal is now a `createSignal`-shaped factory the compiler recognizes by structure, removing the `searchParams` name allow-list from the compiler core:

  ```tsx
  // before
  import { searchParams } from "@barefootjs/client";
  searchParams().get("sort");

  // after
  import { createSearchParams } from "@barefootjs/client";
  const [searchParams, setSearchParams] = createSearchParams();
  searchParams().get("sort"); // reactive read
  setSearchParams({ sort: "price" }); // single imperative navigation path
  ```

  Because `searchParams` is now a real signal getter, it lands in the fold purity oracle and reactive-getter set structurally — the clean fix for the fold-oracle special-casing (superseding the reverted #2055) with no name allow-list.

  - `@barefootjs/client`: **breaking** — the bare `searchParams` export is replaced by `createSearchParams()`, which returns a `[getter, setter]` tuple. The getter is the request-scoped query reader (unchanged SSR + client resolution); `setSearchParams(next)` is the single imperative navigation path (soft same-route nav via the router seam, hard-nav fallback otherwise), replacing the confusing mutable-`URLSearchParams` write path. `SearchParamsInit` accepts a query string, `URLSearchParams`, or a record.
  - `@barefootjs/jsx`: `createSearchParams` is a recognized signal primitive tagged with an `envReader` key on `SignalInfo`; `CLIENT_EXPORTS` swaps `searchParams` for `createSearchParams`; env-signal recognition flows from IR structure, not import names. Codegen keeps env signals out of normal value/field emission while leaving them in the reactivity graph.
  - `@barefootjs/shared`: new `BF_SEAM_NAV_SEARCH` seam for imperative query navigation.
  - Adapters (`go-template`, `hono`, `mojolicious`, `xslate`): env-signal reader lowering keys off signal structure instead of the import name; the per-request reader binding (`bf.SearchParams` / `$searchParams`) is unchanged.

  Migration: replace `import { searchParams } from '@barefootjs/client'` + `searchParams()` with `import { createSearchParams } from '@barefootjs/client'` + `const [searchParams] = createSearchParams()`, and use `setSearchParams(...)` for imperative query navigation.

- Updated dependencies [c8c7d50]
  - @barefootjs/shared@0.17.0

## 0.16.0

### Patch Changes

- a7c90a6: Honor `/* @client */` on attribute bindings (#1966).

  The inline directive deferred a JSX child/text expression to hydration but was silently ignored on attribute initializers: a Go-unsupported predicate in `data-x={/* @client */ pred(x)}` still got lowered and raised BF101/BF102, making the BF102 remediation misleading for attribute-only reactive state.

  The `clientOnly` flag was already set in the IR and honored by the client-JS reactive-attribute path (the CSR template omits the attribute and a mount effect sets/patches it on hydrate). The gap was in the adapters: `renderAttributes` lowered every attribute. All four adapters (Go, Mojo, Xslate, Hono) now skip SSR emission for `clientOnly` attributes, so the server omits the attribute, the unsupported-expression lowering is never reached, and the client sets it on hydrate.

  - @barefootjs/shared@0.16.0

## 0.15.2

### Patch Changes

- @barefootjs/shared@0.15.2

## 0.15.1

### Patch Changes

- @barefootjs/shared@0.15.1

## 0.15.0

### Minor Changes

- 166177d: Composed `site/ui` demo-corpus parity for the perl adapters (#1897):

  - **Xslate now renders the ENTIRE shared conformance corpus to Hono parity** (`skipJsx` is empty). `tabs` / `accordion` / `pagination` came off via: ARIA `aria-selected`/`aria-expanded` and boolean-TYPED prop routing through `bool_str`, compile-time resolution of module object-literal const property access (`variantClasses.ghost`), composed template-literal module consts, `attr={cond ? v : undefined}` attribute omission, and literal-const inlining (`totalPages`).
  - **Mojolicious closes the strict-vars seeding gap**: child renders now seed declared props (JSX default or `undef`), inherited `props.<x>` accesses (via the shared augmentation pass), signal initials, and memo `ssrDefaults` under the caller's props — `tabs` / `tooltip` / `pagination` render to parity and `skipJsx` is empty. The remaining composed fixtures stay pinned on the context-provider object-literal lowering (BF101), the tracked #1897 feature.
  - `@barefootjs/jsx` exports the shared static-const machinery all three SSR adapters now use: `collectModuleStringConsts` (fixed-point, incl. composed template-literal consts and `[...].join(sep)`) and `lookupStaticRecordLiteral` (module object-literal property/index lookup). The Go adapter delegates to it (no behavior change).

- 8d2cbe8: `searchParams()` (router v0.5) now renders at SSR on the Mojolicious and Xslate template adapters, so the cross-adapter `search-params` conformance fixture (`{searchParams().get('sort') ?? 'none'}`) runs on Perl too instead of being skipped (#1922, follow-up to the Go support).

  - **Lowering** (`@barefootjs/jsx` shared helpers `importsSearchParams` / `matchSearchParamsMethodCall`, consumed by both Perl adapters): `searchParams().get(k)` is recognised as an env-signal method call and lowered to a real method call on the per-request reader — `$searchParams->get('sort')` (Mojo) / `$searchParams.get('sort')` (Xslate) — instead of the broken generic deref (`$searchParams->{get}` / `$searchParams.get`, which dropped the call + argument). Scoped to components that import `searchParams` from `@barefootjs/client`.
  - **Runtime** (`@barefootjs/perl`): new `BarefootJS::SearchParams` — a core-Perl, framework-agnostic reader. `new($query)` parses an `application/x-www-form-urlencoded` query (leading `?`, `+`/`%XX` decoding tolerated); `get($key)` returns the first value, or `undef` when absent. Because the adapters lower `??` to Perl's defined-or `//` (which coalesces only `undef`), this matches JS `??` exactly — an absent key falls back to the author's default while a present-but-empty value (`?sort=`) keeps the empty string (a closer match than the Go adapter, whose `or` lowering also coalesces `''`).
  - **Mojolicious wiring** (`@barefootjs/mojolicious`): the plugin's `before_render` hook seeds the `$searchParams` template var per request from `$c->req->query_params`, so `searchParams()` resolves the live query during SSR (the client re-reads `window.location` on hydration). A caller-set value wins (`//=`).
  - **Xslate**: the backend is framework-agnostic, so the host passes a `searchParams => BarefootJS::SearchParams->new($query)` template var (the conformance harness seeds an empty-query reader; production hosts thread their request query).

- 77974ee: Context-provider object-literal lowering for the Perl adapters (#1897):

  - `@barefootjs/jsx` exports `parseProviderObjectLiteral`, a structural (TS AST) classifier for `<Ctx.Provider value={{ … }}>` members: zero-param expression-body arrows are getters (SSR snapshot of the body), other function shapes are client-only behavior, everything else is a plain expression.
  - The Mojolicious and Xslate adapters lower object-literal provider values to Perl/Kolon hashrefs instead of refusing with BF101: getter members snapshot their body's SSR value, handler (`on[A-Z]`) and function-shaped members lower to `undef`/`nil`. Keys keep their JS names so consumer-side accesses map onto the same hashref keys.
  - `ref={fn}` props on imported components are skipped at SSR like `on*` handlers (Hono renders neither; client JS wires them at hydration).

  This un-pins the composed `site/ui` demo fixtures that were BF101-blocked on their context providers (`radio-group`, `accordion`, `dialog`, `popover`, `select`, `dropdown-menu`, `combobox`, `command`).

- 071a1a3: `<Region>` now lowers to a `bf-region` page-lifecycle boundary (spec/router.md), the smallest end-to-end proof for the router RFC's compiler-derived nested regions. Following the `<Async>` built-in precedent, the compiler recognises `<Region>` (and its self-closing form) by tag name and lowers it to a wrapper `<div>` carrying a deterministic `bf-region="<file scope>:<index>"` id — the `computeFileScope` FNV hash of the source path plus a per-file structural index. Because a layout compiles to one shared partial, every page composing it emits the _same_ id, which is what a client router matches a region on across page documents.

  The id is a static string, so all four adapters (Hono, Go template, Mojolicious, Xslate) emit byte-identical `bf-region="<id>"` markers — no per-adapter template interpolation. Covered by a cross-adapter conformance fixture (`region-boundary`) in addition to the Hono-only emit assertion in `packages/jsx`.

  Recognition is by capitalized tag name; import-scoped disambiguation, a runtime `<Region>` export, nested/sibling runtime diffing, and the scope-ownership dispose/rehydrate path are follow-ups.

- 6547370: Variable element-access + `.toFixed`, and `/* @client */`-guarded memo SSR folding (#1897, data-table):

  - `@barefootjs/jsx`: new `index-access` `ParsedExpr` kind for element access with a non-literal index (`selected()[index]`, `rows[i + 1]`). Previously refused as "Complex computed property access"; now supported and dispatched through a new `ParsedExprEmitter.indexAccess` arm. The Perl adapters disambiguate array (`->[$i]`) from hash (`->{$k}`) deref by the index's type; Xslate/Hono use the language's polymorphic `[]`; Go emits the `index` builtin.
  - `@barefootjs/jsx`: `.toFixed(digits?)` lowers as a new `array-method` across all adapters — `bf->to_fixed` / `$bf.to_fixed` (new Perl runtime helper), `bf_to_fixed` (new Go runtime helper, `fmt.Sprintf("%.*f", …)`), native `.toFixed` on Hono.
  - `@barefootjs/jsx`: `extractSsrDefaults` now folds a block-body memo through a statically-resolvable `if (cond) return …` guard, so a `/* @client */`-guarded memo (`const key = sortKey(); if (!key) return rows; … sort …`) seeds its default-state early-return value instead of `null`.
  - `@barefootjs/mojolicious`: the test harness seeds a root signal whose initial is `null` / unevaluable as `undef` (rather than skipping it), so a getter read only in a child-prop expression doesn't fault strict vars.

  With these, the composed `data-table` demo compiles clean on both Perl adapters and renders structurally byte-identical to Hono on real Mojolicious / Text::Xslate. It stays pinned in `skipJsx` on a single remaining divergence — the scope-ID of imported components inside the keyed `.map` (a hydration-scope concern tracked with #1896), not an expression-lowering gap.

### Patch Changes

- cda5316: Fix scope-ID divergence for body children of loop-item components (#1896). Both Perl adapters now reset `inLoop` before rendering body children in `renderComponent`, so nested components (e.g. `<TableCell>` inside a looped `<TableRow>`) receive `_bf_slot` for deterministic parent-scope-derived IDs matching Hono. Removes `data-table` from `skipJsx` in both adapter conformance tests.
- 1f8b1e0: Nested `render_child` calls now resolve and carry correct slot identity. Two fixes (#1897):

  - A child template rendering another imported component (AccordionTrigger → ChevronDownIcon) executed against a fresh `BarefootJS` instance whose child-renderer registry started empty — the registry is now shared with each child instance (test harnesses + `register_components_from_manifest`).
  - `render_child` now invokes the renderer as `$renderer->($props, $invoking_bf)`, and renderer closures derive the child's scope/slot identity from the caller's scope id instead of the registrant's. A grandchild now mounts as `root_s0_s0` rather than collapsing to `root_s0` and colliding `(host, slot)` pairs (#1249 slot-identity contract). Renderer contract note: unpack `@_` (`my ($props, $caller) = @_;`) — a one-argument subroutine signature (`sub ($props)`) enforces arity and will die on the second argument.

- Updated dependencies [071a1a3]
  - @barefootjs/shared@0.15.0

## 0.14.0

### Patch Changes

- @barefootjs/shared@0.14.0

## 0.13.0

### Patch Changes

- @barefootjs/shared@0.13.0

## 0.12.0

### Patch Changes

- @barefootjs/shared@0.12.0

## 0.11.0

### Patch Changes

- eb9d66a: Lower the object-rest `.map()` destructure param read via member access on all three SSR adapters, graduating the `rest-destructure-object-in-map` conformance fixture (previously pinned to BF104).

  `tasks().map(({ id, title, ...rest }) => <li>{title}:{rest.flag}</li>)` now resolves each binding against a per-item loop variable instead of refusing the destructure pattern:

  - **Go**: `{{range $_, $__bf_item0 := …}}` with `$__bf_item0.Title` / `$__bf_item0.Flag` (the `rest` binding maps to the bare range var so the member emitter renders `rest.flag` → `$__bf_item0.Flag`).
  - **Mojo**: a per-binding Perl `my` local off the item (`my $rest = $__bf_item;` so `$rest->{flag}` resolves).
  - **Xslate**: the equivalent Kolon `: my` binding locals.

  The synthetic per-item variable uses a reserved `__bf_item` name (depth-suffixed on Go) to avoid colliding with a user binding of the same name.

  Only the object-rest-via-member shape is graduated. The other three rest-destructure fixtures stay refused (BF104), because they need machinery the SSR `range`/`for` can't express inline:

  - `rest-destructure-object-spread-in-map` (`{...rest}`) needs a residual object excluding the consumed keys,
  - `rest-destructure-array-in-map` (`[a, ...t]`) needs index/slice,
  - `rest-destructure-nested-in-map` (`{ cells: [h, ...r] }`) needs nested index paths.

  A shared IR-level gate (`isLowerableObjectRestDestructure`, exported from `@barefootjs/jsx`) keeps every other shape on the existing BF104 diagnostic. It walks the whole loop subtree (elements, components, conditionals, async, providers, template literals) and refuses when the rest binding is spread or used as a bare value (`String(rest)`, `{rest}`) — those need a residual object — as well as when the loop also has a `.filter()` predicate. The Go adapter suffixes its synthetic range var with the nesting depth (`$__bf_item0`, `$__bf_item1`) so nested destructure loops don't shadow each other. Verified against real Go 1.25.6 / Mojolicious 9.35 / Text::Xslate v3.5.9; Hono reference snapshots unchanged.

- 207802f: Lower JSX `style={{ … }}` object literals to a CSS string on all three SSR adapters, graduating the `style-object-dynamic` and `style-3-signals` conformance fixtures (previously pinned to BF101 because a bare object literal in attribute position had no template form).

  A new shared `parseStyleObjectEntries` helper (`@barefootjs/jsx`) parses the object literal (wrapping in parens to force expression context, since a bare `{…}` parses as a block), kebab-cases each key (`backgroundColor` → `background-color`), and classifies each value as a static string literal or a JS expression. Each adapter assembles the CSS string with its own interpolation for dynamic values:

  - **Go**: `background-color:{{.Color}};padding:8px`
  - **Mojo**: `background-color:<%= $color %>;padding:8px`
  - **Xslate**: `background-color:<: $color :>;padding:8px`

  Each value expression is pre-checked with `isSupported`, so an unsupported value (or an unsupported object shape — spread, shorthand, computed key) keeps the existing BF101 refusal rather than emitting partial output.

  Static CSS key/value segments are HTML-attribute escaped before being inlined into the `style="…"` attribute (a value like `'"'` would otherwise break the attribute quoting / inject markup); dynamic values are escaped by each engine's own attribute context. The shared `cssKebabCase` also special-cases the `ms` vendor prefix (`msTransform` → `-ms-transform`) and is now reused by the compile-time static-style serializer so both paths agree. Verified against real Go 1.25.6 / Mojolicious 9.35 / Text::Xslate v3.5.9; Hono reference snapshots unchanged.

- Updated dependencies [07b95ad]
- Updated dependencies [7079ca0]
- Updated dependencies [1919a0c]
  - @barefootjs/shared@0.11.0

## 0.10.1

### Patch Changes

- @barefootjs/shared@0.10.1

## 0.10.0

### Patch Changes

- @barefootjs/shared@0.10.0

## 0.9.6

### Patch Changes

- 0051ef8: Lower `Array.prototype.find` / `.findIndex` / `.findLast` / `.findLastIndex` on the Mojolicious adapter, graduating the `array-find` / `array-findIndex` / `array-findLast` / `array-findLastIndex` conformance fixtures (previously pinned to BF101).

  The runtime helpers (`bf->find` / `find_index` / `find_last` / `find_last_index`) already existed and the Xslate adapter already lowered these via a Kolon lambda; only the Mojo `higherOrder` emitter still refused them. It now emits `bf->find($arr, sub { my $x = $_[0]; <pred> })` (a per-element coderef predicate, the same shape as `.filter` / `.some` / `.every`), with the camelCase JS names mapping to the snake_case helpers. Verified against real Mojolicious; Hono reference snapshots unchanged.

  - @barefootjs/shared@0.9.6

## 0.9.5

### Patch Changes

- @barefootjs/shared@0.9.5

## 0.9.4

### Patch Changes

- @barefootjs/shared@0.9.4

## 0.9.3

### Patch Changes

- 46d1a0d: Add `override` modifier to `renderAsync` in the Go-template, Mojolicious
  and Xslate adapters. Required by Deno's stricter `noImplicitOverride`
  default — without it `deno publish` (and `deno check`) fail with TS4114
  since `renderAsync` is provided as a concrete fallback on `BaseAdapter`,
  not declared abstract. No runtime change — `override` is a type-only
  annotation.
- 3fda4d5: `scripts/jsr-publish.ts`: drop dev-tooling-only export keys (`./build`,
  `./test-render`) and `bun:`-only conditions from the generated JSR
  manifests.

  These entries are Bun-runtime-shaped (test-render uses `Bun.*` /
  `import.meta.dir` directly; the per-adapter build helpers are wired
  for the `bf` CLI which ships as an npm executable) and never load
  cleanly under Deno's type-checker. They were the residual cause of
  `deno publish` type-check failures even after #1792 fixed import
  extensions — JSR was being asked to publish files it had no business
  type-checking against Deno's runtime.

  The npm-published surface is unchanged — these exports remain
  available to Bun / Node consumers exactly as before.

- 03c7a3c: Propagate SSR context (`<Ctx.Provider value>` → `useContext`) on the Mojolicious and Text::Xslate adapters, graduating the `context-provider` conformance fixture to Hono parity.

  Both adapters previously emitted a child template that read an un-seeded consumer variable (`$theme`), so the provider value never reached the descendant — the fixture was skipped (Go already implemented this in #1768; the Perl side was a deferred follow-up).

  The Perl runtime now mirrors the client `provideContext` / `useContext`:

  - `BarefootJS.pm` gains `provide_context` / `revoke_context` / `use_context`, backed by a package-level value stack. SSR rendering is synchronous and the provider's push/pop are perfectly balanced, so the stack always unwinds at the end of each provider subtree — and a package global (rather than `$c->stash` or the backend) is the one store reliably shared between a parent template and the child templates it renders via `render_child` (the Xslate backend runs with `c => undef`; the Mojo path lazily builds a backend per instance).
  - **Mojo**: `emitProvider` brackets the children with `<% bf->provide_context('Ctx', <value>); %>` … `<% bf->revoke_context('Ctx'); %>`, and each `useContext` consumer is seeded with `% my $x = bf->use_context('Ctx', <default>);`.
  - **Xslate**: same, using the inline `<: $bf.provide_context(...) :>` / `<: $bf.revoke_context(...) :>` form (both return `''`, so the interpolation emits nothing) and a `: my $x = $bf.use_context('Ctx', <default>);` line-statement seed.

  Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

- f00e74d: Compute prop/signal-derived memos at SSR time on the Mojolicious and Text::Xslate adapters, graduating the `props-reactivity-comparison` conformance fixture to Hono parity.

  A memo whose body isn't statically foldable — e.g. `createMemo(() => props.value * 10)` — gets a `null` static SSR default from `extractSsrDefaults` (a bare prop access resolves to `undefined`). The Perl SSR model seeds child memos from those static defaults, so `$displayValue` was never declared and the child rendered empty (Go matches Hono because it generates a child constructor that computes the memo from the passed prop; the Perl static path had no equivalent — the reason both adapters skipped the fixture).

  Each adapter now seeds such memos in-template from the already-seeded prop/signal vars:

  - **Mojo**: `% my $displayValue = $value * 10;`
  - **Xslate**: `: my $displayValue = $value * 10;`

  The seed is emitted only when the memo's static default is `null` (statically-foldable memos stay on the existing ssr-defaults path) and when every variable the lowered expression references is already in scope (props params + signals + prior memos), so a memo over an out-of-scope binding stays on the null path rather than tripping Perl strict mode. Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

  The memo body is extracted with a new AST-backed `extractArrowBodyExpression` helper exported from `@barefootjs/jsx` (it parses the `() => …` computation with the TypeScript parser and returns the body node text), replacing a brittle `^\(...\)\s*=>` regex that desynced on parameter defaults containing calls or nested-arrow bodies. Shared by both Perl adapters.

- 42e0ed9: Graduate the `toggle-shared` conformance fixture to Hono parity on the Mojolicious and Text::Xslate adapters — a keyed `.map` of sibling `ToggleItem` children, each with a per-item prop-derived signal. Three gaps were closed (#1297):

  1. **Prop-derived signal SSR seeding.** A signal whose init derives from a prop (`createSignal(props.defaultOn ?? false)`) is now seeded in-template from the passed prop (`% my $on = ($defaultOn // 0);` / `: my $on = ($defaultOn // 0);`), so a loop child honours its own per-item prop instead of the static default. The lowering is gated by `isSupported` (object/array/constant inits never reach `convertExpression*`, so they don't record a spurious BF101 and keep their existing ssr-defaults seeding) and skipped on Text::Xslate for a same-name signal (Kolon can't express `: my $x = … $x …`; those stay on the harness/manifest seeding, which already resolves them from the prop).

  2. **Loop-child scope id.** A loop child now gets a fresh `<ComponentName>_<rand>` scope id (the PascalCase component name) instead of a parent-slot id, matching the Hono reference (`normalizeHTML` canonicalises `<ComponentName>_<rand>` → `<ComponentName>_*`).

  3. **`data-key`.** The JSX `key` (a reserved prop) now lands as `data-key="…"` on the child scope root, for keyed-loop reconciliation parity. `BarefootJS.pm` gains a `_data_key` field + `data_key_attr` helper; `render_child` sets it from the `key` prop; the component root emits it (`bf->data_key_attr` / `$bf.data_key_attr()`), so non-keyed renders add nothing.

  Note: prop-derived signals/memos are now computed in-template from the props they derive from, so a host seeds the _prop_ (e.g. `initial`) rather than the signal value directly. Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

  - @barefootjs/shared@0.9.3

## 0.9.2

### Patch Changes

- f63ece5: Honour the fixture `componentName` in the Go / Mojolicious / Xslate SSR test-render harnesses, and graduate the `props-reactivity-comparison` conformance fixture on the Go adapter.

  The three SSR test-renderers picked their entry-point IR by default-export → first-exported → first IR, ignoring the requested `componentName`. For a multi-export source (`ReactiveProps.tsx` exports both `ReactiveProps` and `PropsReactivityComparison`) this always rendered the first export, so the `PropsReactivityComparison` fixture compared the wrong component against the Hono reference. Each renderer now selects the IR whose `componentName` matches the requested name first (mirroring the Hono reference's selection), falling back to the previous heuristics for single-export sources.

  With the correct component selected, `props-reactivity-comparison` renders byte-for-byte against the Hono reference on **Go** (the generated child constructors compute the `displayValue = props.value * 10` memo from the passed prop), so it is unskipped there.

  It stays skipped on **Mojolicious / Xslate**: the child memo `displayValue = props.value * 10` is prop-derived, so `extractSsrDefaults` yields `null` and the Perl SSR model — which seeds child memos from those static defaults — never declares `$displayValue` (Kolon renders it empty; Mojo aborts under strict mode). The skip rationales are refreshed to describe this real failure mode, and the stale `toggle-shared` / `children-jsx-expression` rationales are corrected to match current behaviour (Go drops a hoisted `children={<span/>}` body rather than emitting it as literal text; `toggle-shared`'s loop-child slice types as `[]any` not `[]ToggleItemInput`). Hono reference snapshots are unchanged.

  - @barefootjs/shared@0.9.2

## 0.9.1

### Patch Changes

- 6bd31dd: Drop the vestigial `@barefootjs/perl` npm dependency from the Mojolicious and Xslate adapters. The TS adapters never import the Perl runtime as JS — `BarefootJS.pm` is resolved at the Perl layer (each `cpanfile`'s `requires 'BarefootJS'` for CPAN consumers, and `prove -I ../adapter-perl/lib` / a cpanm-installed core in CI), while the TS `test-render` locates it through a relative `../../adapter-perl/lib` path. Version lock-step is already guaranteed by the changesets `fixed` group, so the npm dependency carried no weight. Keeping it made the generated JSR manifests reference a `jsr:@barefootjs/perl` that will never exist on JSR (the Perl distribution ships `lib/*.pm`, no TS exports) and pulled a JS-less package into npm installs.

  The JSR publish script (`scripts/jsr-publish.ts`) now also only emits a `jsr:` specifier for scoped siblings that are themselves JSR-published, so a future cross-language sibling can't silently re-introduce a dangling import.

  - @barefootjs/shared@0.9.1

## 0.9.0

### Patch Changes

- 7d91adc: Resolve local-const conditional spreads and `Record`-indexed spread values on intrinsic elements. Two related spread shapes that previously raised `BF101` now compile on both template adapters.

  Local-const conditional spread: a function-scope const holding a `cond ? { ... } : {}` ternary, spread as a bare identifier (`const sizeAttrs = size ? { ... } : {}; <svg {...sizeAttrs} />`), now resolves to that initializer and routes through the existing conditional-spread lowering. Only function-scope (non-module) consts qualify, and a const that aliases another bare identifier is not forwarded (loop guard) — it falls through to the standard path.

  `Record<staticKeys, scalar>[propKey]` spread value: a spread-object value of the form `IDENT[KEY]`, where `IDENT` is a module-scope `Record<staticKeys, scalar>` object literal (all scalar number/string values under static keys) and `KEY` is a bare prop identifier, now lowers to an inline indexed map. Go emits `map[string]any{"sm": 16, ...}[fmt.Sprint(in.Size)]` (adding the `"fmt"` import only when this fires); Mojo emits `{ 'sm' => 16, ... }->{$size}`. Any non-scalar value, non-static key, or non-prop index still falls through to `BF101`.

  Together these let the `CheckIcon` sibling (`ui/components/ui/icon`) — `const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}` spread onto its `<svg>` — compile standalone with zero `BF101` on both adapters.

  Additionally, unblock the Phase 2b `checkbox` conformance fixture end-to-end on both template adapters (Go + Mojolicious), which composes `CheckIcon` and uses the SolidJS props-object pattern:

  - **Sibling import survival (Go test harness).** The Go conformance harness strips each merged sibling type block's `import (...)`; it now re-adds standard-library imports a merged block still needs (today `"fmt"`, used by `CheckIcon`'s `fmt.Sprint(...)` `Record[key]` lookup) so the combined unit resolves the symbol. The harness also now emits only the child components a parent transitively references — a child _file_ exporting many components (`../icon`'s 30+ icons) no longer drags in dead components whose own codegen wouldn't compile (e.g. an icon's `strokePaths['chevron-down']` lowering to an invalid `{{.StrokePaths.Chevron-down}}`).
  - **Cross-component child rest-bag routing.** A child component attribute whose name isn't a declared child param and isn't a valid identifier (`<CheckIcon data-slot="checkbox-indicator" />`) now routes into the child's rest bag — Go's `Props map[string]any` field / Mojo's quoted `'data-slot' => ...` `render_child` arg — instead of an invalid hyphenated field (`Data-slot:`) or Perl bareword.
  - **Props-object inherited-attribute enumeration.** A component written as `function C(props: P)` only enumerates `P`'s own members; inherited `*HTMLAttributes` members it actually reads (`props.className`, `props.id`, `props.disabled`) are now enumerated as Input/Props fields (Go) / declared stash vars + `defined`-guarded attributes (Mojo), so a caller's `className` / `id` / `disabled` bind and unset optionals are omitted (Hono parity).
  - **Template-literal className memo + boolean memo SSR value.** The Go adapter computes a template-literal `classes` memo's SSR initial value by inlining module string consts (including `[…].join(' ')` consts) and resolving `props.className ?? ''`; a boolean ternary memo (`isChecked`) now renders its zero as `false` (not `0`). The `@barefootjs/jsx` `extractSsrDefaults` (Mojo's SSR seed) gains module-const seeding and `.join()` evaluation so the same `classes` memo resolves to a concrete string instead of empty.

  With these, `checkbox` is unskipped on both adapter conformance suites at byte parity with the Hono reference. `toggle` / `switch` share the inherited-attr fix but remain skipped (they carry an additional `Record[key]`-in-memo-className blocker).

- fcf28cd: Fix the Mojolicious test renderer's child component scope id: it hardcoded a
  literal `test_<slotId>` prefix, so a composed child rendered
  `bf-s="test_s5"` instead of `<parentScope>_<slotId>` (e.g.
  `ReactiveProps_test_s5`) like Hono / CSR. Children now derive their scope id
  from the parent's live `$bf->_scope_id`, mirroring the xslate adapter's
  `rootChildScopePrefix`. This unblocks the `reactive-props` conformance fixture
  on Mojo (xslate already passed it), bringing the two Perl-targeting adapters
  to parity on it.
- 52ec729: Bring the `switch` site/ui primitive to SSR conformance parity across the Go, Mojolicious, and Xslate template adapters.

  `switch` assembles its track/thumb classes in function-scope plain consts (`trackClasses`, `thumbClasses`) rather than a `Record`-indexed memo, so it needs no `Record` SSR lowering — only two gaps blocked cross-adapter parity:

  - **Function-scope const prop enumeration.** `augmentInheritedPropAccesses` (`@barefootjs/jsx`) previously scanned memos, signals, init statements, effects, and template attributes for inherited `props.X` reads, but not function-scope const initializers. The `props.className` read inside `const trackClasses = \`… ${props.className ?? ''}\``was therefore never enumerated, so the generated struct/stash had no field to bind a caller's`className`to. It now also scans non-module local consts (module consts can't reference the function-scoped`props`, so they're skipped).

  - **`[...].join(' ')` module-const inlining on the Perl adapters.** Module consts assembled as `const stateClasses = ['[&[data-state=…]]:…', …].join(' ')` were emitted as references (`$trackStateClasses`) to bindings that don't exist server-side. A new shared `evalStringArrayJoin` helper statically evaluates the join and inlines the flattened string byte-for-byte, matching the Hono reference and the Go adapter's existing private behaviour. Wired into the Mojolicious and Xslate `parsePureStringLiteral` module-const collectors.

  `switch` is unskipped on all three adapter conformance suites. Hono reference snapshots are unchanged.

- 0cb8081: Bring the `toggle` site/ui primitive to SSR conformance parity across the Go, Mojolicious, and Xslate template adapters.

  `toggle`'s `classes` is a block-bodied `createMemo` that indexes module-scope `Record<T, string>` maps by a memo-local key with a default: `const variant = props.variant ?? 'default'; … ${variantClasses[variant]} ${sizeClasses[size]} …`. Lowering it to an SSR value required three extensions:

  - **`parseRecordIndexAccess` (`@barefootjs/jsx`)** gains an optional key resolver so the index key can be a memo-local const (resolved to its underlying prop + `?? '<lit>'` default), not only a bare prop. The result now carries that `defaultKey`. The resolver takes precedence over the same-named prop, since only the local binding carries the fallback.

  - **Go adapter** template-literal memo path now handles block-bodied arrows (collecting leading `const X = props.Y ?? 'lit'` key bindings, then resolving the single returned template literal) and emits `recordConst[key]` as an inline `map[string]string{…}[fmt.Sprint(in.Field)]`. When the key has a `'default'` fallback, the map also maps the empty key `""` to that default entry's value, so an unset prop (Go zero value `""`) renders the default instead of an empty string — matching Hono's `props.X ?? 'default'` runtime evaluation. `inferMemoType` recognises a template-literal memo as `string` (so the class-string `/` in `ring-ring/50` no longer trips the arithmetic-int heuristic).

  - **`extractSsrDefaults` (`@barefootjs/jsx`)**, the Mojo / Xslate SSR stash seed, now statically evaluates block-bodied arrows (leading `const` declarations into a local scope, then the `return` expression) and indexes a resolved object / array with a resolved scalar key, so the seeded `classes` is a concrete string. The Xslate adapter consumes this through the same SSR-seed path as Mojo.

  Also adds an HTML character-reference canonicalisation to the shared `normalizeHTML` conformance helper: a literal `"` in an attribute value (the `[class*="size-"]` in `toggle`'s base classes) is escaped as the named `&quot;` by Hono but as the numeric `&#34;` by Go's `html/template`. Both decode to the same character, so the interchangeable numeric (decimal + hex) forms are now collapsed to one canonical named form on both sides of the comparison — adapter-neutral, same motivation as the existing boolean-attribute / void-element canonicalisation.

  `toggle` is unskipped on all three adapter conformance suites. Hono reference snapshots are unchanged.

- Updated dependencies [848896b]
  - @barefootjs/perl@0.9.0
  - @barefootjs/shared@0.9.0

## 0.8.0

### Minor Changes

- 3ed9659: Add `BarefootJS::DevReload` — framework-agnostic dev browser auto-reload. The
  shared module provides the browser snippet, the `<dist>/.dev/build-id` reader,
  and a ready-made PSGI streaming app (`->to_app`) for the SSE endpoint, so plain
  PSGI/Plack hosts (e.g. the Text::Xslate backend) get the same `barefoot build
--watch` auto-reload as Mojolicious. `Mojolicious::Plugin::BarefootJS::DevReload`
  now delegates its snippet and build-id logic to the shared module (no behaviour
  change).

### Patch Changes

- eab6566: Lower conditional inline-object spreads on intrinsic elements. A spread of the shape `{...(cond ? { 'aria-describedby': value } : {})}` (either branch possibly `{}`) now compiles on both template adapters instead of raising `BF101`.

  The Go adapter builds the spread bag as an immediately-invoked `func() map[string]any { ... }()` in `NewXxxProps` that conditionally returns the populated map or an empty one. The Mojo adapter emits an equivalent Perl inline ternary of hashrefs (`$cond ? { 'aria-describedby' => $value } : {}`) through `bf->spread_attrs`. In both adapters the falsy branch yields an empty bag so the key is omitted rather than rendered as an empty-string attribute (neither `SpreadAttrs` nor `bf->spread_attrs` filters empty strings).

  The condition supports a bare prop identifier and its negation; object keys must be static string/identifier names and values resolve prop references (`in.Field` / `$prop`) or string literals. Any other shape still falls through to the existing `BF101` refusal.

  Additionally, both adapters now honour Hono-style nullish-attribute omission for dynamic attributes. When an attribute value is a bare reference to a nillable prop (Go: a field whose resolved type is `interface{}`; Mojo: a prop with no destructure default and a non-primitive type), the attribute is guarded so an unset value drops the attribute entirely instead of rendering `attr=""`. Go emits `{{if ne .Rows nil}}rows="{{.Rows}}"{{end}}`; Mojo emits `<% if (defined $rows) { %>rows="<%= $rows %>"<% } %>`. Concrete-typed (`string`/`int`/`bool`) and defaulted props are unaffected and still emit unconditionally (matching Hono's `value=""` / `data-count="0"`). This unblocks the `textarea` fixture's optional `rows?: number` prop on both adapter conformance suites.

- Updated dependencies [3ed9659]
  - @barefootjs/perl@0.8.0
  - @barefootjs/shared@0.8.0

## 0.7.0

### Minor Changes

- ac91bc6: Extract the engine-agnostic Perl runtime (`BarefootJS.pm`) into a new
  `@barefootjs/perl` package. `@barefootjs/mojolicious` now depends on it and
  keeps only the Mojo-specific pieces — `BarefootJS::Backend::Mojo`, the
  `Mojolicious::Plugin::BarefootJS` binding, and the compile-time adapter that
  emits Embedded Perl (`.html.ep`).

  The runtime is Mojo-free at load time and drives any Perl template engine
  through a pluggable backend (`encode_json` / `mark_raw` / `materialize` /
  `render_named`), with an injectable JSON encoder. SSR output is unchanged for
  the Mojolicious path.

  Note for consumers that wire Perl `@INC` by hand: `BarefootJS.pm` now ships in
  `@barefootjs/perl/lib` rather than `@barefootjs/mojolicious/lib`. Point `@INC`
  at both package `lib/` directories (the Mojolicious integration's build does
  this automatically).

### Patch Changes

- c02017b: Inline module-scope pure string-literal constants referenced in
  expressions (e.g. `const labelClasses = '...'` used in a `className`
  template literal) on the Go and Mojo template adapters. Previously such
  an identifier lowered to an unpopulated struct-field / stash-variable
  reference (`{{.LabelClasses}}` on Go — failing `can't evaluate field
LabelClasses`; `$labelClasses` on Mojo — rendering empty), because a
  module const is neither a prop, signal, nor local and no field/var ever
  bound it. The adapters now resolve the identifier through the IR's
  `localConstants` and inline the literal value (escaped for the target
  template language), matching what the Hono reference produces by
  evaluating the real JS. Only module-scope pure string literals qualify —
  `Record<T,string>` indexed lookups, memos, signals, and function-scope
  locals are deliberately excluded — and inlining is suppressed for any name
  shadowed by an enclosing loop binding (matching the Go adapter's
  loop-shadowing guards). This unblocks cross-adapter conformance for the
  `site/ui` `label` and `input` primitives.

  The Mojolicious adapter now relies on `typescript` at runtime (to parse
  const initializers), so it is externalized in the build and declared as a
  peer dependency, consistent with `@barefootjs/go-template`.

- Updated dependencies [ac91bc6]
- Updated dependencies [199644e]
  - @barefootjs/perl@0.7.0
  - @barefootjs/shared@0.7.0

## 0.6.1

### Patch Changes

- 2d4edce: Lower `Array.prototype.flat(depth?)` to the template-language adapters (#1448 Tier C).

  The value-returning `.flat()` now compiles on both template adapters instead of refusing with BF101. The flatten depth is validated to a literal and normalised at parse time:

  - `arr.flat()` — flatten one level (the JS default)
  - `arr.flat(n)` — flatten `n` levels (a fractional literal truncates toward zero; a `0` / negative depth normalises to "no flatten" → shallow copy, matching JS)
  - `arr.flat(Infinity)` — flatten fully
  - a **non-literal** depth refuses with BF101 (it can't be resolved at template time) and keeps `/* @client */` as the escape hatch — `@client` is not suggested for this case since the remedy is a literal depth or pre-computing

  Non-array nested elements are preserved (JS only flattens nested arrays). This is the first half of the `.flat` / `.flatMap` Tier C row; the value-returning `.flatMap` stays deferred (the JSX-returning `.flatMap` already lowers as an `IRLoop`).

  - Parser: new `array-method` variant `flat` carrying a structured `FlatDepth` (`number | 'infinity'`); `flat` is removed from `UNSUPPORTED_METHODS`.
  - Emitter: new `flatMethod()` arm on `ParsedExprEmitter` — adding it makes every adapter implementor a TS compile error until handled (the same drift defence sort / reduce use).
  - Go: new `bf_flat` runtime helper (reflect-based recursive flatten; `-1` is the `Infinity` sentinel).
  - Mojo: new `bf->flat` helper (recursive ARRAY-ref flatten; same `-1` sentinel).

  Conformance fixtures (`array-flat`, `array-flat-depth`, `array-flat-infinity`) pin byte-equal output across Hono/CSR, Go, and Mojo.

- 8daf057: Lower value-returning `Array.prototype.flatMap(fn)` field projection to the template-language adapters (#1448 Tier C).

  The field-projection form of `.flatMap` now compiles on both template adapters instead of refusing with BF101. The callback is validated and extracted into a structured `FlatMapOp` at parse time (mirroring `.reduce` / `.sort`):

  - `arr.flatMap(i => i)` — self projection (equivalent to `.flat(1)`)
  - `arr.flatMap(i => i.field)` — flatten a per-item array field (the dominant real-world case, e.g. `items.flatMap(i => i.tags)`)
  - single-`return` block bodies unwrap to the returned expression

  The projected per-item value is flattened one level (`flatMap` = map + `flat(1)`); a non-array projection is kept as-is, matching JS. This composes as a loop base too — `items.flatMap(i => i.tags).map(t => <li>{t}</li>)` now lowers to a loop over the flattened array instead of refusing.

  Out-of-catalogue callbacks — array-literal / transform projections (`i => [i.a, i.b]`), deep field access (`i => i.a.b`), and the index/array callback params — stay refused with BF101 and keep `/* @client */` as the escape hatch. The JSX-returning `.flatMap` continues to lower as an `IRLoop` upstream (unchanged).

  - Parser: new `array-method` variant `flatMap` carrying a structured `FlatMapOp`; `flatMap` stays in `UNSUPPORTED_METHODS` so the degenerate / out-of-catalogue forms still refuse loudly.
  - Emitter: new `flatMapMethod()` arm on `ParsedExprEmitter` (drift defence, same as sort / reduce / flat).
  - Go: new `bf_flat_map` runtime helper (reflect-based projection + one-level flatten, reusing `getFieldValue` and `Flat`).
  - Mojo: new `bf->flat_map` helper (HASH-ref field projection + `flat(1)`).

  Conformance fixtures (`array-flatmap-field`, `array-flatmap-self`) pin byte-equal output across Hono/CSR, Go, and Mojo.

- 0a05dfc: Lower the array-literal (tuple) form of value-returning `Array.prototype.flatMap(fn)` to the template-language adapters (#1448 Tier C).

  Building on the field-projection form (#1734), the array-literal projection now compiles:

  - `arr.flatMap(i => [i.a, i.b])` — gather per-item fields into a flat list
  - `arr.flatMap(i => [i, i.tags])` — mixed self / field leaves

  Every array-literal element must be a `self` (`i`) or `field` (`i.field`) leaf. flatMap's one-level flatten removes only the array-literal wrapper, so each leaf is appended verbatim — an array-valued leaf is kept as a single element (not spread), matching JS `map(...).flat(1)`. A non-object element under a field leaf yields `undefined` / `nil`.

  Richer callbacks — elements with arithmetic / computed or deep access / calls / literals, the spread (`[...xs]`) form, and the 2-arg `flatMap(fn, thisArg)` form — stay refused with BF101 and keep `/* @client */` as the escape hatch.

  - Parser: `FlatMapOp.projection` gains a `tuple` variant (a list of `FlatMapLeaf`s); `extractFlatMapOpFromTS` classifies each array-literal element.
  - Go: new `bf_flat_map_tuple` runtime helper (variadic `(kind, name)` leaf specs).
  - Mojo: new `bf->flat_map_tuple` helper (one `[kind, key]` arrayref per leaf).

  Conformance fixture `array-flatmap-tuple` pins byte-equal output across Hono/CSR, Go, and Mojo. This completes the `.flat` / `.flatMap` Tier C row.

- 9420ef8: Lower `Array.prototype.reduceRight(fn, init)` to the template-language adapters (#1448 Tier C follow-up).

  `.reduceRight` reuses the `.reduce` arithmetic-fold catalogue (#1728) — same `ReduceOp` shapes (numeric sum / product over self or a field, string concatenation, single-`return` block bodies, literal init) — and threads a fold **direction** through to the runtime. The direction is only observable for string concatenation: a left-to-right concat of `[a, b, c]` is `abc`, while right-to-left is `cba`. Numeric sum / product are commutative, so the direction doesn't change them.

  - Parser: the existing reduce interception now also accepts `reduceRight`, preserving the method name on the `array-method` variant. Off-catalogue / no-init forms still refuse with BF101.
  - Emitter: `reduceMethod()` now receives the method name (mirroring `sortMethod()`), so adapters pick the direction.
  - Go: `bf_reduce` gains a trailing `"<direction>"` operand and folds right-to-left when it's `"right"`.
  - Mojo: `bf->reduce` takes a `direction => 'left' | 'right'` option and reverses the snapshot for `'right'`.

  Cross-adapter byte-equality (Hono/CSR, Go, Mojo) verified by a new `reduce-right-concat` conformance fixture (the concat case is the direction discriminator).

- b4a8df8: Lower `Array.prototype.reduce(fn, init)` arithmetic-fold catalogue to the template-language adapters (#1448 Tier C).

  The shapes that recur across the demo components (`playlist.reduce((s, t) => s + t.duration, 0)`, view-count / visitor sums, …) now compile on both template adapters. The accepted catalogue mirrors the `.sort` precedent (a finite, structured form rather than an arbitrary reducer body):

  - `arr.reduce((acc, x) => acc + x, 0)` — numeric sum over self
  - `arr.reduce((acc, x) => acc + x.field, 0)` — numeric sum over a struct field
  - `arr.reduce((acc, x) => acc * x.field, 1)` — numeric product
  - `arr.reduce((acc, x) => acc + x.field, '')` — string concatenation (string init flips `+` to concat)
  - single-`return` block bodies are unwrapped to the returned expression

  The accumulator must be the binary expression's left operand (`acc + x`, not `x + acc`), the per-item operand must be the item param or a single non-computed field access on it, and the init must be a number or string literal. Anything else (subtraction / division, deep field access, object-building reducers, 3- / 4-param forms, `.reduce(fn)` without an initial value) refuses with BF101 and keeps `/* @client */` as the escape hatch. `.reduceRight` stays refused entirely.

  - Parser: new `array-method` variant `reduce` with a structured `ReduceOp` (op / key / type / init) extracted at parse time; `reduce` stays in `UNSUPPORTED_METHODS` so the no-init fall-through still refuses loudly.
  - Emitter: new `reduceMethod()` arm on `ParsedExprEmitter` — adding it makes every adapter implementor a TS compile error until they handle it (the same drift defence sort uses).
  - Go: new `bf_reduce` runtime helper folding to float64 for numeric / Go string for concat.
  - Mojo: new `bf->reduce` helper folding via Perl numeric / string operators.

  Two narrow divergences from the JS / CSR path, both mirroring the `bf_sort` "auto" caveat: float stringification differs for inexact binary fractions (e.g. `0.1 + 0.2`), and numeric-_string_ keys fold numerically on the template adapters while JS `+` string-concatenates them. Genuine numbers — the common SSR case — agree across all three adapters.

  - @barefootjs/shared@0.6.1

## 0.6.0

### Patch Changes

- 35e5f73: Lower the Array / String methods at their full JS arity, instead of only a single fixed argument count (#1448).

  Previously each `array-method` lowering (`join`, `includes`, `at`, `concat`, `slice`, `reverse`, `toReversed`, `toLowerCase`, `toUpperCase`, `trim`, …) accepted exactly one argument shape; any other arity slipped past the parser and fell through to a generic emit that built with no diagnostic and only crashed at SSR render time. Now:

  - **Zero-arg defaults are supported**: `arr.join()` uses the default `,` separator, `arr.slice()` returns a full copy, `arr.at()` is `arr.at(0)`, and `arr.concat()` is a shallow copy — matching JS, no more refusal/crash.
  - **JS-ignored trailing arguments are accepted**: `str.trim(1)`, `arr.at(i, extra)`, `arr.slice(s, e, extra)`, `arr.reverse(extra)`, etc. lower the same as their base form (JS ignores the extras too).
  - **Genuinely-meaningful extra arguments that aren't lowered yet still refuse with BF101** — the `fromIndex` of `.includes` / `.indexOf` / `.lastIndexOf` and the variadic `.concat(a, b, …)` — because silently dropping them would make the SSR output _differ_ from the client (worse than a build error). The diagnostic names the specific unsupported form and does **not** push `/* @client */` (the wrong remedy for an arity issue, and it can't be applied in attribute/condition position anyway).

- 9f6b711: Lower `String.prototype.padStart(target, pad?)` / `padEnd(target, pad?)` to the template-language adapters (#1448 Tier B).

  `value.padStart(5, '0')` / `value.padEnd(5, '.')` now compile to both template adapters, padding to the target width with the pad string (default a single space) repeated and truncated to fill. This completes the String Tier B set from #1448.

  - Parser: two new `array-method` variants `padStart` / `padEnd`, dropped from `UNSUPPORTED_METHODS`. Full JS arity: the no-argument form is `padStart(0)` → the receiver unchanged (JS coerces the missing target to 0), and a third+ argument is ignored. The adapter reads only target + padString.
  - Go: new `bf_pad_start` / `bf_pad_end` runtime helpers (shared `padTo`, rune-counted).
  - Mojo: new `bf->pad_start` / `bf->pad_end` helpers (shared `_pad`, character-counted).

  Length is measured in code points (Go runes / Perl chars) so the two adapters stay byte-equal; this differs from JS's UTF-16-unit `.length` only for astral-plane receivers, which are vanishingly rare in numeric / space padding. The target is truncated toward zero, and a receiver already at least `target` long (or an empty pad) is returned unchanged — all matching JS.

- bfac066: Lower `String.prototype.repeat(n)` to the template-language adapters (#1448 Tier B).

  `value.repeat(3)` now compiles to both template adapters (the receiver concatenated `n` times).

  - Parser: new `array-method` variant `repeat`, dropped from `UNSUPPORTED_METHODS`. Full JS arity: the no-argument form is `repeat(0)` → `""` (JS coerces the missing count to 0, not a `RangeError`), and a second+ argument is ignored.
  - Go: new `bf_repeat` runtime helper (`strings.Repeat`).
  - Mojo: new `bf->repeat` helper (Perl's `x` operator).

  JS throws `RangeError` for a negative count; both adapters instead clamp a count `<= 0` to the empty string so SSR templates degrade rather than crash the render, and truncate a fractional count toward zero (matching JS's `ToIntegerOrInfinity`). Go and Perl stay byte-equal.

- f6ab725: Lower the string-pattern form of `String.prototype.replace(pattern, replacement)` to the template-language adapters (#1448 Tier B).

  `value.replace('o', '0')` now compiles to both template adapters, replacing the **first** occurrence (JS string-pattern semantics — not `.replaceAll`).

  Full JS arity: a third+ argument is ignored (the adapter reads only the pattern + replacement). The one- and zero-argument forms are refused — JS coerces the missing replacement (and pattern) to the literal string `"undefined"`, a degenerate result (mirrors the `.includes()` / `.startsWith()` zero-arg refusal).

  - Parser: new `array-method` variant `replace`, dropped from `UNSUPPORTED_METHODS`. **Regex-pattern** `.replace(/…/, …)` stays refused with BF101 (the Perl `s///` vs Go `regexp.ReplaceAllString` flavour gap is the open design question), and `.replaceAll` stays refused entirely.
  - Go: new `bf_replace` runtime helper (`strings.Replace` with n=1).
  - Mojo: new `bf->replace` helper that splices via `index`/`substr` (not `s///`) so both the pattern and the replacement are literal.

  Known divergence (documented in `bf.go`, `BarefootJS.pm`): the replacement string is treated **literally** on both template adapters — special replacement patterns (`$&`, `$1`, …) are not interpreted. Go and Perl agree (byte-equal SSR output); this differs from the Hono/CSR JS path only for replacement strings containing `$`-patterns, which are rare in template position.

- a2c1810: Lower `String.prototype.split(sep)` to the template-language adapters (#1448 Tier B).

  `value.split(',')` now compiles to both template adapters instead of refusing with BF101. It's the first string method whose result is an _array_, so it composes with the existing array-method surface — `value.split(',').join('|')`, `value.split(',').map(...)`, `value.split(',').length`.

  - Parser: new `array-method` variant `split`; `split` drops out of `UNSUPPORTED_METHODS`.
  - Go: new `bf_split` runtime helper (wraps `strings.Split`, normalised to `[]any`).
  - Mojo: new `bf->split` helper that quotemetas the separator (literal-string match, not regex) and passes Perl's `split` a `-1` limit so trailing empty fields survive — keeping output byte-equal with Go and JS.

  Full JS arity: `.split()` (no separator) returns the whole string as a single element, `.split(sep)` splits on the literal separator, and `.split(sep, limit)` caps the number of pieces (matching JS — `limit` 0 → empty, negative / `>=` length → all); a third+ argument is ignored. The regex-separator form stays refused (a regex-literal argument parses as `unsupported` and propagates to BF101 — the per-adapter regex-flavour decision is tracked for `.replace`). Verified byte-equal across Hono/CSR, Go, and Mojo.

- 9cf0a27: Lower `String.prototype.startsWith(prefix)` / `endsWith(suffix)` to the template-language adapters (#1448 Tier B).

  `value.startsWith('a')` / `value.endsWith('z')` now compile to both template adapters instead of refusing with BF101. Both return a boolean, so they slot naturally into condition position (`value.startsWith(p) ? … : …`).

  Full JS arity: the optional `position` (`startsWith`) / `endPosition` (`endsWith`) second argument re-anchors the test, clamped to `[0, length]` so it never crashes — `"hello world".startsWith("world", 6)` and `"hello world".endsWith("hello", 5)` both lower. A third+ argument is ignored. The zero-arg form (`.startsWith()`) is refused: JS coerces the missing search to the literal string `"undefined"`, a degenerate result (mirrors the `.includes()` zero-arg refusal). Verified byte-equal across Hono/CSR, Go, and Mojo.

  - Parser: two new `array-method` variants `startsWith` / `endsWith`, dropped from `UNSUPPORTED_METHODS`.
  - Go: new `bf_starts_with` / `bf_ends_with` runtime helpers (`strings.HasPrefix` / `strings.HasSuffix`, with the optional clamped position).
  - Mojo: new `bf->starts_with` / `bf->ends_with` helpers doing a `substr`-anchored literal comparison (no regex metachar surprises), with the optional clamped position and empty-prefix/suffix + undef-receiver handling matching JS and Go.
  - @barefootjs/shared@0.6.0

## 0.5.3

### Patch Changes

- Updated dependencies [d87144d]
  - @barefootjs/shared@0.5.3

## 0.5.2

### Patch Changes

- a4f818d: Rewrite the Mojolicious adapter's expression lowering to be parse-first, matching the Go adapter.

  `convertExpressionToPerl` now parses every expression once, gates it on the shared `isSupported`, and renders supported shapes through the AST emitter (`renderParsedExprToPerl`) — the same flow as the Go adapter's `convertExpressionToGo`. The per-method routing regexes, the regex string-rewriting pipeline, `convertHigherOrderExpr`, and `rewriteTemplatePrimitives` are all removed (net −229 lines). The parser's `UNSUPPORTED_METHODS` is now the single source of truth for what is refused, so no adapter-side method-name list has to be kept in sync.

  The AST emitter (`MojoTopLevelEmitter`) gains the handling the regex pipeline previously did: `props.x → $x` flattening, identifier-path templatePrimitive calls (`JSON.stringify` / `Math.floor` → `bf->json` / `bf->floor`), top-level template literals, and a BF101 refusal for the still-unsupported `.find` / `.findIndex` / `.findLast` / `.findLastIndex` Mojo gap. No behaviour change: the full Mojo unit suite and the perl-rendering conformance suite pass unchanged.

- dd2988d: Lower JS `===`/`!==` to Perl `eq`/`ne` when an operand is string-typed — a string signal getter (`sel()`) or a string prop (`props.x`), not only a string literal (#1672). Perl's numeric `==` coerces non-numeric strings to 0, so `"b" == "a"` was true and a whole-item loop conditional like `items().map(t => sel() === t.id && …)` rendered every item's true branch server-side. This unblocks the `loop-item-conditional` conformance fixture on Mojo.
- dff7704: Raise BF101 at build time for unsupported `String.prototype` methods on the template-language adapters (#1448 follow-up).

  Methods that have no SSR lowering — `split`, `startsWith`, `endsWith`, `replace`, `replaceAll`, `repeat`, `padStart`, `padEnd`, `charAt`, `charCodeAt`, `codePointAt`, `normalize`, `substring`, `substr`, `match`, `matchAll`, `search` — were previously absent from the `UNSUPPORTED_METHODS` gate, so `isSupported` reported them supported and the Go / Mojolicious adapters emitted an invalid raw method call (`{{.Name.StartsWith "a"}}` / `$name->{startsWith}('a')`) that produced no build diagnostic and only crashed at template-render time.

  They now surface BF101 with an actionable `/* @client */` suggestion (parity with the unsupported array methods), and the adapter degrades to a safe empty slot instead of emitting template that fails at render. The Mojo adapter routes these through the AST path so the shared `isSupported` gate fires rather than the regex pipeline mangling them. The `/* @client */` escape hatch continues to work for any of these expressions.

  - @barefootjs/shared@0.5.2

## 0.5.1

### Patch Changes

- 113a17c: Reactive whole-item conditionals in loops (#1665).

  `arr.map(t => cond(t) && <li/>)` (and `cond ? <li/> : null`, `expr || <li/>`,
  `expr ?? <li/>`) makes the conditional the entire loop item, so an item renders
  0-or-1 element per pass. Previously this either threw at hydration (the loop's
  children stayed empty and the whole `.map(...)` was emitted verbatim as
  reactive text — uncompiled inline JSX, undeclared module-level helpers) or, once
  compiled, crashed at runtime (`firstElementChild.cloneNode` on a null element)
  or froze at its server-rendered value.

  This is now fully reactive, with identical behaviour whether the array is a
  `const` or a `signal()`:

  - **Runtime** — new `mapArrayAnchored` tracks each item by an always-present
    `<!--bf-loop-i:KEY-->` anchor comment (not a root element, which the item may
    not have); content lives between the anchor and the next anchor / loop end and
    is derived from the live DOM range each pass. `insert()` accepts the anchor as
    its scope so a whole-item conditional toggles range-scoped to its own item.
  - **Compiler** — detect the whole-item conditional, hoist the key from the
    rendering branch, emit per-item anchors plus a `mapArrayAnchored` renderItem;
    static-array bodies route through the same path. Logical (`&&`/`||`/`??`) and
    ternary JSX-helper map bodies are inlined, and BF023 now requires a key on
    those bodies.
  - **SSR adapters** — Hono, Go, and Mojo emit the per-item `bf-loop-i:KEY` anchor
    so server-rendered lists hydrate. Hono also emits `data-key` on the
    conditional branch's loop-item root, matching Go / CSR.

  Both-branch-element ternaries (`cond ? <A/> : <B/>`) render exactly one element
  and keep their existing `mapArray` path.

- Updated dependencies [113a17c]
  - @barefootjs/shared@0.5.1

## 0.5.0

### Patch Changes

- 5cf7272: Emit `barefoot-importmap.html` for template-string adapters (#1644).

  Follow-up to #1639/#1641. The externals system writes `barefoot-externals.json`
  for every adapter, but the Go html/template and Mojolicious adapters had no
  equivalent of Hono's `BfImportMap` component, so a project configuring
  `externals` there had nowhere to inject the importmap + preloads.

  - `bf build` now emits a ready-to-include `barefoot-importmap.html` snippet
    (generated from the same manifest) alongside `barefoot-externals.json` for
    template-string adapters. Include it via `{{ template "barefoot-importmap.html" . }}`
    (Go) or `%= include 'barefoot-importmap'` (Mojolicious).
  - Add `TemplateAdapter.importMapInjection` (`'component' | 'html-snippet'`) so an
    adapter declares how it exposes the importmap. Hono is `'component'` (no
    snippet emitted); Go/Mojo are `'html-snippet'`.
  - New `renderImportMapHtml` + `ExternalsManifest` exports from `@barefootjs/jsx`
    (and a zero-dependency `@barefootjs/jsx/import-map` subpath) are the single
    source of truth for the snippet HTML. Hono's `BfImportMap` now delegates to it
    so the component and snippet paths cannot drift — the snippet inherits Hono's
    `crossorigin` modulepreload fix (#1648) and the `<`-escaped importmap JSON.
  - New cross-adapter `assertImportMapInjectionContract` in `@barefootjs/adapter-tests`
    fails if a new adapter ships without an importmap injection point, and now also
    asserts parity: the external must resolve _through_ the importmap and every
    `modulepreload` hint must carry `crossorigin`.

- c03e0d9: Fix the Mojo test renderer (`renderMojoComponent`) so a child component that destructures a rest-spread bag (`function NativeSelect({ children, ...props })`) renders instead of dying on an undeclared `$props`. `buildChildRenderers` now defaults the rest-props identifier to an empty hashref when the caller doesn't supply one, matching the production runtime's manifest-driven `isRestProps` plumbing (#1652).
- d13dc5c: Widen `.sort()` / `.toSorted()` comparator lowering with multi-key, relational-ternary, and block-body shapes (#1448 Tier B follow-up).

  The comparator parser now builds a structured `SortComparator` as a `keys: SortKey[]` list and accepts three previously-refused shapes (each lowering to both template-language adapters + the Hono/CSR JS path):

  - **Multi-key (`||`-chain)** — `(a, b) => a.x - b.x || a.y.localeCompare(b.y)` splits into one comparison key per `||` operand, applied in priority order as tie-breaks. Emits one 4-string `bf_sort` group (Go) / one `keys` hash (Mojo) per key.
  - **Relational ternary** — `(a, b) => a.f > b.f ? 1 : -1`, the 3-way `a.f < b.f ? -1 : a.f > b.f ? 1 : 0`, and the leading-tie `a.f === b.f ? 0 : …` forms lower to a new `auto` compare type: numeric when both keys parse as numbers, else lexical. Both template runtimes share this rule so their output stays byte-equal (diverges from JS `<`/`>` only for numeric strings).
  - **Single-`return` block bodies** — `(a, b) => { return a.f - b.f }` (arrow form; the function-expression form already worked) unwrap to the returned comparator.

  Runtime: Go `bf_sort` is now variadic over 4-string key groups with an `auto` branch; Mojo `bf->sort` takes an ordered `keys` list with the same `auto` rule. Function-reference comparators (`sort(myCmp)`), multi-statement block bodies, and `localeCompare(b, locale, opts)` stay refused (BF021) — deferred follow-ups.

  - @barefootjs/shared@0.5.0

## 0.4.0

### Patch Changes

- @barefootjs/shared@0.4.0

## 0.3.0

### Patch Changes

- @barefootjs/shared@0.3.0

## 0.2.0

### Minor Changes

- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/shared@0.2.0
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- 91523ba: Add .findLast(p) / .findLastIndex(p) higher-order method lowering (#1448 Tier B). Go template adapter lowers via bf_find_last / bf_find_last_index runtime helpers (equality predicates) and range-based template blocks (complex predicates). Mojo adapter refuses with BF101 (matching existing find/findIndex gap).
- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/jsx@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/jsx@0.1.1
  - @barefootjs/shared@0.1.1
