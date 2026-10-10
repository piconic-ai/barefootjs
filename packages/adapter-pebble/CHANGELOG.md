# @barefootjs/pebble

## 0.39.5

### Patch Changes

- 29aebbf: A `.filter()` predicate that captures an enclosing name now keeps reading the enclosing value when the following `.map()` param reuses that name (#3402). Previously the comparison read the loop's own item, so every item passed the filter.
- 92fc2a4: A JS binding named `loop` no longer collides with the engine's own loop variable inside `{% for %}` (#3404). Jinja, MiniJinja, Twig and Pebble now map it to the compiler-internal `__bf_loop`, in both the emitted template and the runtime's prop-name mangling. A real `loop_` stays distinct.
  
  A `.filter()` param is now renamed to the `.map()` row item on the parsed predicate instead of the rendered text, on Jinja, MiniJinja, Twig, Pebble and Blade. A param named `loop` now tests each row, and a string literal spelled like the renamed name stays as written.
  
  New diagnostic BF105: those four adapters refuse a component in which two distinct names visible at the same point would become one template variable (for example `loop` and `__bf_loop`), instead of rendering both with one value.
- 0017d98: Arithmetic over a signal whose SSR value is `undefined` now renders `NaN` on every template adapter, as JavaScript does (#3390). This covers `createSignal(undefined)`, a zero-arg `createSignal()`, and a memo over either. The template engines hold `undefined` and `null` as the same nil, so the operand used to throw (ERB, Jinja, Pebble, MiniJinja) or read as `0`. The compiler now recognises such an operand (`arithmeticOperandIsUndefined`) and routes it through the runtime's JS `Number()`, which maps nil to `NaN`. Pebble spells the NaN out, and Go seeds such a memo with `bf.Number(nil)`.
- @barefootjs/shared@0.39.5

## 0.39.4

### Patch Changes

- a982376: Arithmetic over a signal whose SSR value can be `null` (`createMemo(() => s() * 2)` with `createSignal<any>(null)`) now renders JS's coerced result (`0`) on ERB, Jinja, Pebble and MiniJinja, instead of throwing at render on the native operator's nil operand. A possibly-nullish operand of `-`, `*`, `/`, `%` or `**` reads as `0`, as go-template's `bf.Mul` already did.
- 9a00178: An optional-chained `.length` (`{props.items?.length}`) over an absent or `null` receiver now renders empty, as JavaScript reads `undefined`. It used to render `0`, the length of an empty array. An empty array or string still renders `0`, and a `?? 0` fallback still takes over for an absent receiver. On go-template, an absent optional string prop still reads as `""` (and so `0`), because its struct field is a plain `string`.
- c0f2038: A `.map()` index, destructure or entry param named like a template-level signal, memo, prop or local constant no longer overwrites it for the rest of the template. Pebble's `{% set %}` inside a `for` body is not loop-scoped, so the loop now saves each such name before it runs and restores it afterwards. The param shadows the outer name only inside the row, as in JavaScript.
- 4f6b4dd: Keep a template-level name intact after a `.map()` loop whose row binds the same name. Twig, Blade and Pebble now save a signal, memo, prop, constant or enclosing row binding that the row's index, destructure binding or preamble local shadows, and restore it after the loop (#3391).
- @barefootjs/shared@0.39.4

## 0.39.3

### Patch Changes

- 0645ba9: A `const` initialized with a boolean literal (`const on = true`), at module or component-function scope, now selects the right branch when read as a conditional's test on every template adapter, as Hono renders it. Each adapter used to carry its own copy of the literal-const lookup, matching numbers and strings by regex but not booleans, so the const read as an unset template variable: the falsy branch rendered, or the template failed at render time. Go also missed a function-scope string const. The lookup is now one shared helper, `lookupLiteralConst` in `@barefootjs/jsx`, reading the analyzer's structured literal (boolean, number, string or `null`); each adapter only renders the result in its own syntax. A module `null` const no longer fails Mojolicious's `strict` compile, and on Go a bare `null` const in text renders empty instead of failing with `nil is not a command`.
- 6ec46ca: An explicit `props.value` read inside a `.map()` row whose callback binds the same name (`props.values.map(value => … props.value …)`) now reads the root prop on the Blade, Jinja, MiniJinja, Mojolicious, Pebble, Twig and Xslate adapters, as Hono does. These adapters flatten `props.X` to the bare template variable `X`, which the loop variable shadowed for the whole row. A loop that shadows a prop now assigns it to a root alias just before the loop (block-scoped on Mojolicious/Xslate), and `props.X` inside the row reads the alias. Blade also restores the prop after `@endforeach`, because PHP's `foreach` leaves the last row in the variable. The alias name never reuses a name the component already has (a prop, local, signal, memo or loop binding). The shared helpers `rootPropAliasNames` / `rootPropAliasesForLoop` / `rootPropReadName` in `@barefootjs/jsx` decide which names need an alias and what it is called.
- eda0c33: An attribute whose value is `undefined` / `null` through a memo (`title={label()}`), an optional member read (`data-name={user()?.name}`) or a ternary branch (`data-choice={on() ? s() : 'x'}`) is now omitted on the template adapters, as on Hono, instead of rendering `attr=""`. Present values, including `''` and `0`, still render. The shared `attrValueMayBeNullish` (`@barefootjs/jsx`) decides which values are guarded. On Go, a memo over an `undefined`-initialized signal is now seeded `nil` in the Props constructor instead of `0`.
- 1f41bc2: An attribute bound directly to a signal whose value is `undefined` or `null` at SSR (`title={s()}`) is now omitted on every template adapter, as Hono omits it. Before, the template adapters rendered it empty (`title=""`). A signal counts as nullable when its type admits `undefined`/`null` (including a zero-arg `createSignal<T>()`) or when it is untyped and its initial value is a literal `undefined`/`null`. The new shared helpers `collectNullableSignalGetters` and `nullableSignalAttrGetter` in `@barefootjs/jsx` make that decision for every adapter.
- e7229a5: A root or child prop/signal whose name is a Pebble/Java reserved word (`filter`, `class`, …) now renders in SSR. The compiled template reads it as `filter_`, but the Java runtime's `DeriveStashFromDefaults.derive` keyed it as `filter`, so it rendered empty until hydration. `derive` now returns the template's (mangled) names. A new `DeriveStashFromDefaults.rootVars(defaults, props, overlays…)` builds a root render's context from source-named props and stash, and `PebbleIdent` is public. Host applications building a root context should use `rootVars` (as `integrations/spring`'s `Render` now does).
- 1ef6ae2: A conditional that directly abuts text (`x:{c ? 'on' : 'off'}`, `{c ? 'on' : 'off'}:y`) no longer renders whitespace between the text and the chosen branch on the template adapters. Before, the conditional's control tags were emitted on their own lines, and those newlines surfaced as a space (`x: off`, `off :y`), which differed from Hono's `x:off` / `off:y`. Jinja, MiniJinja, Twig, Pebble, ERB and Blade now emit the control tags inline. Mojolicious keeps line statements but escapes the newline before each one. Xslate uses the inline `<: … :>` tag form.
- @barefootjs/shared@0.39.3

## 0.39.2

### Patch Changes

- 2f65656: Render literal computed members through index/key lookup, preserving optional numeric indices and punctuation-containing object keys in values, conditions, and filter predicates. Keep absent optional nested Go objects distinct from present zero-valued objects, and prevent Mojolicious strict literal comparisons from matching an absent lookup to false or zero. Graduate the corresponding silent limitations while retaining their conformance fixtures as regression coverage.
- a0ca4f5: Keep literal-seeded signals independent from same-named bare props by separating their lexical bindings before building IR. Preserve object keys, shadowed callback bindings, caller-facing prop names, and build-supplied type information including custom module/type resolutions. Compute Go numeric memos over distinct signal and required prop values instead of silently seeding zero or truncating fractional results, and render direct/interpolated numeric memo text using JS's decimal/exponent notation. Seed getter aliases after memo recomputation so template backends preserve their live values. Graduate the signal/prop name-collision limitation and retain its fixture as a regression test.
- @barefootjs/shared@0.39.2

## 0.39.1

### Patch Changes

- fa57bd2: Fix the value-elided form of an async reactive factory declaration (`const [, save] = createMutation(...)`, `const [, fetchItems] = createQuery(...)`, #3245) leaking its synthesized internal getter name (`__bfGet_<action>`, analyzer.ts's `collectFactorySignal`) into server-facing output. Since nothing in the source ever references that name (it exists only so getter-keyed consumers like substitution env and SSR seeding stay total), it should never appear anywhere a backend author or the hydration wire format would see it — but it was still baked into the Hono/Test SSR module's getter stub, every template-stash adapter's SSR-defaults manifest and seed plan, and the Go adapter's generated props struct/constructor.
  
  Each of those four sites now skips a signal whose value binding is both a `factory` and `getterElided`, matching the `bf debug graph` precedent already established for this shape (#3227's `debug.ts` filter). The action's own SSR stub (`Object.assign(() => {}, { isPending: () => false, error: () => undefined })`) is unaffected and still emitted whenever the source references it.
- 298e42d: Fix a closed-type `{...rest}`-forwarded attribute that starts absent (the caller never passed that key) rendering as `attr=""` instead of being omitted, on every template-string adapter (ERB, Jinja, minijinja, Mojolicious, Twig, Blade, Xslate, Pebble, Go template). Each adapter's "bare optional prop" nullish-omission guard only recognized a `props.<key>`-shaped expression, not the `rest.<key>`-shaped expression `{...rest}`'s per-key expansion produces (#3057), so the guard never fired for a rest-forwarded key and it always rendered unconditionally.
  
  The Go template adapter's own reactive-omission guard used the same fix, plus a Go-specific `bf_get`-vs-nil check for the rest bag (a `map[string]any` field, not a Props-struct field like other optional props). A separate, unrelated gap remains on Go: a signal declared `T | undefined` and seeded with a literal `undefined` still bakes to the empty string instead of `nil` when forwarded this way — tracked as the `go-undefined-signal-seed-not-nil` known limitation, with the affected fixture pinned there rather than fixed here.
- @barefootjs/shared@0.39.1

## 0.39.0

### Patch Changes

- 3c5c771: Export `createMutation` (with `MutationAction` and `CreateMutationOptions`) from `@barefootjs/client`, and compile it. This is the first release that exports it. `const [saved, save] = createMutation(fn, { invalidates })` is recognised as a reactive factory, the same way as `createQuery`:
  
  - `saved()` is seeded `undefined` on the server on every adapter. A mutation has no `initial`, and passing one is refused with the new BF118, which names `createQuery` as the factory that takes it.
  - The request function is emitted into client JS only, as the call's own argument, with prop reads kept live. It is never evaluated on the server and never wrapped in anything that tracks. `invalidates` passes through unchanged.
  - `save.isPending()` and `save.error()` are seeded through the same gate as a query action's. The gate now also admits `isPending()` in an HTML boolean attribute on an intrinsic element, so `disabled={save.isPending()}` renders the enabled button on every adapter. This applies to a `createQuery` action too.
  - A destructure with more than two elements, or a third argument, is refused with BF115 / BF116, as for `createQuery`.
  
  `createMutation`, `MutationAction` and `CreateMutationOptions` live in the `@barefootjs/client/async` subpath next to `createQuery`, re-exported by the main entry and `/runtime`. The Hono SSR shim exports a `createMutation` stub.
  
  ERB, Mojolicious, Jinja, Twig, Xslate, Blade, Rust (minijinja) and Pebble now lower a dynamic HTML boolean attribute from the IR's pre-parsed expression tree instead of re-parsing its raw source text, so a seeded accessor reaches their output there too. Before, they emitted a read of the undeclared action (`save.isPending`), which rendered the same HTML only because the engine treated the missing variable as falsy.
- e44b74e: `createProgramForFile` takes an optional third argument, `{ currentDirectory }`, which sets the directory a relative `filePath` resolves against and the Program's `getCurrentDirectory()`. When it is omitted, behaviour is unchanged. The `test-render` harnesses use it through `@barefootjs/adapter-tests`' `compileFixtureJSX`. Before this change, whether a fixture's `@barefootjs/*` imports resolved to real types or to `any` depended on the directory the tests were started from. The fixture filenames, and so the file-scope ids derived from them, are unchanged.
- 135a074: The `test-render` harnesses now import `compileFixtureJSX` from the narrow `@barefootjs/adapter-tests/harness-program` subpath instead of the package barrel. This removes a module cycle between each adapter's `test-render` and `@barefootjs/adapter-tests`, and stops every `test-render` from loading the full fixture corpus.
- cdfb970: `@barefootjs/pebble/test-render` starts its render JVMs with `-XX:-UsePerfData -Xlog:disable -Xlog:all=warning:stderr`. The rendered HTML is read from stdout, where the JVM prints warnings by default, so a warning such as an `hsperfdata` file-lock notice could be prepended to the HTML.
- b17c4bf: `createQuery`'s action accessors, `action.isPending()` and `action.error()`, are now seeded as ordinary, IR-visible values (`false` / `undefined`, spec/async.md §7.3) at the template positions where the seed renders exactly like the Hono reference. Before, a read of either accessor in a template position was refused with BF117. Two positions are seeded:
  
  - a conditional test, for either accessor: `{fetchPosts.error() ? <Spinner/> : null}`;
  - an ARIA boolean-state attribute on an intrinsic element, for `isPending()` only: `aria-busy={fetchPosts.isPending()}`.
  
  A component's pending and error branches render normally on every adapter, including Hono, and `renderToTest` shows both branches structurally. Recognition is structural: it is fed by `createQuery`'s own binding metadata, not by a name heuristic. One gate decides both the seed and BF117's refusal, and the upcoming `createMutation` reuses it unchanged.
  
  Every other read still refuses with BF117, because the seed would diverge from Hono there. `/* @client */` still works as an escape. The reads that still refuse:
  
  - a text child (`{fetchPosts.error()}`);
  - `error()` in any attribute;
  - `isPending()` in a non-ARIA-boolean attribute;
  - a structured template attribute's ternary;
  - calling the action itself (`fetchPosts()`);
  - a compound or transitive read through a memo, constant, function or aliased action binding.
  
  Eight non-Hono DSL adapters now lower conditions and attributes from the IR's pre-parsed expression tree instead of re-parsing raw source text: ERB, Mojolicious, Jinja, Blade, Pebble, Twig, Xslate and Rust/minijinja. This is what lets a seeded accessor reach their output.
- a720468: The `vite` peer range of `@barefootjs/vite` and of every adapter's `/vite` builder is now `^6.0.0 || ^7.0.0 || ^8.0.0`. Installing on Vite 7 or 8 no longer reports an unmet peer. The plugin imports only Vite's types. CI now runs every adapter builder's `vite build` tests and the `integrations/csr` E2E suite against each of these majors.
- Updated dependencies [e8ff400]
  - @barefootjs/shared@0.39.0

## 0.38.0

### Patch Changes

- Drop the `combobox` and `select` render-divergence declarations. Both fixtures now render byte-identical to the Hono reference on every template adapter: `data-placeholder` / `data-selected` render at SSR from the new `showPlaceholder` / `defaultSelected` props, the `ComboboxValue` / `SelectValue` text slot keeps its SSR markers, and the SSR portal content renders in the same place as the reference.
- 9b4802b: A client-interactive component whose entire JSX return is a single child-component call (no wrapping element) now renders the parent's `<!--bf-scope:...-->` / `<!--bf-/scope:...-->` comment marker pair on every adapter, so the parent hydrates and its forwarded handlers and reactive props reach the child. The decision (`IRComponent.needsScopeComment`) is now computed once in `@barefootjs/jsx`, right after client-JS analysis runs, instead of being re-derived per adapter: Hono reads it instead of its own local check, the eight DSL adapters gained the wrap they never had, and go-template's existing partial support now also emits the closing marker (previously missing, which could leak sibling content into the scope's query range).
- 7b4c221: An `ssrPortalOwnerScope`-flagged element (the `ref`-callback SSR-portal pattern the dialog-style primitives use — `DialogOverlay`/`DialogContent`, `DropdownMenuContent`, `PopoverContent`, and the `<Portal>` component) now stamps `bf-po` on its own tag and renders at a `{{ bf.portals() | raw }}` outlet instead of inline at its source position — matching the Hono reference adapter's `<BfPortals />` contract, so hydration no longer moves the DOM after the fact.
  
  `Bf.register_portal_element`/`Bf.portals()` (Java runtime, `Bf.java`) collect each flagged element's already-rendered markup, mirroring `register_script`/`scripts()`'s existing shape — including the SAME `synchronized (scripts)` monitor, since `Bf.newRoot` makes this bundle reachable from independent top-level island renders on separate threads, not just a single-threaded `render_child` recursion. `portalElements` threads through the private canonical constructor exactly like `scripts`/`preloads` (a shared `List` reference, never copied), so `render_child` and `newRoot` propagate it to any nesting depth for free, with no Go-style manual recursive-propagation helper needed.
  
  The Pebble adapter (`wrapSsrPortalElement`, `pebble-adapter.ts`) captures the flagged element's already-rendered markup via this adapter's own custom `{% set NAME %}…{% endset %}` set-block extension (`SetBlockExtension`, `java/…/pebble/ext/`) — the same mechanism `renderComponent` already uses to forward JSX children — then hands it to `register_portal_element` through a second `{% set _ = … %}` expression statement, so nothing prints at the source position.
  
  The conformance CLI (`Main.render`) and the Spring example integration (`Render.Rendered` gains a `portals` field; `Layout.Opts`/`Layout.render` gain a `portals` outlet next to `scripts`, wired through `DemoController`/`TodoController`/`AiChatController`, which render the `PortalExample` fixture) both now surface the collected portal content after the component's own output.
  
  Verified against real Pebble (Java 21, `io.pebbletemplates:pebble`) for the `dialog` (two "use client" boundaries deep — `DialogContent` inside `Dialog`), `dropdown-menu`, `popover`, and `portal` fixtures, matching Hono's `bf-po` values and full `normalizeHTML`-canonicalized output exactly.
  
  Graduates the `dialog`/`dropdown-menu`/`popover`/`portal` fixtures off the Pebble adapter's `ref-callback-portal-content-inline-at-ssr` render-divergence pins (the shared known-limitation entry stays open for the other adapters that still exhibit it).
- 988106f: `@barefootjs/client`'s `formatDate` is now documentation-tier `@internal` and no longer appears in `docs/core/advanced/api-reference.md` or the API comparison table — it is compiler ABI (the lowering target of the `.toLocaleDateString(locale, { timeZone, ... })` sugar), not an authored API. This is a breaking behaviour change for anyone who imported it directly: **an authored `formatDate(...)` call in a template position now fails to compile with BF056**, on every adapter including Hono. Fix it by switching to `date.toLocaleDateString(locale, { timeZone, ... })` with literal options (compiles to the same `format_date` helper), or by deferring the whole read to the client with `/* @client */`.
  
  `@barefootjs/jsx` no longer registers a lowering plugin for authored `formatDate(...)` calls (`formatDatePlugin` removed) and instead refuses them with the new BF056 diagnostic, fired once in the shared IR-build phase ahead of every adapter's `generate()`. The `.toLocaleDateString()` sugar's own lowering is unaffected.
  
  Each of the nine template-language adapters (plus Hono) pins the new `format-date` conformance fixture's BF056 refusal in its own `conformance-pins.ts`.
- 4c6f395: A component whose multi-return `if`/`else` chain has a branch wrapped in a bare JSX fragment (`return <>…</>`, no wrapping element) now refuses to compile with `BF029` whenever that branch hydrates, which is when the component is `'use client'` or the fragment branch renders a child component the parent must initialize. This replaces silently shipping a branch whose events never bind after hydrating existing server HTML. `ComponentDef`'s comment-scope flags are decided once per component, not per branch, so the client can't tell which branch needs the comment-scope boundary; SSR and a fresh client mount were already correct, only claiming existing SSR markup during hydration missed it. Wrap the branch in a real element instead of a bare fragment, or add `/* @client */` immediately before the fragment to compile it anyway and accept the known hydration gap.
- 737ce71: Known limitations now live in an in-repo registry (`packages/adapter-tests/limitations/<id>.ts`) instead of the `known-limitation` GitHub label. `ConformancePin.issue` is replaced by the required `limitation` id, `unescapable` becomes a bare `true`, and `RenderDivergences` values cite a limitation id instead of a prose reason. Every adapter's `conformancePins` cites the registry accordingly.
- ffb1026: A component-body local bound to an opaque call (`const label = makeLabel(); {label()}`, or a library-returned accessor like `const posts = createQuery(...)`) invoked in text position now refuses to compile with `BF101` on every non-JS-runtime adapter, instead of silently lowering to a bare template-variable lookup with no backing value (an empty or failing render, with no diagnostic). Hono's real JS runtime keeps evaluating this shape correctly and is unaffected. Add `/* @client */` before the call to defer it to the client, or pre-compute the value in the backend.
- f68d4a4: Fix the `ref-callback-portal-content-inline-at-ssr` known limitation on the Hono adapter: a `ref` callback whose body calls `createPortal(el, document.body, { ownerScope })` (the pattern `dialog`/`dropdown-menu`/`popover`/`portal` use) is now recognized structurally by the compiler and the flagged element renders at its portal outlet (`<BfPortals />`) during SSR, matching where hydration's `createPortal` places it — so hydration is a structural no-op instead of a relocation. The client `isSSRPortal` guard also recognizes `bf-po` set directly on the element, not only a `bf-pi` wrapper ancestor. Every other template adapter still renders the flagged element inline (no SSR portal outlet yet) and is pinned with a `render-divergences.ts` entry citing the registry limitation.
- 121016e: The `test-render` harnesses now seed the root component's `bf-p` hydration payload with the caller's props, the way a production route handler does (`$bf->_props($props)` in the Blade/PHP integrations, `render_root` in the Axum integration, `Render.renderRoot` in the Spring integration). Before, their SSR carried no `bf-p`, so a component whose client JS reads a prop could not hydrate from it. The payload is the caller's raw props, minus harness-only `__`-prefixed keys. For Pebble, the test CLI (`Main`) now hands those props to `Bf`'s existing `rootProps` constructor; for minijinja, the `bf-render` binary gains a `props` payload field that sets the root's `BfInstance::props`. Rendered HTML apart from `bf-p` is unchanged.
- @barefootjs/shared@0.38.0

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
