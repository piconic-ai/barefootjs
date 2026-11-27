/**
 * Per-fixture build-time contracts for shapes this adapter intentionally
 * refuses to lower. Declared per adapter, not on the shared fixtures, so
 * adding a new adapter never touches a cross-adapter file. Per-fixture
 * rationale lives on each fixture's docstring
 * (`packages/adapter-tests/fixtures/<id>.ts`) and spec/callback-fidelity.md;
 * comments below only mark where this adapter's set diverges from siblings.
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  'format-date': [{ code: 'BF056', severity: 'error', limitation: 'authored-format-date-call' }],
  // #2843: graduated — a registered lowering call inside a ternary
  // attribute branch (or any nested value position) is now recognised via
  // `MojoTopLevelEmitter`'s `lowering` seam + the registry-aware support
  // gate, matching the direct-call attribute path exactly.
  'filter-typeof-predicate': [{ code: 'BF021', severity: 'error', limitation: 'off-subset-callback-body' }],
  'map-array-builder-body': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'map-array-builder-escaping': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'fill-unsupported': [{ code: 'BF101', severity: 'error', limitation: 'array-fill' }],
  // `===` / `!==` over an object or array: JS compares by reference, which
  // no template runtime can tell from equal contents (#3824 step 8).
  'strict-equality-distinct-reference': [{ code: 'BF101', severity: 'error', limitation: 'object-equality-by-contents' }],
  'strict-equality-same-reference': [{ code: 'BF101', severity: 'error', limitation: 'array-self-equality' }],
  'strict-equality-preamble-reference': [{ code: 'BF101', severity: 'error', limitation: 'array-self-equality' }],
  'strict-equality-destructure-default-distinct': [{ code: 'BF101', severity: 'error', limitation: 'object-equality-by-contents' }],
  'strict-equality-optional-array-element': [{ code: 'BF101', severity: 'error', limitation: 'array-self-equality' }],
  'strict-equality-nullable-array-element': [{ code: 'BF101', severity: 'error', limitation: 'array-self-equality' }],
  // The `omitted-optional-nullable-*` and `undef-null-number-coercion` /
  // `undef-null-relational` BF101 pins used to sit here: the engine could not
  // tell an omitted prop (`NaN` in arithmetic) from a `null` one (`0`). The
  // runtime now carries `undefined` (#3848 U5), and its helpers read each.
  'callback-index-param': [{ code: 'BF101', severity: 'error', limitation: 'callback-index-param' }],
  'filter-index-param-loop': [{ code: 'BF021', severity: 'error', limitation: 'callback-index-param' }],
  'sort-opaque-comparator': [{ code: 'BF101', severity: 'error', limitation: 'callback-outside-evaluator' }],
  'map-opaque-projection': [{ code: 'BF101', severity: 'error', limitation: 'callback-outside-evaluator' }],
  'reduce-nonliteral-seed': [{ code: 'BF101', severity: 'error', limitation: 'callback-outside-evaluator' }],
  'filter-opaque-predicate': [{ code: 'BF101', severity: 'error', limitation: 'callback-outside-evaluator' }],
  'filter-native-nested-index': [{ code: 'BF101', severity: 'error', limitation: 'callback-outside-evaluator' }],
  'find-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'some-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'every-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'reduce-typeof-body': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'reduce-right-typeof-body': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'flatmap-typeof-projection': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  // A pure PROJECTION flatMap body (`flatmap-expression-body`) is NOT pinned —
  // it lowers to neutral nested-loop IR this adapter templatizes natively;
  // only the statement-carrying body refuses.
  'tag-cloud': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'preamble-cells': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  // Refused for the COMPUTED loop array (`const entries = Object.entries(...)
  // .filter(...)`), not the destructure param (that lowers, #2087) — loud
  // BF101 instead of silently iterating an unbound name zero times.
  // A const holding an array with a spread element (`[...b, 'z']`) is read where
  // a template has no binding for it: refused, not an unbound name.
  'destructure-default-spread-const-length': [{ code: 'BF101', severity: 'error', limitation: 'array-literal-element-spread' }],
  // The same array read through a memo, a signal seed or a child prop, which
  // no emitter spells: refused at the declaration the server render reads.
  'destructure-default-spread-const-memo': [{ code: 'BF101', severity: 'error', limitation: 'array-literal-element-spread' }],
  'destructure-default-spread-memo-body': [{ code: 'BF101', severity: 'error', limitation: 'array-literal-element-spread' }],
  'destructure-default-spread-const-signal-seed': [{ code: 'BF101', severity: 'error', limitation: 'array-literal-element-spread' }],
  'destructure-default-spread-method-memo': [{ code: 'BF101', severity: 'error', limitation: 'array-literal-element-spread' }],
  'destructure-default-spread-method-text': [{ code: 'BF101', severity: 'error', limitation: 'array-literal-element-spread' }],
  'destructure-default-spread-inline-child-prop': [
    { code: 'BF101', severity: 'error', limitation: 'array-literal-element-spread', unescapable: true },
  ],
  // A component renders on the server whatever directive its prop carries: no escape.
  'destructure-default-spread-const-child-prop': [
    { code: 'BF101', severity: 'error', limitation: 'array-literal-element-spread', unescapable: true },
  ],
  'static-array-from-props': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // No BF103 pin: the harness registers sibling templates (#2205).
  'static-array-from-props-with-component': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // Module-scope companion of `static-array-from-props` above: the const
  // is computed via a function call, not a static literal — genuinely
  // unresolvable at SSR render time, same #2321 design gap applied
  // uniformly regardless of which scope the const lives in (#2946 fixed
  // the STATIC-literal module-scope case; this is the still-open
  // computed-const case). Escape twin: `module-const-loop-source-computed-client`.
  'module-const-loop-source-computed': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // The same computed-const source, parenthesized (`(keys).map(…)`): the
  // gate reads the parsed tree, so the parentheses do not hide it (#3473).
  'computed-const-loop-source-parenthesized': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // A loop filter predicate with no template form refuses rather than
  // rendering every row (#3534).
  'filter-predicate-shape-loop': [
    { code: 'BF101', severity: 'error', limitation: 'unlowerable-loop-filter-predicate' },
  ],
  // A method call no template lowers, outside a callback, refuses rather
  // than rendering a read of the method name (#3493).
  // A const initializer pushing onto a destructured binding (`const n =
  // a.push('x') && b.length`): the call has no template lowering. Escaped by
  // the `/* @client */` twins (`destructure-default-shared-array*-client`).
  'destructure-default-shared-array': [{ code: 'BF101', severity: 'error', limitation: 'unlowered-method-call' }],
  'destructure-default-shared-array-renamed': [{ code: 'BF101', severity: 'error', limitation: 'unlowered-method-call' }],
  'unlowered-method-call': [
    { code: 'BF101', severity: 'error', limitation: 'unlowered-method-call' },
  ],
  // A zero-arg call on a JavaScript global (`Date.UTC()`) refuses rather
  // than rendering a member read of it (#3505).
  'unlowered-global-call': [
    { code: 'BF101', severity: 'error', limitation: 'unlowered-method-call' },
  ],
  // The same refusal reached through a computed const read outside a loop:
  // the const reads as its initializer (#3494).
  'computed-const-read-unlowerable': [
    { code: 'BF101', severity: 'error', limitation: 'unlowered-method-call' },
  ],
  // Only `.find` is pinned — `find*` returns an element, not a boolean, so
  // there's no inline predicate form; the nested-`.some` sibling lowers to a
  // real inline Perl `grep` and must render to Hono parity instead.
  'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error', limitation: 'nested-callback-in-filter-predicate' }],
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', limitation: 'ambient-locale-date-formatting' }],
  'date-loop-row-member': [{ code: 'BF021', severity: 'error', limitation: 'date-loop-row-receiver' }],
  'rich-prop-client-read': [{ code: 'BF049', severity: 'error', limitation: 'rich-typed-prop-hydration' }],
  // A ternary or array literal LITERALLY WRAPPING JSX at a non-children prop
  // position (e.g. `header={cond ? <a/> : <b/>}`) is refused ahead of
  // `adapter.generate()` in the shared jsx-to-ir.ts phase, so it is pinned
  // identically on every adapter (including Hono) — same reasoning as
  // `rich-prop-client-read` above. This is the permanent, intended behavior
  // (formerly tracked as #2667, closed): the issue's own acceptance criteria
  // treated a loud refusal as fully resolving the silent-divergence bug, so
  // no open issue tracks further work here.
  'jsx-element-prop-ternary': [{ code: 'BF021', severity: 'error', limitation: 'jsx-wrapped-in-non-children-prop' }],
  'jsx-element-prop-array': [{ code: 'BF021', severity: 'error', limitation: 'jsx-wrapped-in-non-children-prop' }],
  // A reactive primitive invoked through a namespace import
  // (`import * as bf from '@barefootjs/client'`, `bf.createSignal(...)`)
  // that the analyzer's checker-less fast path cannot recognize refuses
  // loudly (BF013) instead of silently dropping the declaration — fired
  // in the shared analyzer pass ahead of any adapter's `adapter.generate()`,
  // so all nine adapters (including Hono) pin this identically. A compile
  // that supplies a shared `ts.Program` (e.g. via `@barefootjs/vite`)
  // resolves the primitive normally and never reaches this refusal (formerly
  // tracked as #2771, closed) — no open issue tracks further work.
  'namespace-import-primitive': [{ code: 'BF013', severity: 'error', limitation: 'namespace-import-primitive-without-program' }],
  // #2911: `staticValueToPerl` (`adapter/lib/static-value.ts`) deliberately
  // returns `null` for a `boolean` anywhere inside a static loop array's
  // item shape — Perl has no native boolean literal, and baking `1`/`''`
  // would diverge from JS's `String(true) === "true"` the moment that value
  // is ever interpolated as text. This fixture's item shape has an `active:
  // boolean` field (feeding a conditional, never interpolated as text
  // itself), so the whole array fails to serialize and falls through to the
  // generic "local computed value" BF101 refusal. Unrelated to #2898 (a
  // Go-template-only fix) — this fixture happened to be the first to
  // combine a boolean item field with a conditional in this adapter's own
  // corpus.
  'static-loop-item-conditional': [{
    code: 'BF101',
    severity: 'error',
    limitation: 'boolean-in-static-loop-item',
  }],
  // #2911: same trigger as `static-loop-item-conditional` above — this
  // fixture's item shape has a `disabled: boolean` field (feeding a boolean
  // HTML attribute rather than a conditional), found alongside it while
  // reviewing #2898.
  'static-loop-item-boolean-attr': [{
    code: 'BF101',
    severity: 'error',
    limitation: 'boolean-in-static-loop-item',
  }],
  // #2994 graduated the render-divergence pin: a call to a module-scope
  // helper (arrow-valued const OR `function` declaration) by bare name
  // has no Perl binding in Mojolicious template scope — `call()`'s
  // generic fallback now refuses it loudly (BF101) instead of falling
  // through to a bare `$fmt` lookup that crashes Perl `strict` mode at
  // render time. No verified escape twin exists yet (the shape has no
  // structural lowering — see #2994's "Suggested fix shape" for the
  // deferred, harder direction); `/* @client */` works informally but
  // isn't pinned as a corpus fixture yet.
  'module-const-arrow-helper': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  'module-function-helper-chain': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  // #3012: same #2994 refusal as the two entries above, exercised from a
  // boolean-TEST position (a ternary's `test`) instead of a plain text
  // position. Unlike the six adapters #3012 is actually about, this
  // adapter's `isValidElement` handling (`emitters.ts`) was ALREADY
  // identity-scoped (registered by name via the shared `isValidElement`
  // runtime primitive, #2266) rather than exempted by structural
  // position, so it never had the `_boolContext` gap — every other
  // bare-name call already refused loudly here regardless of position.
  // This pin just extends the existing #2994 contract to the new fixture.
  'module-helper-boolcontext-call': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  // #3894: a keyed loop row whose conditional branch calls a module-scope
  // helper in text position, the refusal of `module-const-arrow-helper`
  // above. The fixture pins the client re-render of that branch on the
  // reference adapter and declares `escapeNotOwed`.
  'keyed-row-branch-call': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' },
  ],
  // #3912: a static array row whose conditional calls a component-scope
  // helper (arrow, block arrow and `function` declaration) with the row's
  // id. The fixture pins the client's branch switch over rows hydration
  // adopted from the reference adapter's HTML and declares `escapeNotOwed`.
  'static-loop-conditional-function-helper': [
    { code: 'BF101', severity: 'error', limitation: 'component-scope-helper-call' },
  ],
  // #3063: a client-interactive component with a multi-return chain
  // where one branch is a bare JSX fragment refuses ahead of
  // `adapter.generate()` in the shared jsx-to-ir.ts phase (the client
  // hydration claim can't tell branches apart — see the registry entry),
  // so it is pinned identically on every adapter including Hono.
  'conditional-return-fragment-branch': [
    { code: 'BF029', severity: 'error', limitation: 'fragment-wrapped-conditional-return-branch-scope' },
  ],
  // A `ref` callback writing an attribute on mount that the element's JSX
  // never renders refuses (BF063) in the shared jsx-to-ir.ts phase, ahead
  // of `adapter.generate()` — a ref never runs at SSR, so the attribute
  // could never reach the server HTML on any backend — so it is pinned
  // identically on every adapter including Hono.
  'ref-mount-attr': [
    { code: 'BF063', severity: 'error', limitation: 'ref-effect-attr-state-ssr' },
  ],
  // #3144: a component-body local bound to an opaque call
  // (`const label = makeLabel(); {label()}`), invoked in text position,
  // refuses ahead of the generic signal-getter fallback in this
  // adapter's own `call()` (`adapter/expr/emitters.ts` /
  // `go-template-adapter.ts`) -- not a shared jsx-to-ir.ts refusal, since
  // Hono's real JS runtime evaluates this shape correctly and must keep
  // doing so.
  'opaque-local-accessor-call': [{ code: 'BF101', severity: 'error', limitation: 'opaque-local-accessor-call' }],
  // A zero-argument call of a local function the template cannot inline.
  'markup-uninlinable-local-function-named-like-prop': [{ code: 'BF101', severity: 'error', limitation: 'uninlinable-local-function-call' }],
  'memo-uninlinable-local-function-named-like-prop': [{ code: 'BF101', severity: 'error', limitation: 'uninlinable-local-function-call' }],
  'signal-seed-uninlinable-local-function-named-like-prop': [{ code: 'BF101', severity: 'error', limitation: 'uninlinable-local-function-call' }],
  'signal-seed-uninlinable-local-function-hides-module-function': [{ code: 'BF101', severity: 'error', limitation: 'uninlinable-local-function-call' }],
  'signal-seed-const-from-uninlinable-local-function': [{ code: 'BF101', severity: 'error', limitation: 'uninlinable-local-function-call' }],
  'signal-seed-wrapped-uninlinable-local-function': [{ code: 'BF101', severity: 'error', limitation: 'uninlinable-local-function-call' }],
  // A destructure default reading a signal through a component const: no
  // template has the signal's value when it applies the default (#3725).
  'destructure-default-reads-signal': [{ code: 'BF101', severity: 'error', limitation: 'destructure-default-reads-component-state' }],
  // A const record indexed by a prop whose keys are not known at compile
  // time reads inherited keys in JS (`labels['toString']`); no template
  // lookup does, so the read refuses rather than rendering `undefined`.
  'record-const-index-inherited-key': [{ code: 'BF101', severity: 'error', limitation: 'record-const-index-unknown-keys' }],
  'module-const-inherited-key': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-object-spread-unresolved-call': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-member': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-let': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-array': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-local': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-computed-props': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-computed-local': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-computed-optional': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-computed-loop': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-object-spread-unresolved-computed-signal': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-helper-call-inlined': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-const-helper-call-spread-inlined': [{ code: 'BF101', severity: 'error', limitation: 'const-object-spread-unresolved' }],
  'module-const-helper-call-child': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-const-helper-call-runtime-alias': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  // #3975: the module helper behind an inlined const reads another module const.
  'module-helper-reads-module-const': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-helper-reads-module-const-chain': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-helper-reads-module-const-values': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-helper-reads-module-const-branch-loop': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-helper-reads-module-const-init': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-helper-reads-module-const-shadowed': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-helper-reads-module-const-prop-hidden': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-helper-param-reads-module-const': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-function-reads-module-const': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  'module-helper-const-identity': [{ code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call' }],
  // #4022: a const initialized by a function literal call no template
  // evaluates (a block body, an argument, a body that constructs a value or
  // writes, a returned function, a call below the top of the initializer).
  'module-const-iife-block-body': [{ code: 'BF101', severity: 'error', limitation: 'const-iife-unlowered' }],
  'module-const-iife-with-argument': [{ code: 'BF101', severity: 'error', limitation: 'const-iife-unlowered' }],
  'module-const-iife-sampling-body': [{ code: 'BF101', severity: 'error', limitation: 'const-iife-unlowered' }],
  'component-const-iife-block-body': [{ code: 'BF101', severity: 'error', limitation: 'const-iife-unlowered' }],
  'component-const-iife-returns-function': [{ code: 'BF101', severity: 'error', limitation: 'const-iife-unlowered' }],
  'module-const-iife-write-body': [{ code: 'BF101', severity: 'error', limitation: 'const-iife-unlowered' }],
  'module-const-iife-nested-call': [{ code: 'BF101', severity: 'error', limitation: 'const-iife-unlowered' }],
  'component-const-iife-reads-written-prop': [{ code: 'BF101', severity: 'error', limitation: 'const-iife-unlowered' }],
  'module-const-literal-identity': [{ code: 'BF101', severity: 'error', limitation: 'array-self-equality' }],
  'module-const-inherited-key-memo': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-memo-chain': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-memo-mixed': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-function': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-function-direct': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-function-nested': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-object-method': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-iife': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-signal-seed': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-memo-const': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-memo-block': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-memo-method': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key' }],
  'module-const-inherited-key-child-prop': [{ code: 'BF101', severity: 'error', limitation: 'const-literal-inherited-key', unescapable: true }],
  // A component-body destructure with no const form, and a read of a taken
  // key through a props-object body rest, are refused in the shared
  // analyzer, ahead of any adapter (#3854).
  'body-destructure-rest-non-props-source': [{ code: 'BF101', severity: 'error', limitation: 'body-destructure-without-const-form' }],
  'body-destructure-non-literal-default': [{ code: 'BF101', severity: 'error', limitation: 'body-destructure-without-const-form' }],
  'body-destructure-non-identifier-source': [{ code: 'BF101', severity: 'error', limitation: 'body-destructure-without-const-form' }],
  'body-rest-taken-key-read': [{ code: 'BF101', severity: 'error', limitation: 'body-rest-taken-key-read' }],
  'body-rest-props-name-shadowed': [{ code: 'BF101', severity: 'error', limitation: 'body-rest-props-name-shadowed' }],
  // A binding a body statement writes after its declaration, read by the
  // markup or by a declaration after the statement, is refused in the shared
  // compile, ahead of any adapter (#3719).
  'destructure-default-body-mutated-memo': [{ code: 'BF101', severity: 'error', limitation: 'body-statement-write-read-as-declared' }],
  'body-statement-write-direct-read': [{ code: 'BF101', severity: 'error', limitation: 'body-statement-write-read-as-declared' }],
  'body-statement-write-block-shadowed-callback': [{ code: 'BF101', severity: 'error', limitation: 'body-statement-write-read-as-declared' }],
  'body-statement-write-computed-method-name': [{ code: 'BF101', severity: 'error', limitation: 'body-statement-write-read-as-declared' }],
  'body-statement-write-sibling-getter-spread': [{ code: 'BF101', severity: 'error', limitation: 'body-statement-write-read-as-declared' }],
  'body-statement-write-through-holder': [{ code: 'BF101', severity: 'error', limitation: 'body-statement-write-read-as-declared' }],
  'body-statement-write-copied-closure-holder': [{ code: 'BF101', severity: 'error', limitation: 'body-statement-write-read-as-declared' }],
  'body-statement-write-aliased-closure-reassigned': [{ code: 'BF101', severity: 'error', limitation: 'body-statement-write-read-as-declared' }],
  // An array of object literals passed as a child prop (in place, or a
  // const the IR passes as the literal) has no spelling as the child's
  // prop value here; the server cannot render the child's rows.
  'module-const-object-array-child-prop': [{ code: 'BF101', severity: 'error', limitation: 'object-array-literal-child-prop', unescapable: true }],
}
