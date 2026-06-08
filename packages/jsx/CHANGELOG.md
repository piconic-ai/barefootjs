# @barefootjs/jsx

## 0.10.0

### Patch Changes

- @barefootjs/shared@0.10.0

## 0.9.6

### Patch Changes

- @barefootjs/shared@0.9.6

## 0.9.5

### Patch Changes

- 4812524: Make the `./jsx-runtime` and `./jsx-dev-runtime` type entries JSR-publishable
  so `@barefootjs/hono` can publish to JSR. They were `.d.ts` files, which JSR
  drops from a package's exports (JSR can't use a `.d.ts` as an export
  entrypoint). As a result `@barefootjs/jsx/jsx-runtime` did not exist on JSR,
  and `@barefootjs/hono`'s JSR publish failed at the documentation-generation
  step with `Failed resolving '@barefootjs/jsx/jsx-runtime'` (it resolved
  locally only via `node_modules`, which JSR's server doesn't have).

  Convert both shims from `.d.ts` to real `.ts` modules (ambient `export
declare` declarations — same type surface, no runtime added) so JSR publishes
  them as exports. The `jsx-dev-runtime` re-export becomes
  `import type { JSX } … ` + `export type { JSX }` to satisfy isolatedModules
  (TS1205) now that it is a real module. Types are unchanged — the
  `IntrinsicElements` catch-all stays `HTMLBaseAttributes` with the existing
  `@ts-nocheck`, so consumer type strength is preserved.

  - @barefootjs/shared@0.9.5

## 0.9.4

### Patch Changes

- 0a103b3: Fix the `@barefootjs/hono` JSR publish, which failed with 31 `TS2411`
  errors in `jsx-runtime/index.d.ts`. The `IntrinsicElements` catch-all
  `[tagName: string]: HTMLBaseAttributes` is incompatible with the
  explicitly-typed elements under TS's index-signature rule, because the
  per-element types intentionally narrow `ref` to a concrete subtype and
  re-declare event handlers (not assignable under `strictFunctionTypes`).
  The diagnostic is spurious for JSX — a tag name always resolves to its
  explicit entry, never the index signature. `tsc` never surfaced it
  (`skipLibCheck`), but `deno publish` always type-checks `.d.ts`.

  Suppress the self-check of this one declarative shim with `@ts-nocheck`
  instead of widening the catch-all to `Record<string, any>`. Widening
  would silently drop attribute checking for custom / web-component tags;
  `@ts-nocheck` keeps the types fully strict at every use site (it only
  disables errors _within_ the shim file) while letting the publish through.

  - @barefootjs/shared@0.9.4

## 0.9.3

### Patch Changes

- 79e64d5: Fix Deno/JSR type-checking failures so `deno publish` succeeds for all
  `@barefootjs/*` libraries.

  - Add explicit `.ts`/`.tsx` extensions to relative imports across each
    published package's `src/` (Deno's ESM resolver does not implicitly
    append TypeScript extensions the way Bun/Node bundlers do; without
    this the publisher fails with `TS2307`).
  - Switch Node built-in imports in `@barefootjs/jsx` (`path`, `fs`) to
    the `node:` prefix Deno requires for unambiguous specifier resolution.
  - Enable `allowImportingTsExtensions: true` (with
    `emitDeclarationOnly: true` as its prerequisite) in each published
    package's `tsconfig.json` so TypeScript accepts the now-explicit
    extensions.

  No consumer-facing API changes — the npm build still emits
  `.js`/`.d.ts` artifacts identical to before; only the JSR-published
  TypeScript source surface is affected.

- f00e74d: Compute prop/signal-derived memos at SSR time on the Mojolicious and Text::Xslate adapters, graduating the `props-reactivity-comparison` conformance fixture to Hono parity.

  A memo whose body isn't statically foldable — e.g. `createMemo(() => props.value * 10)` — gets a `null` static SSR default from `extractSsrDefaults` (a bare prop access resolves to `undefined`). The Perl SSR model seeds child memos from those static defaults, so `$displayValue` was never declared and the child rendered empty (Go matches Hono because it generates a child constructor that computes the memo from the passed prop; the Perl static path had no equivalent — the reason both adapters skipped the fixture).

  Each adapter now seeds such memos in-template from the already-seeded prop/signal vars:

  - **Mojo**: `% my $displayValue = $value * 10;`
  - **Xslate**: `: my $displayValue = $value * 10;`

  The seed is emitted only when the memo's static default is `null` (statically-foldable memos stay on the existing ssr-defaults path) and when every variable the lowered expression references is already in scope (props params + signals + prior memos), so a memo over an out-of-scope binding stays on the null path rather than tripping Perl strict mode. Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

  The memo body is extracted with a new AST-backed `extractArrowBodyExpression` helper exported from `@barefootjs/jsx` (it parses the `() => …` computation with the TypeScript parser and returns the body node text), replacing a brittle `^\(...\)\s*=>` regex that desynced on parameter defaults containing calls or nested-arrow bodies. Shared by both Perl adapters.

  - @barefootjs/shared@0.9.3

## 0.9.2

### Patch Changes

- @barefootjs/shared@0.9.2

## 0.9.1

### Patch Changes

- @barefootjs/shared@0.9.1

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

  - @barefootjs/shared@0.9.0

## 0.8.0

### Patch Changes

- @barefootjs/shared@0.8.0

## 0.7.0

### Patch Changes

- 43cb708: Fix `applyRestAttrs` exclude list to key on consumed prop names instead of
  HTML attribute names. For components that destructure props and spread
  `...rest`, the generated exclude list now unions the destructured param
  names (the JS rest-exclusion set) with the statically-set attribute names.
  This prevents hydration from double-binding separately-wired event handlers
  (e.g. `onInput`/`onChange` firing twice) and from re-emitting consumed props
  (e.g. `error`, `describedBy`, `variant`, `size`) as raw DOM attributes.
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
  - @barefootjs/shared@0.7.0

## 0.6.1

### Patch Changes

- d4dc638: Fix silent missing hydration for a nested `.map()` of child components inside a **component-rooted** loop item (#1725). When a `.map()`'s item root was itself a child component (a passthrough wrapper like `SelectGroup`) whose JSX `children` contained a nested `.map()` of components (e.g. `SelectItem`), the parent init emitted `initChild()` only for the outer wrapper — never descending into its children to initialize the inner-loop component instances. They rendered from SSR but never hydrated (no error, just inert event handlers).

  The compiler now collects inner loops inside a child-component loop item and emits a document-order zip (`qsaChildScopes` + per-component cursor over the flattened `outer.forEach(o => inner.forEach(i => ...))` iteration). This addresses the inner components by their slot selector rather than element offsets, so it works whether the wrapper component's root is an element (`<div>{children}</div>`) or a fragment (`<>{children}</>`) — the latter emits no per-group wrapper element to index.

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

  - @barefootjs/shared@0.6.1

## 0.6.0

### Patch Changes

- 35e5f73: Lower the Array / String methods at their full JS arity, instead of only a single fixed argument count (#1448).

  Previously each `array-method` lowering (`join`, `includes`, `at`, `concat`, `slice`, `reverse`, `toReversed`, `toLowerCase`, `toUpperCase`, `trim`, …) accepted exactly one argument shape; any other arity slipped past the parser and fell through to a generic emit that built with no diagnostic and only crashed at SSR render time. Now:

  - **Zero-arg defaults are supported**: `arr.join()` uses the default `,` separator, `arr.slice()` returns a full copy, `arr.at()` is `arr.at(0)`, and `arr.concat()` is a shallow copy — matching JS, no more refusal/crash.
  - **JS-ignored trailing arguments are accepted**: `str.trim(1)`, `arr.at(i, extra)`, `arr.slice(s, e, extra)`, `arr.reverse(extra)`, etc. lower the same as their base form (JS ignores the extras too).
  - **Genuinely-meaningful extra arguments that aren't lowered yet still refuse with BF101** — the `fromIndex` of `.includes` / `.indexOf` / `.lastIndexOf` and the variadic `.concat(a, b, …)` — because silently dropping them would make the SSR output _differ_ from the client (worse than a build error). The diagnostic names the specific unsupported form and does **not** push `/* @client */` (the wrong remedy for an arity issue, and it can't be applied in attribute/condition position anyway).

- b24a1e6: Fix dropped component props in CSR render. A parent passing a non-statically-inlinable value (e.g. `Array.from(...)` or an init-scope local) as a prop to a child component emitted `renderChild('Child', {})` — silently dropping the prop — so the child's template read it eagerly and threw (`Cannot read properties of undefined`). Such children now defer to a placeholder + `upsertChild` (`createComponent` with the complete getter props), mirroring the existing clientOnly-conditional / loop-placeholder paths. SSR adapters are unaffected.
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

- b7ffce1: Implement `dangerouslySetInnerHTML={{ __html }}` on the client. Previously the client codegen treated it as a generic reactive attribute, emitting a bogus `dangerouslySetInnerHTML="[object Object]"` and never setting `innerHTML`, so a `"use client"` component rendered nothing on the client (a silent SSR/CSR mismatch). The client now mirrors the SSR adapters: the `{ __html }` object is suppressed as an attribute, its value is emitted as the element's raw (unescaped) content in the template, and a reactive value also drives an `innerHTML` assignment in init. This is the intentional raw-HTML escape hatch — values are NOT escaped, by design.
- 2c1f3ad: Client-render templates now HTML-escape interpolated attribute values (via a new `escapeAttr` runtime helper) to match the SSR adapters' attribute escaping (`& " ' < >`). Previously a dynamic attribute value containing `"`, `<`, `>`, or `&` — e.g. UnoCSS arbitrary variants like `[class*="size-"]` or `has-[>svg]` — was concatenated raw into the client template string, which corrupts attribute parsing when the template is inserted via `innerHTML` and diverges from the server-rendered bytes. Escaping at interpolation time is the only correct layer (a post-assembly pass can't tell a delimiter `"` from a value `"`).
- 5231cc8: Client-render templates now HTML-escape interpolated **text content** (the `<!--bf:sN-->${expr}<!--/-->` slots) via a new `escapeText` runtime helper — the parallel of the #1692 attribute-value fix. A string child containing `<` / `&` (e.g. `{user.name}`) was previously concatenated raw into the template string, which diverges from the SSR-escaped bytes and is a markup-injection vector when the template is inserted via `innerHTML`. Only the text-marker slots are escaped; bare `${children}` passthrough and `renderChild(...)` output are pre-rendered HTML and are left untouched. Hono escapes text with the same set as attribute values (`& " ' < >`), so `escapeText` delegates to the same operation for byte-parity with the conformance layer.
- 0f0d880: Fix a loop wrapped in a transparent fragment losing its parent container's preceding siblings when computing the `children[idx]` hydration offset (#1699, follow-up to #1688/#1693). A fragment (`<>…</>`) renders no DOM element wrapper, so a `.map()` inside it is a direct sibling of the fragment's siblings in the nearest ancestor element — but `computeLoopSiblingOffsets` treated the fragment as its own container boundary and reset the preceding-sibling run, so elements before the fragment were dropped from the offset and the mapped items resolved against the wrong `children[idx]` (their nested child components stayed inert after hydration). The offset pre-pass now flattens transparent containers (fragment / provider / async) into the enclosing run, so `<Box><hr/><hr/><>{xs.map(...)}</></Box>` correctly offsets the items past both `<hr/>`s while fragment-internal siblings keep counting too.
- 72fdbe2: `bf build` no longer mangles string-literal contents when inlining a local module into a client component's chunk. The combine and specifier-normalisation passes are now AST-aware, so `import …` lines and `@barefootjs/client` text that merely appear _inside a string value_ (e.g. an inlined data module exporting a code snippet) are left untouched. This fixes a hydration break (`ReferenceError: hydrate is not defined`, where the component's real runtime import was relocated into the literal) and a string-corruption bug (`@barefootjs/client` rewritten to `./barefoot.js` inside snippet text).
- d32c45d: Fix mapped items in the second and later `static + .map()` groups staying inert after hydration inside a self-portaling container (#1693, follow-up to #1688). The `children[idx]` offset for a loop's nested child components only counted statically-sized preceding siblings, so siblings whose rendered element count is only known at runtime shifted the items and left them resolving against the wrong element (unhydrated):

  - a preceding `.map()` contributes `array.length` children — the original report's two-group shadcn `Select`;
  - a preceding `{cond && <el/>}` / `{cond ? <el/> : null}` conditional contributes 0 elements when its branch is absent (it renders only comment anchors), but was over-counted as a static `1`.

  The offset is now computed from the actual element count of each preceding sibling — a folded integer for statically-sized nodes, plus a runtime term (`(arr).length`, `(cond ? 1 : 0)`) for dynamic ones. Non-element siblings (bare text / expressions) correctly contribute 0 since `container.children` is element-only.

- Updated dependencies [d87144d]
  - @barefootjs/shared@0.5.3

## 0.5.2

### Patch Changes

- ad11fb8: Fix a nested child component being dropped during hydration when a static sibling element precedes a `.map()` inside a component (or fragment / provider / async) container (#1688). `computeLoopSiblingOffsets` only counted preceding DOM siblings under element parents, so a loop nested directly inside such a container got a silently-zero `siblingOffset`. The generated `container.children[__idx]` lookup for each item's nested child was then off by one, resolving the first item's child against the static sibling and dropping it. Sibling counting now runs for every container whose children render as a contiguous run of DOM siblings.
- 562d343: Bake typed and scalar signal array-literal initial values into the generated `NewXxxProps` SSR data context, so Go server-renders the initial loop items instead of an empty list (#1672). Untyped object arrays and non-literal initialisers continue to default to `nil`.

  `TypeDefinition` now carries structured `properties` (`PropertyInfo[]`) for object/interface types, so adapters can consume a type's field set without re-parsing its source text. The go-template adapter uses this to derive struct fields and bake object literals against the real field set.

- dff7704: Raise BF101 at build time for unsupported `String.prototype` methods on the template-language adapters (#1448 follow-up).

  Methods that have no SSR lowering — `split`, `startsWith`, `endsWith`, `replace`, `replaceAll`, `repeat`, `padStart`, `padEnd`, `charAt`, `charCodeAt`, `codePointAt`, `normalize`, `substring`, `substr`, `match`, `matchAll`, `search` — were previously absent from the `UNSUPPORTED_METHODS` gate, so `isSupported` reported them supported and the Go / Mojolicious adapters emitted an invalid raw method call (`{{.Name.StartsWith "a"}}` / `$name->{startsWith}('a')`) that produced no build diagnostic and only crashed at template-render time.

  They now surface BF101 with an actionable `/* @client */` suggestion (parity with the unsupported array methods), and the adapter degrades to a safe empty slot instead of emitting template that fails at render. The Mojo adapter routes these through the AST path so the shared `isSupported` gate fires rather than the regex pipeline mangling them. The `/* @client */` escape hatch continues to work for any of these expressions.

  - @barefootjs/shared@0.5.2

## 0.5.1

### Patch Changes

- 8742059: Fix two follow-up issues from the #1663 dynamic-dispatch work.

  `__bfText` could render both a stale element and fresh text in a conditional slot: that path re-resolves the anchor via `$t()` each run, which inserts a new text node before an element left by a previous Node-valued run. Writing a primitive now clears any remaining siblings up to the end marker, so switching JSX → text leaves only the text.

  The no-arg props default (`= {}`) is now asserted to the param's annotated type (`= {} as T`) in both the test and Hono adapters. `hasRequiredProps` treats a prop with a destructuring default as non-required, but the declared props type may still mark that field required, so a bare `= {}` failed `tsc` ("Property 'x' is missing in type '{}'..."). The destructuring defaults still supply the values at runtime.

- 9dcffdf: Compile JSX used as an object-literal arrow value and render dynamic dispatch (#1663).

  A `Record<K, () => JSX>` lookup map (`{ piconic: () => <BrandLogo/> }`) was never lowered: a module-level map had its const dropped from the emitted module (`ReferenceError` at SSR), and a function-local map leaked raw `<...>` into the client bundle (`SyntaxError: Unexpected token '<'`). The preprocessor now hoists arrow values in object-literal property assignments into synthesized components, the same lowering already applied to arrows in JSX-attribute position, so the lookup map survives as component references.

  Dynamic dispatch of such a map in child position (`<div>{themeLogo(props.id)}</div>`) now renders on the client: the dynamic-text effect routes through a new `__bfText` runtime helper that splices the live component element into the slot by identity instead of stringifying it to `"[object HTMLElement]"`. Adapters and `createComponent` default missing props to `{}` so a bare no-arg shim call (`LOGOS[id]()`) no longer crashes destructuring `undefined`.

- 5d49015: Per-item attribute reading an outer signal by index now becomes reactive inside `.map()` (#1673).

  A per-item attribute/style expression inside a keyed `.map()` only got a `createEffect` when it read the loop item accessor (`it.w`) or a directly-named signal/memo/prop. If it instead read the source array signal through a helper indexed by position — e.g. `style={`width:${widthAt(i)}%`}` where `const widthAt = (i) => items()[i].w` — the compiler emitted no reactive effect and the value froze at its server-rendered value after hydration. The identical binding on a top-level element updated correctly.

  `collectLoopChildReactiveAttrs` now applies the same Solid-style wrap-by-default AST-flag fallback (`callsReactiveGetters` / `hasFunctionCalls`) that the top-level attribute path (`decideWrapForAttr`, #940) already used. An opaque function call inside a per-item attribute is wrapped in a per-item `createEffect`, so it tracks whatever signals it reads at runtime and reflects current state after hydration — matching the equivalent top-level binding. The emitted effect resolves the loop index reference to the renderItem index variable, so the closure stays valid.

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

- cbed3cc: Fix duplicate `__compEl` declaration when a nested `.map()` returns multiple child components (#1664).

  An outer `.map()` whose callback returns a wrapping element containing a nested `.map()` that emits more than one child component compiled all of them into a single shared inner `forEach` body. The emitter declared `const __compEl` once per component in that scope, producing a duplicate `const` declaration that threw `SyntaxError: Identifier '__compEl' has already been declared` at hydration. Each binding is now uniquely suffixed (`__compEl0`, `__compEl1`, …) when multiple components share the inner-loop scope; the single-component case keeps the plain `__compEl` name.

- 909b17a: Make `tokenContainsIdent` regex-literal aware (#1370).

  `scanForIdentifiers` (behind `tokenContainsIdent`) was the last hand-rolled
  char-by-char string-state machine outside the shared `ts.createScanner`
  lexer. It tracked quotes, template literals, and comments by hand but was
  blind to regex literals, so a lone quote inside a regex (`/it's/`) flipped it
  into string state and swallowed real identifier references, and an identifier
  inside a regex body (`/className/`) was wrongly counted as a reference.

  It now delegates to the shared `iterateJsTokens` lexer, which recognises
  regex literals, nested template literals, and comments in one place. Prop
  dependency detection on synthesised expression strings is now correct for
  expressions containing regex literals. No change to adapter output for
  existing fixtures.

- d13dc5c: Widen `.sort()` / `.toSorted()` comparator lowering with multi-key, relational-ternary, and block-body shapes (#1448 Tier B follow-up).

  The comparator parser now builds a structured `SortComparator` as a `keys: SortKey[]` list and accepts three previously-refused shapes (each lowering to both template-language adapters + the Hono/CSR JS path):

  - **Multi-key (`||`-chain)** — `(a, b) => a.x - b.x || a.y.localeCompare(b.y)` splits into one comparison key per `||` operand, applied in priority order as tie-breaks. Emits one 4-string `bf_sort` group (Go) / one `keys` hash (Mojo) per key.
  - **Relational ternary** — `(a, b) => a.f > b.f ? 1 : -1`, the 3-way `a.f < b.f ? -1 : a.f > b.f ? 1 : 0`, and the leading-tie `a.f === b.f ? 0 : …` forms lower to a new `auto` compare type: numeric when both keys parse as numbers, else lexical. Both template runtimes share this rule so their output stays byte-equal (diverges from JS `<`/`>` only for numeric strings).
  - **Single-`return` block bodies** — `(a, b) => { return a.f - b.f }` (arrow form; the function-expression form already worked) unwrap to the returned comparator.

  Runtime: Go `bf_sort` is now variadic over 4-string key groups with an `auto` branch; Mojo `bf->sort` takes an ordered `keys` list with the same `auto` rule. Function-reference comparators (`sort(myCmp)`), multi-statement block bodies, and `localeCompare(b, locale, opts)` stay refused (BF021) — deferred follow-ups.

- 6326d07: Unify the importmap manifest type across the component and snippet paths.

  Both importmap injection paths now describe `barefoot-externals.json` with one
  type. `@barefootjs/jsx` exports a shared `ImportMapManifest` (the optional-field
  subset the renderer needs); `renderImportMapHtml` takes it, and the strict build
  output `ExternalsManifest` remains its all-required superset.

  **Breaking (`@barefootjs/hono`):** the `BarefootExternalsManifest` type export is
  removed. Type a `BfImportMap` `externals` prop with `ImportMapManifest` from
  `@barefootjs/jsx` instead (the runtime prop shape is unchanged, so importing the
  parsed `barefoot-externals.json` and passing it through still works).

  - @barefootjs/shared@0.5.0

## 0.4.0

### Patch Changes

- 2d817a0: Fix the client `hydrate` template lambda mishandling auto-deferred conditionals that read per-instance `createForm` state (`{field.error() && …}`). The module-scope template can't reproduce `createForm`, so it emitted `undefined.field(...)` (throws) or re-inlined a throwaway `createForm({...})`. It now emits empty `bf-cond-start`/`bf-cond-end` markers like SSR and lets `init`'s `insert()` populate the branch, fixing client-render (`createComponent`) of `@barefootjs/form` components.
  - @barefootjs/shared@0.4.0

## 0.3.0

### Minor Changes

- 0111b70: Add source locations/JSX previews to DOM bindings, `bf debug loops`, `bf debug why-update`, `bf debug summary` commands, and improved `bf debug fallbacks` output
- 210563a: Resolve event handler setters transitively through helper-function call chains. BREAKING: SetterRef.via and WhyUpdateSource.via are now string[] (the call chain) instead of string.

### Patch Changes

- 52a511d: Resolve event handler setters through arrow-function consts (not just function declarations) in setter analysis
- ea37bfc: Auto-defer reactive brand-package bindings (e.g. `@barefootjs/form` field accessors) referenced from template positions instead of raising BF061. `value={field.value()}`, `disabled={form.isSubmitting()}`, and `{field.error() && …}` now compile without a manual `/* @client */` on each binding.
- d64f94b: Add EventHandler wiring to TestNode: onClick, onInput, onChange, onSubmit shorthands and on() fallback
  - @barefootjs/shared@0.3.0

## 0.2.0

### Minor Changes

- 4e4d31a: Add `bf debug events` command for tracing event handler -> setter -> signal -> DOM update paths
- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- bac95e6: Extract classifyDOMProp as single source of truth for DOM attribute vs JSX prop classification
- bff7df6: Fix reactive expressions inside conditional branches not updating when dependencies change
- 31ce089: Fix prop name substitution corrupting string literals in client JS (e.g. `"size-9"` → `"(_p.size ?? 'default')-9"`)
- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
  - @barefootjs/shared@0.2.0
  - @barefootjs/client@0.2.0

## 0.1.3

### Patch Changes

- 91523ba: Add .findLast(p) / .findLastIndex(p) higher-order method lowering (#1448 Tier B). Go template adapter lowers via bf_find_last / bf_find_last_index runtime helpers (equality predicates) and range-based template blocks (complex predicates). Mojo adapter refuses with BF101 (matching existing find/findIndex gap).
- a5a466c: Compile props.X.map() to mapArray for reactive DOM reconciliation instead of static forEach (#1586). Direct prop array references in .map() expressions are now treated as potentially reactive, consistent with the compiler's existing "props are always reactive" design.
- a57e113: Unify inner-loop reactive-attribute emit through the centralised emitAttrUpdate helper (#1368). Fixes boolean-attr handling in nested loops (now uses DOM property assignment) and adds missing className/value special-case handling.
  - @barefootjs/client@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/client@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/client@0.1.1
  - @barefootjs/shared@0.1.1
