# @barefootjs/go-template

## 0.21.1

### Patch Changes

- 3f7be3d: Fix #2299: an inline-object-typed prop's nested member access
  (`props.cfg.id` where `cfg: { id: number }`) now renders correctly on the
  typed struct backends instead of empty. The inline object type bakes as an
  untyped map (`map[string]interface{}` on Go), so an exact-case dot path
  (`.Cfg.ID`) missed the JS-cased map key. The Go adapter now routes such a
  chain through the case-tolerant `bf_get` runtime getter; Rust already
  rendered it correctly. The `object-catalogued` render divergence is removed
  from both adapters, so the object-synthesis data points now run the oracle
  comparison on every backend.
- f3ec45d: Pin `object-catalogued` (#2277) as a render divergence on the two typed
  struct backends. An inline object-typed prop's nested member access
  (`props.cfg.id`) renders empty on Go and Rust because the inline object type
  doesn't synthesize a named struct/typed field — tracked as #2299. The
  object-synthesis data points still run the oracle comparison on Hono and
  every dynamic backend (Ruby/Python/PHP/Perl).
  - @barefootjs/shared@0.21.1

## 0.21.0

### Patch Changes

- 495a18f: Add #2274: a `date` catalogue entry lowering a zero-arg `Date.prototype` method call on a `Date`-typed prop (`createdAt.toISOString()`, `updatedAt.getUTCFullYear()`, …) to a backend-neutral `helper-call` LoweringNode instead of refusing it as an uncatalogued rich-type method call (#2273's `checkRichTypeMethodCalls` now exempts it).

  - `@barefootjs/jsx`: `date-lowering.ts` registers the `date` builtin lowering plugin recognizing `getUTCFullYear` / `getUTCMonth` / `getUTCDate` / `getUTCHours` / `getUTCMinutes` / `getUTCSeconds` / `getTime` / `toISOString`; the analyzer widens a destructured `Date`-typed prop's rich-type evidence so the plugin (and the #2273 refusal) can see through the destructure.
  - `@barefootjs/go-template`, `@barefootjs/erb`, `@barefootjs/jinja`, `@barefootjs/php`, `@barefootjs/perl`, `@barefootjs/rust`: each runtime gains a `date(recv, op)` helper (`bf_date` / `bf.date` / `BarefootJS::Date` / `barefootjs.date`) accepting either the backend's own native date/time value or an ISO-8601 string, normalizing both to the same instant before dispatching `op` — pinned against the JS-normative golden vectors (epoch 0, a pre-1970 instant, a leap day, and the four-digit-year boundary). `getUTCMonth` is 0-based, matching JS; every accessor and `getTime` render as an integer; `toISOString` always renders millisecond precision, UTC.

  The Rust runtime additionally gains a hand-rolled proleptic-Gregorian calendar (`date.rs`, Hinnant's `civil_from_days`/`days_from_civil`) and a `JsValue::Date`/`minijinja::Value` native receiver shape — no new crate dependency.

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

  - @barefootjs/shared@0.20.0

## 0.19.1

### Patch Changes

- 5b184a8: Fix #2260: the "controlled component" idiom (an internal signal, a controlled signal seeded bare from a prop, an `isControlled` presence memo, and a derived ternary memo — the shape `ui/components/ui/toggle`, `switch`, and `checkbox` all share) now honours a caller-supplied value in SSR output on every adapter, instead of only the uncontrolled default.

  - **`packages/jsx`**: `freeIdentifiers()` no longer reports the JS value-keyword `undefined` as a free variable (it parses as an `identifier` node, unlike `null`, which is a `literal`). This let `computeSsrSeedPlan`'s `classify()` correctly classify `props.X !== undefined` (the `isControlled` memo) as `derived` instead of `opaque` — the actual root cause on ERB, Jinja, and Rust (minijinja), which all consume the shared SSR-seed-plan machinery. Fixes the `toggle:gen:pressed:true` / `switch:gen:checked:true` / `checkbox:gen:checked:true` data points on those three adapters (their `defaultPressed`/`defaultChecked` sub-case already passed).
  - **`@barefootjs/go-template`**: Go bakes these values into the constructor rather than seeding in-template, and needed three coupled fixes: (1) a new `collectPresenceCheckedPropNames` collector recognizes `props.X !== undefined` as a nillability-requiring consumption, flipping the prop to the existing nillable `interface{}` representation (#2248) — presence is otherwise inexpressible on a concrete `bool` field; (2) `memoInitialFromParsedBody` gained a presence-check branch (`props.X !== undefined` → `in.X != nil`) and a ternary-over-getter-calls branch (`cond() ? a() : b()` where all three are signal/memo getters, not just the pre-existing string-literal-branch case) for the derived `isPressed`/`isChecked` memo; (3) `convertInitialValue`/`getSignalInitialValueAsGo` now type-assert a nillable-flipped prop reference against the consuming signal's own concrete type (unwrapping a `T | undefined` signal type annotation to `T`) instead of a bare reference — needed because the flip in (1) otherwise breaks a sibling signal's own initializer (`createSignal<boolean | undefined>(props.pressed)`) with a Go compile error (`interface{}` value into a `bool` field).

  Removes `toggle`/`switch`/`checkbox`'s `gen:pressed:true`/`gen:checked:true` `skipDataPoints` pins on ERB/Jinja/Rust, and those plus `gen:defaultPressed:true`/`gen:defaultChecked:true` on Go.

- 1c2b116: Fix #2262: `.flat(dynamicDepth)` with a runtime depth of `0` or negative now matches the documented `ToIntegerOrInfinity` contract (shallow copy, not empty) end-to-end on Go and ERB. The depth coercion itself (`coerceFlatDepth` / `coerce_flat_depth`) was already correct — the bug was in stringifying the unflattened nested-array elements afterwards (e.g. `rows.flat(0).join(' ')`):

  - Go: `toString` (used by `Join`/`ConcatStr`) returned `""` for any non-primitive value, including a nested-array element left in place by a no-op flatten — now it recursively comma-joins array elements, mirroring JS's `Array.prototype.toString` (`this.join(',')`).
  - ERB: the shared `string` helper fell through to Ruby's `Array#to_s` (`"[[1], [2]]"`, inspect-style) for array values — now it recursively comma-joins the same way.

  Removes the `array-flat-dynamic-depth:gen:depth:zero` / `:gen:depth:negative` `skipDataPoints` pins on both adapters.

- 1c2b116: Fix #2267: an absent defaultless optional scalar prop consumed as a bare TEXT expression (`{size}` for `size?: number`, no `??`/attribute involvement) now renders empty on Go, matching the JS reference (`undefined` → ""), instead of the concrete field's zero value (`0`).

  `resolvePropGoType`'s existing `interface{}` nillable flip (previously driven only by `??` consumption, #2248, and bare-omittable-attribute consumption, #2259) now also covers bare text-position consumption via a new `collectTextConsumedPropNames` collector. The text emitter (`renderExpression`) routes a flipped prop's bare reference through the runtime's nil-safe `bf_string` stringifier (`""` for nil, otherwise identical formatting to `text/template`'s own default printing) instead of a raw `{{.X}}` — a bare `{{.X}}` would print a nil `interface{}` as the literal `<no value>`, not empty.

  Adds the `bare-text-optional-scalar` fixture (adapter-tests) pinning the `present` / `absent` / `zero` data points.

- 5270372: Fix #2254: Go's `??` nullish gate now applies in **condition position** (ternary tests / `{{if}}` paths, reached via `convertConditionToGo`), not just plain expression-interpolation positions.

  `renderConditionExpr`'s `logical` case unconditionally emitted Go's truthiness-based `or` for both `&&` and `??`, so a nillable-lowered optional prop's present-but-empty value (`''`/`0`/`false`) wrongly fell back to the `??` default when tested in a condition — e.g. `(props.label ?? 'Default') === 'Default' ? <A/> : <B/>` rendered `<A/>` for `label=""`, diverging from JS (which keeps `''` since it's present, not nullish). The sibling `logical()` emitter (used for other expression positions) already routed nillable operands through the nil-testing `bf_nullish` helper since #2248/#2252; this brings the condition-position emitter in line with it via the same `nillablePropNameOf` gate.

- 1c2b116: Fix #2256: JS `??` nullish semantics now cover a single-hop member-access left operand rooted at a nillable optional-object prop (`user?.name ?? 'anonymous'`), not just a bare prop reference. Both `collectNullishConsumedPropNames` (the `interface{}`-flip seam) and the `??` emitter's `nillablePropNameOf` gate previously matched only `label` / `props.label` shapes, so `user?.name ?? '…'` fell through to the truthiness-based `or` — collapsing a present-but-empty `""` member into the fallback where JS keeps it. Both now recognize the ROOT of a single-hop member chain (`user` in `user?.name`); an optional-object prop already lowers to nillable `map[string]interface{}` by construction, and the existing `bf_get` nil-safe `?.` lowering already returns Go `nil` on a missing root, so gating on the root is sufficient — no new runtime helper needed. A deeper chain (`props.user?.name`, `user?.address?.city`) is unaffected — same single-hop `?.` caveat already documented on the `member` `ParsedExpr` variant.

  Removes the `optional-chaining-prop:empty-name` `skipDataPoints` pin.

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

### Minor Changes

- 2246d40: Destructured optional props keep their TypeInfo and optional flag (#2259). `{ size }: { size?: number }` now resolves in `propsParams` exactly like the props-object style: primitive members carry their concrete type, every member carries `optional` derived from the type's `?` (or a destructure default), and generated export signatures render the `?` again. The client JS no longer synthesizes a zero default when extracting a defaultless optional prop — the binding stays `undefined` when absent, matching JS destructuring semantics and the SSR seed.

  The Go adapter additionally recognises the destructured `x ?? <literal>` signal seed (matched structurally on the signal's `ParsedExpr`), so the #2248/#2252 hoisted-fallback/nillable machinery now fires for destructured components instead of seeding the signal with a literal zero, and an optional no-default scalar consumed as a bare omittable attribute (`rows={rows}`) takes the same `interface{}` flip so the `{{if ne .X nil}}` omission guard keeps firing now that the field would otherwise resolve concrete.

  The dynamic-template adapters (ERB / Jinja / Mojolicious / Rust / Twig / Blade / Xslate) widen `collectNullableOptionalProps` to declared-optional primitives, keeping Hono-style attribute omission for optional props that previously arrived untyped — this also extends the omission guard to props-object-style optional primitives, matching the reference render.

  Known output change on Go: a destructured optional scalar consumed as a bare TEXT expression now renders its zero value when absent (the pre-existing props-object behavior) instead of empty — tracked as #2267.

- 8803c4d: Fix #2248: JS `??` on an optional scalar prop now carries real nullish semantics on Go. An optional `string`/`number`/`boolean` prop consumed by `??` (with a non-zero-equivalent fallback and no destructure default) lowers to the adapter's established nillable `interface{}` representation, so "absent" is distinguishable from an explicit `''`/`0`/`false` at render time:

  - Template position: `{{bf_nullish .Label "Default"}}` (new runtime helper — falls back on nil only) replaces the truthiness-based `{{or …}}`, which collapsed a present-but-empty `""` into the fallback.
  - Signal seeds (`createSignal(props.size ?? 1)`): the constructor hoist checks `if in.Size != nil` instead of `if size == 0`, so an explicit `Size: 0` input is honoured (JS `0 ?? 1` is `0`). Numeric props coerce through new exported `bf.ToInt` / `bf.ToFloat64` (an untyped `Size: 3` literal boxes as `int` even for a float64-shaped prop); string/bool assert directly.
  - The flipped props join the existing nillable behaviours (bare-attribute omission on nil) by construction, and assignment ergonomics are unchanged — plain literals assign into `interface{}` fields.

  Generated-code API note: for exactly these props the `XxxInput` / `XxxProps` struct fields change from a concrete scalar type to `interface{}`. Props with a destructure default (`{ className = '' }`) or a zero-equivalent fallback (`?? ''` / `?? 0` / `?? false`, where nullish and truthiness semantics coincide) keep their concrete types.

  Found and verified by the data-point oracle conformance suite: the Go adapter's `skipDataPoints` entries for `nullish-coalescing-text` are removed, and all four adversarial points now match the JS reference render on real Go.

### Patch Changes

- a5a7930: Fix `test-render`'s prop-to-Go-literal string emission: string props were interpolated into the generated `main.go` with quote-only (or no) escaping, so a `"`, backslash, or newline in a prop value broke the render harness at Go compile time. All four emission sites now share `goStringLit` (`JSON.stringify`, whose escapes are a subset of Go's interpreted-string-literal escapes). Found by the data-point oracle conformance pilot (`spec/subset-conformance.md`): the `html-in-label` adversarial point passes on real Go after the fix.
  - @barefootjs/shared@0.19.0

## 0.18.7

### Patch Changes

- b5ccd0d: Fix #2236: two independent Go template adapter gaps in loop-param-shadowing
  resolution, both previously flagged as "not fixed" tracked residuals in the
  #2221/#2212 changesets.

  Slice A: `convertExpressionToGo`'s bare-identifier fast path (the
  "inline a function-scope literal const" shortcut, e.g. `totalPages`) is a
  string-keyed check over the raw JS source text, reached directly by call
  sites like attribute emission (`key={count}` → `data-key`) that never go
  through `identifier()` — the `ParsedExprEmitter` method that already carries
  loop-shadow guards (`loopParamStack` / `isOuterLoopParam`, mirrored from
  `resolveModuleStringConst` / `resolveModuleNumericConst`). A `.map((count) =>
...)` callback param shadowing an outer `const count = 7` got the OUTER
  literal inlined at the `data-key` position even though the text position
  (which does go through `identifier()`) correctly resolved to the per-item
  value. Guarded with the same loop-shadow checks the sibling resolvers use;
  unlike the Twig-family's coarse `collectLoopBoundNames` trade-off, Go's guard
  is scope-precise (it consults the live `loopParamStack`), so a const whose
  name is loop-bound elsewhere in the component still inlines correctly at a
  genuinely non-shadowed occurrence outside any loop.

  Slice B: Go's own `collectStringValueNames` (`prop-classes.ts`) was ported
  from Blade before #2212 added the `collectLoopBoundNames` exclusion, so it
  lacked the loop-bound-name subtraction every other adapter's prop-classes.ts
  has. An outer string-typed prop/signal shadowed by a `.map()` callback param
  of the same name still poisoned the shadowed occurrence's type resolution —
  `1 + label` inside `values.map((label) => ...)` (with an outer `label:
string` prop) emitted `bf_concat_str` (string concat, "1" + "1" → "11")
  instead of `bf_add` (numeric addition, 1 + 1 → 2). Fixed by porting the full
  #2212 shape the sibling adapters carry: same-file local consts join the
  string set (so an outer `{label + suffix}` with `suffix = '!'` still
  classifies as concat via its other operand once `label` is subtracted) and
  loop-bound names are excluded via `collectLoopBoundNames`. The exclusion is
  the accepted #2212 coarse trade-off (a flat, component-wide name set), not
  scope-precise like slice A: a genuinely non-shadowed occurrence outside the
  loop, whose name happens to be loop-bound elsewhere, also falls back to
  numeric `bf_add`. Safe (never silently-wrong string output), just imprecise.

  With both fixed, the shared `loop-param-shadows-outer-name` conformance
  fixture (#2212/#2221/#2222) now renders at reference parity on Go — its
  `render-divergences.ts` entry is removed.

- a64460c: Fix #2228: a `.filter(pred).map(item => <Child prop={item} …/>)` loop whose body is a single child component ranges over the WRAPPER Props slice (`{{range $_, $todo := .TodoItems}}` — `TodoItemProps` per item), but the inline filter predicate lowered loop-param field accesses as if the dot were the raw datum: `t.done` → `.Done`. The wrapper struct has no top-level `Done`; the datum lives nested under the prop that receives the loop param verbatim (`todo={todo}` → `.Todo.Done`). `html/template` resolves struct fields at execute time, so this shipped silently whenever the predicate branch happened to be short-circuited away (todo-app-ssr's SSR default `filter === 'all'` masks both `.Done` branches via Go's `and`/`or` short-circuit) and 500'd with `can't evaluate field Done in type TodoItemProps` the moment a non-'all' initial filter made the branch reachable.

  `renderLoop`'s filter-predicate lowering now derives the datum-carrying field from the child's props (the first non-event prop whose value is a bare reference to the loop param, capitalized with the same `capitalizeFieldName` the struct generator uses — never hardcoded) and threads it through `renderPredicateCondition` → `renderFilterExpr`, which qualifies loop-param references (`t`, `t.done`, `t.isDone()`) through that field (`.Todo`, `.Todo.Done`, `.Todo.IsDone`). Outer-scope `$.`/signal references and all non-wrapper filter call sites (plain-element loop bodies, standalone `.filter()`/`.find()`/`.every()` lowering) are unchanged — they keep the bare `.`/`.Field` forms. `sortComparator` lowering is unaffected: it goes through `bf_sort_eval`/`bf_sort`, whose Go-side reflection reader (`getFieldValue`) operates on the slice values themselves, not the `{{if}}` dot path; the loop `key` (`data-key`) renders inside the child template against its own Props and was already correct.

- e0bb7af: Fix the record-member sibling of #2236's bare-identifier gap, found by the new `loop-param-shadows-record-const` conformance fixture: `resolveStaticRecordLiteralIndex` (the fast path resolving `IDENT['key']` / `IDENT.key` against a module-scope object-literal const, e.g. the icon registry's `strokePaths['chevron-down']`) had no loop-shadowing guard, so `rows.map((cfg) => cfg.x)` under a module `const cfg = { x: 'outer-lit' }` baked `outer-lit` into every iteration of the SSR template. The guard is the same scope-precise check the bare-identifier fast path got in #2236 (now factored into a shared `isLoopShadowedName`, including the `loopBindingStack` scan for destructured callbacks); the shadowed occurrence falls through to the generic lowering and resolves the member through the loop binding (`{{.X}}`). Non-shadowed module record lookups are unchanged.
- c80d35a: Fix #2224: the two static-array `.map()` loop shapes #2208 deliberately left refused on the Go template adapter no longer refuse with BF101.

  1. A static array-of-objects loop whose body is a PLAIN ELEMENT (no child component), e.g. `const items = [{ label: 'Alpha' }, ...]; return <ul>{items.map(item => <li key={item.label}>{item.label}</li>)}</ul>`. `html/template` has no slice/map literal syntax and Go has no `.{Name}s`-shaped template target to bake into for an element body (that only exists for #2208's child-component shape), so rather than synthesizing a Go struct type for the item shape, the adapter now UNROLLS the loop body once per item at template-generation time — substituting each item's statically-known field values directly into text/attr/key positions instead of emitting a `{{range}}`. See `packages/adapter-go-template/src/adapter/analysis/static-element-loop-bake.ts` for the exact (conservative) acceptance gate: the callback param must be a simple identifier with no index binding, no `.filter()`/`.sort()`/`.entries()`-style chaining, a single-root non-conditional body, and every dynamic value in the body (text, attributes) must resolve to a scalar directly against the item — a signal/memo call, an index-param reference, a reference to any other non-static local, a nested loop/conditional/component, or a non-scalar field anywhere in the body keeps the existing BF101 refusal rather than risk silently wrong output. The unrolled markup keeps the same `<!--bf-loop:id-->` marker pair, `data-key` attributes, and text scope comments a dynamic loop emits, so CSR hydration (compiled by the separate, unaffected `ir-to-client-js.ts` pass) still finds the same DOM shape.

  2. An inline, unnamed array literal directly in the `.map()` call (no named local const), with either a child-component or plain-element body — previously refused with `BF101: Expression not supported: [...]` because `renderLoop` unconditionally ran the loop's array expression through the shared `isSupported` gate (which refuses a standalone object literal) even when the loop was independently baked via `resolveStaticLoopSource`/`analyzeBakeableStaticChildLoop`, whose result made that conversion's return value unused. The Go adapter now skips converting the array expression at all for a child-component loop body (baked or not, the `{{range}}` source is always `.{ComponentName}s` regardless) and, for a plain-element body, routes it through the same static-unroll path as a named const.

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
  - @barefootjs/shared@0.18.6

## 0.18.5

### Patch Changes

- 764bc23: Fix numeric/boolean JSX-expression literal props on a child component (`count={5}`, `active={true}`) rendering as Go zero values (`0`/`false`) instead of the actual literal.

  `emitStaticChildInstances` builds each nested child component instance's `<Child>Input{...}` Go struct literal from the parent's JSX attributes. A plain quoted string attribute (`label="mail"`) is a distinct `AttrValue` kind (`literal`) handled separately and unaffected. `count={5}`/`active={true}` are curly-brace attributes — always `kind: 'expression'` regardless of what's inside the braces — so they fell to `resolveDynamicPropValue`, which only recognized a signal/memo getter call or a comparison against one. A bare `5`/`true` matches neither, so the field was silently OMITTED from the struct literal entirely, defaulting to Go's zero value.

  The `expression`-kind branch now checks the attribute's structured `parsed` tree (already attached during IR construction) for `kind: 'literal'` before falling to `resolveDynamicPropValue`, and emits the literal's Go representation directly — the reliable structural signal, rather than re-matching the raw source text.

  `child-primitive-props` graduates from a render divergence to a passing render.

- 7bd1762: Decode JSX character references in Phase 1 and escape static content on emit. JSX defines `&copy;` in literal text (and in quoted attribute values) as the character `©` — Babel, esbuild, and TypeScript's JSX emit all decode at parse time — but the compiler carried the RAW source text through the IR, so every template adapter re-emitted the undecoded entity (`html-entity-text` divergence) and none escaped HTML metacharacters in static attribute values (`static-attr-escape`: `title="Fish & Chips"` reached the output unescaped). Phase 1 now decodes via the new `decodeEntities` (`@barefootjs/shared`; numeric references fully, named references from a curated table — unknown names degrade consistently on every backend), so `IRText.value` and static attribute values carry the semantics. Emission escapes per context: the eight template adapters and the client-JS `innerHTML` template builders route static text and attribute values through the shared `escapeHtml` (`& < > "`), and the Hono adapter re-encodes for JSX source (adding `{`/`}`). Both fixtures graduate from all eight adapters' `renderDivergences` declarations and from the CSR conformance skip list.
- 7772e8c: Make the `ParsedExpr` evaluator's `Number()` / ToNumber string coercion JS-faithful on the Go and Ruby backends, closing two divergences from the JS reference (the evaluator subset allows none). Both surface when a `map` / `filter` / `sort` / `reduce` callback body coerces a string field, e.g. `.filter(x => Number(x.code) > 0)`.

  - **Ruby (`@barefootjs/erb`)** — `Number("5.")` **raised** `ArgumentError` (Ruby's `Float()` rejects a trailing decimal point), aborting SSR with a 500 where JS returns `5`. `parse_numeric_string` now normalizes a `.` not followed by a digit (`"5."` → `"5"`, `"5.e3"` → `"5e3"`) before converting, and wraps the conversion so a coercion can never raise (falls back to `NaN`). The accepted grammar is unchanged.
  - **Go (`@barefootjs/go-template`)** — `evalToNumber` delegated to `strconv.ParseFloat`, which **over-accepts** forms JS's `Number()` rejects: underscore digit separators (`"1_000"` → `1000`, JS `NaN`) and hex-float syntax (`"0x1p4"` → `16`, JS `NaN`), and turned decimal overflow into `NaN` (`"1e1000"`, JS `Infinity`). It now gates on the JS decimal `StringToNumber` grammar (anchored regexp: sign, integer/fraction digits, exponent — ASCII digits only), handles the exact `Infinity` / `+Infinity` / `-Infinity` spellings, and passes `strconv.ErrRange` results (±Inf) through instead of discarding them. Radix-prefixed integer strings (`0x` / `0o` / `0b`) remain `NaN`, unchanged (the documented radix-divergence region shared with the other backends).

  Ten `Number(...)` cases pinning the decimal numeric-string grammar (leading/trailing dot, sign, exponent, whitespace, underscore rejection, hex-float rejection, overflow → ±Infinity) are added to the shared evaluator vector corpus (`eval-vectors.json`), so all five evaluator backends (Go, Ruby, Perl, Python, PHP) are held to JS parity here going forward.

- 69bfd35: Thread the `.map()` index param through the list-item event-delegation dispatcher. When a delegated handler closed over the callback's index (`items().map((item, i) => <button onClick={() => handle(i)} />)`), `bf build` lowered the per-item handler into a single delegated listener that re-derived the _item_ from `data-key`/DOM position but dropped the _index_ — so `i` was a dangling reference and the handler threw `ReferenceError: i is not defined` the first time it fired (item-property access like `item.id` worked because that was re-derived). The dispatcher now re-derives the index from the same runtime source the item comes from — `arr.findIndex(...)` for keyed lookups, the already-computed DOM position for the index-based lookups — and binds it under the user's param name. Output is unchanged for handlers that don't reference the index.
- 63ff687: Fix a prop re-forwarded through a nested child-component invocation (`<Leaf text={props.label} />` inside `Middle`, itself invoked from `Parent`) rendering EMPTY on the Go template adapter — three-level composition (Parent → Middle → Leaf) lost the threaded value at the second hop.

  `emitStaticChildInstances` builds each nested child instance's `<Child>Input{...}` struct literal from the parent's own JSX attributes. A LITERAL attribute value (`<Middle label="threaded" />`) bakes straight to a Go string literal — this is why two-level composition with a literal prop already worked. A bare passthrough of the CALLER's own prop (`text={props.label}`, or the destructured form `text={label}`) is different: it's an `expression`-kind attribute value with no `.parts` (those only exist for template-literal/lookup shapes), so it fell to `resolveDynamicPropValue`, which only recognized a signal/memo getter call (`foo()`) or a `getter() === 'lit'` comparison — never a bare identifier or `props.X` member access. Neither pattern matched, so the field was silently omitted from the struct literal entirely, leaving it at Go's zero value (`""`) instead of erroring.

  `resolveDynamicPropValue` now recognizes an EXACT bare `<name>` or `props.<name>` reference (no `??`/`||` fallback suffix — that isn't a pure passthrough) whose name matches one of the current component's own declared props, and resolves it to `in.<Field>` — the current component's own Input struct field for that same prop, i.e. a direct passthrough.

  `grandchild-composition` graduates from a render divergence to a passing render.

  Note: a SEPARATE, unrelated CSR/hydration-side divergence for this same fixture (`grandchild-composition`'s client-JS scope-id derivation reusing the parent's scope id instead of deriving its own, in `packages/adapter-tests/src/__tests__/csr-conformance.test.ts`) is NOT addressed here — this fix is scoped to the Go SSR render-divergence only.

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

- b536269: Fix a memo derived from another memo (`label = createMemo(() => doubled() + 1)`, where `doubled` is itself `createMemo(() => count() * 2)`) rendering EMPTY on the Go template adapter — only the first derivation layer SSR-computed correctly.

  `memoInitialFromParsedBody` (`memo/memo-compute.ts`) resolves a memo's SSR initial-value expression by looking up its dependency's getter name — but its arithmetic-binary-op branch (`() => <ref> <op> <int>`) and its bare-getter branch (`() => getter()`) each did this with a `signals.find(...)`-only lookup, never consulting `ctx.state.currentMemos`. `doubled` is a memo, not a signal, so `label`'s dependency on it was never recognized at all; the field was silently omitted from the constructor, defaulting to Go's zero value (`nil`, since the type inferencer also couldn't resolve a concrete type once the fold failed).

  The fix routes both branches through the existing `resolveGetterValueAsGo` helper (already used by this file's ternary-condition and filter-arm-sibling resolvers for exactly this signal-or-memo distinction) instead of hand-rolling a signals-only lookup — it checks `signals` first (unchanged behavior for a signal-derived memo like `doubled`), then falls back to `ctx.state.currentMemos` and recurses with the same `resolving`-set self/mutual-reference guard the other call sites already use, correctly folding an arbitrarily deep memo chain rather than just one level.

  The arithmetic branch also now parenthesizes a compound `depInitial` (detected by the presence of whitespace — a signal's own initial value is always a simple atom and never needs it) before splicing it under the memo's own operator, so a differently-shaped chain (e.g. `inner = () => count() + 1` then `outer = () => inner() * 2`) can't silently invert precedence (`3 + 1 * 2` = 5 in Go vs JS's `(3+1)*2` = 8) the way an unconditional bare substitution would have.

  `memo-chain` graduates from a render divergence to a passing render.

  **Known residual limitation**: a sibling shape — a boolean SELECTION memo derived from another memo (`sel = createMemo(() => label() === 'x')`, where `label` is itself a memo, as opposed to a signal) — has the identical signals-only-lookup gap in this same file's equality-comparison-to-bool branch, and still folds to the zero value (`false`). No fixture exercises this shape today; fixing it is a separate, structurally different change (recursively computing a memo's initial value as a STRING and checking whether it takes a quoted-literal shape, rather than this PR's straightforward value-substitution), out of scope here.

- 9a9f7ce: Fix nested-loop `data-key` attributes to carry the depth suffix (`data-key-1`, `data-key-2`, ...) that the Hono/JS reference already emits for a `.map()` nested inside another `.map()`. Both the CSR client-JS path (`ir-to-client-js`'s `loopDepth` recursion counter) and the Hono SSR adapter (a `loopKeyStack`) already derived this independently at render time; the eight template (non-JS) adapters had no such mechanism at all and always emitted plain `data-key` regardless of nesting, so an inner loop's items were indistinguishable from the outer loop's for client-side reconciliation.

  `IRLoop` gains a `depth` field (0 = outermost), computed once in Phase 1 (`jsx-to-ir.ts`, a `ctx.loopDepth` counter incremented/decremented in lockstep with `ctx.loopParams` around each `.map()` callback) — the single IR-computed source of truth every adapter now reads instead of re-deriving nesting depth on its own. Each of the eight adapters threads the loop's own `depth` through its `renderLoop`/`renderAttributes` call (a per-adapter save/restore field mirroring the existing `inLoop` boolean), so `key` → `data-key`/`data-key-N` matches `keyAttrName()` in `ir-to-client-js/utils.ts` exactly.

  Also fixes a related, previously-undiscovered Jinja bug this fixture exposed: the adapter's member-access emitter lowered `obj.field` through Jinja's `.` (attribute-then-item) resolution, so a dict-shaped JS object with a field literally named `items`/`keys`/`values`/`get`/... resolved to Python's _built-in dict method_ of the same name instead of the field's value (`group.items` → `TypeError: 'builtin_function_or_method' object is not iterable`). Both Jinja member-access emitters now lower to bracket/item access (`obj['field']`, Jinja's `getitem`, key-first), which cannot collide with a dict method name.

  `nested-loop-outer-binding` graduates from a render divergence to a passing render on all eight template adapters.

- 12eebaf: Fix `nested-loop-triple-depth`'s render divergence — but the root cause was in the Go adapter's TEST HARNESS, not the adapter's actual codegen.

  The divergence's own description ("Go loop-scope binding only reaches two levels deep") was incorrect. The Go template adapter's real loop-scope binding (`loopParamStack` in `go-template-adapter.ts`, and the corresponding `{{range $_, $var := .Field}}` nesting it emits) is a plain unbounded stack with no depth limit, and generates fully correct Go template code at any nesting depth — verified directly.

  The actual bug lived in `packages/adapter-go-template/src/test-render.ts`, the conformance-test harness that bakes a fixture's runtime `props` into Go source for `go run`. `goMapLiteralFromObject`'s key capitalization used a naive first-letter-uppercase (`k.charAt(0).toUpperCase() + k.slice(1)`) instead of the Go-initialism-aware `capitalizeFieldName` the real adapter codegen uses everywhere else (`id` → `ID`, not `Id`). Since Go's `html/template` does a case-sensitive map/field lookup, a fixture keyed on `id` (as this one is: `tree.id`, `branch.id`, `leaf.id`) baked a literal keyed `"Id"` that the template's `{{.ID}}` lookup could never match — rendering every level's key AND text content empty, at ANY nesting depth (not specifically the third), which a from-scratch repro confirmed. It happened to surface first on this fixture, and happened to look depth-related, only because the sibling 2-level fixture's key field (`name`) isn't a Go initialism and so was capitalized identically either way.

  Fixed the harness's naive capitalizer at all three call sites that had it (`goMapLiteralFromObject`'s nested-object-key path, `buildGoPropsInit`'s top-level prop-field path, and the rest-bag field-name path) to use `capitalizeFieldName`, already imported in the file and already used correctly by the neighboring `goStructLiteral`.

  **No real end-user Go output is affected by this fix** — the actual `@barefootjs/go-template` compiler codegen (what a real project's `bf build` emits) was never wrong; only this package's own test-render harness's ad hoc runtime-prop injection mis-modeled the adapter's actual field-naming convention. `nested-loop-triple-depth` graduates from a render divergence to a passing render.

- 664b4af: Fix `.toFixed(2)` on a number prop (generated Go failed to `go run`) and `Math.min/max/abs/floor` over a fractional signal (rendered `"0"` for every value) — both share the same root cause on the Go adapter.

  - `typeInfoToGo` (`type-codegen.ts`) hard-coded every TS `number` to Go `int`, regardless of whether the field's actual value is fractional. A signal's fractional initial value (`createSignal(-7.6)`) now widens the field to `float64` when the literal has a decimal point — mirroring the same int/float64 distinction the `kind: 'unknown'` branch's `inferTypeFromValue` fallback already made, just never consulted for `kind: 'primitive'`.
  - A bare `number` prop with no default (`{ price }: { price: number }`) has no literal to read a fraction off of — assigning its runtime value (`19.5`) to a Go `int` struct field is a compile error (`constant 19.5 truncated to integer`), which is what `number-tofixed`'s "generated Go fails to run" symptom actually was. Since there's no literal evidence available, `buildPropTypeOverrides` (`prop-types.ts`) now walks the component's JSX tree for a `.toFixed(...)` call whose receiver is that prop, and widens it to `float64` when found — the one number-shape usage that needs this rescue, not a general "infer number-ness from usage" mechanism. This is a Go-adapter-local heuristic (mirroring the existing `isBooleanMemo`/`isStringTernaryMemo` precedent in this same adapter): the underlying int-vs-float64 struct-field distinction is inherent to Go's static typing and doesn't exist on the other seven (dynamically-typed) template backends, so it doesn't belong on the shared IR.
  - Separately, `convertInitialValue` (`value-lowering.ts`) — which lowers a signal's initial value to its Go SSR literal — never handled a leading `-`, so `-7.6` fell through both its int and decimal regexes straight to the `0` zero-value fallback regardless of the field's resolved type. This was the more direct cause of `math-methods` rendering `"0"` for every value; fixed alongside the type-widening above since both are needed for the fixture to render correctly end to end.

  Both `number-tofixed` and `math-methods` graduate from render divergences to a passing render.

  **Known residual limitation** (not a new regression if hit later): a bare `number` prop with no default still resolves to Go `int` unless it's used as a DIRECT `.toFixed()` receiver in the JSX tree. The same `go run` compile failure this PR fixes can still occur for the identical prop shape if the fraction only surfaces indirectly (`.toFixed()` inside a signal's initial value or a memo's computation) or via a different fraction-producing operation on the same bare prop (division, `Math.round`/`Math.floor`, etc.) — see the docstring on `collectToFixedPropNames` in `prop-types.ts`.

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

- 92e66d0: Fix an object-valued signal with an explicit type argument (`createSignal<User>({ name: 'Ada', role: 'admin' })`) failing to `go run` on the Go template adapter.

  The named Go struct (`type User struct { Name string; Role string }`) and the member-access lowering (`user().role` → `.User.Role`, correctly case-matched to the struct's own field names) were already both correct — this shape doesn't need the loop-only object-array struct-synthesis mechanism (`synthesizeStructFromSignal`) the divergence's own description pointed at. The actual gap was narrower: `convertInitialValue` (`value/value-lowering.ts`), which lowers a signal's initial value to its Go SSR literal, never recognized a struct-backed `interface`-kind `TypeInfo` as bakeable — it fell straight through to the `nil` fallback. For a `map[string]interface{}` field `nil` is a legal zero value (silently dropping the data), but for a plain (non-pointer) named-struct field it's not: `cannot use nil as User value in struct literal`, a Go compile error.

  `convertInitialValue`'s `interface`-kind branch now also tries `jsLiteralToGo` (→ `parsedLiteralToGo`'s object-literal case, which already bakes an object literal against a named local struct correctly — proven by an existing passing test for a typed array-of-objects signal) whenever the type has an actual struct backing (`ctx.state.localStructFields.has(typeInfo.raw)`), mirroring the array branch just above it.

  `signal-object-field` graduates from a render divergence to a passing render.

  **Known residual limitation** (unrelated to this fixture, out of scope): a fully UNTYPED object-valued signal (`createSignal({...})` with no type argument, which lowers to `map[string]interface{}`) still falls to `nil` — a nil map is a legal zero value so this doesn't crash, but it does silently drop the initial data. No fixture exercises this shape today.

- 323c50f: Fix `'Hello, ' + name` rendering `"0"` on the Go template adapter.

  Go's `html/template` has no native infix `+` at all — `binary()` always lowers JS `+` through a runtime call, `bf_add`, which coerces both operands to `float64` unconditionally. A string operand's `toFloat64` is `0`, so `'Hello, ' + name + '!'` computed `0 + 0 = 0` regardless of the actual strings.

  JS `+` is addition only when both operands are numeric; it's concatenation the moment either side is a string. `binary()` (and the two other `case '+'` sites that independently re-derive the same lowering — a filter predicate's own `binary` case and a condition expression's `binary` case) now check `isStringConcatBinary` (the shared helper already consumed by Blade/Mojolicious/Twig/Xslate for the same JS `+` ambiguity) before falling to `bf_add`, routing to a new `bf_concat_str` runtime helper instead when either operand is string-typed.

  `isStringConcatBinary` needs an `isStringName` predicate — whether a bare identifier holds a string value — which the Go adapter didn't have. Added `collectStringValueNames` (`props/prop-classes.ts`, ported from the Blade/Jinja-family adapters' own copy of the same function) and wired it into `CompileState.stringValueNames`.

  `string-concat-plus` graduates from a render divergence to a passing render.

- be2b48d: Support `String.prototype.replaceAll(pattern, replacement)` with a string pattern. Previously refused at compile time with BF101 (no lowering existed); the string-pattern form now lowers through a new `replaceAll` `ArrayMethod` IR member — parsed with the same arity/regex/object-literal gates as `.replace` (a regex-literal pattern stays refused, matching `.replace`'s deferred-form treatment) — to a dedicated all-occurrences helper on every backend: Go `bf_replace_all` (`strings.ReplaceAll`), the shared Perl runtime's `replace_all` (Mojolicious + Text::Xslate, index/substr loop keeping the replacement literal), Python's `bf.replace_all` (native `str.replace`, already global by default), Ruby's `bf.replace_all` (an index/splice loop — deliberately not `String#gsub`, which interprets `\1`/`\&` backreferences in the replacement even for a literal pattern), the shared PHP runtime's `replace_all` (`str_replace`, with the empty-pattern case hand-rolled since PHP's `str_replace("")` is a no-op unlike JS), and Rust's `bf.replace_all` (native `str::replace`, already global by default).

  A dedicated helper, not the existing `.replace` lowering with a flag — reusing the first-occurrence helper would have silently truncated the replacement to one match. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) mirror `.replace`'s cases with a multi-occurrence receiver as the flagship, catching that exact swapped-lowering bug on every runtime that consumes the shared corpus (Go, Perl, Python, Ruby, PHP) plus a matching Rust vector. The `string-replaceall` fixture graduates from a BF101 refusal to a passing render on all eight template adapters.

- 56241b8: Dispatch `.slice()` to a string branch in every backend's runtime helper. `word.slice(0, 4)` on a `string` prop rendered empty (Go/Ruby/Perl/PHP/Rust) or `[]` (Python/Perl EP text) instead of the substring — the adapter can't disambiguate a string receiver from an array receiver at compile time (both lower through the same `bf_slice`/`bf.slice` call), so the compiled template already emits the correct polymorphic call; only the runtime helper itself needed a string branch, the same way `.includes()` already dispatches on the runtime value's type. Negative start (`slice(-4)`), an absent end (`slice(4)`), out-of-range clamping, and multi-byte characters (indexed by code point, not byte offset) all match the JS reference. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts`) pin the string-receiver shape across every runtime that consumes the shared corpus (Go, Perl, Python, Ruby, PHP), plus a matching Rust test. The `string-slice` fixture graduates from all eight template adapters' `renderDivergences` declarations.
- 9b3707a: Support `String.prototype.trimStart()` / `.trimEnd()`. Previously refused at compile time with BF101 (no lowering existed); each now lowers through a dedicated `trimStart` / `trimEnd` `ArrayMethod` IR member — separate members, not a shared `trim` member with a `side` flag, matching the existing `padStart`/`padEnd` and `startsWith`/`endsWith` precedent — to a dedicated one-sided helper on every backend: Go `bf_trim_start` / `bf_trim_end` (`strings.TrimLeftFunc` / `TrimRightFunc` with `unicode.IsSpace`), the shared Perl runtime's `trim_start` / `trim_end` (Mojolicious + Text::Xslate, one-sided `\s` regex), Python's `bf.trim_start` / `bf.trim_end` (native `str.lstrip()` / `rstrip()`), Ruby's `bf.trim_start` / `bf.trim_end` (one-sided `\p{Space}` regex), the shared PHP runtime's `trim_start` / `trim_end` (one-sided `preg_replace`), and Rust's `bf.trim_start` / `bf.trim_end` (native `str::trim_start()` / `trim_end()`).

  Neither has an array equivalent, so unlike `.slice()` there's no receiver-type ambiguity to resolve — each is a plain new method with runtime-type dispatch shared with `.trim()`. Dedicated one-sided helpers, not the existing `.trim()` lowering with a flag — reusing the both-sides helper would have silently stripped whitespace from the wrong side. New golden-vector cases (`packages/adapter-tests/vectors/cases.ts` → `vectors.json`) and hand-written runtime unit tests mirror `.trim()`'s cases with a both-sided-whitespace receiver as the flagship, catching that exact swapped-lowering bug on every runtime. The `string-trim-sided` fixture graduates from a BF101 refusal to a passing render on all eight template adapters.

- Updated dependencies [7bd1762]
  - @barefootjs/shared@0.18.5

## 0.18.4

### Patch Changes

- 23cc4dc: Normalize intrinsic-element attribute names ONCE in Phase 1: `IRAttribute.name` now carries the HTML/SVG attribute name, so every adapter emits it verbatim. The shared `dom-prop` classifier grows an `HTML_CAMEL_ALIASES` table (React-style camelCase → HTML: `tabIndex` → `tabindex`, `maxLength` → `maxlength`, `autoComplete` → `autocomplete`, `readOnly` → the boolean `readonly`, `spellCheck` → the enumerated `spellcheck`, …) consulted by both `toHTMLAttrName` (now applied in `jsx-to-ir`'s `processAttributes`) and `toHTMLAttrNameRuntime` (spread paths). Previously each adapter mapped at most `className` → `class` itself and every other alias leaked into the emitted HTML as an unknown attribute the browser ignores — `htmlFor` never became `for` (broken label association on template backends), `readOnly` rendered as `readOnly="true"` vs bare presence depending on backend, and SVG `strokeWidth`/`strokeLinecap` passed through unmapped. Component props (`IRProp`) keep the user's API names; unknown names (`data-*`, custom-element attributes, `viewBox`-style case-sensitive SVG XML names) pass through unchanged. The `camelcase-attributes`, `svg-icon`, and `boolean-attr-literals` fixtures graduate from every adapter's `renderDivergences` declaration and the CSR skip list.
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

- fa393c0: Template-primitive registry V2: user-imported helpers via the lowering-plugin registry (#2069, catalog entry for #1187).

  - **`RelocateEnv.loweringMatchers`**: `isCallAcceptedByAdapter` (`packages/jsx/src/relocate.ts`) now consults a component's bound `LoweringPlugin` matchers (`prepareLoweringMatchers`, #2057) as a third acceptance path alongside `templatePrimitives` / `acceptsTemplateCall`. A bespoke user-imported helper (`const serialized = customSerialize(props.config)`) that was never — and can never be — added to any adapter's string-keyed `templatePrimitives` map now inlines into the generated client template instead of falling back to `(undefined)`, provided a `LoweringPlugin` recognises the call (import-aware via `prepare(metadata)`, same seam the built-in `queryHref` plugin uses). The shadow guard applies identically: a local binding that shadows the plugin's expected import name is not accepted.
  - **One-hop alias resolution (`RelocateEnv.aliasTargets`)**: `const fmt = customSerialize; fmt(x)` now resolves `fmt` to `customSerialize` for both the `templatePrimitives` key lookup and the matcher dispatch — exactly one hop (an alias-of-an-alias, or an alias to a still-component-scoped name, stays refused; there is no transitive chain resolution).
  - **Fixed a `_p._p` double-rewrite latent bug** in the props-object bare-lift path (`relocate.ts`'s `decideAction`) that the `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` conformance case pins against, for the case where an accepted call's object-literal argument mixes bare-props-object and per-key member access.
  - **Generic `helper-call` rendering**: all 7 template adapters (Go, Mojolicious, Xslate, ERB, Jinja, Rust/MiniJinja, Twig) render the neutral `LoweringNode` `helper-call` variant (previously unused) alongside the existing `guard-list` — a plugin's `helper` id maps to the adapter's own runtime-helper naming convention (Go `bf_<helper>`, Perl `bf-><helper>`, Kolon `$bf.<helper>`, everyone else `bf.<helper>`), mirroring exactly how the built-in `query` helper (`queryHref`) already renders. The framework renders the invocation; the plugin author is responsible for registering the backend function (e.g. into Go's `FuncMap`). Client-side, the call is left untouched — the browser executes the real imported function, same as `queryHref`.
  - Conformance: `USER_IMPORT_VIA_CONST` and `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` (`packages/adapter-tests/src/cases/template-primitives.ts`) now register a small test-only `customSerialize` `LoweringPlugin` around each compile (restored via `try`/`finally` so a failure can't leak the plugin into unrelated suites) and are unskipped on all 7 template adapters — Hono, whose broad `acceptsTemplateCall` already covered this shape, stays green with the same case setup.

  `TemplatePrimitiveRegistry` / `TemplateCallAcceptor` remain V1 (identifier-path, fixed at adapter-construction time) — see the updated doc comments on `packages/jsx/src/adapters/interface.ts` and the `spec/compiler.md` capability-flags section for the full V1/V2 split.

### Patch Changes

- 6c13ce7: `@barefootjs/jsx` exports `ConformancePin` / `ConformancePins` types, and each adapter package now exports its conformance `expectedDiagnostics` pin set as a structured `conformancePins` module (with `issue:` URLs) consumed by its own conformance test. These structured pins also feed a repo-internal component × adapter compile-compatibility matrix (`ui/compat.lock.json`, regenerated with `bun run compat:lock` and drift-checked in CI) that is not part of the published CLI or any published package's runtime surface.
- f20a0a3: Fix two Go template adapter codegen bugs against generated props structs (#2130, #2131):

  - **#2130** — a `.map()` loop whose body is an element _wrapping_ a child component (`<li><Badge>…</Badge></li>`) retargeted its `{{range}}` at a `.{ChildName}s` slice that only exists for direct single-component bodies, 500ing at render with `can't evaluate field Badges in type *XxxProps`. The range now iterates the real collection (gated on the IR's `loop.childComponent`, the same condition the slice generator uses), and the wrapped child renders through the parent's once-per-slot instance (`$.{Name}SlotN`) with per-item children injected via the loop-body companion define.
  - **#2131** — `bf build` never registered child component shapes on the adapter (only the test harness did), so HTML attributes passed to a rest-spread child (`<Input placeholder="…" />`) were emitted as named Go struct fields the generated `Input` struct doesn't declare, breaking `go build` with `unknown field Placeholder`. The CLI now runs a metadata-only pre-pass (`analyzeComponent` + `buildMetadata` per discovered component) that registers every component's shape before the first entry compiles, so non-param attrs route into the child's `Props map[string]any` rest bag.
  - @barefootjs/shared@0.18.0

## 0.17.1

### Patch Changes

- 6b3bba3: Lower value-producing `.map(cb)` on the template-string adapters via the #2018 runtime evaluator (#2073). A `.map()` whose callback returns a value (the blog-showcase shape `` p.tags.map((t) => `#${t}`).join(' ') ``) previously refused with BF101 on Go / Mojo / Xslate; `map` now joins `CALLBACK_METHODS`, the projection body serializes per element through the new `map_eval` helpers (`bf->map_eval` / `$bf.map_eval` / `bf_map_eval` + `BarefootJS::Evaluator::map_json` / Go `MapEval`), one result per element with no flatten, composing through the existing `.join` lowering. The JSX-returning `.map` is an IRLoop upstream and unaffected; the fall-throughs (a bare `arr.map` reference or a function-reference callback) still refuse loudly.
- d0fde8a: Surface BF101 for a filter predicate whose body contains a nested higher-order callback the adapter can only degrade (#2038). The runtime evaluator refuses nested arrows, and the legacy predicate fallbacks silently rewrote such predicates — Xslate's Kolon-lambda emit collapsed the inner call to its receiver (`!other.some(r => …)` → `!other`), Mojo degraded nested `find*` / sort / reduce / flatMap the same way, and the Go filter-expr `call` arm dropped the arrow argument entirely. Each adapter is now loud at its exact degrade points, with `/* @client */` as the escape hatch. Faithful nested lowerings are untouched: Mojo's inline `grep` for nested `filter` / `every` / `some` and Go's `len (bf_filter_eval …)` for `.filter(cb).length` still render (pinned by the new `filter-nested-callback-predicate` conformance fixture).
- 882847c: SSR-compute memos derived from the `createSearchParams()` env signal (#2075), building on the #1922 per-request readers — including LIST-valued filter memos on Go. Env-signal handling is now open-closed: a new `ENV_SIGNAL_READERS` registry in `@barefootjs/jsx` (`envSignalReaderFor` / `envSignalLocalNames`) supplies the canonical reader name and method set, so a future env signal registers once instead of growing per-adapter branches. Mojo/Xslate seed derived memos in-template from the registry-resolved canonical reader (aliased getters canonicalise), with the seed-availability check allowing lowering-internal bindings (arrow/lambda params, Perl's `$_`, Kolon's `$bf`). Go lowers scalar derived memos (`get('k')` bare and `?? '<lit>'` defaulted) and list-filter memos (`props.items.filter(p => …tag()…)` → `bf.FilterEval` with the predicate's getter calls materialized into the env) in the generated constructor, typing filter memos `[]any`. The runtime evaluator gains its first `array-method` — `.includes` (array SameValueZero membership / string substring) — implemented isomorphically in Go and Perl and pinned by new golden vectors; `.every`/`.some` predicates using `.includes` now route through the evaluator on the Perl adapters too. The pre-existing template-position helpers (`bf_includes`, `$bf->includes`) now share the same SameValueZero equality — previously Go used `reflect.DeepEqual` (int/float64 never matched, `[NaN].includes(NaN)` was false) and Perl used stringy `eq` (`[2].includes("2")` was wrongly true) — so `.includes` returns the JS answer regardless of position.
  - @barefootjs/shared@0.17.1

## 0.17.0

### Minor Changes

- 60f0b5b: Add the lightweight ParsedExpr evaluator to the Go runtime (#2018, Track B).

  `bf.go`'s runtime gains a pure-expression evaluator (`EvalExpr` /
  `EvalNode`) for higher-order callback bodies, plus the evaluator-driven
  folds `FoldEval` (reduce / reduceRight over any reducer body) and
  `SortEval` (sort by any comparator body). These are the runtime
  generalization of the special-cased `bf_reduce` / `bf_sort` callback
  catalogue: a callback body rides as a pure `ParsedExpr` and is evaluated
  against an environment (`{acc, item, …captured free vars}`), so the
  `+`/`*` op restriction, the `acc`-canonical form, and the comparator
  pattern restriction all disappear.

  The evaluator's coercion is JS-faithful (ToNumber / ToString / ToBoolean,
  strict equality, `Math.round` half-toward-+Infinity), pinned isomorphically
  by the Track A golden vectors — a new `eval_vectors_test.go` harness runs
  every `eval-vectors.json` case in Go and matches the JS reference exactly.

  Purely additive: the new functions are not yet wired into emit, so all
  existing template output stays byte-identical and no adapter
  `createSourceFile` is added. Migrating the emit path onto the evaluator
  (and the byte-equal decision for the won't-fix `localeCompare` string
  sort) is the follow-up integration.

- caba215: `queryHref` now accepts an **array value** for multi-value query keys (#2048, the Q4 follow-up to #2042): `queryHref(base, { tag: ['a', 'b'] })` → `?tag=a&tag=b`, i.e. `URLSearchParams.append` rather than `set`. Empty / falsy members are skipped (same truthy-omit as a scalar), so an empty — or all-empty — array contributes nothing. `QueryParamValue` becomes `string | string[] | null | undefined`.

  This works across the client and all SSR adapters byte-for-byte:

  - **`@barefootjs/client`**: `queryHref` appends each non-empty array member.
  - **`@barefootjs/perl`** (Mojolicious + Xslate via the shared `query` helper): an array ref appends one pair per non-empty member.
  - **`@barefootjs/go-template`**: `bf_query` appends each non-empty member of a `[]string` (or `[]any`) value. To support this, the value-emptiness check moved from the lowering into the `bf_query` helper itself — a plain `key: v` now lowers to a `(true)` include and a conditional to `(cond)`, and the helper drops an included-but-empty value. This matches the client and Perl exactly (it also removes the previous Go-only divergence where an explicitly-included empty value was kept as `k=`); rendered output for existing scalar usage is unchanged.

  The `query` helper's array behaviour is conformance-tested across the Go and Perl backends via the shared golden helper vectors.

### Patch Changes

- f3696f9: Render carousel (and similar) demos byte-identical to the Hono SSR reference (#1971).

  Three Go-adapter SSR divergences that compiled clean but rendered wrong are fixed:

  - **String-ternary memos mistyped as `bool`.** A memo like `() => orientation() === 'vertical' ? 'flex-col' : 'flex'` was classified boolean by the `===` in its condition and baked `class="false"`. Such string-literal/module-const-branch ternaries are now detected and resolved to a Go runtime conditional, including comparison conditions over a getter or an inline `props.X ?? 'default'`.
  - **Optional object props always-truthy / dropped.** An optional named-struct prop (`opts?: EmblaOptionsType`) lowered to a value struct, so a `{{if .Opts}}`-guarded attribute could never be omitted and an inline `opts={{ … }}` was dropped. Optional named-struct props now lower to `map[string]interface{}` (nil/empty is falsy; keys round-trip through `bf_json` like `JSON.stringify`), and inline object literals bake to Go map literals.
  - **Inline scalar-literal-array loops rendered zero items.** `[1,2,3,4,5].map(n => …{n}…)` had no datum plumbing for the scalar value. The loop wrapper now carries the value, the body define receives it, the literal slice is baked into the constructor, and `data-key` is stamped from the scalar.

- f4e715b: Carry a module-scope constant's parsed value on the IR (`ConstantInfo.parsed`,
  Roadmap A-2). The analyzer structures each module const's value once — parsed
  from the parenthesised form so a bare object literal resolves to an
  `object-literal` rather than being read as a block. The Go adapter's
  static-record index lookup (`resolveStaticRecordLiteralIndex`, e.g. an icon
  registry's `strokePaths['chevron-down']`) now reads the carried `object-literal`
  structure for the common string/number value case instead of re-parsing the
  const's value string, keeping `ts.createSourceFile` only as the fallback for
  records the parser doesn't structure (spread / computed-key / template-key).
  Byte-identical — verified by the Go adapter unit + conformance suites.
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
- 648c74b: Finish decomposing the Go adapter's `generateNewPropsFunction` by extracting the two loop-body wrapper builders into private emitters (readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `emitStaticBodyWrappers` — static nested components WITH body children: bakes the module-const / inline-literal loop array into the constructor and builds the wrapper slice.
  - `emitDynamicBodyWrappers` — dynamic loop-body components whose array bakes to a module-const via a memo.

  Both take the shared `emittedWrapperVars` set (the return-struct stage reads it). With this, `generateNewPropsFunction` drops from ~590 to ~210 lines — orchestration plus the return-struct field assembly.

- 6306efc: Extract the Go html/template adapter's constructor-context expression lowering into `memo/ctor-lowering.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `memo/ctor-lowering.ts` — `lowerCtorExpr`, `lowerCtorCond`, `lowerCtorStringArray` moved out as free functions (mutually recursive). They lower the narrow surface of JS expressions a derived-state memo needs (#1897) into Go constructor code: literals, `<sp>.get('k')`, `<arr>.includes(<x>)`, module arrow-helper inlining, `?? `/`||`/`? :` string forms. They read `state.localConstants` / `state.propsObjectName` and `parseLiteralExpression`, and set `state.needsStringsImport` when they emit a `strings.*` call.
  - No new `GoEmitContext` member is needed; the two external call sites now call `lowerCtorExpr(this.emitCtx, …)`.

- 735ed91: Refactor the Go html/template adapter: extract pure helpers, internal types, and per-compile state out of the 8.6k-line single-file `GoTemplateAdapter` into focused `adapter/lib/*` modules.

  Internal-only, output byte-identical (verified by the adapter unit + conformance suites). No behavioural or public-API change:

  - `lib/go-naming.ts` — Go identifier/initialism/keyword tables and field-name capitalisation.
  - `lib/go-emit.ts` — Go-template string escaping, arg wrapping, and `bf_*` runtime-helper emitters (de-duplicates two identical `escapeGoString` copies).
  - `lib/types.ts` / `lib/ir-scope.ts` / `lib/constants.ts` — adapter bookkeeping interfaces (`GoTemplateAdapterOptions` re-exported unchanged), IR scope traversal, and the template-primitive table.
  - `lib/compile-state.ts` — `CompileState` groups the ~24 per-compile fields reset at the start of `generate()`/`generateTypes()` into one object, preserving field lifetimes 1:1.

- 57f9615: Extract the Go html/template adapter's memo initial-value computation core into `memo/memo-compute.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `memo/memo-compute.ts` — the six mutually-recursive memo-value functions moved out as free functions: `computeMemoInitialValue` (typed-field entry, zero-value defaulting), `computeMemoInitialValueOrNull` (pattern-matching core), `memoInitialFromParsedBody` (structural match over the analyzer-attached `parsed` tree), `computeComparisonTernaryGo`, `resolveComparisonOperandGo`, `resolveGetterValueAsGo`. They read `state.currentMemos` / `state.moduleStringConsts` and delegate to the value / type / template-interp / memo-value modules.
  - `emit-context.ts` — `GoEmitContext` gains `extractPropFallback` (parallel to the existing `extractPropNameFromInitialValue`), the one adapter-resident parser the core calls back into.
  - Removes the now-unused `EMPTY_PROP_FALLBACK_VARS` static from the adapter (all users moved into modules).

- ce96cc5: Extract the Go html/template adapter's memo type-inference predicates into `memo/memo-type.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `memo/memo-type.ts` — `isTemplateLiteralMemo`, `isBooleanMemo`, `isStringTernaryMemo` moved out as pure free functions. They classify a memo's computation (template-literal / boolean / string-ternary) so `inferMemoType` can pick the right Go field type and SSR zero value. They read only `state.moduleStringConsts` and `extractPropNameFromInitialValue`.
  - `inferMemoType` stays on the adapter as the orchestrator that calls the three predicates; no new `GoEmitContext` member is needed.

- f108699: Extract the Go html/template adapter's block-body / object memo value computation into `memo/memo-value.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `memo/memo-value.ts` — `resolveBlockBodyMemoModuleConst` (recognise a guard-and-return-module-const memo, reading `state.localConstants`) and `computeObjectMemoInitialValue` (lower a `searchParams()`-derived object-returning memo to a Go `map[string]interface{}` literal via `lowerCtorExpr`, reading `state.searchParamsLocals`) moved out as free functions.
  - No new `GoEmitContext` member is needed; call sites now use `…(this.emitCtx, …)`.

- f1ac8e1: Split the self-contained sections out of the Go adapter's ~590-line `generateNewPropsFunction` into focused private emitters (readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `emitNewPropsDocComment` — the `NewXxxProps` doc header + per-component "handler-populated slice" NOTE.
  - `emitStaticChildInstances` — the ~145-line static child-component instance emitter (props, rest-bag routing, context bindings, children passthrough).
  - `emitSpreadBagInits` — spread-bag field initializers + the BF101 fallback.

  These stay as adapter methods (orchestrator), just no longer inline. The loop-body wrapper builders (which share `emittedWrapperVars` / `propFallbackVars`) are left for a follow-up.

- 7e673b2: Continue decomposing the Go html/template adapter (Phase 4). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `analysis/component-tree.ts` — pure IR structural walks (`hasClientInteractivity`, nested/child-component discovery) moved out as free functions that read no adapter state.
  - `emit-context.ts` — introduce `GoEmitContext`, the narrow interface (per-compile `state` + the recursive entry points) that extracted emit modules depend on instead of the concrete adapter. The adapter implements it and passes `this`.
  - `expr/helper-inline.ts` — local arrow-const helper inlining at a call site.
  - `expr/url-builder.ts` — `URLSearchParams` builder helpers → `bf_query` lowering.

- e0a9228: Deduplicate the per-compile state priming shared by `generate()` and `generateTypes()` into a single `primeCompileState(ir)` method (Go adapter readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  The two entry points each set the same ~10 `CompileState` fields from the IR (props-object / rest names, module-const + local-const tables, memos, type definitions, context consumers, `searchParams` locals) and call `augmentInheritedPropAccesses` — `generateTypes` carried a row of "Mirror `generate()`" comments warning about exactly the drift this removes.

- 4d169c9: Extract the Go html/template adapter's prop-type resolution into `props/prop-types.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `props/prop-types.ts` — `buildPropTypeOverrides` (signal-inferred Go-type overrides), `resolvePropGoType` (the shared per-field type resolver — optional named-struct props → `map[string]interface{}`), and `collectNillablePropNames` moved out as free functions. They read only `state.localStructFields` and `extractPropNameFromInitialValue` and resolve via `typeInfoToGo`; no new `GoEmitContext` member.

  Note: the struct _assembly_ generators (`generateInputStruct` / `generatePropsStruct` / `generateNewPropsFunction`) remain on the adapter — they are the orchestrator core that composes the extracted lowering modules (~18 cross-method dependencies), which the architecture deliberately keeps on the object rather than re-exposing through the seam.

- 0321d8f: Split the Go adapter's `generatePropsStruct` into focused private field emitters (readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `emitPropsStructHeader` — the fixed `ScopeID` / `Bf*` / `Scripts` / `SearchParams` fields.
  - `emitPropsDataFields` — prop, signal, and memo fields (owns the shared `propFieldNames` de-dup set so a signal/memo sharing a prop's name doesn't redeclare the field).
  - `emitPropsAuxFields` — derived-const, `useContext`-consumer, nested-component-array, static-child, and spread-bag fields.

  `generatePropsStruct` drops from ~190 lines to a 5-line orchestration.

- e694d18: Extract the Go html/template adapter's spread-bag codegen into `spread/spread-codegen.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `spread/spread-codegen.ts` — the ten spread / object-map codegen methods moved out as free functions, with two exported entry points (`collectSpreadSlots`, `buildSpreadInitializer`) and eight module-local helpers (`classifySpreadBagSource`, `collectSpreadSlotsRecursive`, `parseJsObjectLiteralToGoMap`, `buildConditionalSpreadInitializer`, `unwrapParens`, `conditionToGoBool`, `objectLiteralToGoSpreadMap`, `recordIndexAccessToGoMap`). They read only `state.restPropsName` / `state.usesFmt` and `parseLiteralExpression`; no new `GoEmitContext` member.
  - Removes the now-unused `parseRecordIndexAccess` import from the adapter (its last caller moved into the module).

- f9bb3a8: Extract the Go html/template adapter's template-literal memo lowering into `memo/template-interp.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `memo/template-interp.ts` — `computeTemplateLiteralMemoInitialValue`, `resolveTemplateInterpolation`, `parseLocalKeyBinding`, `recordIndexInterpolationToGo`, `propsAccessName` moved out as free functions. They compute a template-literal memo's SSR initial value as a Go `string` expression (quasis → Go literals; `${…}` interpolations → module string consts / `Record`-index maps / `props.<name>` field reads), reading `state.localConstants` / `state.propsObjectName` and setting `state.usesFmt` when a `Record`-index interpolation emits `fmt.Sprint`.
  - `emit-context.ts` — `GoEmitContext` gains `resolveModuleStringConst`, the one adapter-resident entry point this module calls back into (it depends on per-compile loop state that stays on the adapter).

- 39db6d9: Extract the Go html/template adapter's type codegen into `type/type-codegen.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `type/type-codegen.ts` — `typeInfoToGo`, `tsTypeStringToGo`, `inferTypeFromValue` moved out as pure free functions. They render a prop/signal/const's TypeScript type (`TypeInfo`, a raw type string, or an inferred shape from a literal) into the Go struct-field type, reading only `state.localTypeNames`.
  - `emit-context.ts` — `typeInfoToGo` is removed from `GoEmitContext`: now a free function, `value-lowering` imports it directly instead of calling back through the seam, shrinking the context surface.

- 3fab788: Split the inline sections out of the Go adapter's `generateTypes` into focused private emitters, leaving it as clean orchestration (readability). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `buildLocalTypeTables` — populate `localTypeNames` / `localTypeAliases` / `localStructFields` from the IR's type definitions.
  - `emitLocalTypeStructs` — emit Go structs / string aliases for local type definitions.
  - `emitSynthStructs` — synthesise + emit a struct per untyped object-array signal (#1680).
  - `resolveNestedLoopItemTypes` — resolve a null loop `itemType` from a memo-derived / direct module-const array (#1897).
  - `composeFileHeader` — assemble the package clause + sorted import block once `usesFmt` / `usesHtmlTemplate` / `needsStringsImport` are known.

  `generateTypes` drops from ~330 to ~50 lines — priming, the five `emit*`/`build*` steps, the three struct generators, and the header compose.

- c9c97dd: Extract the Go html/template adapter's value-lowering cluster into `value/value-lowering.ts` (Roadmap B). Internal-only, output byte-identical (verified by the adapter unit + conformance suites); no behavioural or public-API change.

  - `value/value-lowering.ts` — `convertInitialValue`, `jsLiteralToGo`, `objectLiteralToGoMap`, `tsLiteralToGo`, `getSignalInitialValueAsGo` moved out as pure free functions over `GoEmitContext`. They bake inline signal/const initial values into Go literals (scalars, prop references, fully-literal arrays/objects) and fall back to `nil`/`0` otherwise.
  - `emit-context.ts` — `GoEmitContext` gains `typeInfoToGo` and `extractPropNameFromInitialValue`, the two adapter entry points the moved functions call back into (`parseLiteralExpression` was already on the seam). `typeInfoToGo` / `parseLiteralExpression` stay on the adapter as widely-shared members.

- a40066c: Encode `bf_query` keys/values with `application/x-www-form-urlencoded` (matching the browser's `URLSearchParams` and the Perl `query` helper) instead of Go's `url.QueryEscape`, so a `queryHref(base, { … })` renders byte-for-byte identically across the go-template, Mojolicious, and Xslate SSR adapters and the Hono client (#2048, follow-up to #2042).

  The two encoders agreed on everything except `~` and `*`: `url.QueryEscape` keeps `~` and percent-encodes `*`, whereas `URLSearchParams` percent-encodes `~` → `%7E` and keeps `*`. The new `formEscape` keeps the unreserved set `A-Z a-z 0-9 * - . _`, turns a space into `+`, and percent-encodes every other byte as `%XX` (uppercase, byte-wise UTF-8) — so query values containing `~` or `*` now match the other backends exactly.

  The `query` helper is now covered by the shared golden helper vectors (`packages/adapter-tests/helper-vectors`), so the Go and Perl backends are conformance-tested against one set of `URLSearchParams`-derived expectations instead of hand-duplicated per-backend cases.

- 1d5da4d: Go constructor lowering now reads `ConstantInfo.parsed2` / `ParsedExpr2` instead of re-parsing const values with `ts.createSourceFile`. The four `parseLiteralExpression` call sites in `ctor-lowering.ts` (and the derived-const caller in `go-template-adapter.ts`) are removed; `lowerCtorExpr` / `lowerCtorCond` / `lowerCtorStringArray` take the IR-carried `ParsedExpr2` tree, and a new `tsNodeToParsedExpr2` bridge converts the return-object initializers in `memo-value.ts`. Go-only (mojo/xslate untouched); output is byte-identical (786/556 conformance + Go suites).
- 107f330: Lower standalone `.sort(cmp)` / `.reduce(fn, init)` on the Go adapter through the
  runtime evaluator (#2018, P1). The comparator / reducer body is serialized to a
  ParsedExpr JSON blob and evaluated per element by the new `bf_sort_eval` /
  `bf_reduce_eval` template helpers, with captured free variables threaded as
  `base_env` via `bf_env` — generalizing the fixed `bf_sort` / `bf_reduce`
  catalogues to any pure comparator / reducer body. A comparator the evaluator
  can't model (e.g. `localeCompare`) falls back to the legacy `bf_sort` path, so
  behavior there is unchanged. The runtime struct-field reader now resolves a JS
  field name (`id`) case-insensitively against the Go struct field (`ID`), which
  the evaluator's raw field names require. Rendered HTML is unchanged; only the
  emitted template text moves to the evaluator helpers. (The chained
  `.sort().map()` / `.filter().map()` loop-hoist and the mojo/xslate adapters keep
  the legacy path until their own phases.)
- 9b8c769: Lower higher-order methods (`.filter` / `.find` / `.findIndex` / `.findLast` /
  `.findLastIndex` / `.every` / `.some`) on the Go template adapter through the
  runtime evaluator (#2018, P2). The predicate body — already a `ParsedExpr` on
  the `higher-order` IR node — serializes to JSON and emits `bf_filter_eval` /
  `bf_find_eval` / `bf_find_index_eval` / `bf_every_eval` / `bf_some_eval`, with
  captured free vars threaded via `bf_env`, generalizing the field-equality /
  truthiness predicate catalogue to any pure predicate body. A predicate the
  evaluator can't model (a method-call / signal-getter predicate) falls back to
  the structured `bf_filter` / `bf_find` / … helpers and the `{{range}}`
  template-block path; `.filter(Boolean)` keeps its dedicated `bf_filter_truthy`
  lowering. Rendered HTML is unchanged; only the emitted template text moves to
  the evaluator helpers.
- 23e46fc: Document `parseLiteralExpression` as the terminal sweep's final target — the last `ts.createSourceFile` in the adapter, a shared parser (many call sites across the constructor/value lowering) being removed incrementally via the Go-only `ParsedExpr2` bridge (tracked in #2006). Docstring-only; no behavioural or API change.
- bc607ea: Resolve static `Record`-index lookups (`variantClasses[variant]`, icon registries) from the IR-carried `object-literal` tree instead of re-parsing the const value with `ts.createSourceFile` at emit time. Numeric record values now emit `literal.raw` — TypeScript's normalised `NumericLiteral.text` token (not the source spelling), which is exactly what the adapter's numeric lowering already emits, so the result is byte-identical to the former parse while skipping the second `ts.createSourceFile` and avoiding a round-trip through the parsed numeric `value`. Verified byte-identical by the conformance (786) and Go unit (556) suites.
- 7a2a061: Inline component-scope arrow helpers structurally, removing the Go helper-inliner's `ts.createSourceFile` re-parses (#2006).

  The Go adapter's `inlineLocalHelperCall` no longer parses the call expression or the helper arrow body with `parseLiteralExpression`. It substitutes the call args (carried as the call's `ParsedExpr` `preParsed` tree) into the helper body recovered structurally from `ConstantInfo.parsed2`, then lowers the substituted tree directly — so a compound arg (`props.a ?? props.b`) keeps its precedence by structure instead of the former text-splice parenthesisation. A new `parsedExpr2ToParsedExpr` bridge (the reverse of the `ParsedExpr2` ctor tree) is added to `@barefootjs/jsx` for this.

  Output is byte-identical across the affected fixtures (`sortClass` / `tagClass` inliner). The block-bodied `URLSearchParams` URL-builder helpers (`hrefFor` / `sortHref` / `tagHref`) keep their text path — `ParsedExpr2` can't model a statement block, so there's no structured body tree to substitute in.

- 1e6635a: Carry the parsed expression tree for intrinsic-element attribute expressions in the IR (continuing the "IR carries semantics, adapters emit from it" direction). Output byte-identical; the only public-API change is additive.

  - `@barefootjs/jsx`: `ExpressionAttr` gains an optional `parsed` (`parseExpression(expr.trim())`), attached by the `jsxToIR` walk for each element attribute. Optional/best-effort like `IRExpression.parsed`.
  - `@barefootjs/go-template`: the element attribute emitter reuses `value.parsed` for its condition/classification/value lowerings (`convertConditionToGo`, the conditional/template-literal classification parse, and `convertExpressionToGo`), instead of re-parsing the same attribute string up to several times per attribute.

- a231927: Carry the parsed condition tree in the IR (continuing the "IR carries semantics, adapters emit from it" direction). Output byte-identical; the only public-API change is additive.

  - `@barefootjs/jsx`: `IRConditional` and `IRIfStatement` gain an optional `parsedCondition` (`parseExpression(condition.trim())`), attached by the `jsxToIR` walk. Optional/best-effort like `IRExpression.parsed`.
  - `@barefootjs/go-template`: `convertConditionToGo` takes an optional pre-parsed tree; `renderConditional` and `renderIfStatement` (incl. else-if chains) pass `parsedCondition`, so a rendered condition reuses the IR's parse instead of calling `parseExpression` again.

- 22e0101: Carry the parsed expression tree in the IR for text-interpolation nodes, so SSR adapters emit from it instead of each re-parsing the string at emit time (and a multi-adapter build parses it once, not per adapter). Output byte-identical; the only public-API change is additive (`IRExpression` gains an optional `parsed` field).

  - `@barefootjs/jsx`: `jsxToIR` now walks the produced tree and attaches `IRExpression.parsed` (`parseExpression(expr.trim())`) to every text-interpolation node. Best-effort — a node left without `parsed` (or an empty expr) just falls back to adapter-side parsing, so it is never a behavioural change.
  - `@barefootjs/go-template`: `convertExpressionToGo` takes an optional pre-parsed tree and `renderExpression` passes `expr.parsed`, so a rendered interpolation reuses the IR's parse instead of calling `parseExpression` again. The string-based early returns (null/undefined, static record index, inlined consts, helper/url lowering) are unchanged and still run first.

- 290b904: Carry parsed memo structure in the IR so adapters emit from it instead of re-parsing. Output byte-identical (adapter unit + conformance suites); no behavioural change. The only public-API change is additive and non-breaking: `MemoInfo` is now exported and gains an optional `parsed` field.

  - `@barefootjs/jsx`: the analyzer now attaches `MemoInfo.parsed` — a structured `ParsedExpr` of the memo arrow's body (expression-bodied arrows only) — so adapters can shape-match a memo on the tree instead of re-parsing `computation`. `MemoInfo` is now exported.
  - `@barefootjs/go-template`: replace the nine `computation.match(/…/)` regex shape-matches in `computeMemoInitialValueOrNull` with structural matching over `MemoInfo.parsed` (`getter() === 'lit'`, `props.X ?? false`, `cond() ? A : B`, `<ref> * N`, bare `getter()` / `props.X` / `var`). Block-bodied / unparsable memos fall back to the existing comparison-ternary / block-body / object-memo handling.

- 2451595: Remove the `ts.createSourceFile` (`parseLiteralExpression` + `tsLiteralToGo`)
  fallback from `jsLiteralToGo` in the Go adapter's value lowering (terminal
  sweep, #2006). Signal/const inline initial values now bake exclusively from the
  analyzer's carried structured `ParsedExpr` tree via `parsedLiteralToGo`, which
  already reproduces every bakeable shape (scalars, a unary-minus number, scalar
  arrays, and objects against a local struct) and keeps `nil` for everything else
  (empty arrays, objects with no known struct, identifiers/calls, nested
  object/array values, `as const`). The deleted fallback covered the same
  bakeable shapes — every shape the analyzer leaves `unsupported` (so no tree is
  carried) is also one the fallback's own `ts.is*` checks declined — so the
  removal is byte-identical (verified by the 786/556 adapter gauntlet). The
  inline primitive-literal loop-array bake now threads the loop's carried
  `ParsedExpr` through the same structured path. The now-dead `tsLiteralToGo`
  helper and its `typescript`/`typeInfoToGo` imports are deleted.
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

- 28db2cb: Carry a block-bodied memo's statements on the IR (`MemoInfo.parsedBlock`) so the
  Go adapter can pattern-match block shapes without re-parsing `computation` with
  `ts.createSourceFile`. The analyzer attaches them via a new
  `parseBlockBodyTolerant` (best-effort: a statement the parser can't represent —
  e.g. a trailing `return /* @client */ …` — is omitted rather than failing the
  whole block, matching the adapter's former tolerant walk). The Go
  `resolveBlockBodyMemoModuleConst` (the `const k = getter(); if (!k) return CONST`
  guard memo, #1897) now reads `parsedBlock`. Additive and optional — other
  adapters ignore the field, and `parseBlockBody` (strict) is unchanged.
  Byte-identical, verified by go unit (556) + conformance (786). Removes the
  `memo-value.ts` `ts.createSourceFile`.
- d310046: Lower a comparison-ternary memo (`() => orientation() === 'vertical' ? A : B`)
  from the analyzer-carried `MemoInfo.parsed` tree instead of re-parsing
  `computation` with `ts.createSourceFile`. `computeComparisonTernaryGo` and
  `resolveComparisonOperandGo` now operate on `ParsedExpr` (a `ParsedExpr`
  counterpart of `propsAccessName` resolves the props-object member access). The
  predicate only ever matched an expression-bodied conditional — a block-bodied
  memo has no `parsed`, so it still returns null. Byte-identical (carousel
  `directionClasses` / `positionClasses` / `paddingClass`); verified by go unit
  (556) + conformance (786). Drops the adapter's package-wide `ts.createSourceFile`
  count from 6 to 5.
- ce5d511: Lower the guard-and-return-const block memo (#1897 / #1945) through the folded expression instead of a bespoke statement walk (#2040, PR-B of the memo follow-up stack).

  The analyzer now folds a complete, value-producing block-bodied memo into a single `MemoInfo.parsed` expression (`foldBlockToExpr`), runs after all signals/memos are collected so idempotent reactive getter reads (`const k = getter()`) count as pure and a guard read across several branches still folds. An incomplete or unfoldable block leaves `parsed` undefined and consumers keep their `parsedBlock` fallback.

  The Go adapter's `resolveBlockBodyMemoModuleConst` is rewritten to read the folded `MemoInfo.parsed` conditional (`!getter() ? MODULE_CONST : <derived>`) rather than walking `var-decl`/`if`/`return` statements with a local-var→signal map — the per-idiom statement matcher is gone, the recognition rides the general fold. The guard-falsy-init → module-const baking is unchanged.

  Render parity verified: Go + Perl adapter conformance green; Go/Mojo/Xslate adapter unit suites green; the jsx suite carries only the pre-existing checker-alias failures.

- aefe7a0: Make `memo/memo-type.ts` parse-free by classifying memo bodies from the IR
  instead of re-parsing `computation` with `ts.createSourceFile`:

  - `MemoInfo.bodyIsTemplateLiteral` — the analyzer sets this from the real arrow
    AST node; `inferMemoType` reads it instead of the removed `isTemplateLiteralMemo`
    helper. A no-substitution `` `plain` `` template folds to a plain string
    `ParsedExpr` literal, so a dedicated boolean (not a `parsed.kind` check)
    preserves the backtick distinction.
  - `isStringTernaryMemo` now reads the analyzer-carried `MemoInfo.parsed`
    conditional tree (the `moduleStringConsts` membership check stays a plain Set
    lookup in the adapter). A block-bodied memo has no `parsed`, so it returns
    false — matching the former predicate, which never descended a block.

  Byte-identical (the analyzer logic mirrors the former adapter predicates over
  the same source); verified by go unit (556) + conformance (786). Drops the
  adapter's package-wide `ts.createSourceFile` count from 8 to 6 and advances the
  constitution's "no expression parsing in adapters" rule by moving the
  classification to Phase 1.

- 8b19546: Read carried `ParsedExpr` trees in two more Go-adapter lowerings instead of
  re-parsing source strings with `ts.createSourceFile` (Roadmap A terminal
  sweep). Object-literal child-prop maps — an inline object passed to a child's
  optional object prop (`<Carousel opts={{ align: 'start' }}>` →
  `map[string]interface{}`) — now lower from the `ExpressionAttr.parsed`
  `object-literal` tree via `objectLiteralToGoMap`. Scalar-literal loop typing —
  `[1,2,3,4,5].map(...)` style loops whose `BfLoopItem` field types as
  `interface{}` — now read a new `IRLoop.arrayParsed` (attached in `jsx-to-ir.ts`
  as the parse of the same `array` string the adapter consumes, threaded through
  `NestedComponentInfo.loopArrayParsed`) instead of re-parsing the loop's array
  string in `scalarLiteralLoopGoType`. Both reproduce the previous output
  byte-for-byte (string via `JSON.stringify`, numbers via the carried `raw`
  token, unary-minus numbers preserved) and fall back / defer identically when
  the tree is absent or unsupported — verified by the adapter conformance and Go
  adapter suites (786 / 556).
- 07649cb: Lower the object-returning `searchParams()` memo from the analyzer-carried `parsedBlock` instead of re-parsing `computation` with `ts.createSourceFile` (terminal sweep, #2006).

  - `@barefootjs/jsx` — add `parsedExprToParsedExpr2`, a pure structural `ParsedExpr` → `ParsedExpr2` converter for the object-memo value surface; the block-body tolerant parser (`parseStatement`) now also carries `object-literal` var-decl inits and returns (an object-literal return is parenthesised to force expression context), completing the Roadmap A-1 deferral.
  - `@barefootjs/go-template` — `computeObjectMemoInitialValue` walks `MemoInfo.parsedBlock` / `parsedBlockComplete` and lowers each return-object property via `parsedExprToParsedExpr2` + `lowerCtorExpr`, dropping the adapter's last `parseLiteralExpression` (`ts.createSourceFile`) call.

  Byte-identical Go output (786 adapter-conformance / 553+3-skip go-template tests stay green); no public-API or behavioural change.

- a421530: Lower object / struct-array signal initial values from the carried IR tree too
  (Roadmap A-4). `parsedLiteralToGo` now bakes an object literal against a
  concrete local struct — mirroring `tsLiteralToGo`'s object branch (Go field
  names resolved from the struct's field map, deferring on an unknown struct, an
  undeclared key, or a nested object/array value). Combined with A-3's scalar
  support, every fully-literal signal-array init — a typed struct array
  `createSignal<Item[]>([{ id: "a" }])`, an untyped synthesised-struct array, or a
  scalar array — now bakes from the structured tree instead of re-parsing the
  value string with
  `ts.createSourceFile`, which stays the fallback only for shapes the tree can't
  represent (`as const`, calls, identifiers). Byte-identical — verified by the Go
  adapter struct/scalar bake unit tests + conformance suite.
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

- e9ed338: Add `queryHref` — a pure, functional URL-query builder (#2042).

  `queryHref(base, { … })` is the build counterpart to `searchParams()` (the reactive reader): instead of imperatively mutating a `URLSearchParams`, pass a params object of **string** values. Each entry is included iff its value is a non-empty string (so a conditional include folds into the value as `cond ? value : undefined`); values are encoded with `URLSearchParams`. It runs natively on the client and is a pure function (no reactivity). (Number/boolean values are intentionally not accepted — JS truthiness omits `0`/`false`, which the SSR string guard can't model without per-value type info; stringify at the call site.)

  The go-template adapter lowers a `queryHref(base, { … })` call to `bf_query` directly — because the call and its object literal are already structured IR, there is no block-body recognizer and no emit-time re-parse. This is the functional alternative to the imperative `URLSearchParams` builder idiom: write the query inline (`href={queryHref(base, { … })}`) rather than a multi-statement helper.

  Notes / scope:

  - go-template SSR lowering only in this cut; Mojolicious / Xslate parity (their query helpers) is a follow-up. They keep the generic lowering until then.
  - Helper wrappers whose params-object references the helper's params aren't inlined yet (a pre-existing inliner limitation, since object literals lower opaquely from source) — the direct call is the supported idiom.

- d330fe1: Lower `queryHref` through a default-applied built-in `LoweringPlugin` instead of a per-adapter recognition branch (#2057). Its runtime stays in `@barefootjs/client`; the compiler registers `queryHrefPlugin` by default, so each adapter (go-template / mojolicious / xslate) recognises `queryHref(base, { … })` through the same registry matcher loop as any userland plugin and renders it to its query helper (`bf_query` / `bf->query` / `$bf.query`). Adapters no longer carry a queryHref-specific branch. Output is unchanged — `queryHref` still lowers identically.
- 5b3b134: Retire the imperative `URLSearchParams` href-builder recognizer (#2042).

  With `queryHref` shipped on every SSR adapter and the last usage migrated, the ad-hoc recognizer for the `(…) => { const u = new URLSearchParams(); … }` idiom is removed:

  - `@barefootjs/jsx`: deleted `url-builder-shape.ts` (`recognizeUrlBuilder`), the `ConstantInfo.urlBuilder` field, and the `UrlBuilderInfo` / `UrlBuilderSet` types (compiler-internal surface added in #2039).
  - `@barefootjs/go-template`: removed `lowerUrlBuilderHelperCall` and the builder emitter; `expr/url-builder.ts` now only lowers the structured `queryHref(base, { … })` call to `bf_query`.

  No user-facing behavior change: components use `queryHref` (lowered structurally, no recognizer / re-parse). The trailing-slash `String.replace(/\/+$/, '')` → `strings.TrimRight` ctor lowering is independent and unchanged.

- 758f4db: Lower the searchParams-derived object memo (#2015) through the general fold instead of a bespoke statement walk (#2040, PR-C of the memo follow-up stack).

  `computeObjectMemoInitialValue` previously walked `parsedBlock` for `const sp = searchParams()` bindings + a terminal `return { … }`. It now folds the block with `foldBlockToExpr`, adding `searchParams` to the purity oracle (an idempotent request-query read, safe to inline at each `sp.get('k')` site), and lowers the resulting object-literal. `sp` is inlined to `searchParams()`, so `lowerCtorExpr` now recognises a `searchParams().get('k')` receiver in addition to the `const sp` env form. `foldBlockToExpr` is exported from `@barefootjs/jsx`.

  This drops the statement-shape matching (var-decl scan + last-return check) for the object memo, and as a side benefit lowers an object memo that calls `searchParams().get('k')` directly without a `const` binding. A block that doesn't fold to an object literal returns null → the same nil fallback as before. Render parity verified by the Go adapter conformance + unit suites.

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

- 837ae95: Carry a signal's parsed initial value on the IR (`SignalInfo.parsed`, Roadmap
  A-3) and lower literal signal inits from it. The analyzer structures each
  signal's `initialValue` once (best-effort, from the same type-stripped string
  the adapter consumes). A new `ParsedExpr.literal.raw` field carries the numeric
  literal's `ts.NumericLiteral.text` (TS's normalised token) so a structured
  lowering matches the existing `ts.createSourceFile` path byte-for-byte instead
  of the lossy `parseFloat` value. The Go adapter's scalar-array signal bake
  (`convertInitialValue` → `jsLiteralToGo`) now reads the carried tree via a new
  `parsedLiteralToGo` helper, which reproduces the scalar / scalar-array shapes
  exactly and defers (returns null) everything else — object/struct-array baking,
  empty arrays, `as const` — to the unchanged `ts.createSourceFile` fallback. So
  only the reproduced shapes skip the re-parse; behaviour is byte-identical,
  verified by the Go adapter unit + conformance suites.
- 5d89c86: Carry a `SpreadAttr.parsed` tree on the IR so the Go adapter's conditional inline-object spread codegen lowers from the parsed tree instead of re-parsing the spread source with `ts.createSourceFile` (`parseLiteralExpression`). Additive and best-effort (mirrors `ExpressionAttr.parsed`); the generated Go is byte-identical (786/556 conformance + go-template tests unchanged).
- d779e7b: Lower a spread bag's signal object-literal initial value (`{...attrs()}` where
  `attrs` is `createSignal({ ... })`) from the carried IR tree instead of
  re-parsing with `ts.createSourceFile`. The analyzer now parenthesises a signal's
  `initialValue` before parsing (`(${initialValue})`), so a bare object-literal
  init resolves to an `object-literal` `ParsedExpr` rather than being read as a
  block — `parseExpression` unwraps the parens, so array / scalar / prop-ref inits
  (the existing consumers) are unchanged. The Go spread codegen reads
  `signal.parsed` via a new `parsedObjectLiteralToGoMap`; a non-object / spread /
  computed init leaves `parsed` absent or non-object, returning null exactly as
  the former string parser did. Byte-identical — verified by go unit (556),
  conformance (786), and jsx unit (2216). Drops the adapter's package-wide
  `ts.createSourceFile` count by one.

  Also adds an optional `ObjectLiteralProperty.keyKind` (`identifier` / `string` /
  `numeric`) to the shared `ParsedExpr` so the spread lowering can keep rejecting
  numeric object keys (`{ 1: 'a' }`) exactly as the former parser did — `key`
  normalises numeric and string keys to the same text. Additive and optional;
  other consumers ignore it.

- 53f1d4d: Untyped object-array signal struct synthesis now reads the analyzer-carried `signal.parsed` tree instead of re-parsing `initialValue` with `ts.createSourceFile` (`parseLiteralExpression`). Byte-identical output (786 adapter-tests / 556 go-template).
- 86dde58: Lower a template-literal memo's SSR value from the carried IR tree instead of
  re-parsing `computation` with `ts.createSourceFile`.
  `computeTemplateLiteralMemoInitialValue` now reads the template from `memo.parsed`
  (expression body) or `memo.parsedBlock` (block body — the Toggle `classes` memo,
  collecting its `const X = props.Y ?? 'lit'` key bindings), and its interpolation
  resolvers (`resolveTemplateInterpolation` / `parseLocalKeyBinding` / the
  record-index lowering) operate on `ParsedExpr`. The record-index case reads the
  `recordConst`'s carried `ConstantInfo.parsed` object-literal rather than the
  shared `parseRecordIndexAccess` (which the other adapters keep using unchanged).
  Byte-identical — verified by go unit (556) + conformance (786), including the
  carousel class memos and the Toggle `variantClasses[variant]` record index.
  Removes the `template-interp.ts` `ts.createSourceFile`.
- 3938a6f: Carry the regex-`replace` shape as pure IR, retiring an emit-time `ts.createSourceFile` / `parseLiteralExpression` re-parse in the go-template adapter (#2039).

  - The regex form of `String.replace` is now carried structurally (an `array-method` `replace` whose first arg is a `regex` node) rather than collapsing to `unsupported`, so the derived-memo constructor lowering recovers the `/\/+$/` trailing-slash strip → `strings.TrimRight` off the IR, with no `ts.createSourceFile` on the `bf build` hot path. Template use of a regex `.replace` stays refused with the same deferred-form diagnostic via `isSupported`.

  No change to rendered HTML across the go-template, Mojolicious, and Xslate SSR adapters.

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

- 8e0c10a: Exclude children prop from bf-p serialization to prevent nested scope ID leaks in router region diffs
  - @barefootjs/shared@0.15.2

## 0.15.1

### Patch Changes

- @barefootjs/shared@0.15.1

## 0.15.0

### Minor Changes

- ae67ac7: JSX children passed to imported child components now render on Go (#1896) instead of silently dropping. Action-bearing children (nested components, dynamic text) lower to a per-call-site companion define executed with the parent's data and injected into the child's props:

  - New runtime helpers: `bf.TemplateFuncMap(t)` (provides `bf_tmpl`, a closure over the executing template set — register it alongside `bf.FuncMap()` before parsing) and `bf.WithChildren` (registered as `bf_with_children`).
  - The adapter emits `{{template "Child" (bf_with_children .ChildSlotN (bf_tmpl "<Parent>__children_<slot>" .))}}` for such call sites, and collects component instances / keyed loops nested inside children onto the parent's props.

  A long tail of codegen fixes rode along, surfaced by the composed `site/ui` demo corpus (all verified to byte parity with the Hono reference): multi-component-file `restPropsName` staleness in `generateTypes` (`in.Props undefined`), memo-vs-prop struct field collisions (`ClassName redeclared`), reference-typed zero values (`0` into `map`/`bool` fields), compile-time resolution of module-const record lookups (`strokePaths['chevron-down']`, `variantClasses.ghost`) and literal consts, template-literal ternary double-wrapping (`{{{{if`), parenthesised compound args (`eq (or .X "top") "left"`, `bf_string (…)`), string-tolerant equality (`eq (bf_string .Sorted) "asc"` for union-typed props), ARIA presence attributes rendering as `aria-x="true"`, and `attr={cond ? value : undefined}` omitting the attribute like Hono.

- f01e7fa: data-table component now renders on Go template (#1897). Three adapter-level capabilities were added:

  - **Loop body children via companion defines**: children of loop-body components (e.g. `<TableCell>` inside `<TableRow>`) render through `bf_with_children` + `bf_tmpl` companion defines.
  - **Wrapper struct + constructor baking**: a wrapper struct embeds the child component's Props, per-row datum fields, and child sub-component slots. The constructor bakes module-const arrays into Go struct literals.
  - **Block-body memo resolution**: recognizes `() => { const k = getter(); if (!k) return MODULE_CONST; … }` via TS AST walk and bakes the constant's value when the guard signal starts falsy.

  Also fixes marker conformance regex to capture `^`-prefixed slot IDs in `bfTextStart`/`bfText`/`text_start` calls.

- 498f83d: Compute object-returning `searchParams()` memos for SSR instead of emitting a nil map (PostList derived-state blocker, #1897 follow-up — Capability A).

  A block-body memo of the shape `() => { const sp = searchParams(); return { sort: asSortKey(sp.get('sort')), tag: sp.get('tag') ?? '' } }` previously fell through every memo pattern and was initialized to `nil` in `NewXxxProps`, so the template's `.Params.Sort` / `.Params.Tag` accesses read a nil map. The adapter now lowers the object's values to Go in the constructor context and emits a computed `map[string]interface{}` with capitalized keys (matching the template's field access). The lowerer supports the narrow surface these memos use: `<sp>.get('k')` → `in.SearchParams.Get("k")`, `<arr>.includes(<x>)` → `bf.Includes([]string{…}, <x>)`, module arrow-helper inlining (e.g. `asSortKey`), `<expr> ?? ''`, and string ternaries. Unsupported shapes still fall back to `nil`, so nothing regresses.

- 2c62b27: Inline local pure helper calls at template call sites (PostList derived-state blocker, #1897 follow-up — Capability B).

  A call to a local, expression-bodied helper arrow const — `className={sortClass('date')}` where `const sortClass = (k) => params().sort === k ? 'sort on' : 'sort'` — previously lowered to `{{.SortClass "date"}}`, a method call on the Props struct with no Go method backing it (execute-time `can't evaluate field SortClass`). The adapter now inlines the helper's body at the call site, substituting the call arguments for the params (AST span-splice, so it is shadowing- and member-name-safe), and lowers the result: `class="{{if eq (bf_string .Params.Sort) "date"}}sort on{{else}}sort{{end}}"`. Works inside loops too (`tagClass(t)` resolves the loop var and root memo). Only self-contained helpers are inlined; one that delegates to another local helper (e.g. `sortHref` → `hrefFor`) is left untouched for a later capability. The attribute-value emitter no longer double-wraps an inlined helper that lowers to a self-contained `{{…}}` action block.

- 5536468: `searchParams()` (router v0.5) now renders at SSR on the Go template adapter, so the cross-adapter `search-params` conformance fixture (`{searchParams().get('sort') ?? 'none'}`) runs on Go instead of being skipped (#1922, follow-up to #1917).

  - **Lowering**: Go's `and`/`or` are prefix builtins, so a multi-token operand (a method/function call, arithmetic, comparison, nested helper) must be parenthesised or it degrades into extra sibling args. `logical()` now composes both operands through `wrapIfMultiToken` — the file-wide idiom — so `searchParams().get(k) ?? d` lowers to `{{or (.SearchParams.Get "sort") "none"}}` instead of the broken `{{or .SearchParams.Get "sort" "none"}}` (which dropped the call grouping and rendered empty). This fixes the general `obj.method(arg) ?? fallback` shape, not just `searchParams`.
  - **Runtime**: new `bf.SearchParams` type with a `.Get(key)` helper (empty-tolerant zero value over `url.Values`) and a `bf.NewSearchParams(raw)` constructor for route handlers (`bf.NewSearchParams(r.URL.RawQuery)`).
  - **Codegen**: a `SearchParams bf.SearchParams` binding threaded through the generated `Input` / `Props` structs and `NewXxxProps`, emitted only when a component imports `searchParams` (and guarded against a name collision with a user prop/signal/memo of the same name). It is not serialised for hydration (`json:"-"`) — the client re-reads `window.location.search` itself. The zero value is an empty query, so a render with no request query resolves every key to `""` and the author's `?? default` renders.

  The Mojolicious / Xslate template adapters stay skipped pending their own env-signal lowering + per-request Perl `search_params` reader (#1922).

- 9758831: Lower `hrefFor`-style URL-builder helpers to `bf_query`, and compute derived string consts as struct fields (PostList href blocker, #1897 follow-up — Capability C2).

  A call to a local URL-builder helper — `href={sortHref('date')}` where `sortHref` delegates to `hrefFor = (sort, tag) => { const u = new URLSearchParams(); if (sort !== 'date') u.set('sort', sort); if (tag) u.set('tag', tag); return u.toString() ? \`${root}?${u}\` : root }`— previously lowered to`{{.SortHref "date"}}`, a method call with no Go method behind it. The adapter now:

  - Recognizes the `URLSearchParams` builder idiom (AST) and emits a `bf_query` action, lowering each guarded `.set()` to an `(include bool, key, value)` triple — the guard via the existing condition lowering (`if (sort !== 'date')` → `ne … "date"`; `if (tag)` → `ne … ""`). Pass-through delegates (`sortHref` → `hrefFor`) are inlined and recursed.
  - Computes component-scope derived string consts that the template references (e.g. `root = base || '/'`, with `base = (props.base ?? '').replace(/\/+$/, '')`) as `NewXxxProps`-initialized struct fields. `(…).replace(/\/+$/, '')` lowers to `strings.TrimRight(_, "/")` (this trailing-slash pattern only), `||` to an empty-fallback, and `props.X` to `in.X`; `strings` is added to the generated imports when used.

  Verified end-to-end against the shared blog `PostList`: `.SortHref` / `.TagHref` are gone, `Root` is computed, and the emitted Go renders correct URLs (`/blog?sort=title&tag=go`, trailing-slash bases normalized).

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

- 0d6333e: Lower an array memo's `.length` to its handler-filled loop slice count (PostList status count, #1897 follow-up — Capability D, completing the derived-state fix).

  A memo used both as a loop source (`visible().map(...)`) and as a count (`visible().length`) previously lowered the count to `len .Visible` — a memo field the adapter leaves unset (nil) — so the status line rendered `0`. The loop's `.map()` already becomes a handler-filled slice (`.PostListItems`) holding exactly the rendered (filtered) items, so the adapter now maps each array memo to that slice and lowers `<memo>().length` to `len .<Slice>` (loop-scoped through `$.` when nested). `props.items.length` and other lengths are unaffected.

  With this, the shared blog `PostList` renders fully on Go template SSR: `params` / derived classes / hrefs / counts all resolve, no execute-time crashes.

- da0c0c0: Go template adapter codegen fixes surfaced by bringing the shared blog islands to the Go/Chi integration.

  - **`Math.min` / `Math.max`** now lower to the `bf_min` / `bf_max` runtime helpers (two-arg form; the N-arg form still falls back to the standard BF101 unsupported-call diagnostic via the arity gate). Previously `Math.min(...)` emitted a non-existent `.Math.Min` field access that crashed at execute time.
  - **Nested arithmetic** parenthesises compound operands, so `(a / b) * c` emits `bf_mul (bf_div .A .B) .C` instead of `bf_mul bf_div .A .B 100`, which handed `bf_mul` four arguments. Comparisons (`gt`/`lt`/`eq`/…) wrap compound operands the same way.
  - **Module numeric consts** (`const TRACK = 8`) inline their literal value rather than emitting a `.TRACK` Props field that never exists (mirrors the existing module string-const inlining).
  - **Combined types file** adds the `"strings"` import when the merged constructors reference `strings.*` (a `searchParams()`-backed component emits `strings.TrimRight` for its router base), fixing an `undefined: strings` compile error in the generated types.

- edd17e6: Add the `bf_query` runtime helper (PostList href blocker, #1897 follow-up — Capability C1).

  `bf_query(base, ...triples)` builds a URL from a base path plus a query string assembled from `(include bool, key, value)` triples, in order — appending each pair only when its `include` flag is true, with keys/values query-escaped. It mirrors a JS `URLSearchParams` builder whose `.set(key, value)` calls are each guarded by an `if` (the compiler lowers each guard to the `include` bool). This is the runtime primitive the upcoming adapter lowering of `hrefFor`-style helpers emits; no generated output uses it yet.

- 50c1965: Fix `searchParams()` SSR on the Go template adapter for an aliased import. `import { searchParams as sp }` + `sp().get(k)` now lowers to the canonical `.SearchParams.Get` field (and the `SearchParams bf.SearchParams` struct binding is generated), matching the non-aliased path — previously detection missed the alias (so no field was emitted) and the call lowered to a `.Sp` field that never exists. Detection now uses the shared `searchParamsLocalNames` helper (the same one the Mojo/Xslate adapters use), so the binding is found under any local name. #1922
- 2218654: Fix invalid template syntax for a dynamic text node whose expression is a template literal with leading literal text.

  Such an expression lowers to a **mix** of literal text and `{{...}}` actions (e.g. ` · #${tag}` → ` · #{{.Tag}}`). `renderExpression` only skipped re-wrapping when the lowered string _started_ with `{{`, so a template literal with leading literal text fell through and got wrapped whole — emitting `{{ · #{{.Tag}}}}`, which `html/template` rejects at parse time (`unrecognized character in action: U+00B7 '·'`). It now skips re-wrapping when the lowered string starts with `{{` (an `{{if}}`/`{{with}}` action chain) **or** the parsed expression is a `template-literal`, and emits it as-is between `bfTextStart`/`bfTextEnd`. The check keys off the parsed expression kind rather than substring-matching `{{`, so a bare string literal that merely contains `{{` (JSX `{"{{"}` → Go expr `"{{"`) is still wrapped and stays escaped. This is the shared blog `PostList` status-line shape (the `· #${params().tag}` branch).

- ed9bfeb: `test-render` now recognises alias-import siblings (any specifier present in the `components` map, e.g. `@ui/components/ui/<name>`) when computing the reachable child set, and deduplicates module-scope shared types emitted once per component by multi-component child files. Previously an alias-imported child produced a combined unit referencing `New<Child>Props` without the child's type block (`undefined` compile errors), and multi-component child files failed with `redeclared in this block`.
- 166177d: Composed `site/ui` demo-corpus parity for the perl adapters (#1897):

  - **Xslate now renders the ENTIRE shared conformance corpus to Hono parity** (`skipJsx` is empty). `tabs` / `accordion` / `pagination` came off via: ARIA `aria-selected`/`aria-expanded` and boolean-TYPED prop routing through `bool_str`, compile-time resolution of module object-literal const property access (`variantClasses.ghost`), composed template-literal module consts, `attr={cond ? v : undefined}` attribute omission, and literal-const inlining (`totalPages`).
  - **Mojolicious closes the strict-vars seeding gap**: child renders now seed declared props (JSX default or `undef`), inherited `props.<x>` accesses (via the shared augmentation pass), signal initials, and memo `ssrDefaults` under the caller's props — `tabs` / `tooltip` / `pagination` render to parity and `skipJsx` is empty. The remaining composed fixtures stay pinned on the context-provider object-literal lowering (BF101), the tracked #1897 feature.
  - `@barefootjs/jsx` exports the shared static-const machinery all three SSR adapters now use: `collectModuleStringConsts` (fixed-point, incl. composed template-literal consts and `[...].join(sep)`) and `lookupStaticRecordLiteral` (module object-literal property/index lookup). The Go adapter delegates to it (no behavior change).

- Updated dependencies [071a1a3]
  - @barefootjs/shared@0.15.0

## 0.14.0

## 0.13.0

## 0.12.0

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

## 0.10.1

## 0.10.0

## 0.9.6

## 0.9.5

## 0.9.4

## 0.9.3

### Patch Changes

- 46d1a0d: Add `override` modifier to `renderAsync` in the Go-template, Mojolicious
  and Xslate adapters. Required by Deno's stricter `noImplicitOverride`
  default — without it `deno publish` (and `deno check`) fail with TS4114
  since `renderAsync` is provided as a concrete fallback on `BaseAdapter`,
  not declared abstract. No runtime change — `override` is a type-only
  annotation.
- b308ed5: Render hoisted `children={<…/>}` JSX on the Go template adapter, graduating the `children-jsx-expression` and `fragment-wrapped-children-jsx-expression` conformance fixtures to Hono parity.

  A `children` value passed as a JSX-expression attribute (`<Box children={<span>x</span>} />`) lands as a `jsx-children` prop, and its root carries `needsScope: true`. The Go adapter previously had no path to render such a hoisted child — it was dropped, so the parent rendered an empty `<div bf-s="…"></div>`.

  The adapter now treats a `jsx-children` prop as the child slot's effective children when no nested children exist, and bakes them into the child's `Children` input. Because the hoisted root's `bf-s` must resolve to the **parent** scope at render time (mirroring the client `__BF_PARENT_SCOPE__` placeholder and Mojo's begin/end capture), the bake splices the runtime parent `scopeID` into the rendered fragment (`extractScopedHtmlChildren` → `template.HTML("<span bf-s=\"" + scopeID + "\">x</span>")`) rather than emitting a static string. Genuinely dynamic fragments (surviving `{{…}}` actions) stay on the existing drop path. Hono reference snapshots are unchanged.

- b4b970c: Graduate the `toggle-shared` conformance fixture to Hono parity on the Go template adapter — the last adapter that still skipped it. `toggle-shared` is a keyed `.map` of sibling `ToggleItem` children, each with a per-item prop-derived signal.

  The adapter's generated types were already correct (typed `[]ToggleItemInput` slice, per-item `On: in.DefaultOn` seeding, `ToggleItem_<rand>` scope ids — fixed by intervening array-baking work). Two remaining gaps were closed:

  1. **Typed prop-array literal (test harness).** The Go test-render serialised an array-of-objects prop as `[]any{…}`, which failed to compile against the typed `ToggleItems []ToggleItemInput` Input field. It now reads the field's element type from the generated `<Component>Input` struct and emits a matching typed slice of keyed struct literals (`[]ToggleItemInput{ToggleItemInput{Label: …, DefaultOn: …}, …}`), with omitted optional keys taking the Go zero value.

  2. **`data-key`.** A keyed loop child now stamps `data-key` for reconciliation parity. Every component `Props` gains a `BfDataKey` field; the parent's loop init sets it per item from the loop `key` expression (`item.label` → `fmt.Sprint(item.Label)`); and the component's scope root emits `{{if .BfDataKey}}data-key="{{.BfDataKey}}"{{end}}`. Emission is scoped to the component root element(s) — including each branch top of an early-return (`if-statement`) root — so non-keyed renders add nothing.

  This clears the final `toggle-shared` skip; the shared JSX conformance corpus now renders to Hono parity on Go, Mojolicious, and Text::Xslate alike. Measured against real Go 1.25.6. Hono reference snapshots unchanged.

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

## 0.9.2

### Patch Changes

- f63ece5: Honour the fixture `componentName` in the Go / Mojolicious / Xslate SSR test-render harnesses, and graduate the `props-reactivity-comparison` conformance fixture on the Go adapter.

  The three SSR test-renderers picked their entry-point IR by default-export → first-exported → first IR, ignoring the requested `componentName`. For a multi-export source (`ReactiveProps.tsx` exports both `ReactiveProps` and `PropsReactivityComparison`) this always rendered the first export, so the `PropsReactivityComparison` fixture compared the wrong component against the Hono reference. Each renderer now selects the IR whose `componentName` matches the requested name first (mirroring the Hono reference's selection), falling back to the previous heuristics for single-export sources.

  With the correct component selected, `props-reactivity-comparison` renders byte-for-byte against the Hono reference on **Go** (the generated child constructors compute the `displayValue = props.value * 10` memo from the passed prop), so it is unskipped there.

  It stays skipped on **Mojolicious / Xslate**: the child memo `displayValue = props.value * 10` is prop-derived, so `extractSsrDefaults` yields `null` and the Perl SSR model — which seeds child memos from those static defaults — never declares `$displayValue` (Kolon renders it empty; Mojo aborts under strict mode). The skip rationales are refreshed to describe this real failure mode, and the stale `toggle-shared` / `children-jsx-expression` rationales are corrected to match current behaviour (Go drops a hoisted `children={<span/>}` body rather than emitting it as literal text; `toggle-shared`'s loop-child slice types as `[]any` not `[]ToggleItemInput`). Hono reference snapshots are unchanged.

## 0.9.1

## 0.9.0

### Patch Changes

- cfbb4b6: Implement SSR context propagation for the Go template adapter, bringing the `context-provider` conformance fixture to parity with the Hono reference (the Perl backends stay deferred).

  Template engines have no JS runtime context stack like the Hono adapter's `provideContextSSR`, so a `useContext` value has to be threaded in at the data-construction layer:

  - **`collectContextConsumers` (`@barefootjs/jsx`)** — a shared helper that, for a component, finds every `const x = useContext(Ctx)` consumer and resolves each `Ctx` to its `createContext(<default>)` default value (string / number / boolean literal). Single source of truth for the SSR-context adapters.

  - **Go consumer side** — each `useContext` consumer becomes a struct field on the component's `Input` / `Props` (named after the local binding, e.g. `theme` → `Theme`), defaulted in `NewXxxProps` to the `createContext` default when the caller doesn't set it. The template already lowers the `useContext` local to a `{{.Theme}}` root-field read; it now resolves against a real field instead of emitting `.Theme` against a struct that has none (the prior compile failure).

  - **Go provider side** — `collectStaticChildInstances` threads the active `<Ctx.Provider value>` bindings (literal values lowered to Go literals) down the IR tree. When a static child slot consumes a context an enclosing provider supplies, its `NewXxxProps(...Input{ ... })` construction sets the matching field to the provider value (cross-component consumer lookup via the existing `registerChildComponentShape` channel), so `useContext(Ctx)` resolves to the provided value at template-eval time.

  `context-provider` is unskipped on the Go conformance suite. It stays skipped on the Mojolicious / Xslate suites (their stash-seed render path would port the same way — tracked as a follow-up); their skip rationales are updated to reflect that the Go path now exists. Hono reference snapshots are unchanged.

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

## 0.8.0

### Patch Changes

- eab6566: Lower conditional inline-object spreads on intrinsic elements. A spread of the shape `{...(cond ? { 'aria-describedby': value } : {})}` (either branch possibly `{}`) now compiles on both template adapters instead of raising `BF101`.

  The Go adapter builds the spread bag as an immediately-invoked `func() map[string]any { ... }()` in `NewXxxProps` that conditionally returns the populated map or an empty one. The Mojo adapter emits an equivalent Perl inline ternary of hashrefs (`$cond ? { 'aria-describedby' => $value } : {}`) through `bf->spread_attrs`. In both adapters the falsy branch yields an empty bag so the key is omitted rather than rendered as an empty-string attribute (neither `SpreadAttrs` nor `bf->spread_attrs` filters empty strings).

  The condition supports a bare prop identifier and its negation; object keys must be static string/identifier names and values resolve prop references (`in.Field` / `$prop`) or string literals. Any other shape still falls through to the existing `BF101` refusal.

  Additionally, both adapters now honour Hono-style nullish-attribute omission for dynamic attributes. When an attribute value is a bare reference to a nillable prop (Go: a field whose resolved type is `interface{}`; Mojo: a prop with no destructure default and a non-primitive type), the attribute is guarded so an unset value drops the attribute entirely instead of rendering `attr=""`. Go emits `{{if ne .Rows nil}}rows="{{.Rows}}"{{end}}`; Mojo emits `<% if (defined $rows) { %>rows="<%= $rows %>"<% } %>`. Concrete-typed (`string`/`int`/`bool`) and defaulted props are unaffected and still emit unconditionally (matching Hono's `value=""` / `data-count="0"`). This unblocks the `textarea` fixture's optional `rows?: number` prop on both adapter conformance suites.

## 0.7.0

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

- 677c614: Render the `Slot` component's runtime-chosen dynamic tag (`const Tag =
children.tag`) as a children passthrough in the Go template adapter
  instead of an impossible `{{template "Tag"}}` call, which Go's
  `html/template` rejected (`no such template "Tag"`) while escape-walking
  all registered templates. This lets components that use the `asChild` /
  `Slot` pattern (e.g. `Button`) be registered and rendered server-side on
  the Go adapter. A new additive `IRComponent.dynamicTag` flag marks the
  node; it is consumed only by the Go adapter (Hono/CSR/Mojo ignore it).
  Also fixes two latent Go-adapter divergences surfaced by this path. The
  `isValidElement(x)` element guard now lowers to a real server-side
  truthiness check (an element is renderable when there is markup to emit)
  instead of a bogus `.IsValidElement` field access; any other user-defined
  predicate call in a condition (e.g. `isAdmin(user)`), which a server-side
  template genuinely cannot evaluate, now refuses with a hard `BF102` error
  pointing to `/* @client */` rather than silently rendering a gated branch.
  And `Record<T,string>` case values in template-literal lookups are
  HTML-escaped to match the reference output.

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

- 3529d0f: Give `.forEach()` a dedicated unsupported-method diagnostic and tighten the generic BF101 wording (#1448 Tier C).

  `.forEach()` returns `undefined`, so it is never a template-position lowering target — its only meaningful use is side effects inside event handlers / `createEffect` callbacks (client JS, which never reaches the adapter). The template-language adapters already refuse it in template position via the parser's `UNSUPPORTED_METHODS` gate (surfaced as BF101); this swaps the generic hint for a `forEach`-specific reason that explains the `undefined` return and points to `.map(...)` / `createEffect` instead.

  The generic BF101 reason for other unlowerable methods is also reworded to lead with the SSR-preserving fix and frame `/* @client */` as an escape hatch with its cost made explicit: `'<method>()' can't render on the server. Pre-compute the value, or add /* @client */ for client-only (no SSR).` These reasons are flagged `selfContained` on the `SupportResult`, so the Go-template adapter shows them as-is instead of appending its own "Options" block — which would have duplicated the remedies and, for `forEach`, contradicted the tailored message. Low-level reasons (operators, comparators, complex predicates) stay un-flagged, so the adapter still attaches its remediation options and users never lose actionable next steps.

  No behaviour change for the client-callback path: `.forEach()` inside event handlers / `createEffect` continues to pass straight through to the emitted runtime. A regression test pins both halves of the contract.

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

## 0.5.3

## 0.5.2

### Patch Changes

- ea6d3e9: Reference outer signals/props through Go template's `$` root scope inside a `{{range}}` loop body (#1677). Previously a reference like `sel()` or `props.x` used inside `items().map(...)` emitted `.Sel` / `.Active`, which Go resolves against the iteration element (no such field → `<nil>`); it now emits `$.Sel` / `$.Active`. The loop element's own fields stay element-scoped (`.ID`).
- 562d343: Bake typed and scalar signal array-literal initial values into the generated `NewXxxProps` SSR data context, so Go server-renders the initial loop items instead of an empty list (#1672). Untyped object arrays and non-literal initialisers continue to default to `nil`.

  `TypeDefinition` now carries structured `properties` (`PropertyInfo[]`) for object/interface types, so adapters can consume a type's field set without re-parsing its source text. The go-template adapter uses this to derive struct fields and bake object literals against the real field set.

- f20bc10: Synthesise a Go struct for an untyped object-array signal so its inline initial value SSR-renders instead of staying `nil` (#1680). `createSignal([{ id: "a", n: 1 }])` now infers a struct from the literal's shape, types the signal field as a slice of it, and bakes the items — so the loop body's struct field access (`{{.ID}}`) resolves server-side. Synthesis bails to `nil` (prior behaviour) when elements don't share one shape, a value isn't a scalar literal, a key isn't a Go identifier, or the synthesised name would collide with an existing type. This also lets the `loop-item-conditional` conformance fixture render on Go.

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

- d13dc5c: Widen `.sort()` / `.toSorted()` comparator lowering with multi-key, relational-ternary, and block-body shapes (#1448 Tier B follow-up).

  The comparator parser now builds a structured `SortComparator` as a `keys: SortKey[]` list and accepts three previously-refused shapes (each lowering to both template-language adapters + the Hono/CSR JS path):

  - **Multi-key (`||`-chain)** — `(a, b) => a.x - b.x || a.y.localeCompare(b.y)` splits into one comparison key per `||` operand, applied in priority order as tie-breaks. Emits one 4-string `bf_sort` group (Go) / one `keys` hash (Mojo) per key.
  - **Relational ternary** — `(a, b) => a.f > b.f ? 1 : -1`, the 3-way `a.f < b.f ? -1 : a.f > b.f ? 1 : 0`, and the leading-tie `a.f === b.f ? 0 : …` forms lower to a new `auto` compare type: numeric when both keys parse as numbers, else lexical. Both template runtimes share this rule so their output stays byte-equal (diverges from JS `<`/`>` only for numeric strings).
  - **Single-`return` block bodies** — `(a, b) => { return a.f - b.f }` (arrow form; the function-expression form already worked) unwrap to the returned comparator.

  Runtime: Go `bf_sort` is now variadic over 4-string key groups with an `auto` branch; Mojo `bf->sort` takes an ordered `keys` list with the same `auto` rule. Function-reference comparators (`sort(myCmp)`), multi-statement block bodies, and `localeCompare(b, locale, opts)` stay refused (BF021) — deferred follow-ups.

## 0.4.0

## 0.3.0

## 0.2.0

### Minor Changes

- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- 91523ba: Add .findLast(p) / .findLastIndex(p) higher-order method lowering (#1448 Tier B). Go template adapter lowers via bf_find_last / bf_find_last_index runtime helpers (equality predicates) and range-based template blocks (complex predicates). Mojo adapter refuses with BF101 (matching existing find/findIndex gap).
- e16730d: Fix nullish coalescing (`??`) branch selection for unset props: map JS `null` to Go `nil` instead of empty string so `{{if ne .Field nil}}` correctly evaluates to false when the field is unset.
- 85d0507: Hoist preambles for template-block composition in expressions: when a higher-order method with a complex predicate (findLast, findLastIndex, every, some) is composed inside binary/logical/conditional expressions, the template block is structurally split into a preamble and a variable reference so the output is valid Go template syntax. Migrate all template-block producers (findLast, findLastIndex, every, some) from fixed $bf_result to counter-based unique variable names ($bf_r0, $bf_r1, ...) to avoid redeclaration conflicts when multiple blocks are composed.
- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/jsx@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/jsx@0.1.1
