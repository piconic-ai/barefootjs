# @barefootjs/pebble

## 0.37.2

### Patch Changes

- 737ce71: Known limitations now live in an in-repo registry (`packages/adapter-tests/limitations/<id>.ts`) instead of the `known-limitation` GitHub label. `ConformancePin.issue` is replaced by the required `limitation` id, `unescapable` becomes a bare `true`, and `RenderDivergences` values cite a limitation id instead of a prose reason. Every adapter's `conformancePins` cites the registry accordingly.
- 82b99f5: Declare the `opaque-local-accessor-call` render divergence: a component-body `const` bound to an opaque call (`const label = makeLabel()`) and invoked in text position lowers to a bare template-variable lookup on every DSL adapter, with no diagnostic, while the reference runs the accessor at render time. Pinned as a `silent` known limitation with a `/* @client */` escape twin; no lowering change yet.
- @barefootjs/shared@0.37.2

## 0.37.1

### Patch Changes

- ec766fa: Re-point stale closed-issue citations in `conformancePins` (#3030): the module-scope-helper-call refusal family's `unescapable`/`issue` fields formerly cited closed #2994/#3012 (and Go's closed #2266) now cite #3032, the issue tracking the still-missing corpus escape twin; Pebble's `module-const-loop-source-computed` pin now cites the open #2321 instead of closed #2946, matching every sibling adapter's pin for the identical fixture. Doc-only — no behavior change.
- @barefootjs/shared@0.37.1

## 0.37.0

### Minor Changes

- 4526374: Wires the Pebble adapter into the shared ~190-fixture conformance corpus (#2101 Phase 4): `bf.render_child` now actually performs cross-template child-component rendering against a real `PebbleEngine`, closing the gap Phase 3b left open. A new `renderPebbleComponent` JSX-compiling test harness (`test-render.ts`) drives `runAdapterConformanceTests`, and `conformance-pins.ts` starts from the Jinja adapter's pin set (the same shared, engine-independent BF0xx compiler refusals) with no additions needed — every remaining gap found during this pass was a real bug, now fixed:
  
  - `render_child` derives child scope ids (`_bf_slot`-based or a random fallback), routes undeclared props into the rest bag via a new `_bf_manifest.json` sidecar + `ChildMeta`/`DeriveStashFromDefaults` (a Java port of `ssr-defaults.ts`'s prop/signal/memo default-resolution rules), and shares the parent's context-provider stack with cross-template descendants.
  - Hydration marker helpers (`text_start`/`text_end`, `scope_comment`/`scope_comment_end`, `comment`, `hydration_attrs`/`props_attr`/`data_key_attr`) now emit the real shared wire format instead of Phase 3a placeholders.
  - `merge`/`flat_map_tuple`/`query`/`style_object` take a single Pebble list-literal argument instead of Java varargs — confirmed Pebble's method resolver can never match a varargs method from a template call.
  - Literal-map subscript (`{...}[key]`) and two-variable `for k, v in map` — both previously assumed unsupported in comments only — are now actually routed through the already-correct `bf.get`/`bf.entries` helpers everywhere they're emitted.
  - `{% set %}...{% endset %}` block-capture now binds a `SafeString`, fixing silent double-escaping of every forwarded JSX-children/named-slot/async-fallback value.
  - `Bf.string(null)` now returns `""` (pinned divergence, matching every other language port), `style_object` ports the shared `hasUnsafeStyleValue` scan exactly, and `Main` writes stdout as explicit UTF-8 (was silently mangling non-ASCII fixture output).
  - Registers Pebble's own template metacharacters (`{{`/`{%`/`{#`) in the shared `dangerousInnerHtmlMetacharViolation` guard table — every adapter must supply this entry, per that file's own fail-closed design.
  
  Result: `bun test packages/adapter-pebble` — 1766 pass / 24 skip (pre-existing, Jinja-derived compiler-refusal pins) / 0 fail. `bun test packages/adapter-tests` stays fully green (2661 pass / 5 skip / 0 fail), confirming no regression to any sibling adapter.
- 8b4de64: Adds `packages/adapter-pebble`'s Phase 2 adapter core (#2101): `PebbleAdapter`'s render methods now emit real `.peb` (Pebble template engine) output, ported mechanically from the Jinja adapter with syntax choices drawn from the Twig adapter wherever Pebble's confirmed grammar matches Twig's rather than Jinja's (which is most of the time — Pebble is a Twig-inspired engine). Covers element/attribute rendering, conditionals (`{% if %}`/`{% elseif %}`/`{% else %}`), loops (including destructured `.map()` params, sort/filter, and object-entries iteration), child-component invocation, JSX children/named-slot/async-fallback forwarding, hydration markers, and the full `ParsedExpr` → Pebble expression lowering (including the evaluator-only higher-order-callback path, since Pebble has no lambda expressions).
  
  This PR is TypeScript-only: no Java runtime exists yet to execute the emitted templates (that's Phase 3), and the shared conformance suite is not wired up yet (Phase 4). Every Pebble syntax choice is either independently confirmed against Pebble's own documentation/issue tracker or explicitly flagged as an assumption/watchpoint in `pebble-adapter.ts`'s file header — most notably that stock Pebble has no `{% set %}...{% endset %}` block-capture tag (confirmed via a long-standing open feature request), so this adapter's children-forwarding syntax requires a custom Pebble `TokenParser` extension to be implemented in Phase 3.
- ad970a5: Adds the Pebble adapter's Phase 3a Java runtime (#2101): a Gradle project (`packages/adapter-pebble/java/`) implementing the `bf.*` template helper surface and the `ParsedExpr` evaluator, golden-vector tested against the shared `packages/adapter-tests/vectors/` corpus (396/396 helper-vector cases, 102/102 evaluator cases, zero pinned divergences).
  
  This pass also empirically verified the TS adapter core's (#2971) documented assumptions against a real Pebble engine and found one critical bug (Pebble has no `??` operator at all — a template parse error, not a subtly wrong value) plus two minor ones, all fixed directly on top of #2971 in this same stack: JS `??` now routes through a new `bf.coalesce` runtime helper instead of a native (nonexistent) operator, both `~` string-concat operands are now wrapped in `bf.string(...)`, and an inaccurate syntax-table claim about a two-variable `for` form was corrected.
  
  `packages/adapter-pebble/src/test-render.ts` now builds the Java runtime's fat jar once (memoized) and renders hand-written `.peb` templates through a real `java -jar` invocation. The custom `{% set %}...{% endset %}` block-capture extension (needed for JSX-children/named-slot/async-fallback forwarding — stock Pebble has no such tag) and the conformance loop against the shared fixture corpus are separate follow-up PRs in the same stack.
- 20980dd: Adds the Pebble adapter's Phase 3b custom `set` tag extension (#2101): `packages/adapter-pebble/java/src/main/java/dev/barefootjs/pebble/ext/` registers a `SetBlockTokenParser` that replaces stock Pebble's `set` tag handler, adding support for `{% set NAME %}...{% endset %}` block-capture (stock Pebble only ever supported `{% set NAME = EXPRESSION %}`) while keeping that assignment form working unchanged.
  
  This closes the gap the Phase 3a Java runtime documented: JSX-children/named-slot/async-fallback forwarding (`bf.async_boundary`, and the `{% set %}...{% endset %}` shape `renderComponent` emits for named slots) now renders correctly end-to-end, including nested capture blocks. Cross-template child rendering (`bf.render_child`) still throws — it additionally needs multi-template dispatch in `Main`/`Bf`, deferred to the Phase 4 conformance-loop work where child-component fixtures first require it.
  
  Tested with a direct JUnit engine-level suite (`ext/SetBlockExtensionTest.java`, parsing/rendering through a real `PebbleEngine` + `StringLoader`) and new end-to-end `java -jar` smoke tests (`pebble-set-block.test.ts`).
- d756d75: Adds `packages/adapter-pebble`'s Phase 1 package skeleton (#2101): a new BarefootJS backend adapter targeting the [Pebble](https://pebbletemplates.io/) template engine for the JVM ecosystem (Spring Boot, Ktor, plain Servlet apps).
  
  This PR only lands the package structure and a `PebbleAdapter` that type-checks against the `TemplateAdapter` interface — its render methods, the Java rendering runtime, and the conformance suite land in follow-up PRs stacked on this one. See the package README's "Design decisions" section for the Phase 0 scoping decisions this stack builds on.

### Patch Changes

- eb27b31: Refuse a bare-name call to an unresolvable module-scope helper with `BF101` instead of silently resolving it against Pebble's template scope (undefined → empty render, or falsy in a boolean-test position — silently picking the wrong branch). Ports #3011/#3012's fix shape from the eight sibling non-JS adapters, which Pebble never received since it was developed on a separate stacked branch that didn't exist on `main` when those PRs landed. `isValidElement(x)` (the one caller that legitimately needs to keep compiling — `ui/components/ui/slot`'s `asChild` guard) is resolved as an identity-scoped `templatePrimitive` (`bf.is_element`, backed by a new `Bf#is_element` Java port of the shared BarefootJS runtime's shape-check method) ahead of the generic refusal, so it never reaches it.
- @barefootjs/shared@0.37.0
