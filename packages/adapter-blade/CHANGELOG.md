# @barefootjs/blade

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

- 53e2f68: Add `@barefootjs/blade/vite`, a composed Vite plugin for PHP/Blade

  A new subpath exporting `barefoot` (named AND default, matching core's own
  `packages/vite/src/index.ts` shape, and `@barefootjs/go-template/vite`'s /
  `@barefootjs/hono/vite`'s naming, exactly):

  ```ts
  import { barefoot } from "@barefootjs/blade/vite";

  export default defineConfig({
    base: "/integrations/laravel/client/",
    build: { outDir: "dist/client" },
    plugins: barefoot({
      components: ["../shared/components", "../shared/blog"],
      templates: "dist/templates",
    }),
  });
  ```

  No `adapter` option — this constructs `BladeAdapter` itself.

  ## Turns out to be MORE mechanical than Go's, not less

  The brief asked: does writing `@barefootjs/go-template/vite` a second time
  (for a template-string adapter, not a compiled-binary one) stay mechanical,
  or does it reveal that the Go reference was Go-specific? Answer: the shape
  transcribes perfectly, but two of Go's three moving pieces turn out to be
  Go-only weight this port sheds outright, not carries over:

  - **No `afterEmit`-driven type combination at all.** Go's `postBuild`
    (`./build.ts`'s `createConfig`) has real default behavior: combine every
    file's Props-struct fragment into one `components.go`, because Go's
    per-file fragments share a `randomID` helper and a package header, and an
    unused import fails the build outright. Reading `@barefootjs/blade/
build.ts`'s `createConfig` shows it has **no default `postBuild` of its
    own** — it only forwards a caller-supplied one verbatim, because
    `BladeAdapter.generate()` never produces a `types` section (`sections.types`
    is always `''` — PHP templates have no imports/types/exports to combine).
    So `@barefootjs/blade/vite`'s `afterEmit` does nothing for `types` at all;
    there is no Go-shaped combining step to port because there is nothing to
    combine, and no compiler to please by removing an unused import.
  - **No `adapterOptions` field either.** `BladeAdapterOptions`'s only two
    fields, `clientJsBasePath`/`barefootJsPath`, are dead code once Vite
    drives the build: `BladeAdapter.generateScriptRegistrations` only falls
    back to them when `scriptAssets` is `undefined`, and core's `barefoot()`
    plugin ALWAYS passes a resolved `scriptAssets` array. Unlike Go
    (`packageName`, still real) or Hono (`clientJsFilename`, still real),
    Blade has no adapter option left with any effect — so this options
    interface omits the field rather than plumbing through something that
    would always be ignored.
  - **`assets` DOES port over, unchanged in shape.** A hand-written
    `client/router-entry.ts` (the `@barefootjs/router` blog bootstrap) still
    needs its Vite-resolved URL exposed to the PHP app, the same problem Go/
    Hono solve with the same `assets` option and companion config-capture
    plugin (`configResolved`/`configureServer` closures feeding `afterEmit`,
    since `AfterEmitContext` deliberately carries neither). The ONE real
    difference: the generated file is plain **JSON** (`dist/bf-assets.json`),
    not generated Go/TS source — PHP reads it at request time (no compile
    step), so there's nothing to commit; unlike Go's `bf_assets.go` (checked
    in, because Go must compile a static map into the binary), this file
    lives under `dist/` (already gitignored) and is regenerated fresh on
    every build, dev or production.

  ## Two more things a real migration surfaced that unit tests didn't

  Writing `vite.ts` and its unit tests was mechanical and green on the first
  try. Actually running `vite build` against `integrations/laravel`'s real
  `vite.config.ts` found two more things, neither caught by `vite.test.ts`'s
  mocked/fixture-scale builds:

  1. **`expr/emitters.ts`'s TS constructor-parameter-property syntax breaks
     `vite build`, not `bun test`.** Vite's own config loader
     (`bundleConfigFile`) marks every BARE (non-relative) import as
     `external`, so `import { barefoot } from '@barefootjs/blade/vite'` in
     `vite.config.ts` ends up loaded by Node's OWN native TypeScript
     type-stripping (default-on since Node 22.18/23.6), not esbuild — and
     Node's strip-only mode does not support parameter properties
     (`SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]`), only plain
     annotations. `go-template`'s and `hono`'s adapter code happen not to use
     this syntax anywhere reachable from their own `vite.ts`, so this was
     invisible until Blade's (and — same fix applied — Jinja's/ERB's)
     `expr/emitters.ts`, which does, was loaded the same way. Fixed by
     rewriting the two affected constructors (`BladeFilterEmitter`,
     `BladeTopLevelEmitter`) as plain field declarations + explicit
     assignment — behaviorally identical, Node-native-TS-safe.
  2. **`ssrDefaults` needs a runtime-read manifest for Blade the way Go/Hono
     never did.** Go bakes `ssrDefaults` directly into each component's
     generated `NewXxxProps` constructor; Hono's self-contained `.tsx` file
     inlines them as JS defaults. Blade has neither — `stash_from_ssr_
defaults`-equivalent PHP reads them from a JSON side-channel at request
     time. The legacy CLI wrote ONE combined `dist/templates/manifest.json`;
     `@barefootjs/vite`'s core plugin only wrote one `<Name>.ssr-
defaults.json` per component. First pass here closed the gap on the
     READ side (`ExampleApp::manifest()` glob-and-reassembling the per-
     component files) — review correctly pushed back: that's seven copies of
     identical reconstruction logic across three languages for a build
     ARTIFACT the pipeline used to just hand over. Fixed in core instead
     (see the `@barefootjs/vite` changeset in this same PR): `manifest.json`
     is now written alongside the per-component files, matching the legacy
     shape exactly. `ExampleApp::manifest()` is back to a single
     `json_decode` of that one file — byte-for-byte the pre-migration code.

  ## Conclusion for the design brief's question

  `@barefootjs/go-template/vite`'s SHAPE (adapter construction + optional
  `afterEmit` + optional `assets`) generalizes cleanly — nothing in it needed
  bending to fit Blade. But its CONTENT is more Go-specific than the shape:
  the type-combination machinery and the `adapterOptions` passthrough are
  both artifacts of Go being a compiled language with real adapter-side
  runtime configuration, not general template-adapter needs. A template
  adapter with no compile step and no adapter-side runtime configuration
  (Blade, and — per the same reasoning — Jinja2 and ERB) needs
  STRICTLY LESS than Go's reference, not an equal amount reshaped.

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

- 0d3ffaf: Fix a loop-scope resolution bug found by the #2482 audit. `elementAttrEmitter.emitSpread`'s local-const fallback resolved a bare spread identifier against `localConstants` with no loop-shadow check, so a `.map()` row like `<p {...attrs} />` spread the OUTER `const attrs = ...` instead of the per-row value. The fallback now consults the live `loopBoundNames` map and skips local-const resolution for a name currently bound by an enclosing loop, mirroring the Mojolicious adapter's existing guard (#2489).
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

- @barefootjs/shared@0.30.5

## 0.30.4

### Patch Changes

- 0e22502: Fix a `.map()` callback param that shares a boolean-typed or nullable-optional prop's name being misclassified in attribute position: the row's string value was routed through the boolean/nullable-optional lowering (rendering "true"/"false", or gaining a spurious null guard) instead of the row's own value. The five Twig-family adapters (twig, jinja, blade, xslate, rust/minijinja) gain a position-accurate, ref-counted `loopBoundNames` map — ported from the ERB/Mojolicious adapters, which already had the map but were missing the guard at these two call sites. All seven adapters now check loop-bound position before routing through the boolean/nullable-optional lowering (#2488).
  - @barefootjs/shared@0.30.4

## 0.30.2

### Patch Changes

- @barefootjs/shared@0.30.2

## 0.30.1

### Patch Changes

- ea054b9: Declare the render divergences found by probing the #2482 loop-scope audit's unguarded name-resolution sites: the Twig-family boolean-prop misroute for loop params (#2488) and the `emitSpread` local-const shadow (#2489); ERB's symbol-vs-string dynamic row-key lookup (#2491); and Go's condition-position destructured bindings (#2486), nested-loop `inLoop` clobber (#2487), row-spread attribute-name mangling (#2490), dynamic row-key lookup (#2491), and JS-computed initializer seeding (#2492). Each entry carries its issue URL and graduates when the fix lands.
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

- @barefootjs/shared@0.21.1

## 0.21.0

### Patch Changes

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

  - @barefootjs/shared@0.19.0

## 0.18.7

### Patch Changes

- 2243ad8: Fix #2221: every Twig-family adapter's `_resolveLiteralConst` (Mojolicious: `resolveLiteralConst`) is a flat name lookup against `ir.metadata.localConstants` with no notion of AST scope — it inlined an outer same-file const's literal value even at an occurrence that is actually an enclosing `.map()`/`.filter()` loop callback's own (shadowing) parameter of the same name, so every iteration rendered the same hard-coded literal instead of the per-item value. Twig, Jinja, Blade, Xslate, and Rust (minijinja) are guarded with the same coarse `collectLoopBoundNames` exclusion #2212 already established for `collectStringValueNames`: a name any loop binds anywhere in the component never inlines, falling back to the bare identifier — coarse (a genuinely non-shadowed same-named const elsewhere in the component also stops inlining) but safe.

  Mojolicious's own `resolveLiteralConst` / `resolveStaticRecordLiteral` were already immune — they consult a _live_, ref-counted `loopBoundNames` map that `renderLoop` populates/depopulates as it descends/ascends into each loop body (#1749), which is scope-precise rather than coarse, so no change was needed there. The actual gap found in that adapter was a sibling call site: `emitSpread`'s bare-identifier local-const resolution (`{...attrs}` forwarding a function-scope conditional-object const's hashref, #checkbox/icon) read `localConstants` directly with no loop-shadowing guard at all. Fixed with the same `loopBoundNames` guard as its neighboring call sites.

  Not fixed here (reported, tracked separately): a `key={name}` (or any bare-identifier JSX attribute value) shadowed by an enclosing loop param of the same name is folded to the OUTER const's literal at IR-generation time (`tryResolveIdentifierAsTemplateLiteral` → `findLocalConst` in `packages/jsx/src/jsx-to-ir.ts`), before any adapter runs — this affects every adapter, including Hono's native JSX re-emission, and needs a shared-compiler fix rather than a per-adapter guard. The Go template adapter has its own independent instance of this issue's bug class in `convertExpressionToGo`'s bare-identifier fast path (`packages/adapter-go-template/src/adapter/go-template-adapter.ts`), which lacks the loop-shadowing guards its sibling `resolveModuleStringConst`/`resolveModuleNumericConst` already have. The Twig-family's `_resolveStaticRecordLiteral` / `lookupStaticRecordLiteral` (module-scope object-literal consts, e.g. `variantClasses.ghost`) have the identical unguarded flat-lookup hazard when the object name itself is loop-bound (confirmed reproducible on Twig). None of these are fixed in this patch.

- dfbd8de: Fix #2237: every Twig-family adapter's `_resolveStaticRecordLiteral` (`IDENT.key` lookup on a module-scope object-literal const, e.g. `variantClasses.ghost` — #1896/#1897) is a flat name lookup on `objectName` against `ir.metadata.localConstants` with no notion of AST scope — the record-literal sibling of #2221's `_resolveLiteralConst` bug. It inlined an outer same-file const's member value even at an occurrence that is actually an enclosing `.map()`/`.filter()` loop callback's own (shadowing) parameter of the same name, so every iteration rendered the same hard-coded literal instead of the per-item value. Twig, Jinja, Blade, Xslate, and Rust (minijinja) are guarded with the same coarse `staticLoopSourceBoundNames` exclusion #2221 already established for `_resolveLiteralConst`: an object name any loop binds anywhere in the component never inlines its member lookups, falling back to the bare member expression — coarse (a genuinely non-shadowed same-named const elsewhere in the component also stops inlining) but safe.

  Mojolicious's `resolveStaticRecordLiteral` was already immune — flagged as such in the #2221 sweep and confirmed here with a compile repro plus a regression pin (no code change needed): it consults the same _live_, ref-counted `loopBoundNames` map that `resolveLiteralConst` and `renderLoop` already use (#1749), which is scope-precise rather than coarse, so a name loop-bound only inside one loop still inlines its member lookup correctly outside it.

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

- 17dfdf8: New PHP backend adapter targeting Laravel Blade. `BladeAdapter` ports the Twig adapter's IR lowering to Blade syntax (`{!! e(…) !!}` / `@if` / `@elseif` / `@foreach`), and the package bundles a PHP runtime backend (`packages/adapter-blade/php/`) built on `illuminate/view` standalone (Filesystem + Dispatcher + EngineResolver/BladeCompiler + FileViewFinder + Factory) — a `BladeBackend` implementing the engine backend contract (`encode_json`, `mark_raw`, `materialize`, `render_named`, `ident`) on top of the shared engine-agnostic runtime (`@barefootjs/php`). Templates call the same snake_case `bf.<helper>` surface as the other PHP/Perl/Python adapters, with `bf.truthy` / `bf.eq` / `bf.neq` covering JS-vs-PHP semantic divergences (PHP truthiness, and PHP's `==`/`===` not matching JS strict equality).

### Patch Changes

- @barefootjs/shared@0.18.0
