# @barefootjs/mojolicious

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
