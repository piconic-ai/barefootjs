# @barefootjs/blade

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
