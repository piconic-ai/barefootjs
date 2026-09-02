# @barefootjs/client

## 0.33.4

### Patch Changes

- @barefootjs/shared@0.33.4

## 0.33.3

### Patch Changes

- be0b2c6: Stop an unguarded `{props.children}` from rendering the literal text
  `undefined` on a pure-CSR mount when the caller passes no children.
  
  The client template emitted `children` as a bare `${_p.children}` splice, and a
  caller that passes no children leaves the key absent from the props object
  entirely — so the splice stringified `undefined` into the DOM. SSR and
  SSR+hydration both rendered an empty body, which broke the three-way contract on
  the SSR-equals-CSR-mount leg, and only there: an SSR-first check could not see
  it. The shape is ordinary component code, and seventeen fixtures in the corpus
  (kbd, dialog, tooltip, select, tabs, popover, combobox, …) were emitting it.
  
  The new `markupOrEmpty` runtime helper does exactly one thing: a nullish value
  becomes the empty string, every other value passes through completely
  unescaped. It is deliberately not `escapeTextOrMarkup`, which its sibling props
  use — that helper only lets a value through unescaped when it carries the
  `bfMarkup()` brand, and a children payload never does, since
  `materializeComponent` joins children into a plain HTML string before the
  template lambda runs. Routing children through it would HTML-escape real markup
  into visible `&lt;span&gt;` text on every call that actually has children. The
  guard matches how the other two families already render the same source: Hono's
  JSX runtime renders `undefined` as nothing, and the DSL adapters route through
  `bf.string(children)`.
  
  On the compiler side the decision lives in one place. `bareSpliceExpr` is the
  single door for the no-`slotId` splice — the counterpart to `escapeTextSlotExpr`
  for the branch that must not escape — and all four `case 'expression'` template
  builders call it rather than each carrying its own copy.
  
  The fixture corpus had been routing around this rather than pinning it:
  `jsx-element-prop-no-children` and `component-with-jsx-children` both guarded
  their source with `?? ''`, which is why no conformance layer reported it. Both
  guards are dropped and a dedicated fixture with the unguarded source is added.
- da77d25: Collapse the row-key attribute (`data-key` / `data-key-N`) onto one IR-resolved field, `IRElement.keyAttr`, fixing #2753's two measured shapes: the client runtime stamping a positional-index `data-key` onto an unkeyed loop's rows that SSR never emits (Shape A), and the client stamping a second, plain `data-key` alongside SSR's depth-suffixed `data-key-N` on a nested loop's rows (Shape B).
  
  `IRElement.keyAttr` replaces the `carriesDataKey` boolean (#2732/#2744) and is now the single decision every adapter and the client runtime reads, resolved once in `jsx-to-ir.ts`:
  
  - Mechanism 1 (`applyLoopKeyAttr`): an element directly inside a `.map()` this component compiles inline gets `{ name: keyAttrName(loop.depth), value: <the key expression> }` — absent entirely for an unkeyed loop.
  - Mechanism 2 (`resolveRootKeyAttr` + the existing `markDataKeyCarrier`): one of this component's own possible render roots (a plain element/if-statement-branch root, or a `needsScopeComment` fragment's first eligible element) gets `{ name: 'data-key' }` (no local value) to relay a key its OWN caller supplies at runtime.
  
  All 9 SSR adapters now emit from `element.keyAttr` alone. Deleted per-adapter duplication this replaces: Hono's `loopKeyStack` (a mutated stack of loop keys) and its parallel `carriesDataKey`/`__dataKey` branch; every one of the other 8 adapters' `currentLoopKeyDepth` field (Go template: `loopKeyDepthStack`) and their `attr.name === 'key'` rewrite in `renderAttributes`; and the `rootScopeNodes`/`collectRootScopeNodes` duplication (byte-identical across 8 `lib/ir-scope.ts` copies) that fed each adapter's own `carriesDataKey` gate — that walk now lives once, in `jsx-to-ir.ts`'s `resolveRootKeyAttr`.
  
  On the client runtime side (`map-array.ts`, `map-array-lazy.ts`, `component.ts`), every `data-key` stamp is now gated on the loop actually being keyed (`getKey` non-null) and reads/writes the SAME compiler-resolved attribute NAME (a new `keyAttrName` parameter, defaulting to `'data-key'` so every depth-0 call site is unchanged) instead of a hardcoded `BF_KEY`. An unkeyed loop's rows are never touched at all — `mapArray` keeps positional identity in its own `scopes` Map. The stale hydration-detection check this replaced (`!existingRanges[0]?.primaryEl.hasAttribute('data-key') || scopes.size === 0`) was already vacuous (`scopes` is always empty the one time that line runs); the new signal is simply `existingRanges.length > 0`.
- d886f4e: Stop the child-component reactive-prop mirror from turning a `ref` into a DOM
  attribute, and give a top-level root-is-a-child-call component a scope id to
  thread into its nested `renderChild`.
  
  Both are cases where the correct answer already existed elsewhere in the
  pipeline and one path did not consult it.
  
  **`ref` on a child-component call site (#2749).** `collectReactiveChildProps`
  (`ir-to-client-js/collect-elements.ts`) decided "is this prop a DOM attribute?"
  with a hand-rolled `on[A-Z]` test and no `ref` case, so a reactive `ref` prop
  fell through to the generic dynamic-prop mirror and the emitted `init` ran
  `__scope.setAttribute('ref', String(__v))` — the callback's SOURCE TEXT as an
  attribute value. SSR never emits a `ref` attribute, so only the hydrate leg
  grew one and the SSR-vs-hydrated snapshot diverged. The same prop was always
  passed correctly to `initChild` as `get ref() { … }`; the runtime child then
  routes it through `applyRestAttrs`, which reads `classifyDOMProp` — documented
  as "the single source of truth for how should this prop reach the DOM" — gets
  `kind: 'ref'` back, and invokes the callback. The mirror now reads that same
  classifier and takes the same three exclusions (`ref` / `event` / `skip`) that
  `applyRestAttrs` takes, so the two sides can no longer disagree. With the
  attribute leak gone the callback runs; what a `ref` still cannot do is run
  during SSR at all, which is the separate capability gap tracked in #2714.
  
  **Top-level root-is-a-child-call scope (#2757).** `materializeComponent`
  (`client/runtime/component.ts`) threaded `_parentScopeId` from its own
  `scopeId`, or from `slot.parent`. A `comment: true` / `fragmentRoot: false`
  wrapper has neither at a top-level mount: `scopeId` is null by design (the
  parsed firstChild is the child's own already-scoped element, so stamping over
  it would break the wrapper's own `$c` lookups) and a top-level
  `createComponent(name, {})` is passed no slot. `renderChild` therefore fell
  through to its "no parent known" fallback and named the child after ITSELF
  (`Row_xyz_s2` where SSR and hydration both produce `Wrapper_xyz_s2`), with no
  `bf-h`/`bf-m` pair. It now derives a scope id for threading only — the same
  split #2722 made for a genuine fragment root, which keeps a non-null `scopeId`
  purely so this threading works and skips only the attribute write. Guarded on
  there being no ambient scope, so a wrapper materialized during an outer
  template eval still inherits that caller's scope. A hoisted-children
  `bf-s="__BF_PARENT_SCOPE__"` placeholder under such a wrapper now resolves to
  that derived scope instead of stripping, which is what the Hono reference
  already emitted for the same source.
- Updated dependencies [da77d25]
  - @barefootjs/shared@0.33.3

## 0.33.2

### Patch Changes

- 07fc28a: Fix #2722: a pure CSR mount (`createComponent()`, no SSR) of a fragment-rooted client component (`return <>...</>`) lost its own scope identity. `materializeComponent` treated every `comment: true` definition as the #2649 "root is a single child component call" shape — where the parsed markup already carries the child's own `bf-s` and the wrapper must leave its `scopeId` null — but a genuine fragment root's markup carries no scope id anywhere (SSR moves it onto a wrapping `<!--bf-scope:-->` comment pair instead). Forcing `scopeId` to null for this shape too skipped threading it into `_parentScopeId`, so every nested `renderChild()` call fell back to a random, un-prefixed scope id instead of the parent-derived one SSR/hydrate use — visible as a CSR-mounted root missing `bf-s` entirely, and (once nested children are involved) as a scope-name mismatch against the hydrated leg (e.g. `Select_*` instead of the expected `SelectBasicDemo_*_sN`).
  
  Fixed with a new `ComponentDef.fragmentRoot` flag — set by the compiler (`emit-registration.ts`) exactly when a component's root is a genuine fragment (`ir.root.type === 'fragment'`), never for the root-is-a-child-call shape — that lets `materializeComponent` generate its own scope id and its own `<!--bf-scope:-->` boundary comments for a CSR mount, mirroring `wrapWithScopeComment`'s SSR shape instead of leaving both null. `createComponent()`'s return type widens to `HTMLElement | DocumentFragment`: the one case with no known mount target (a bare top-level call, no placeholder or loop-row position) has no single element to hand back once boundary comments are involved, so it returns a `DocumentFragment` bundling the comments with the element — a plain `container.appendChild(result)` moves both as a unit.
- 2359eb0: Fix #2721: hydrating a fragment-rooted client component (`return <>...</>`) read its own props as `{}` regardless of what SSR actually serialized. `hydrateCommentScope` (runtime/hydrate.ts) unwrapped the comment's JSON with `parsed[name] ?? {}`, assuming a `{ [componentName]: props }` shape that no emitter produces — `wrapWithScopeComment` (adapter-hono) always writes the scope's own props flat, exactly like `bf-p` does for an element-scoped root. The bug was invisible whenever a fragment root had no props to serialize (`{}` was already correct by luck), which is why it survived until the mutation sweep exercised a fragment-wrapped component whose props actually mattered — e.g. a `toggleItems` array silently becoming `[]` at hydration, which then made `mapArray`'s "client has fewer items than SSR rendered" cleanup delete every SSR-rendered row.
  
  Fixed by reading the parsed JSON directly, matching `hydrateElementScope`'s equivalent `bf-p` read.
- 3d29f51: Fix #2733: `mapArray`'s per-row bookkeeping (`ItemScope`) had nowhere to carry a fragment-rooted component's own `<!--bf-scope:ID-->` / `<!--bf-/scope:ID-->` boundary comments when that component was used as a keyed loop row — `extras` is typed `HTMLElement[]`, and the pair is a different, orthogonal concept from the `<!--bf-loop-i-->` marker `startMarker` already tracks (that one belongs to a multi-root loop BODY; this one belongs to the row's own child-component scope identity). `insertScope` (reorder) and `removeScope` (removal) walked only `startMarker → primaryEl → extras`, so either operation left the row's comments behind — orphaning `commentScopeRegistry`'s entry for that row, since its stored comment's sibling range no longer contained the element.
  
  Fixed by adding `ItemScope.scopeComments`, populated on hydration by teaching `findItemRanges` to recognize a `bf-scope:`/`bf-/scope:` pair bracketing a row's element (paired by scope id, and deliberately NOT requiring a root-shaped comment: `hydrateCommentScope` skips `|h=` comments because at the top level they mean "a parent owns this scope", but `findItemRanges` walks between a loop's own markers where every row IS a child — real SSR emits `|h=` on every row, so requiring a root shape matched nothing a server produces), and on CSR by having `createComponent`'s `rowMount` branch (component.ts) stash the pair on the connecting element via a `__bfScopeComments` property — the same stash-and-delete convention `__bfExtras` already uses for a multi-root loop body's extra siblings. `insertScope`/`removeScope` now move/remove the pair as part of the row's atomic unit, and the LIS-based reorder's insertion point prefers `scopeComments.start` over a bare `primaryEl` so a moved run can't land between a stationary fragment-root row's own boundary comment and its element.
  
  A fragment-rooted component whose OWN render has 2+ top-level nodes, used as a loop row, remains a declared (warned) gap — connecting those extra roots is a separate problem from the boundary-comment tracking this fixes, and no fixture reaches it yet.
- e672ae0: Fix #2735: a pure CSR mount (`createComponent()`, no SSR) of a genuine multi-root fragment component (`return <>...</>` with two or more top-level siblings) silently dropped every root but the first. `materializeComponent` kept only `parseHTML(html.trim()).firstChild` — the fragment template concatenates all of its top-level children into one HTML string, so every sibling after the first was parsed and immediately discarded, taking with it whatever reactive slots and event handlers lived on those roots. SSR rendered every root; a CSR mount rendered one.
  
  Fixed by keeping the whole ordered list of top-level nodes the parsed template produced — **not only elements**: bare text between two element roots is itself a root, and a reactive text slot sitting there renders as a `<!--bf:sN-->` marker whose loss leaves the runtime's slot lookup with nothing to bind. The list is gated on the same `fragmentRoot` flag #2722 added, since that is the only shape whose template ever emits more than one top-level node. Both connect shapes that own their destination now insert the whole list: a `mountAt` replacement replaces with every root, and the bare (no placeholder, no loop-row position) `DocumentFragment` return bundles every root between its boundary comments — mirroring `wrapWithScopeComment`'s SSR shape, which already wraps the whole multi-root body in one comment pair.
  
  Also fixes an adjacent crash on the same path: the proxy element threaded through init is now the first **element** among the roots rather than simply the first node, so a fragment whose template starts with text (`<>text<p/></>`) no longer throws `element.hasAttribute is not a function`. A fragment root that renders no element at all is now refused with a warning instead of crashing.
  
  A fragment-root component used as a keyed loop row remains as previously declared (#2733) — no fixture reaches that combination yet — but that path now warns when it drops roots instead of dropping them silently.
- f8f902a: Fix `renderChild`'s attribute splicing corrupting hyphenated tag names. The first tag's name was matched with `\w+`, which stops at a hyphen, so the scope and `data-key` attributes were spliced into the MIDDLE of a custom element's name — `<my-widget>` became `<my data-key="1"-widget>`, which the parser then drops entirely, removing the element from the DOM.
  
  Reachable from ordinary source: a fragment-rooted child component whose root is a custom element, used as a keyed `.map()` row, goes through this splice. SSR places the same attributes as a compiler-emitted JSX spread and was always correct, so the two legs diverged with no diagnostic.
  
  The tag-name class is now `[a-zA-Z][^\s/>]*`, shared as `FIRST_TAG_PATTERN` / `TAG_HEAD_PATTERN` across every splice site in `renderChild` rather than repeated inline — the leading-letter anchor keeps the existing behaviour of skipping past a template's opening comment markers (`<!--bf-cond-start:...-->`) to the first real element.
- @barefootjs/shared@0.33.2

## 0.33.1

### Patch Changes

- 3336997: Fix #2649: a third level of stateless composition (grandchild) used to reuse its parent's `bf-s` scope id instead of deriving its own, silently colliding with the parent's scope on CSR (`test_s0` reused instead of `test_s0_s0`, diverging from the SSR reference — #2444 had already fixed the sibling case). `renderChild` now pushes `_parentScopeId` to a child's own derived scope while that child's template evaluates, so a grandchild's scope is derived from the child, not the grandparent.
  
  That push alone reopens a different bug for a `comment: true` synthesized wrapper (e.g. `<Flow renderNode={(n) => <Body id={n.id} />}>`, #1211): the wrapper's element IS its single real child's element, and its init used to resolve that child through `$c(scope, 's0')`'s self-match fallback — once the child's own first grandchild also derives a `bf-s` ending in the same slot suffix, the precise `$c` search matches the grandchild instead of falling through to self-match, silently misrouting `initChild` onto the wrong element (an early attempt at this fix broke `site/ui`'s xyflow Highlight-Depth demo). Fixed at its source: a `comment: true` component's own root-level child needs no `$c` lookup at all — it already IS `__scope`, and the client-JS codegen (`ClientJsContext.commentScopeRootSlotId`) now references `__scope` directly instead of re-deriving it through `$c`.
  
  `grandchild-composition` graduates out of the CSR conformance skip set.
- 9e78064: Fix #2705: a keyed inner `.map()` living inside a loop-row `&&`-conditional whose branch content sits behind an intervening wrapper element (e.g. `<article>{cond && items.map(...)}</article>`) used to search for its own loop markers against the WHOLE conditional's bind scope instead of the wrapper — `collectInnerLoops` never assigns the loop a `containerSlotId` in this shape, because the wrapper sits outside the branch's own IR subtree and the collector's slot-tracking walk never observes it. `mapArray`'s marker lookup only scans a container's direct children, so it silently misdetected the wrapper itself as the first item (stamping the wrong `data-key`) and appended any further items as siblings OUTSIDE the wrapper. Reproduced on the very first hydration pass.
  
  `buildBranchInnerLoopsPlan` now falls back to a new runtime helper, `findCondContainer(scopeVar, condSlotId)` (`@barefootjs/client/runtime`), which resolves the conditional's own `<!--bf-cond-start:id-->` marker and returns its parent element — the one DOM anchor guaranteed to sit inside the real wrapper regardless of adoption vs. fresh-splice.
- @barefootjs/shared@0.33.1

## 0.33.0

### Patch Changes

- @barefootjs/shared@0.33.0

## 0.32.0

### Patch Changes

- @barefootjs/shared@0.32.0

## 0.31.10

### Patch Changes

- @barefootjs/shared@0.31.10

## 0.31.9

### Patch Changes

- a4ef805: Fixed a JSX element passed at a non-`children` component prop position (e.g. `<Card header={<strong>Title</strong>}>`) rendering as HTML-escaped text on the client (`&lt;strong&gt;`) instead of the intended markup. The compiler now carries the assembled HTML through a runtime-checked brand from every producer emission (`renderChild` / `initChild` props) to the two consuming escape functions, so the receiving component's claim-plan `'markup'` slot renders it raw at both initial paint and reactive re-render, matching server-rendered output. Plain string props, and JSX passed via the `children` position, are unaffected.
- 2c16d6b: MathML-rooted `mapArray` / conditional-branch bodies now clone in the MathML namespace, porting the existing SVG synthetic-wrap fix (`<math>...</math>` instead of `<svg>...</svg>`) to MathML root tags (`mrow`, `mfrac`, `msup`, `msub`, `mn`, `mi`, `mtable`, ...). Previously a `.map()` or ternary body rooted at a MathML tag cloned as an `HTMLUnknownElement` in the xhtml namespace and rendered nothing. The runtime's `parseHTML` gained the matching MathML wrap for dynamically-inserted markup whose parent lives in the MathML namespace.
  - @barefootjs/shared@0.31.9

## 0.31.8

### Patch Changes

- @barefootjs/shared@0.31.8

## 0.31.7

### Patch Changes

- @barefootjs/shared@0.31.7

## 0.31.6

### Patch Changes

- @barefootjs/shared@0.31.6

## 0.31.5

### Patch Changes

- @barefootjs/shared@0.31.5

## 0.31.4

### Patch Changes

- @barefootjs/shared@0.31.4

## 0.31.3

### Patch Changes

- @barefootjs/shared@0.31.3

## 0.31.2

### Patch Changes

- @barefootjs/shared@0.31.2

## 0.31.1

### Patch Changes

- @barefootjs/shared@0.31.1

## 0.31.0

### Minor Changes

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

- ad323bd: Stop the file-scoped registry key from leaking into CSR `bf-s` scope IDs

  Under CSR a non-exported component rendered `bf-s="ToggleItem__be083511_jepihw"`
  — a doubled underscore and an 8-hex segment ahead of the usual random suffix —
  where the eighteen SSR integrations render the documented `ToggleItem_abc123`.

  The hash is deliberate and stays: `nameForRegistryRef` rewrites the registry
  key of a **non-exported** component to `Name__<8hex>` so two files each
  defining a private component of the same name can't overwrite each other in
  the one global registry. That key is an internal disambiguator. `bf-s` is a
  documented contract that `integrations/shared/e2e/toggle.spec.ts` asserts, so
  CSR was the side in the wrong.

  Root cause was one line in `hydrate()`:

  ```ts
  def.name = name; // name is the registry KEY
  ```

  `ComponentDef.name` exists for exactly this — its docstring reads "Used for
  scope ID generation" — but `hydrate()` overwrote it with the key. The line
  predates file-scoping, when the key and the display name were always the same
  string. It is now `def.name ??= name`, keeping the minification fallback while
  respecting a compiler-supplied name.

  Alongside it: the two runtime sites that built scope IDs straight from the key
  (`renderChild`, `createComponent`) now read `def.name`, and the compiler emits
  `name: '<plain>'` on the def whenever it file-scopes the key.

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

- @barefootjs/shared@0.30.6

## 0.30.5

### Patch Changes

- @barefootjs/shared@0.30.5

## 0.30.4

### Patch Changes

- @barefootjs/shared@0.30.4

## 0.30.2

### Patch Changes

- @barefootjs/shared@0.30.2

## 0.30.1

### Patch Changes

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

  - @barefootjs/shared@0.30.0

## 0.29.0

### Patch Changes

- e3b3efd: Keep a multi-root item's extras reachable when its primary is already attached

  `itemRootElements` (`qsa-item.ts`) yields an item's roots in three steps: the
  primary, then its siblings up to a loop-boundary comment, then the CSR-only
  `__bfExtras` stash holding extras that are not siblings yet. Step 2 ended with
  `return`, which ends the generator — so hitting a boundary skipped step 3
  entirely.

  That was invisible in every shipped path. Nothing attaches a row before its
  `renderItem` body runs, and with a detached primary `nextSibling` is `null`:
  the walk never executes and control reaches the stash regardless. Attach the
  primary first and the very first sibling is a boundary comment, the generator
  ends, and `upsertChildItem` reports the item's child placeholders as missing —
  leaving them unreplaced in the DOM.

  `break` bounds the sibling walk without ending the generator. The boundary's
  purpose is preserved: the walk still stops there, and the only thing consulted
  afterwards is the item's own stash, which `mapArray` deletes once the body has
  returned (`map-array.ts`), so no element is ever yielded twice.

  This ships on its own as a no-op: with nothing attaching rows early, the `break`
  is never reached before the stash would have been read anyway. It is a
  prerequisite for the connect-before-init work on rows whose root is a template
  clone — a child inside such a row runs `init` against a detached element, and
  `useContext` resolves by walking `parentElement`, so it falls through to the
  global last-writer-wins store and reads another provider's value. Fixing that
  means attaching the row before the body's tail, which is exactly the case this
  `return` broke.

  Worth recording because the previous comment here explained the detachment
  dependency as the sibling walk "running past the item's own roots into a
  neighbouring item's elements". That is not what happened: the walk stopped
  correctly at the boundary and then gave up before the stash. The failure was
  measured, not deduced, and the comment is corrected to match.

- d87c070: Connect a composite loop row before its children initialise

  A loop row whose root is user markup (`items.map(it => <li><Chip/></li>)`) is a
  template clone written inline in the emitted body, so no runtime function sits
  between "make a row" and "the element exists" and there was nothing to hand a
  destination to. `mapArray` first saw the element as `renderItem`'s return
  value — after `upsertChild` had already run the row's children's `init`
  against a detached element.

  `useContext` resolves by walking `parentElement`. A detached element has no
  ancestors to walk, so the lookup fell through to the global, last-writer-wins
  context store and returned whichever provider on the page wrote last. No error,
  no warning — a plausible wrong value. With one provider of a context on the
  page it is invisible, because the global holds the same value; put two on one
  page and rows in the first list start reading the second's.

  Measured, with providers `A` and `B` and a row in `A`'s list: the child read
  `B`. With the row connected first it reads `A`.

  The compiler now emits `mountRowRoot(clone)`, which consumes the same ambient
  mount point `createComponent` row roots already use (#2431), for the one loop
  variant that initialises anything inside the row — composite, i.e. nested
  components and/or inner loops. A plain row has no nested `init`, so it has
  nothing that could resolve wrongly and is left alone; the high-volume
  `mapArrayLazy` emission is untouched.

  Four things attaching a row earlier could have broken, all checked:

  - **The reorder.** A fresh row is mounted at the end of the loop range and the
    LIS walk moves it to its final position. Front-insert, reorder, append and
    removal all reconcile to the right order.
  - **Multi-root rows.** A Fragment row is a clone, so it takes this path, and
    `qsa-item.ts`'s lookup used to give up on an attached primary before reading
    the extras stash. That is fixed separately; here the primary mounts, the
    children init connected, and each primary still travels with its own extras
    through a reorder.
  - **Cross-row lookups.** Rows are attached while later rows are still being
    built, so a lookup that escaped its own row would now land in a real
    neighbour. Each row gets exactly its own child.
  - **A body that throws after mounting.** This one did regress, and is fixed: a
    detached row could never be left on screen, but a mounted one can, so the
    mount is recorded on the mount point and undone before the error propagates.

  Left alone deliberately: `createItemScope` still un-parks a row that turns out
  to carry extras. By then the mount has already done its job — the tail ran
  connected — and un-parking keeps the reorder from marking a row stationary
  before its extras and per-item marker exist.

  No SSR output change: the hydration branch adopts a row that came from server
  markup and is in the document by construction, so it never mounts. This is also
  why the change has no CSR-conformance fixture — that layer evaluates the
  `template:` lambda and compares HTML, and neither the template nor the HTML
  moves here. The behaviour lives in the renderItem body, so the coverage does
  too, in `packages/client/__tests__/runtime/`.

  - @barefootjs/shared@0.29.0

## 0.28.1

### Patch Changes

- @barefootjs/shared@0.28.1

## 0.28.0

### Minor Changes

- fe474a0: Connect a CSR-materialised child component before running its `init`, so
  context resolves by DOM position.

  **This changes when `init` runs relative to DOM insertion.** `createComponent`
  built the element with `parseHTML(...).firstChild` and called `initFn` on it
  while it was still detached; every caller then attached it afterwards
  (`ph.replaceWith(comp)`). So a component's own `init` observed an element with
  no parent chain.

  `useContext` resolves providers by walking `parentElement` from the current
  scope. From a detached element that walk finds nothing and falls through to
  the module-global fallback store in `runtime/context.ts` — and that store is
  **last-writer-wins across every provider of the same context on the page**.
  With one provider the fallback happens to return the right value, which is why
  this stayed hidden.

  The divergence shows up when a child is materialised _after_ a sibling provider
  has run. During a plain hydration pass the doc-order walker inits each provider
  immediately before creating its own children, so the global still holds that
  provider's value. But a child created later — by an interaction — reads whatever
  provider hydrated last:

  ```
  <Host value="ONE">   ← child added here, later
  <Host value="TWO">   ← this one wrote the global last
  ```

  the new child under `ONE` received `"TWO"`.

  `createComponent` now takes a `mountAt` argument — the placeholder it replaces —
  and performs that replacement _before_ `init`, so `useContext` resolves by
  position and layout reads (`offsetWidth`, `getBoundingClientRect`) see a
  laid-out element. `upsertChild`, `upsertChildItem`, and the branch
  child-component emission pass their placeholder through. This aligns the CSR
  path with the SSR one, where the doc-order walker only ever inits elements
  already in the document (see `runtime/hydrate.ts`, whose ordering contract
  exists for exactly this `provideContext` → `useContext` visibility reason).

  `mountAt` is an unconditional obligation, since callers previously ran
  `replaceWith` on every outcome: paths that don't consume it — a missing or empty
  template, and the root-deferred-placeholder shape that must stay detached so its
  self-replacement stays recoverable — still get the replacement performed on the
  way out.

  Both construction modes honour it. `ComponentDef` mode initially did not: that
  branch returned early and ran `def.init` detached, so `createComponent(def, …,
mountAt)` kept the very bug this fixes. `mountAt` is threaded through it too, so
  the lifecycle does not depend on whether a caller passes a name or a def.

  **Still open:** `mapArray` rows are unaffected and continue to init detached —
  `renderItem` returns the element to `mapArray`, so there is no placeholder to
  hand over, and the batched `insertBefore` happens later. This is the xyflow
  shape (`<Flow>` provides `FlowContext`; nodes render through `mapArray` and read
  `useFlow()` in their init), and the reason
  `packages/xyflow/src/flow-subsystems.ts` carries a `__bfFlowStore` +
  `closest('.bf-flow')` workaround. Reproduced by the skipped tests in
  `packages/client/__tests__/runtime/csr-loop-row-init-connected.test.ts`; closing
  it reorders the emitted `renderItem` tail or pre-inserts the row, both on the
  runtime's hottest path, so it is deliberately not bundled here.

### Patch Changes

- 483496b: Connect a `createComponent` loop row before its `init` runs, so `useContext`
  resolves the row's own provider instead of the last one that hydrated on the
  page.

  The child-slot path already had this guarantee: `upsertChild` hands its
  placeholder to `createComponent` as `mountAt`, and `materializeComponent`
  replaces the placeholder _before_ calling `initFn` (step 7b) precisely because
  `useContext` resolves by DOM position. A loop row had no placeholder to hand
  over, so it kept initialising detached and fell through to the global,
  last-writer-wins context store. With two providers of the same context on one
  page — two `<Flow>` blocks, each rendering nodes through `mapArray` — a node
  created after the sibling flow had hydrated resolved the **wrong** flow's
  store.

  `mapArray` now hands the row's container and trailing anchor down through a
  `setRowMountPoint` ambient, taken-and-cleared by the outermost
  `createComponent` inside `renderItem`, which connects there before running
  `init`. The ambient is the same shape as the `_parentScopeId` one that already
  lives in `component.ts`, and take-and-clear is what keeps a nested
  `createComponent` from the row's own init from re-using the row's mount point.

  **The reorder is deliberately left alone.** A mounted row now appears in the
  LIS walk like any other attached scope, and the LIS argument — keep the longest
  already-correctly-ordered run stationary, insert every other run before the
  next stationary scope — never depended on new rows being absent from that walk;
  it only needs `domOrderIndices` to reflect the live DOM, which it still does.
  Pinned by a reorder test that inserts a fresh row at the front and then
  reverses a three-row list.

  The ambient carrying the mount point is a single slot, so `mapArray` saves and
  restores whatever it found rather than clearing to `null`, and only touches the
  slot when it is the one setting it. A row whose own `init` drives a nested
  `mapArray` would otherwise have the inner list strand the outer row's
  not-yet-claimed mount point and silently revert it to init-detached.

  One cost is inherent rather than incidental: a bulk append of component rows no
  longer collapses into a single `DocumentFragment` insert, because each row must
  be in the live document before its own `init` runs, and a fragment is not the
  live document. The insertions move earlier (one per row, inside
  `createComponent`) instead of disappearing — the reorder step then finds the
  parked order already correct and performs zero mutations. Template-clone rows
  keep the batched path untouched.

  Two shapes stay on the old path, both intentionally:

  - **Multi-root rows.** A Fragment loop body's extras and per-item marker only
    exist once `renderItem` has returned, so `createItemScope` un-parks a row
    that turns out to carry extras rather than leaving it in the DOM without
    them. This also preserves `qsa-item.ts`'s step-3 contract, which needs the
    primary detached during setup. Expected to be dead code — a multi-root body
    never takes the `createComponent` row path.
  - **Composite / plain rows.** Their root is a template clone, never a
    `createComponent`, so there is no call to hand a mount point to and their
    nested `upsertChild` children still init against a detached row. Closing
    that needs the emitted renderItem body to hand its element over before the
    tail runs — a compiler change, pinned as a skipped test in
    `csr-loop-row-init-connected.test.ts`.

  Deferring the row's `init` instead — the other obvious fix — is the wrong
  seam and is documented as such in that test file. `createComponent` is atomic:
  getter `children` are evaluated _after_ `initFn` so the row's own providers are
  in place first, and the renderItem tail's `insert(__csrEl, '^sN', …)` calls
  resolve conditional-slot markers that live inside exactly that getter-children
  HTML. Deferring init defers those markers into existence, leaving per-row
  branch slots unwired.

  Measured: the two previously-skipped tests in
  `packages/client/__tests__/runtime/csr-loop-row-init-connected.test.ts` now
  pass (client suite 608 pass + 2 skip → 610 pass); adapter and CSR conformance
  1456 pass / 0 fail; the full `site/ui` Playwright suite green on CI across all
  four shards.

- c3c435a: Add a re-subscribe seam to `mapArrayLazy`'s loop-level outer effect.

  `applyOuter` runs in one loop-level effect that subscribes to whatever its
  body reads. For a primed signal/memo getter that set is independent of the
  entries, so a reconcile can never strand it — the existing contract. For a
  per-key subscription such as `createSelector`, whose selector subscribes the
  caller only to the keys it was called with, the set DOES depend on the
  entries iterated, and three sequences strand it: an empty entry list on the
  first run (loop permanently dead), a row created and then selected while no
  already-subscribed key flips, and an item change that moves the value a
  binding keys on. All three were reproduced before this was written; each is
  now a regression test.

  Every loop with an `applyOuter` now re-runs it after any reconcile that
  created a row or changed an item (removals strand nothing). This is
  deliberately unconditional rather than gated on a compiler judgement about
  which outer reads are per-key: that gate would turn a MISCLASSIFICATION into
  a silent staleness bug, while unconditional makes the same mistake merely
  wasteful. Forcing it on for a loop that does not need it measured below this
  repo's benchmark floor (post-hydration heap 1815.5KB -> 1809.1KB, i.e. it
  came out lower — noise, not signal).

  This inverts the earlier contract that a reconcile never re-runs the outer
  effect; the test that pinned it is updated with the reason.

- 27b0648: Keep a live DOM node intact when it lands on a lazy loop row's content slot

  A child-position interpolation can evaluate to a real element rather than a
  string:

  ```tsx
  {
    _p.renderCell(row.id);
  }
  ```

  when the caller passes an inline-JSX arrow — the compiler lifts that into a
  component whose call returns a live Node. In a lazy loop row the value was
  stringified before it ever reached the claim door (`String(__x)` in
  `stringify/lazy-row.ts`), and the row's content slot is claimed as
  `kind: 'text'`, whose writer sets `nodeValue`. A Text node cannot host an
  element, so the element was destroyed: the user saw its serialized markup as
  visible characters, or `[object HTMLDivElement]`, depending on the DOM
  implementation's `toString`.

  Two properties made it silent. Nothing overwrote the row afterwards — the
  other Node-bearing shapes are self-healing by accident, since a conditional's
  `insert()` re-renders through `__bfSlot` and a non-loop reactive text
  re-applies through `escapeTextOrNode`, so the wrong value is transient there
  and only the lazy row keeps it. And the eligibility gate ACCEPTS the shape: a
  prop accessor is an opaque outer read, which the re-subscribe seam
  (`spec/slot-unification.md` §9.3a) made eligible, so the row takes the lazy
  path and the destructive write is what ships.

  The fix keeps the cheap door and decides on the VALUE, in two halves:

  - `textOrNode` (new export, `runtime/claim-slots.ts`) passes a Node through and
    coerces anything else with `String`, exactly as the previous inline emission
    did. It is the 'text' door's counterpart to `escapeTextOrNode` — a 'text'
    write goes through `nodeValue` and must NOT be escaped, but it does need the
    Node case separated out. `stringify/lazy-row.ts` emits it in place of
    `String(__x)`.
  - The claim **promotes** a slot from 'text' to 'markup' on its first Node
    write, reusing the anchor comment the original claim already resolved (so
    §2's claim-once rule still holds — no second position resolution) and its
    matching `<!--/-->` as the end boundary. `writeMarkup` already splices Nodes
    by identity, so every later write on that id — Node or string — is correct.
    A slot that cannot host a Node (markerless, or missing its end marker) warns
    and skips the write instead of stringifying an element.

  Whether such a call yields a string or a Node is not decidable from the
  expression's syntax — `renderChild(...)` and `_p.renderCell(...)` are both
  `CallExpression` — so this has to be a runtime decision on the value, not a
  compile-time classification. Strings keep the Text-node fast path; the added
  cost is one `instanceof Node` per content write.

  The seed comparison fails safe on its own: `read(id)` answers with a string or
  `null`, neither of which is ever `===` a Node, so an outer-involving Node
  binding always writes on its first run. That is the right direction — a Node
  is freshly built on this run and is never the SSR-rendered content by
  identity.

- 86f5f68: Add `mapArrayLazy` (plus its `LazyRowPlan`/`LazyRowEntry` contract types) to
  `@barefootjs/client/runtime` — the lazy row graph runtime for keyed loops
  (spec/slot-unification.md §9, L2 of the stacked series). Rows carry NO
  per-row reactive resources: hydration adopts SSR rows with zero DOM
  mutations (key read from `data-key`, never written on adopted rows),
  item-driven updates are direct reconciler calls into the plan's `applyItem`
  with lazy per-row ref claiming, and outer-involving bindings run through ONE
  loop-level effect (`applyOuter`) with read-compare-write seeding on its
  first run. Keyed diff, duplicate-key warning, clear-all fast path, and LIS
  minimal-move reorder mirror `mapArray`'s; `createRow`/`applyItem` run
  untracked so the reconciler subscribes only to the loop accessor. No
  compiler change yet — the L3 compiler switch targets this entry point for
  eligible plain loops.
- 4274898: Make claiming a `'text'` slot non-mutating, and add `lazyClaimSlots` — the
  read-capable twin of `lazySlots`.

  A text claim used to call `textNodeAfterComment`, which CREATES and inserts
  an empty Text node when SSR rendered the slot empty, so merely claiming a
  row mutated the DOM. A marked text slot now holds ONE field — the live Text
  node once materialized, or the anchor Comment to create it after — and the
  node is created by the first write that needs it. Post-write DOM is
  identical to before; inspecting a slot now leaves nothing behind.

  That unlocks the read half of read-compare-write seeding
  (`spec/slot-unification.md` §9.3(1)), which content slots previously had no
  door for. It ships as a separate `lazyClaimSlots` / `ClaimedSlotsRW` pair
  rather than a `read` on every claim: doors are allocated per row, so giving
  every row a reader costs closures on rows that never read (measured
  +84KB/1k rows for a reader on every writer, +40KB for a reader on every
  claim). Both shapes sit on the same claim — a second accessor bundle, never
  a second way to resolve a position.

  - @barefootjs/shared@0.28.0

## 0.27.0

### Minor Changes

- 17af2ae: Unify content-slot updates onto a single claim-based mechanism (slot
  unification Step A, spec/slot-unification.md). The compiler now emits
  claim plans for every content slot (loop-row text, preamble regions,
  dynamic text/JSX slots, `@client` expressions) instead of the four
  per-mechanism paths this replaces — `$t`-effect text slots, `__bfText`,
  `patchSlotRange`, and `updateClientMarker` — all of which are deleted
  along with the `bf-client:` marker grammar they depended on.

  This cleanup step (A4) additionally removes the dead
  `reconcileElements`/`reconcileList` runtime exports: no compiler emission
  path has called them since element/list reconciliation moved to
  `mapArray`/`mapArrayAnchored`, so they were unreachable dead code kept
  alive only by their own unit tests. `getLoopChildren`/`getLoopNodes` (real
  consumers remain in `mapArray`'s clearing path) move to a new
  `runtime/loop-markers.ts` module with the same public export names — no
  consumer-facing change.

- 76f0dea: Elide `<!--bf:sN-->…<!--/-->` markers for `/* @client */` text slots
  outside loops/conditionals (slot unification Step B, spec/
  slot-unification.md §3(b)) — the one 'text'-kind slot whose rendered
  width is deterministically zero on every request, which is what makes a
  real compile-time claim path sound without a marker to fall back on.
  `client-only-elision.ts` decides this once, before either
  `adapter.generate` or `generateClientJs` run, so all nine SSR adapters
  and the CSR template emitter drop the same marker consistently.

  Extends the claim-plan interpreter (`@barefootjs/client/runtime/
claim-slots.ts`) with a `markerless` `SlotSpec` flag: a markerless 'text'
  slot's path resolves directly to its position (adopting an existing Text
  node, or creating one at that exact index when SSR rendered nothing
  there) instead of scanning for an anchor comment.

  Adds claim-plan conformance (`packages/adapter-tests`): for every fixture
  and every adapter, resolves the emitted claim plan's statically-known
  paths against real SSR-rendered DOM and asserts each lands on the
  expected anchor/position kind.

  Ordinary reactive text slots (loop rows, conditional branches) are NOT
  elided by this change — their rendered width is data-dependent per
  request, which needs a different, not-yet-implemented safety argument
  (see `client-only-elision.ts`'s module docstring and
  spec/slot-unification.md §5a's "Step B measured" note).

### Patch Changes

- 807b1a5: Remove dead runtime surface left by the slot unification: `getComponentProps`, `getPropsUpdateFn`, and `registerPropsUpdate` (consumer-less since `reconcileList`'s removal) are deleted from `@barefootjs/client/runtime`, and `tAfter` is dropped from the compiler's runtime-import candidates (no emission site remains). Documentation for the `/* @client */` directive is rewritten to describe the claimed-slot behavior that actually ships.
- e71e19d: Fix a CSR memory/update regression introduced by the slot-unification
  migration (slot unification A3 → A3b, spec/slot-unification.md §3(c)/§8):
  loop-row emission was still wiring one `createEffect` per reactive attr,
  per reactive text, and per preamble region — 3 separate effect closures and
  subscription-list entries for even the simple two-text-and-one-attr row in
  the DOM benchmark's `Bench` table, up from the pre-migration baseline's
  same 3 effects but with the new claim-plan writer/`Map`/refs stacked on
  top of them.

  For the plain-loop-row shape (top-level `mapArray` rows and their
  branch-scoped equivalent) the compiler now emits ONE `createEffect` per
  row that writes every reactive attr, outer text, and preamble region for
  that row through a single claimed-slot writer — outer texts and preamble
  regions share one `lazySlots` call (mixed `'text'`/`'markup'` claim
  kinds), removing the N-1 extra effect objects and their subscription
  entries per row. Composite loops, component loops, the anchored
  (whole-item-conditional) loop shape, and static (`forEach`) loops are
  unchanged — their `reactiveEffects` never carry preamble regions, and this
  pass only touched the shape it could mechanically verify.

  Profile mode (`bf debug profile`, #1690) keeps the previous per-slot/
  per-attr effect emission so the profiler's `<Component>#binding:<slotId>`
  ids still attribute a re-run to its own binding; only normal (non-profile)
  builds get the consolidated row effect.

  Measured on `benchmarks/apps/barefoot` (CI quick-mode DOM suite,
  `benchmarks/runner/bench-dom.ts`): 1k-row memory 2046.4KB → ~1767KB
  (-13.6%, within ~0.6% of the pre-migration same-hardware baseline of
  1756.9KB); update10th settled back into the ~1.0-1.17x-vanilla band
  observed pre-migration. Shipped JS size is materially unchanged (the win
  is runtime object count, not source bytes).

  - @barefootjs/shared@0.27.0

## 0.26.4

### Patch Changes

- 6114df8: Rewire the client side of JSX-returning `.flatMap()` loops onto flattened leaf descriptors. Previously the emitted `mapArray` reconciled the UN-flattened source items against the flattened SSR leaves with a null keyFn and an EMPTY item template — leaves vanished at hydration with zero interaction, adding an item crashed on `cloneNode(null)`, and the list never reacted to data changes. The accessor now flattens through the callback body producing `({ k, h })` descriptors per leaf (keyed by the leaf's own `key`, index fallback), renderItem builds new leaves from the descriptor HTML and patches existing ones in place via the new `patchLeaf` runtime helper, and leaf `data-key` moved off the string templates onto `mapArray`'s `setAttribute` path (closing the CSR/SSR data-key asymmetry, escaping included). A flatMap leaf carrying an event handler, component, nested loop, or spread now refuses loudly instead of rendering silently-dead DOM.
- b0817cc: Fix a keyed `.map()` loop whose row body has a preamble-built leaf child (`const cells = []; cells.push(<td>{stateLabel}</td>); return <tr key={t.id}>{cells}<td>{t.name}</td></tr>`) going stale on same-key item updates. `mapArray` reuses the same row DOM node via per-item `setItem`, re-running only the row's wired text/attr slots — a preamble-derived child like `{cells}` had neither, so it froze at its mount-time content forever while sibling wired slots (`{t.name}`) updated normally. A loop-body expression child whose free identifiers reference a preamble-declared local is now classified as a preamble-patched region: it renders with the same `<!--bf:sN-->...<!--/-->` slot marker a reactive text uses (so SSR/CSR row templates stay byte-identical), but the client wires it via a dedicated region-patch effect — `patchSlotRange` (new `@barefootjs/client` runtime helper) replaces the marker-delimited DOM range in place whenever the re-run preamble produces different content, instead of a `.textContent` assignment that would corrupt markup.
  - @barefootjs/shared@0.26.4

## 0.26.3

### Patch Changes

- @barefootjs/shared@0.26.3

## 0.26.2

### Patch Changes

- @barefootjs/shared@0.26.2

## 0.26.1

### Patch Changes

- @barefootjs/shared@0.26.1

## 0.26.0

### Minor Changes

- 050513c: `formatDate` / `format_date` timeZone widens to canonical IANA zone IDs (#2344): `'Asia/Tokyo'`-style zones resolve through each backend's tzdata at the instant being formatted (DST-aware, seconds-precision LMT included), and the literal-locale `toLocaleDateString` sugar admits a named-zone literal the build machine's Intl probe verifies. Breaking contract change: an unresolvable timeZone (unknown zone, non-canonical spelling, malformed or out-of-range offset) now raises the backend's native error instead of silently normalizing to UTC. New runtime dependencies: tzinfo (Ruby), DateTime + DateTime::TimeZone (Perl — the generated zone modules load OlsonDB, which needs DateTime::Duration), chrono-tz (Rust), tzdata (Python, fallback only).

### Patch Changes

- @barefootjs/shared@0.26.0

## 0.25.0

### Patch Changes

- @barefootjs/shared@0.25.0

## 0.24.1

### Patch Changes

- @barefootjs/shared@0.24.1

## 0.24.0

### Minor Changes

- f7f955a: Month/weekday name tokens for date formatting (#2334). `formatDate` gains an explicit `names` table argument (flat 38-slot layout; the `format_date` helper's canonical arity is now 4) and the `MMMM`/`MMM`/`dddd`/`ddd` tokens. The `toLocaleDateString` sugar now admits ANY literal options bag — `{ dateStyle: 'long', timeZone: 'UTC' }`, `{ weekday: 'short', … }` — probing it at build time and shipping the derived pattern plus the name table into the compiled output as an ordinary array argument, so backends stay locale-data-free (type-only) and no runtime ICU/CLDR exists anywhere. Unreproducible forms (era, dayPeriod, 2-digit year, narrow names, non-latn digits) keep refusing loudly per the fidelity rule: reproduce the user's TSX exactly or decline, never approximate.

### Patch Changes

- @barefootjs/shared@0.24.0

## 0.23.0

### Patch Changes

- @barefootjs/shared@0.23.0

## 0.22.0

### Minor Changes

- fdc5b3e: Add `formatDate(date, pattern, timeZone)` (#2324): a pure-function date formatter with explicit inputs — pattern tokens `YYYY`/`MM`/`M`/`DD`/`D`, timezone `'UTC'` or a fixed `±HH:MM` offset — exported from `@barefootjs/client` and catalogued as the backend-neutral `format_date` template helper. SSR adapters lower the call through the builtin lowering-plugin registry and render it natively on every backend (Go, Ruby, Perl, PHP, Python, Rust) with byte-identical, golden-vector-pinned output; no locale, timezone database, or ICU data is consulted anywhere.

### Patch Changes

- @barefootjs/shared@0.22.0

## 0.21.4

### Patch Changes

- ffd65a8: Fix `qsa()` returning a nested child component's element instead of the caller's own when their compiler-assigned local slot numbers (`bf="sN"`) happen to collide. Compiler slot IDs restart from `s0` per component file, so a parent's own slot and a nested child's slot can share the same number; `qsa()` (used by `insert()`'s conditional-branch `bindEvents` for plain attribute/class bindings) now skips any candidate that falls inside a nested child component's own scope boundary, matching the scope-boundary awareness `find()` already has via `belongsToScope()`.
  - @barefootjs/shared@0.21.4

## 0.21.3

### Patch Changes

- 69ae86b: Fix `insert()`'s branch-swap path never finding a conditional's markers when they sit as a _sibling_ of a fragment-root component's comment-scope proxy element, rather than nested inside it (e.g. a reopen-button conditional alongside a stable `<aside>` proxy, as in piconic-ai/sora's `ListSidebar`). `updateFragmentConditional`, `updateElementConditional`, and `autoFocusConditionalElement` searched only the proxy's own _descendants_ (`document.createTreeWalker(scope, ...)` / `scope.querySelector(...)`), while `insert()`'s own first-hydration lookup already correctly used the comment-scope-aware `find()` — an asymmetry that left every subsequent branch swap silently frozen on whatever rendered at hydration, with no error. All three now go through the newly-added `findCondTarget()` (comment-scope-aware for a fragment-root proxy, a plain `scope.querySelector(...)` for a regular scope — `find()` itself would wrongly reject a `mapArray` loop item's own conditional, since its cloned template root usually carries no `bf-s` for `find()`'s `belongsToScope` check to match) or the newly-exported `commentsInScope()` helper, matching the first-hydration path.
  - @barefootjs/shared@0.21.3

## 0.21.2

### Patch Changes

- @barefootjs/shared@0.21.2

## 0.21.1

### Patch Changes

- 83956ce: Fix #2302 (a gap left by the #2289/#2293 fix): a fragment-rooted child component's own `$`/`$t` queries failed to resolve any slot nested inside one of the fragment's top-level siblings (e.g. `<header><select>`), because `find()`'s comment-scope acceptance check rejected any candidate with a `bf-s`-attributed ancestor — which every fragment child mounted inside a normal parent island always has. Separately, a _parent's_ own slot search could wrongly claim a descendant that actually belonged to a nested fragment child's coincidentally same-numbered slot (e.g. a parent's `bf="s5"` collapse button vs. the fragment child's own unrelated `bf="s5"` element), because `belongsToScope()`'s `.closest('[bf-s]')` walk has no element to stop at for a fragment child's comment-anchored scope. Both are now resolved by bounding the search to the actual `<!--bf-scope:...-->` … `<!--bf-/scope:...-->` sibling range instead of relying on `.closest('[bf-s]')` alone.
  - @barefootjs/shared@0.21.1

## 0.21.0

### Minor Changes

- 10fa0df: Close #2292: apply the catalogued `Date` lowering (#2274) on the client-JS
  (CSR) path, not just SSR. A `Date`-typed prop's zero-arg accessor call
  (`createdAt.toISOString()`, `createdAt.getUTCFullYear()`, …) now works after
  hydration instead of throwing.

  - `@barefootjs/client` gains a `date(recv, op)` runtime helper (importable
    from `@barefootjs/client/runtime`), the client counterpart to every SSR
    adapter's `date` helper. `recv` tolerates a real `Date` OR the ISO-8601
    string a Date-typed prop arrives as post-hydration (props are JSON
    round-tripped with no type-aware revival); a nil/unparseable receiver
    degrades to the documented zero value (`''` for `toISOString`, else `0`)
    rather than throwing. Semantics match the SSR runtimes byte-for-byte
    (0-based `getUTCMonth`, UTC millisecond `toISOString`).
  - `@barefootjs/jsx`: the client emitter now lowers the same calls
    `datePlugin` lowers on the SSR side — reusing the exact `datePlugin`
    matcher (not a re-implementation), so SSR and CSR stay in parity — on both
    the static template path (`jsx-to-ir.ts`) and the reactive
    `createEffect` path (`ir-to-client-js/emit-reactive.ts`), emitting
    `date(<recv>, "<op>")` and auto-importing the runtime helper. A call
    lowers on the client iff it lowers on the server.

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

- @barefootjs/shared@0.20.0

## 0.19.1

### Patch Changes

- @barefootjs/shared@0.19.1

## 0.19.0

### Patch Changes

- @barefootjs/shared@0.19.0

## 0.18.7

### Patch Changes

- fd73cf0: Perf: new `createSelector(source, fn?)` primitive (SolidJS-compatible, #2143 gap 5) — an O(changed) selection accessor for `class={isSelected(row.id) ? ... : ...}` patterns. Each row's effect subscribes to its own key instead of the raw signal, so a selection change re-runs two effects (deselected + selected row) regardless of list size. The returned accessor is `Reactive<>`-branded, so the existing type-based reactivity analysis recognises `isSelected(row.id)` with no analyzer changes beyond registering the export and a `needsTypeBasedDetection` trigger for bare selector usage outside `.map()`. `@barefootjs/hono` gains the matching SSR client-shim stub.
- 42e9066: Perf: new `runtimeBundle: 'treeshake-exact'` build mode (#2143 gap 4) drops the always-kept public mount API (`render`, `hydrate`, `flushHydration`, `rehydrateAll`, `rehydrateScope`, `disposeScope`, `setupStreaming`, `createSearchParams`) that `'treeshake'` (the default) unconditionally keeps in `barefoot.js` regardless of whether the project actually uses them. Under `'treeshake-exact'` these names ship only if the compiled output, `bundleEntries`, `externals`, or an explicit `runtimeKeep` entry actually reaches them — a hand-written page script the CLI never compiles (e.g. an inline `<script type="module">` calling `hydrate()` directly) must list any such name in `runtimeKeep` or it's silently dropped. Fully opt-in; `'treeshake'` stays the default with unchanged behavior. Also fixes a real crash-to-full-copy bug the new mode could hit: a project with zero reachable runtime exports now skips `barefoot.js` generation (and removes any stale copy from a prior build) instead of failing into shipping the entire uncompressed runtime.
  - @barefootjs/shared@0.18.7

## 0.18.6

### Patch Changes

- 09e8eb9: Perf: hoisted single-root `mapArray` loop bodies (#2143 gap 1) now resolve reactive attr/text/ref slots on a fresh clone via compile-time child-index paths (`.firstChild.nextSibling...`, Solid-style) instead of a per-row `qsa()`/`$t()` runtime lookup, computed from the loop's existing skeleton IR and bailing to the runtime lookup for any loop shape the HTML parser could restructure (tables, `<select>`, `<p>` auto-close, `<pre>`/`<template>`, cross-tag auto-close groups, or content a bare `<tr>` would foster-parent out of the row) or for hydration. `@barefootjs/client` exports the existing text-marker helper as `tAfter` for this codegen to call.
  - @barefootjs/shared@0.18.6

## 0.18.5

### Patch Changes

- Updated dependencies [7bd1762]
  - @barefootjs/shared@0.18.5

## 0.18.4

### Patch Changes

- 23cc4dc: Normalize intrinsic-element attribute names ONCE in Phase 1: `IRAttribute.name` now carries the HTML/SVG attribute name, so every adapter emits it verbatim. The shared `dom-prop` classifier grows an `HTML_CAMEL_ALIASES` table (React-style camelCase → HTML: `tabIndex` → `tabindex`, `maxLength` → `maxlength`, `autoComplete` → `autocomplete`, `readOnly` → the boolean `readonly`, `spellCheck` → the enumerated `spellcheck`, …) consulted by both `toHTMLAttrName` (now applied in `jsx-to-ir`'s `processAttributes`) and `toHTMLAttrNameRuntime` (spread paths). Previously each adapter mapped at most `className` → `class` itself and every other alias leaked into the emitted HTML as an unknown attribute the browser ignores — `htmlFor` never became `for` (broken label association on template backends), `readOnly` rendered as `readOnly="true"` vs bare presence depending on backend, and SVG `strokeWidth`/`strokeLinecap` passed through unmapped. Component props (`IRProp`) keep the user's API names; unknown names (`data-*`, custom-element attributes, `viewBox`-style case-sensitive SVG XML names) pass through unchanged. The `camelcase-attributes`, `svg-icon`, and `boolean-attr-literals` fixtures graduate from every adapter's `renderDivergences` declaration and the CSR skip list.
- Updated dependencies [23cc4dc]
  - @barefootjs/shared@0.18.4

## 0.18.3

### Patch Changes

- @barefootjs/shared@0.18.3

## 0.18.2

### Patch Changes

- @barefootjs/shared@0.18.2

## 0.18.1

### Patch Changes

- @barefootjs/shared@0.18.1

## 0.18.0

### Patch Changes

- 0636582: `bf build` now tree-shakes the client runtime bundle (`barefoot.js`) down to only the `@barefootjs/client*` exports a project's compiled client JS (components, `bundleEntries`, rebundled `externals` chunks) actually imports, plus a small always-kept public mount API (`render`, `hydrate`, `flushHydration`, `rehydrateAll`, `rehydrateScope`, `disposeScope`, `setupStreaming`, `createSearchParams`) for hand-written page scripts the compiler never sees. Previously `barefoot.js` was always a byte-for-byte copy of the entire prebuilt runtime regardless of what the project used — on the CSR benchmark app this shipped ~72KB raw / ~19.4KB gzip; the same app now ships ~24KB raw / ~8.8KB gzip.

  New config surface (`createConfig()` in `@barefootjs/client/build`, or any `barefoot.config.ts`):

  - `runtimeBundle?: 'treeshake' | 'full'` — defaults to `'treeshake'`. Set to `'full'` to restore the previous verbatim-copy behavior.
  - `runtimeKeep?: string[]` — extra runtime export names to force-keep, for names only ever referenced from hand-written page scripts beyond the always-kept set.

  Safety: if the collector sees an import shape it can't safely narrow (a namespace import, a default import, or a dynamic `import()` of the runtime — reachable only through `bundleEntries`/rebundled `externals`, since the compiler's own component codegen never emits these shapes), the build falls back to a full runtime copy for that build and logs why, rather than risk shipping a `barefoot.js` missing something that's actually used.

- 99cae9d: Performance: `mapArray` now reorders keyed lists with minimal DOM moves (LIS-based — a two-row swap moves two scopes instead of re-inserting every row), batches contiguous new rows through a `DocumentFragment`, clears emptied lists in bulk via `Range.deleteContents()`/`textContent`, and caches its loop boundary markers between updates. Effect disposal bookkeeping is now O(1) per child (lazily-allocated insertion-ordered `Set` instead of `indexOf`+`splice`), removing an O(n²) cost when disposing large lists. No behavioral changes: keyed reconciliation semantics, cascade-disposal order, hydration, multi-root items, and focus preservation are unchanged and covered by new regression tests.
- d05cc49: Performance: signal→effect dispatch is significantly faster. Effect dependency tracking now uses generation-stamped diffing, so an effect whose read set is unchanged between runs no longer unsubscribes/resubscribes on every run, and unbatched `set()` reuses a cached subscriber snapshot instead of allocating a new array per write (invalidated only when membership actually changes). Observable semantics are unchanged — synchronous dispatch order, snapshot-at-dispatch behavior for mid-dispatch subscribe/unsubscribe, dynamic dependency drop, `Object.is` bail, `batch()`, `untrack`, cleanup timing, and the circular-run guard are all preserved and pinned by new tests; the profiler-instrumented path emits a byte-identical event stream.
- 435d996: `escapeText` — the runtime helper that escapes interpolated text content for the initial client render (`<!--bf:sN-->${escapeText(expr)}<!--/-->` slots) — now renders a nullish value as empty text instead of stringifying it into literal `"undefined"` / `"null"`. This matches the JSX/Solid semantics the Hono SSR reference follows (`{undefined}` / `{null}` produce no text) and the reactive text-update path, which already coerces via `String(value ?? '')` (`dynamic-text.ts`, `client-marker.ts`). Previously a bare `{props.x}` reading an absent prop diverged from the server-rendered output at first paint — empty on SSR, literal `"undefined"` on CSR (#2137). Non-nullish values (including `0` and `false`) keep their `String()` form, matching the reactive path.
  - @barefootjs/shared@0.18.0

## 0.17.1

### Patch Changes

- @barefootjs/shared@0.17.1

## 0.17.0

### Minor Changes

- e9ed338: Add `queryHref` — a pure, functional URL-query builder (#2042).

  `queryHref(base, { … })` is the build counterpart to `searchParams()` (the reactive reader): instead of imperatively mutating a `URLSearchParams`, pass a params object of **string** values. Each entry is included iff its value is a non-empty string (so a conditional include folds into the value as `cond ? value : undefined`); values are encoded with `URLSearchParams`. It runs natively on the client and is a pure function (no reactivity). (Number/boolean values are intentionally not accepted — JS truthiness omits `0`/`false`, which the SSR string guard can't model without per-value type info; stringify at the call site.)

  The go-template adapter lowers a `queryHref(base, { … })` call to `bf_query` directly — because the call and its object literal are already structured IR, there is no block-body recognizer and no emit-time re-parse. This is the functional alternative to the imperative `URLSearchParams` builder idiom: write the query inline (`href={queryHref(base, { … })}`) rather than a multi-statement helper.

  Notes / scope:

  - go-template SSR lowering only in this cut; Mojolicious / Xslate parity (their query helpers) is a follow-up. They keep the generic lowering until then.
  - Helper wrappers whose params-object references the helper's params aren't inlined yet (a pre-existing inliner limitation, since object literals lower opaquely from source) — the direct call is the supported idiom.

- caba215: `queryHref` now accepts an **array value** for multi-value query keys (#2048, the Q4 follow-up to #2042): `queryHref(base, { tag: ['a', 'b'] })` → `?tag=a&tag=b`, i.e. `URLSearchParams.append` rather than `set`. Empty / falsy members are skipped (same truthy-omit as a scalar), so an empty — or all-empty — array contributes nothing. `QueryParamValue` becomes `string | string[] | null | undefined`.

  This works across the client and all SSR adapters byte-for-byte:

  - **`@barefootjs/client`**: `queryHref` appends each non-empty array member.
  - **`@barefootjs/perl`** (Mojolicious + Xslate via the shared `query` helper): an array ref appends one pair per non-empty member.
  - **`@barefootjs/go-template`**: `bf_query` appends each non-empty member of a `[]string` (or `[]any`) value. To support this, the value-emptiness check moved from the lowering into the `bf_query` helper itself — a plain `key: v` now lowers to a `(true)` include and a conditional to `(cond)`, and the helper drops an included-but-empty value. This matches the client and Perl exactly (it also removes the previous Go-only divergence where an explicitly-included empty value was kept as `k=`); rendered output for existing scalar usage is unchanged.

  The `query` helper's array behaviour is conformance-tested across the Go and Perl backends via the shared golden helper vectors.

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

### Patch Changes

- Updated dependencies [c8c7d50]
  - @barefootjs/shared@0.17.0

## 0.16.0

### Patch Changes

- @barefootjs/shared@0.16.0

## 0.15.2

### Patch Changes

- @barefootjs/shared@0.15.2

## 0.15.1

### Patch Changes

- @barefootjs/shared@0.15.1

## 0.15.0

### Minor Changes

- 2339a2f: `<Async>` and `<Region>` are now **import-scoped, import-required** built-ins instead of bare capitalized tag-name matches (#1915, follow-up to #1914).

  The compiler recognises them only when their local binding is imported from `@barefootjs/client` (keyed off `ir.metadata.imports`), so a user's own `<Async>` / `<Region>` component — imported from elsewhere or declared locally — no longer collides with the built-in, and an aliased `import { Async as Boundary }` maps `<Boundary>` through. Real, type-checked `Async` / `Region` stubs now ship from `@barefootjs/client` (they throw if ever executed, since the compiler compiles the tags away), giving authors prop-checking and completion — the model `Portal` already follows, and how Solid imports `<Show>` / `<Suspense>` from `solid-js`. The import is elided on emit (both `templateImports` and the client-JS DOM imports) so it never survives as a phantom runtime import.

  A bare `<Async>` / `<Region>` used without the import and with no other in-scope binding now raises `BF054`. This replaces the per-file `declare function Async(...)` workaround and the `@barefootjs/hono` JSX runtime's `export declare function Async` (removed).

  **Migration:** add `import { Async, Region } from '@barefootjs/client'` to files that use these tags.

- c6212ab: Request-scoped environment signals (`searchParams()`, and future cookies/…) now resolve at SSR for the non-Hono JS hosts that render via `renderToHtml` (h3 / Elysia / any WinterCG handler), through one **keyed** request-env mechanism. #1922 (follow-up to router v0.5).

  Hono resolves a request's environment through `useRequestContext()` inside its `jsxRenderer` async context; `renderToHtml` has none, so `searchParams()` previously resolved to the empty default regardless of the request — query-dependent initial content flashed / mismatched on hydration.

  - **`@barefootjs/client`**: the searchParams-specific server reader seam is generalised to a single keyed one. `__bfSetServerSearchReader` → `__bfSetServerEnvReader((key) => …)` and `globalThis.__bf_serverSearchReader` → `globalThis.__bf_serverEnvReader(key)` (`createEnvSignal` now takes the env `key`). One seam serves every env signal, so a new signal (cookies, …) needs no new seam, setter, or host function.
  - **`@barefootjs/hono`**: new `@barefootjs/hono/request-env` subpath. It scopes the request env with a Node `AsyncLocalStorage`, so each render reads its own request's values and concurrent renders never race (a process-wide per-request global would, which the spec forbids). It installs on the shared keyed `__bf_serverEnvReader` seam (no `@barefootjs/client` import) and delegates to any prior reader when no scope is active, so a process mixing Hono and `renderToHtml` hosts keeps resolving both ways, and it lives behind its own subpath so the always-on `renderToHtml` path never loads `node:async_hooks`. Two entry points:
    - `withRequestEnv(handler)` — wrap a WinterCG `fetch` handler once at the entry point. It derives the env from the `Request`, so the whole request runs with it bound and every `renderToHtml` inside resolves it with **no per-render plumbing**; the host never names env keys.
    - `runWithRequestEnv(env, fn)` + the keyed `BfRequestEnv` type — the lower-level primitive for hosts that bind env manually.

  Usage (the bundled h3 and Elysia demos are wired this way — bind once, pages are plain `renderToHtml`):

  ```ts
  import { withRequestEnv } from "@barefootjs/hono/request-env";

  export default { port, fetch: withRequestEnv(myFetchHandler) };
  ```

  Adding the cookie env signal later is then: define it in `@barefootjs/client`, add a `cookie` field to `BfRequestEnv` (and to the `Request`→env derivation behind `withRequestEnv`) — every host wired with `withRequestEnv` picks it up with **no code change**.

- e627b29: `searchParams()` — a request-scoped reactive **environment signal** (spec/router.md **v0.5**, "The wedge"). A same-route, query-only navigation (`/list?sort=price`) driven by `@barefootjs/router` now updates `searchParams()` and the URL **with no swap and no re-hydration** — islands reconcile fine-grained.

  - **`@barefootjs/client`**: new top-level `searchParams: Reactive<() => URLSearchParams>`. It rides the shared `@barefootjs/client/reactive` runtime (structurally one instance), so the existing reactivity analysis wires DOM updates with no new compiler feature. The underlying signal is created lazily on first read (and the router push seam `window.__bf_pushSearch` is installed there, on first read — not at import), so the module has **no import-time side effects** and an island that never reads it can be tree-shaken out of it. The generic `createEnvSignal` stays internal; only `searchParams` is exported. (The spec's package-level `"sideEffects": false` hint is deferred: it currently triggers a bun bundler bug that collapses the runtime entry to a broken re-export facade — a separate follow-up.)
  - **Request-scoped SSR**: on the server `searchParams()` resolves per-request through an injected reader (`__bfSetServerSearchReader`, or a `globalThis.__bf_serverSearchReader` seam) — never a process-wide module global, which would race across concurrent requests.
  - **`@barefootjs/hono`**: auto-wires that reader via `useRequestContext().req` (async-context scoped, race-free) when the SSR scripts are rendered — no opt-in step. `searchParams` is also re-exported from the Hono `client-shim` (SSR) and from `@barefootjs/client/runtime` (the island bundle's import source), and is allow-listed in the compiler so importing it no longer trips `BF051`.

  Covered by a cross-adapter conformance fixture (`search-params`): it runs on Hono today; the Go / Mojolicious / Xslate template adapters are skipped pending env-signal SSR lowering + runtime, tracked in [#1922](https://github.com/piconic-ai/barefootjs/issues/1922).

  The router's query-only short-circuit (shipped in v0) activates automatically once an island reads `searchParams()`; until then query-only navigations fall back to a full swap.

- 623c0f7: Add subtree-scoped re-hydration and precise per-scope disposal to the runtime.

  - `rehydrateScope(root)` runs a synchronous hydration walk over just `root`'s subtree (cost O(scopes in `root`)), beside the existing whole-document `rehydrateAll()`. Lets a caller that knows which region changed — a client router after a content swap, a streaming chunk, a conditional/loop that just inserted a branch — hydrate only that region instead of re-walking the document.
  - `disposeScope(root)` tears down the reactive graphs (effects, memos, `onCleanup`) of every scope inside `root`. Each scope's `init` now runs inside a `createRoot` so its bindings have a disposable owner. This is additive: nothing disposes a root unless `disposeScope` is called, so existing component lifetimes are unchanged.
  - Both are exposed on `window` via `setupStreaming` as `__bf_hydrate_within` / `__bf_dispose_within`.

### Patch Changes

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

### Minor Changes

- c26b408: Attribute conditional-branch DOM-binding effects in the profiler (#1690, #1795 Phase 1).

  A conditional's `insert()` effect and the attribute / text binding effects
  emitted inside its branch `bindEvents` now carry a
  `<Component>#binding:<slotId>` id in profile mode, and `buildIdIndex` resolves
  them from the graph's `domBindings` (conditional / attribute / text slot + loc):

  - **`insert()` runtime** — takes an optional trailing `bfId` and forwards it to
    the internal conditional re-eval `createEffect`, so a conditional's re-runs are
    attributed to its source line instead of showing as a bare runtime id.
  - **branch attribute effects** — `createDisposableEffect(…, "<Comp>#binding:<slotId>")`
    for `class={…}` / reactive attrs written inside a branch swap.
  - **branch text effects** — the `__bfText` re-splice effect carries the id too.

  `profileComponentName` is threaded through `buildInsertPlan` → `InsertPlan` →
  `stringifyInsert`, including recursively into nested conditionals. Previously
  these branch-scoped re-runs surfaced in the hot-subscribers list as
  unattributed runtime ids and inflated the coverage gap, even though a toggled
  conditional is often the _most_ re-run subscriber.

  Off by default the emitted effects are byte-for-byte unchanged (SR8). Loop-child
  text/attribute binding effects remain a follow-up (#1795 Phase 2).

- 271350a: Attribute the loop reconcile effect in the profiler (#1690, #1795).

  `mapArray` / `mapArrayAnchored` gain an optional `bfId` forwarded to their
  internal reconcile `createEffect`, and the loop emitter passes
  `<Component>#binding:<slotId>` for it in profile mode. `buildIdIndex` already
  resolves that id from the graph's `loop` domBinding (slot + loc).

  Dogfooding a list component showed the loop's reconcile effect is typically the
  **single costliest subscriber** (it re-renders the list on every change) yet was
  unattributed — it dominated the hot list as a bare `e1`. Now it reads
  `s7 (loop)  3 runs, 4.8ms  (TodoApp.tsx:29)`. Off by default the `mapArray`
  call is byte-for-byte unchanged (SR8). Per-item loop-child text effects remain
  a follow-up under #1795.

- b5067dc: Add dev-only reactive instrumentation hooks for `bf debug profile` (#1690, SR1).

  The runtime gains a single, gated measurement sink installed via
  `setProfilerSink(sink | null)`. When a sink is set, the reactive choke points in
  `reactive.ts` emit events — `signalSet`, `subscribeAdd`/`subscribeRemove`,
  `effectCreate`/`effectEnter`/`effectExit`/`effectDispose`, and
  `batchBegin`/`batchFlush` — carrying node ids, timing, and batch state. A memo's
  effect-run and its private signal-set share one id so the profiler can collapse
  them into a single node.

  The sink is null by default (production), so every choke point stays a single
  null-check branch with no allocation and no behavior change — reactive
  semantics are unaffected (SR8). The `ProfilerEventSink` / `SubscriberKind` types
  and `setProfilerSink` are exported from `@barefootjs/client`.

- 9877323: Add profile-mode turn-boundary markers around event handlers (#1690, SR3).

  The runtime gains `beginTurn(handlerId, loc?)` / `endTurn()` (and the matching
  `turnBegin`/`turnEnd` sink hooks). In profile mode the client-JS codegen wraps
  each event handler so the reactive work it triggers is attributed to one turn:

  ```js
  _el.addEventListener("click", (...__bfa) => {
    beginTurn("Counter#handler:s0:click");
    try {
      return HANDLER(...__bfa);
    } finally {
      endTurn();
    }
  });
  ```

  A single `wrapHandlerForTurn` helper produces the wrapper, and `beginTurn`/
  `endTurn` are registered as runtime imports so the import line is auto-wired.

  Measurement-only: the handler's behavior and `set()`'s synchronous semantics
  are unchanged. Off by default the emitted code carries no markers and no turn
  import (SR8). This PR wraps the top-level handler path; the delegation / branch
  / loop-child handler paths are wrapped in a follow-up.

- 07b95ad: Add the SR2 event collector and SR4 IR join for `bf debug profile` (#1690).

  - **`@barefootjs/shared`**: `ProfilerEvent` / `ProfilerEventType` — the
    normalized event wire contract shared by the runtime producer and the jsx
    consumer. It lives in `shared` (built first, depended on by both) so the
    jsx↔client peer relationship stays free of a build-order cycle.
  - **`@barefootjs/client`**: `createRecordingSink()` (SR2) — turns the raw
    `ProfilerEventSink` callbacks (SR1) into a flat, ordered, **turn-stamped**
    event log. It tracks the `beginTurn`/`endTurn` stack (SR3) and stamps every
    event with the handler id in scope, so per-turn metrics need no microtask
    guesswork.
  - **`@barefootjs/jsx`**: `buildIdIndex(graph)` + `joinProfilerEvents(events,
index)` (SR4) — resolve each event's compiler-assigned id to its source-mapped
    IR node (signals/memos/effects, including controlled-signal sync effects).
    Unresolved ids are surfaced as coverage gaps, never dropped (SR4 invariant).

  These are the substrate the v1 analyses (hot subscribers / wasted re-runs /
  batch advisor) consume next. Dev-only; no effect on production builds (SR8).

- 7079ca0: Count turn _invocations_, not handler ids, in profiler metrics (#1690).

  Dogfooding a list whose rows share one `onClick` revealed that firing the same
  handler N times (clicking N rows) collapsed into a single "turn" — because
  events were keyed by the handler-id string. That inflated `runsPerTurn` and
  batch-advisor savings (N interactions summed into one turn).

  `ProfilerEvent` now carries `turnSeq` (a unique per-invocation counter the
  recording sink stamps at each `beginTurn`). The analyses count distinct turns by
  `turnSeq`: hot-subscribers `runsPerTurn` divides by real invocations, the batch
  advisor evaluates each invocation separately (reporting the worst per handler),
  and `report.turns` reflects interactions while `coverage.handlersFired` still
  counts distinct handlers. A 3-row list now reads `turns: 3, handlers: 1/1`
  (was `turns: 1`).

- 1919a0c: Add the wasted-re-runs analysis — v1 (#1690, §4.2.2).

  A reactive effect/memo that re-ran but produced output identical to its
  previous run did removable work — the complement to hot subscribers (where the
  cost is, vs. how much of it is removable).

  - **Fingerprint (SR1, dev-only/SR8):** new optional `effectOutput(id, changed)`
    sink method on the SR2 stream. The runtime aggregates a per-run output verdict
    via `__bfReportOutput` (flushed once at run exit): memos compare the recomputed
    value by `Object.is`; text bindings (`__bfText`) compare the written string —
    and a stale-element cleanup counts as a real DOM change. A run with no
    fingerprint emits no event and isn't counted. `effectOutput` is optional on the
    exported `ProfilerEventSink`, so a pre-existing custom sink stays valid.
  - **Analysis (SR2 + SR4):** `analyzeWastedReReruns` / `formatWastedReReruns`,
    `wasted = wastedRuns / totalRuns`, joined to IR source loc and ranked by
    removable cost then ratio (deterministic). Surfaced in `buildProfileReport` /
    `formatProfileReport` (text + `--json`) behind the new `--wasted-pct` flag
    (default 50%).

### Patch Changes

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

- @barefootjs/shared@0.9.6

## 0.9.5

### Patch Changes

- @barefootjs/shared@0.9.5

## 0.9.4

### Patch Changes

- @barefootjs/shared@0.9.4

## 0.9.3

### Patch Changes

- @barefootjs/shared@0.9.3

## 0.9.2

### Patch Changes

- @barefootjs/shared@0.9.2

## 0.9.1

### Patch Changes

- @barefootjs/shared@0.9.1

## 0.9.0

### Patch Changes

- @barefootjs/shared@0.9.0

## 0.8.0

### Patch Changes

- @barefootjs/shared@0.8.0

## 0.7.0

### Patch Changes

- @barefootjs/shared@0.7.0

## 0.6.1

### Patch Changes

- @barefootjs/shared@0.6.1

## 0.6.0

### Patch Changes

- b24a1e6: Fix dropped component props in CSR render. A parent passing a non-statically-inlinable value (e.g. `Array.from(...)` or an init-scope local) as a prop to a child component emitted `renderChild('Child', {})` — silently dropping the prop — so the child's template read it eagerly and threw (`Cannot read properties of undefined`). Such children now defer to a placeholder + `upsertChild` (`createComponent` with the complete getter props), mirroring the existing clientOnly-conditional / loop-placeholder paths. SSR adapters are unaffected.
  - @barefootjs/shared@0.6.0

## 0.5.3

### Patch Changes

- 5842c03: `__bfSlot` now HTML-escapes its plain-string path, so text rendered inside a conditional `template()` branch is escaped to match the SSR output (closing the branch-text gap left by #1694, where only top-level text slots were escaped). The escape is applied on the string path only — live `Node` values still return raw `<!--bf-slot:N-->` markers for `insert()` to splice, so slotted content is preserved.
- 2c1f3ad: Client-render templates now HTML-escape interpolated attribute values (via a new `escapeAttr` runtime helper) to match the SSR adapters' attribute escaping (`& " ' < >`). Previously a dynamic attribute value containing `"`, `<`, `>`, or `&` — e.g. UnoCSS arbitrary variants like `[class*="size-"]` or `has-[>svg]` — was concatenated raw into the client template string, which corrupts attribute parsing when the template is inserted via `innerHTML` and diverges from the server-rendered bytes. Escaping at interpolation time is the only correct layer (a post-assembly pass can't tell a delimiter `"` from a value `"`).
- 5231cc8: Client-render templates now HTML-escape interpolated **text content** (the `<!--bf:sN-->${expr}<!--/-->` slots) via a new `escapeText` runtime helper — the parallel of the #1692 attribute-value fix. A string child containing `<` / `&` (e.g. `{user.name}`) was previously concatenated raw into the template string, which diverges from the SSR-escaped bytes and is a markup-injection vector when the template is inserted via `innerHTML`. Only the text-marker slots are escaped; bare `${children}` passthrough and `renderChild(...)` output are pre-rendered HTML and are left untouched. Hono escapes text with the same set as attribute values (`& " ' < >`), so `escapeText` delegates to the same operation for byte-parity with the conformance layer.
- d87144d: Handle `dangerouslySetInnerHTML` arriving through a spread/rest object in the runtime spread helpers (follow-up to the explicit-attribute support in #1704). `classifyDOMProp` now classifies it as a dedicated `innerHTML` kind; `spreadAttrs` skips it (so a spread carrying it no longer serialises a bogus `dangerouslySetInnerHTML="[object Object]"` attribute), and `applyRestAttrs` assigns the raw `el.innerHTML = value.__html` (the escape hatch) instead of `setAttribute`.
- Updated dependencies [d87144d]
  - @barefootjs/shared@0.5.3

## 0.5.2

### Patch Changes

- @barefootjs/shared@0.5.2

## 0.5.1

### Patch Changes

- 8742059: Fix two follow-up issues from the #1663 dynamic-dispatch work.

  `__bfText` could render both a stale element and fresh text in a conditional slot: that path re-resolves the anchor via `$t()` each run, which inserts a new text node before an element left by a previous Node-valued run. Writing a primitive now clears any remaining siblings up to the end marker, so switching JSX → text leaves only the text.

  The no-arg props default (`= {}`) is now asserted to the param's annotated type (`= {} as T`) in both the test and Hono adapters. `hasRequiredProps` treats a prop with a destructuring default as non-required, but the declared props type may still mark that field required, so a bare `= {}` failed `tsc` ("Property 'x' is missing in type '{}'..."). The destructuring defaults still supply the values at runtime.

- 9dcffdf: Compile JSX used as an object-literal arrow value and render dynamic dispatch (#1663).

  A `Record<K, () => JSX>` lookup map (`{ piconic: () => <BrandLogo/> }`) was never lowered: a module-level map had its const dropped from the emitted module (`ReferenceError` at SSR), and a function-local map leaked raw `<...>` into the client bundle (`SyntaxError: Unexpected token '<'`). The preprocessor now hoists arrow values in object-literal property assignments into synthesized components, the same lowering already applied to arrows in JSX-attribute position, so the lookup map survives as component references.

  Dynamic dispatch of such a map in child position (`<div>{themeLogo(props.id)}</div>`) now renders on the client: the dynamic-text effect routes through a new `__bfText` runtime helper that splices the live component element into the slot by identity instead of stringifying it to `"[object HTMLElement]"`. Adapters and `createComponent` default missing props to `{}` so a bare no-arg shim call (`LOGOS[id]()`) no longer crashes destructuring `undefined`.

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

- @barefootjs/shared@0.5.0

## 0.4.0

### Patch Changes

- @barefootjs/shared@0.4.0

## 0.3.0

### Patch Changes

- b136f8d: Remove internal @barefootjs/\* from published devDependencies to avoid npm registry dependency graph pollution
- 7e9570d: Fix CSR `render()` dropping all but the first root of a multi-root (fragment) component. `render()` now mounts every root element; for the multi-root case it recreates the SSR fragment layout (a `bf-scope:` comment marker before the sibling roots) so `$c()` resolves sibling child scopes via the comment range. The async hydration walk no longer re-initializes a `render()`'d fragment scope — the comment-scope path now honours `hydratedScopes`, matching the element-scope path — so multi-root components mount every root and initialize exactly once.
- 44c3466: Fix two mapArray bugs (#1627):

  - Hydration now removes orphaned SSR nodes when the client signal has fewer items than the server rendered.
  - Components created via `createComponent` (the CSR path mapArray takes for new loop items post-hydration) now thread their own scope id into `_parentScopeId`, so child components rendered by `renderChild` get parent-prefixed `bf-s`/`bf-h`/`bf-m` markers. This lets the component's init resolve them via `$c(scope, 'sN')` and wire up event handlers, matching the SSR convention.
  - @barefootjs/shared@0.3.0

## 0.2.0

### Patch Changes

- 2313724: Fix classifyDOMProp review issues: strict event detection, boolean attr DOM property handling, immutable BOOLEAN_ATTRS export
- bac95e6: Extract classifyDOMProp as single source of truth for DOM attribute vs JSX prop classification
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
