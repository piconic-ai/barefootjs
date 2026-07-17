# @barefootjs/xslate

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

- 2d64f28: Lower `{...props}` component-spread props on the Jinja, MiniJinja, and Xslate adapters instead of refusing them with BF101 — porting the segment-based fold the Twig adapter shipped with previously.

  Jinja and MiniJinja have no dict-splat syntax that flattens past a single `**` per call (CPython's `dict()` builtin raises `TemplateSyntaxError` on more than one `**` argument), so `renderComponent` now builds each child's props dict as an ordered sequence of segments — literal `{'k': v, ...}` dict entries and spread expressions — and folds them into one expression via NESTED `dict(base, **top)` calls, later segment winning on key conflict (matching JSX's `{...a, ...b}` / `Object.assign` semantics). A spread operand is wrapped `(EXPR or {})` before unpacking: `**`-unpacking an undefined/none bag raises even though Jinja's `ChainableUndefined` (Python) / `UndefinedBehavior::Chainable` (minijinja) tolerate chained member access on it, so the `or {}` guard normalises a missing bag (e.g. `children.props` when `children` was never passed) to an empty dict first. Verified against real jinja2 3.1.6 (Python) and the minijinja crate v2 (Rust).

  Xslate's Kolon dialect has no hash-splat syntax at all (`%$hash`-into-hashref-literal is a parse error), so its `renderComponent` instead folds the same ordered segments via chained `.merge(...)` calls — Kolon's builtin hash method, later argument wins. A spread operand is wrapped `(EXPR // {})`: `.merge(undef)` warns "Merging value is not a HASH reference" on real Text::Xslate 3.5.9, so the defined-or guard is required.

  This unblocks the site/ui `Slot` polymorphism pattern (`<Slot className={classes} {...props}>`) used by `badge`, `breadcrumb`, `button`, `button-group`, `icon`, `item`, `kbd`, and `slot` itself, all of which previously failed to compile on these three adapters. The `button` and `kbd` pins in each package's `conformance-pins.ts` graduate from an expected-BF101 diagnostic contract to real rendered-HTML conformance.

- 36fec0e: Lower array-index / nested / rest destructure `.map()` callback params on all template adapters (#2087, refs #2069).

  `LoopParamBinding` gains a structured `segments` path (field/index steps with `isIdent` classification) and the shared gate — renamed `isLowerableLoopDestructure`, old name kept as a deprecated alias — now admits fixed bindings at any path depth (`([k, v])`, `{ cells: [head] }`, `{ user: { name } }`), array-rest (`[first, ...tail]`, lowered as the exact slice), and object-rest used as member access or as a `{...rest}` spread onto an intrinsic element (lowered as a true residual bag via a new per-adapter `omit` runtime helper feeding the existing `spread_attrs` pipeline; ERB uses native `Hash#except`).

  The `rest-destructure-{object-spread,array,nested}-in-map` conformance fixtures graduate from BF104 pins to real-engine HTML comparison on all seven template adapters, alongside the new `destructure-array-index-in-map` / `destructure-nested-object-in-map` fixtures. Still refused (BF104): bare value uses of an object-rest name, spreads onto components/providers, `.filter().map(destructure)` chains, and `__bf_`-prefixed binding names.

  Collateral hardening: `static-array-from-props(-with-component)`'s destructure no longer trips BF104, which exposed an orthogonal gap — a loop array bound to a computed function-scope const would silently render empty. Template adapters now raise a narrow BF101 for that shape instead.

- fa393c0: Template-primitive registry V2: user-imported helpers via the lowering-plugin registry (#2069, catalog entry for #1187).

  - **`RelocateEnv.loweringMatchers`**: `isCallAcceptedByAdapter` (`packages/jsx/src/relocate.ts`) now consults a component's bound `LoweringPlugin` matchers (`prepareLoweringMatchers`, #2057) as a third acceptance path alongside `templatePrimitives` / `acceptsTemplateCall`. A bespoke user-imported helper (`const serialized = customSerialize(props.config)`) that was never — and can never be — added to any adapter's string-keyed `templatePrimitives` map now inlines into the generated client template instead of falling back to `(undefined)`, provided a `LoweringPlugin` recognises the call (import-aware via `prepare(metadata)`, same seam the built-in `queryHref` plugin uses). The shadow guard applies identically: a local binding that shadows the plugin's expected import name is not accepted.
  - **One-hop alias resolution (`RelocateEnv.aliasTargets`)**: `const fmt = customSerialize; fmt(x)` now resolves `fmt` to `customSerialize` for both the `templatePrimitives` key lookup and the matcher dispatch — exactly one hop (an alias-of-an-alias, or an alias to a still-component-scoped name, stays refused; there is no transitive chain resolution).
  - **Fixed a `_p._p` double-rewrite latent bug** in the props-object bare-lift path (`relocate.ts`'s `decideAction`) that the `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` conformance case pins against, for the case where an accepted call's object-literal argument mixes bare-props-object and per-key member access.
  - **Generic `helper-call` rendering**: all 7 template adapters (Go, Mojolicious, Xslate, ERB, Jinja, Rust/MiniJinja, Twig) render the neutral `LoweringNode` `helper-call` variant (previously unused) alongside the existing `guard-list` — a plugin's `helper` id maps to the adapter's own runtime-helper naming convention (Go `bf_<helper>`, Perl `bf-><helper>`, Kolon `$bf.<helper>`, everyone else `bf.<helper>`), mirroring exactly how the built-in `query` helper (`queryHref`) already renders. The framework renders the invocation; the plugin author is responsible for registering the backend function (e.g. into Go's `FuncMap`). Client-side, the call is left untouched — the browser executes the real imported function, same as `queryHref`.
  - Conformance: `USER_IMPORT_VIA_CONST` and `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` (`packages/adapter-tests/src/cases/template-primitives.ts`) now register a small test-only `customSerialize` `LoweringPlugin` around each compile (restored via `try`/`finally` so a failure can't leak the plugin into unrelated suites) and are unskipped on all 7 template adapters — Hono, whose broad `acceptsTemplateCall` already covered this shape, stays green with the same case setup.

  `TemplatePrimitiveRegistry` / `TemplateCallAcceptor` remain V1 (identifier-path, fixed at adapter-construction time) — see the updated doc comments on `packages/jsx/src/adapters/interface.ts` and the `spec/compiler.md` capability-flags section for the full V1/V2 split.

### Patch Changes

- 6c13ce7: `@barefootjs/jsx` exports `ConformancePin` / `ConformancePins` types, and each adapter package now exports its conformance `expectedDiagnostics` pin set as a structured `conformancePins` module (with `issue:` URLs) consumed by its own conformance test. These structured pins also feed a repo-internal component × adapter compile-compatibility matrix (`ui/compat.lock.json`, regenerated with `bun run compat:lock` and drift-checked in CI) that is not part of the published CLI or any published package's runtime surface.
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

### Minor Changes

- 848896b: Add `runAdapterConformanceTests` for the Text::Xslate adapter (with a
  `renderXslateComponent` test renderer), validated against the same shared
  fixture corpus as mojo.

  Make the adapter's runtime-helper calls consistent: every JS-semantics-sensitive
  value operation goes through a `$bf` method, so the runtime's JS-compat handling
  is always applied (rather than a raw Kolon builtin). `.filter` / `.every` /
  `.some` / `.find` / `.findIndex` / `.findLast` / `.findLastIndex`,
  `.toLowerCase` / `.toUpperCase`, `.join`, and `.length` lower to the
  corresponding `$bf` methods — new methods
  on the `BarefootJS` runtime in `@barefootjs/perl`. This also fixes a latent bug:
  `.length` previously used Kolon's array-only `.size()`, which faults on a string;
  `$bf.length` handles both arrays (element count) and strings (char count).

  The skip list is verified, not inherited: the six fixtures mojo skips for
  Perl-EP scoping faults (`logical-or-jsx`, `nullish-coalescing-jsx`,
  `branch-map`, `return-logical-or`, `return-nullish-coalescing`, `return-map`)
  all PASS on Xslate, because Kolon resolves variables from the per-render vars
  rather than Perl lexicals. `style-object-dynamic` is pinned as a `BF101`
  diagnostic (a clean refusal) rather than skipped. Eight fixtures remain skipped
  (SSR context, multi-component scope-id harness, Phase-2b `site/ui` primitives),
  each confirmed to genuinely fail.

### Patch Changes

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

- 6561b34: Bring the Text::Xslate (Kolon) adapter to parity with the Mojolicious adapter on the Phase 2b `textarea` and `checkbox` conformance fixtures, which it previously skipped.

  Ported (in Kolon form) from the Mojo adapter:

  - **Conditional inline-object spread** — `{...(cond ? { 'aria-describedby': x } : {})}` (and the function-scope local-const form `const sizeAttrs = size ? { ... } : {}; {...sizeAttrs}`) now lowers to a Kolon inline ternary of hashrefs through `$bf.spread_attrs(...)` instead of raising `BF101`.
  - **`Record<staticKeys, scalar>[propKey]` spread value** — CheckIcon's `sizeMap[size]` lowers via the shared `parseRecordIndexAccess` to an inline bracket-indexed Kolon hashref `{ 'sm' => 16, ... }[$size]`. Note: Kolon indexes a hashref literal with bracket syntax `{…}[$key]`, not Perl's arrow-deref `{…}->{$key}` (which Kolon's parser rejects).
  - **Nullish optional-attribute omission** — an optional, no-default, nillable prop (e.g. textarea's `rows`) is now guarded with a Kolon `: if (defined $rows) { … : }` block so the attribute drops when unset rather than rendering `rows=""`.
  - **Props-object inherited-attribute enumeration** — `function Checkbox(props: CheckboxProps)` now calls the shared `augmentInheritedPropAccesses(ir)` so inherited bare optional attributes (`id={props.id}`) get the `defined`-guard.
  - **Hyphenated child rest-bag routing** — a hyphenated child prop name (`<CheckIcon data-slot="checkbox-indicator" />`) is now quoted in the `render_child` hashref (`'data-slot' => …`); an unquoted key parses as subtraction in Kolon.

  The test renderer now defers the child-compile error gate and re-checks only the components a fixture transitively references, so a sibling source file that exports an unreferenced component which legitimately can't lower to Kolon (e.g. `../icon`'s generic `Icon`, which splats `{...props}` onto child components — no Kolon form) no longer blocks a fixture that never renders it.

- Updated dependencies [848896b]
  - @barefootjs/perl@0.9.0
  - @barefootjs/shared@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [3ed9659]
  - @barefootjs/perl@0.8.0
  - @barefootjs/shared@0.8.0

## 0.7.0

### Minor Changes

- 199644e: Add `@barefootjs/xslate` — a Text::Xslate (Kolon) adapter that compiles
  BarefootJS IR to `.tx` templates and ships `BarefootJS::Backend::Xslate`. Because
  the rendering backend is framework-agnostic, it runs under any PSGI/Plack app
  (no Mojolicious required). Validated end-to-end against Text::Xslate 3.5.9 and
  served live via Plack.

  The EP→Kolon mapping is mechanical (`<%= X %>` → `<: X :>`, `<%== X %>` →
  `<: X | mark_raw :>`, `bf->m` → `$bf.m()`), so the engine-agnostic
  `BarefootJS` runtime renders through Xslate unchanged.

  Also generalizes the core `render_child` (in `@barefootjs/perl`) to accept the
  single-hashref call form that Text::Xslate Kolon (and Template Toolkit) method
  calls require, in addition to the existing Mojo list form. Backward-compatible.

### Patch Changes

- Updated dependencies [ac91bc6]
- Updated dependencies [199644e]
  - @barefootjs/perl@0.7.0
  - @barefootjs/shared@0.7.0
