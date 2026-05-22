/**
 * MojoAdapter - Tests
 *
 * Conformance tests (shared across adapters) + Mojo-specific tests.
 */

import { describe, test, expect } from 'bun:test'
import { MojoAdapter } from '../adapter/mojo-adapter'
import {
  runAdapterConformanceTests,
  TemplatePrimitiveCaseId,
} from '@barefootjs/adapter-tests'
import { renderMojoComponent, PerlNotAvailableError } from '../test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

runAdapterConformanceTests({
  name: 'mojo',
  factory: () => new MojoAdapter(),
  render: renderMojoComponent,
  // Dynamic style objects (non-static values) require Perl template
  // interpolation support for JS object literals, not yet implemented.
  // Mojo currently emits invalid Perl silently for this shape — the
  // Go adapter records BF101 via `convertExpressionToGo()` for the
  // same fixture (now contracted via `expectedDiagnostics`), but the
  // Mojo adapter's expression gate doesn't yet lift the same
  // failure into a `CompilerError`, so the fixture stays on `skipJsx`
  // until that gate is extended (#1266 follow-up).
  // `logical-or-jsx`, `nullish-coalescing-jsx`, `branch-map` reference
  // a prop directly inside a conditional branch (`$label`, `$banner`,
  // `$active`). The Mojo adapter emits these as bare Perl variables
  // (`% if ($label) { ... }`) without a corresponding
  // `my $label = ...;` declaration, so Perl rejects the template with
  // "Global symbol requires explicit package name". Same class of
  // Perl-scoping divergence that motivates the existing skips —
  // out of scope for the #971 refactor.
  // Return-position variants of the same divergence —
  // `return-logical-or` / `return-nullish-coalescing` reference
  // `$label` / `$banner` directly; `return-map` iterates over `$items`
  // without a `my` declaration.
  //
  // `static-array-children` / `static-array-from-props` /
  // `static-array-from-props-with-component` are no longer here —
  // they're covered by `expectedDiagnostics` below, asserting that
  // the adapter emits `BF103` / `BF104` at build time instead of
  // silently emitting invalid Perl / unresolved cross-template
  // references (#1266).
  skipJsx: [
    'style-object-dynamic',
    'logical-or-jsx',
    'nullish-coalescing-jsx',
    'branch-map',
    'return-logical-or',
    'return-nullish-coalescing',
    'return-map',
    // #1297 fixed the harness-side IR emission gate. The remaining
    // gap is adapter-side: the Mojo adapter has no SSR context-
    // propagation mechanism, so `<Ctx.Provider value="dark">` doesn't
    // make `useContext(Ctx)` resolve to `"dark"` at template-eval
    // time — the template emits `<%= $theme %>` against a hash that
    // never receives a `theme` key. Provider SSR coverage on Mojo
    // waits on that adapter feature; see #1297 follow-up.
    'context-provider',
    // Shared-component corpus (#1466) — Mojo-specific
    // `data-*="false"` divergence. The HTML5-boolean-attr and
    // `aria-*="0"` rules in `normalizeHTML` unskip `form` and
    // `portal`, but Mojo's Perl string-context coercion of JS false
    // emits `data-active=""` where Hono / Go emit `data-active="false"`.
    // Normalising `data-*=""` blanket-wide would mis-coerce
    // legitimate `data-count={0}` values (see PR #1496 review), so
    // these stay skipped until the Mojo adapter learns to serialise
    // JS boolean false as the string "false" for `data-*` bindings.
    'conditional-return-button',
    'conditional-return-link',
    // Multi-component fixtures still diverge because Mojo's child
    // template emitter pins the child's `bf-s` to the literal
    // `test_<sN>` (`_scope_id("test_$sid")` in `test-render.ts`)
    // instead of `<ChildName>_<id>_<sN>` like Hono / CSR. Same family
    // of test-harness scope-id plumbing the `componentName` option
    // fixed on the Hono side. Separate follow-up.
    'toggle-shared',
    'reactive-props',
    'props-reactivity-comparison',
  ],
  // Per-fixture build-time contracts for shapes the Mojo adapter
  // intentionally refuses to lower. Owned by this adapter test file
  // (not by the shared fixtures) so adding a new adapter doesn't
  // require touching any cross-adapter file.
  expectedDiagnostics: {
    // Sibling-imported child component in a loop body: Mojo emits
    // a cross-template call that needs separate registration. BF103
    // makes the requirement loud. (The barefoot CLI passes
    // `siblingTemplatesRegistered: true` so CLI builds suppress it.)
    'static-array-children': [{ code: 'BF103', severity: 'error' }],
    // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
    // call it inside a keyed `.map`. Same BF103 surface as the
    // synthetic `static-array-children` above — pinned at adapter
    // level so the shared-component corpus stays adapter-neutral.
    'todo-app': [{ code: 'BF103', severity: 'error' }],
    'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
    // Array-destructure loop param (`([k, v]) => ...`) lowers to
    // invalid Perl (`% my $[k, v] = $entries->[$_i];`).
    'static-array-from-props': [{ code: 'BF104', severity: 'error' }],
    // Both BF103 (imported child) and BF104 (destructure) fire.
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF104', severity: 'error' },
    ],
    // #1310: rest destructure in .map() callback. Hono / CSR lower
    // these via the inline residual-object accessor (#1309); the Mojo
    // adapter's loop emitter raises the generic BF104 destructure
    // refusal regardless of whether the binding is rest or plain.
    // Pinning the contract here makes the limitation declarative.
    'rest-destructure-object-in-map': [{ code: 'BF104', severity: 'error' }],
    // #1244 catalog: rest spread back onto the root element. Same
    // refusal shape as the read-only variant above — `paramBindings`
    // is non-empty so BF104 fires regardless of how `rest` is used.
    'rest-destructure-object-spread-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-array-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-nested-in-map': [{ code: 'BF104', severity: 'error' }],
    // #1244 stress catalog #11 (#1322): JS object literal in an
    // attribute value (`style={{ background: bg(), color: fg() }}`) has
    // no idiomatic Mojo template form. `refuseUnsupportedAttrExpression`
    // surfaces BF101 with a wrap-in-`/* @client */` suggestion, matching
    // the Go adapter's behaviour.
    'style-3-signals': [{ code: 'BF101', severity: 'error' }],
    // #1244 stress catalog #12 (#1323): tagged-template-literal call
    // (`cn\`base \${tone()}\``) — same family as #1322 above and refused
    // via the same gate.
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // #1443: `[a, b].filter(Boolean).join(' ')` (the registry Slot's
    // shape) now lowers to `join(' ', @{[grep { $_ } @{[$a, $b]}]})`.
    // No BF101 expected — pinned positively via the
    // `branch-local-filter-join` template-output test below.
    //
    // #1448 Tier A — JS Array / String methods that the Mojo adapter
    // hasn't lowered yet. Each row drops once the corresponding
    // method PR lands. Hono / CSR pass these out of the box (they
    // evaluate JS at runtime) so the pin only applies here.
    //
    // `array-includes` / `string-includes` no longer pinned — both
    // shapes lower via the shared `array-method` IR + `bf->includes`
    // runtime dispatch (#1448 Tier A first PR).
    // `array-indexOf` / `array-lastIndexOf` no longer pinned —
    // value-equality `bf->index_of` / `bf->last_index_of` helpers
    // handle the shape (#1448 Tier A second PR).
    // `array-at` no longer pinned — `bf->at` (Mojo) / `bf_at` (Go)
    // handle the negative-index lookup (#1448 Tier A third PR).
    // `array-concat` no longer pinned — `bf->concat` (Mojo) /
    // `bf_concat` (Go) merge two arrays into a new array
    // (#1448 Tier A fourth PR).
    // `array-slice` no longer pinned — `bf->slice` (Mojo) /
    // `bf_slice` (Go) carve out a sub-range with JS-compat
    // negative-index / out-of-bounds clamping (#1448 Tier A
    // fifth PR).
    // `array-reverse` / `array-toReversed` no longer pinned —
    // both share the `bf->reverse` / `bf_reverse` helper since
    // SSR templates render a snapshot and the JS mutate-vs-new
    // distinction has no template-level meaning (#1448 Tier A
    // sixth PR).
    // `string-toLowerCase` / `string-toUpperCase` no longer pinned —
    // Perl's native `lc` / `uc` (Mojo) and pre-existing
    // `bf_lower` / `bf_upper` (Go) handle the JS method names
    // (#1448 Tier A seventh + eighth PRs).
    // `string-trim` no longer pinned — pre-existing `bf_trim`
    // (Go) and new `bf->trim` helper (Mojo) handle the strip
    // (#1448 Tier A ninth PR, closing out Tier A).
    // #1448 catalog — `.find` / `.findIndex` have no Mojo lowering
    // yet (no `array-method` IR variant, no emitter), so the
    // Mojo-specific gate in `convertExpressionToPerl` refuses them
    // up front. `.join` is NOT pinned here — it's lifted to the
    // `array-method` IR by the parser and `renderArrayMethod`'s
    // `case 'join'` emits `join(sep, @{arr})` correctly; the
    // text-expression form is routed through the same AST path.
    'array-find':          [{ code: 'BF101', severity: 'error' }],
    'array-findIndex':     [{ code: 'BF101', severity: 'error' }],
  },
  // `JSON_STRINGIFY_VIA_CONST` and `MATH_FLOOR_VIA_CONST` now pass
  // via `MojoAdapter.templatePrimitives` (#1189). The two remaining
  // cases stay skipped because the V1 registry is identifier-path-
  // only and explicit:
  //   - `USER_IMPORT_VIA_CONST` — a bespoke user import isn't in
  //     the registry and can't be rendered server-side without
  //     user-supplied helper mappings.
  //   - `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` — uses `customSerialize`
  //     too, same reason.
  // Adding new entries to `templatePrimitives` should narrow this
  // skip set; see `MOJO_TEMPLATE_PRIMITIVES` in `mojo-adapter.ts`
  // for the full V1 surface.
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
  // Mojo `renderLoop` does not yet emit the `bf->comment("loop:<id>")`
  // boundary markers when the loop is `@client` (Hono and Go both do).
  // The client runtime relies on these markers to locate the insertion
  // anchor when hydrating the array; without them, mapArray() resolves
  // anchor = null and appends after sibling markers (#872 parity).
  // Tracked as a follow-up; remove from this set when Mojo emits the
  // boundary pair for clientOnly loops too.
  skipMarkerConformance: new Set([
    'client-only',
    'client-only-loop-with-sibling-cond',
    // Same as Hono: `/* @client */` markers on TodoApp's keyed `.map`
    // intentionally elide a slot id from the SSR template that the IR
    // still declares (s6). See hono-adapter.test for the contract.
    'todo-app',
  ]),
  onRenderError: (err, id) => {
    if (err instanceof PerlNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})

// =============================================================================
// Helpers
// =============================================================================

function compileToIR(source: string, adapter?: MojoAdapter): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: adapter ?? new MojoAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string, adapter?: MojoAdapter) {
  const a = adapter ?? new MojoAdapter()
  const ir = compileToIR(source, a)
  return a.generate(ir)
}

// =============================================================================
// Mojo-Specific Tests
// =============================================================================

describe('MojoAdapter - Template Generation', () => {
  test('generates basic element with scope marker', () => {
    const result = compileAndGenerate(`
export function Hello() {
  return <div>Hello</div>
}
`)
    expect(result.template).toContain('<div')
    expect(result.template).toContain('Hello')
    expect(result.template).toContain('bf-s=')
  })

  test('generates .html.ep extension', () => {
    const adapter = new MojoAdapter()
    expect(adapter.extension).toBe('.html.ep')
  })

  test('generates conditional with Perl if/else', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Toggle() {
  const [active, setActive] = createSignal(false)
  return <div>{active() ? 'On' : 'Off'}</div>
}
`)
    expect(result.template).toContain('% if')
    expect(result.template).toContain('% }')
  })

  test('generates loop with Perl for', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function List() {
  const [items, setItems] = createSignal<string[]>([])
  return <ul>{items().map(item => <li>{item}</li>)}</ul>
}
`)
    expect(result.template).toContain('% for my')
    // Markers are scoped per-call-site (#1087): `bf->comment("loop:<id>")`.
    expect(result.template).toMatch(/bf->comment\("loop:[^"]+"\)/)
    expect(result.template).toMatch(/bf->comment\("\/loop:[^"]+"\)/)
  })

  test('generates script registration for client components', () => {
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <div>{count()}</div>
}
`)
    expect(result.template).toContain("bf->register_script")
    expect(result.template).toContain('barefoot.js')
    expect(result.template).toContain('Counter.client.js')
  })

  test('does not generate script registration for static components', () => {
    const result = compileAndGenerate(`
export function Static() {
  return <div>Static content</div>
}
`)
    expect(result.template).not.toContain("bf->register_script")
  })

  test('forwards JSX children via begin/end capture (#1202)', () => {
    const result = compileAndGenerate(`
'use client'
export function Page() {
  return <main><Card><span>hello</span><span>world</span></Card></main>
}
`)
    // Capture lives in its own action so the inner `%>` can't close
    // the outer render_child tag.
    expect(result.template).toMatch(/<% my \$bf_children_\w+ = begin %>/)
    expect(result.template).toContain('<span>hello</span><span>world</span>')
    expect(result.template).toContain('<% end %>')
    expect(result.template).toMatch(
      /bf->render_child\('card'.*children => \$bf_children_\w+\)/,
    )
  })

  test('omits children entry when component has no JSX children', () => {
    const result = compileAndGenerate(`
'use client'
export function Page() {
  return <main><Card label="x" /></main>
}
`)
    expect(result.template).not.toContain('begin %>')
    expect(result.template).not.toContain('children =>')
  })

  describe('emits BF101 for JS-only filter / array patterns the Mojo adapter cannot lower to EP', () => {
    // These patterns previously fell through Mojo's regex pipeline and
    // emitted broken Embedded Perl silently (e.g. `$items->{filter}->[...]`
    // for a destructured filter, `[grep {...}]->{length}` for nested
    // higher-order). The Go adapter rejects them via its
    // `convertExpressionToGo` / `renderFilterExpr` gates with BF101;
    // these tests pin Mojo to the same contract so users on
    // non-JS-runtime adapters see a compile error and can either
    // rewrite or add `/* @client */`.
    const wrap = (body: string) => `'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<any[]>([])
  return ${body}
}`

    // #1443 follow-up: destructured filter param and function-keyword
    // filter no longer fall in this BF101 group — they lower cleanly
    // via parser-side normalisation (see `lowers .filter(({done}) =>
    // done) ...` parser tests + the Mojo positive-output test below).
    // The nested-higher-order-in-filter-predicate shape also lowers
    // now (#1443 PR4) — moved to a positive-output test below.
    const cases: { name: string; body: string; needle: string }[] = [
      { name: 'reduce',            body: `<div>{items().reduce((s, x) => s + x, 0)}</div>`,                                                          needle: '.reduce(' },
      { name: 'forEach',           body: `<ul>{items().forEach(x => x)}</ul>`,                                                                       needle: '.forEach(' },
      { name: 'flatMap',           body: `<ul>{items().flatMap(x => x.tags).map(t => <li key={t}>{t}</li>)}</ul>`,                                  needle: '.flatMap(' },
    ]

    for (const { name, body, needle } of cases) {
      test(`${name} → BF101`, () => {
        const adapter = new MojoAdapter()
        const result = compileJSX(wrap(body), 'C.tsx', { adapter })
        const bf101 = result.errors?.filter(e => e.code === 'BF101') ?? []
        expect(bf101.length).toBeGreaterThan(0)
        expect(bf101.some(e => e.message.includes(needle))).toBe(true)
      })

      test(`${name} + /* @client */ suppresses BF101`, () => {
        const adapter = new MojoAdapter()
        const wrappedBody = body.replace(/\{(?!\/\* @client \*\/)/, '{/* @client */ ')
        const result = compileJSX(wrap(wrappedBody), 'C.tsx', { adapter })
        const bf101 = result.errors?.filter(e => e.code === 'BF101') ?? []
        expect(bf101).toEqual([])
      })
    }
  })

  test('lowers .filter(({done}) => done).map(...) — destructured filter param (#1443)', () => {
    // Pre-#1443 the destructured arrow rejected at the parser and the
    // surrounding `.map()` loop fell back to a BF101 path. With the
    // parser rewriting `({done}) => done` to `_t => _t.done`, the
    // adapter's existing `IRLoop.filterPredicate` path renders the
    // chain as a Perl `for` over `grep { $_->{done} } @{$items}`.
    const adapter = new MojoAdapter()
    const result = compileJSX(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<any[]>([])
  return <ul>{items().filter(({done}) => done).map(t => <li key={t.id}>{t.name}</li>)}</ul>
}`, 'C.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('grep { $_->{done} } @{$items}')
  })

  test('lowers nested .filter(...).length > 0 in outer filter predicate (#1443 PR4)', () => {
    // Pre-#1443 PR4: the predicate `x => x.tags.filter(t => t.active).length > 0`
    // emitted `[grep { ... } ...]->{length}` — a hash-key lookup on
    // an anonymous array ref, undef at runtime. The
    // `containsHigherOrder` gate refused this outright with BF101.
    // PR4 fixes the `member` emit for `.length` on higher-order
    // objects to produce `scalar(@{...})` and removes the gate, so
    // the canonical "tags have at least one active" shape lowers
    // to valid EP.
    const adapter = new MojoAdapter()
    const result = compileJSX(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<any[]>([])
  return <ul>{items().filter(x => x.tags.filter(t => t.active).length > 0).map(t => <li key={t.id}>{t.name}</li>)}</ul>
}`, 'C.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('scalar(@{[grep { $_->{active} } @{$t->{tags}}]})')
  })

  test('lowers .filter(function (x) { return x.done }).map(...) — function-keyword filter (#1443)', () => {
    // Function expressions with a single `return <expr>` body normalise
    // to the arrow-fn IR shape at parse time, so the higher-order
    // detector + adapter lowering paths fire alongside their arrow
    // counterparts.
    const adapter = new MojoAdapter()
    const result = compileJSX(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<any[]>([])
  return <ul>{items().filter(function (x) { return x.done }).map(t => <li key={t.id}>{t.name}</li>)}</ul>
}`, 'C.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('grep { $_->{done} } @{$items}')
  })

  test('lowers the registry Slot\'s [a, b].filter(Boolean).join(\' \') chain (#1443)', () => {
    // The registry `<Slot>` builds its merged className via
    // `[className, childClass].filter(Boolean).join(' ')`. Pre-#1443
    // each link in the chain (array literal, `Boolean` callable
    // filter, `.join`) hit a separate refusal gate and the chain
    // emitted BF101 — making the scaffold `<Button>` / `<Card>`
    // unusable on Mojo. The fix lowers all three to Embedded Perl
    // (`join(' ', @{[grep { $_ } @{[...]}]})`), unblocking the
    // registry surface. The #1421 recursion guard stays in place
    // as defence in depth for other unsupported shapes, but this
    // specific chain no longer reaches the loop because the parser
    // succeeds.
    const adapter = new MojoAdapter()
    const result = compileJSX(
      `
"use client"
function Slot({ children, className }: { children?: unknown; className?: string }) {
  if (children) {
    const merged = [className].filter(Boolean).join(' ')
    return <div className={merged}>x</div>
  }
  return <div>fallback</div>
}
export { Slot }
`.trimStart(),
      'slot.tsx',
      { adapter },
    )
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain(`join(' ', @{[grep { $_ } @{[$className]}]})`)
  })

  test('lowers .includes(x) on an array prop via bf->includes(...) (#1448 Tier A)', () => {
    // Pre-#1448: `items.includes(target)` rejected at the parser
    // (`UNSUPPORTED_METHODS`) and surfaced as BF101. The lowering
    // now routes through the shared `array-method` IR + the
    // `bf->includes` helper, which inspects `ref()` to dispatch
    // between ARRAY-ref element search and scalar substring search.
    //
    // The bare `bf->` form (no `$` prefix) matches every other
    // helper emit in this adapter; the standalone Mojo::Template
    // test render in `test-render.ts` rewrites it to `$bf->` so
    // both render paths stay consistent.
    const adapter = new MojoAdapter()
    const result = compileJSX(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<string[]>([])
  const [target] = createSignal('x')
  return <div>{items().includes(target()) ? 'yes' : 'no'}</div>
}`, 'C.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('bf->includes($items, $target)')
    // Defensive pin: no leaked `$bf->` (would survive the test-render
    // patch as `$$bf->` and crash perl with "Not a SCALAR reference").
    expect(template).not.toContain('$bf->includes')
  })

  test('lowers .includes(sub) on a string prop via bf->includes(...) (#1448 Tier A)', () => {
    // String receiver shares the IR node with the array form; the
    // helper's `ref() ne 'ARRAY'` branch falls through to
    // `index(...) != -1`. Pinning the emit shape — same emitter
    // surface, different runtime behaviour.
    const adapter = new MojoAdapter()
    const result = compileJSX(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [value] = createSignal('hello world')
  const [needle] = createSignal('world')
  return <div>{value().includes(needle()) ? 'yes' : 'no'}</div>
}`, 'C.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('bf->includes($value, $needle)')
    expect(template).not.toContain('$bf->includes')
  })

  test('lowers .indexOf(x) on an array prop via bf->index_of(...) (#1448 Tier A)', () => {
    // Value-equality search. Mojo's `bf->index_of` walks the array
    // forward and returns the first matching index (or -1). The
    // existing `.find` lowering uses Perl `grep` for struct-field
    // find — disjoint surface, disjoint helpers.
    const adapter = new MojoAdapter()
    const result = compileJSX(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<string[]>([])
  const [target] = createSignal('x')
  return <div>idx: {items().indexOf(target())}</div>
}`, 'C.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('bf->index_of($items, $target)')
    expect(template).not.toContain('$bf->index_of')
  })

  test('lowers .lastIndexOf(x) on an array prop via bf->last_index_of(...) (#1448 Tier A)', () => {
    // Backward-walk variant. Sharing a helper module with index_of
    // keeps the dispatch trivial (`_array_index_of(..., $reverse)`)
    // and the per-direction emit a one-liner.
    const adapter = new MojoAdapter()
    const result = compileJSX(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<string[]>([])
  const [target] = createSignal('x')
  return <div>last: {items().lastIndexOf(target())}</div>
}`, 'C.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('bf->last_index_of($items, $target)')
  })

  test('lowers .at(-1) on an array prop via bf->at(...) (#1448 Tier A)', () => {
    // Negative indices are the canonical reason an author reaches
    // for `.at` over `[i]`; pinning `.at(-1)` (last element) — a
    // positive-only lowering would still pass `.at(0)` but fail
    // here.
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ items }: { items: string[] }) {
  return <div>last: {items.at(-1)}</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('bf->at($items, -1)')
    expect(template).not.toContain('$bf->at(')
  })

  test('lowers .toLowerCase() via Perl native lc (#1448 Tier A)', () => {
    // Perl's `lc` is the native lowering — no helper needed.
    // Defensive: must not emit a `$lc(...)` form (which the
    // test-render patch would mangle); emit must be the bare
    // `lc(...)` call so it stays well-formed in both the
    // standalone test renderer and real Mojolicious.
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ value }: { value: string }) {
  return <div>{value.toLowerCase()}</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('lc($value)')
    expect(template).not.toContain('$lc(')
  })

  test('lowers .toUpperCase() via Perl native uc (#1448 Tier A)', () => {
    // Mirrors toLowerCase — Perl's `uc` builtin, no helper.
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ value }: { value: string }) {
  return <div>{value.toUpperCase()}</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('uc($value)')
    expect(template).not.toContain('$uc(')
  })

  test('lowers .trim() via bf->trim helper (#1448 Tier A)', () => {
    // No native Perl `trim`; the helper wraps a single regex so an
    // undef receiver (common for missing-prop case) doesn't trigger
    // a substitution-on-undef warning.
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ value }: { value: string }) {
  return <div>[{value.trim()}]</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('bf->trim($value)')
    expect(template).not.toContain('$bf->trim')
  })

  test('lowers .reverse().join(\' \') via bf->reverse + join (#1448 Tier A)', () => {
    // SSR templates render a snapshot, so `.reverse` and
    // `.toReversed` share a Mojo lowering — both return a new
    // ARRAY ref so downstream `.join(...)` composes naturally.
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ items }: { items: string[] }) {
  return <div>{items.reverse().join(' ')}</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain("join(' ', @{bf->reverse($items)})")
    expect(template).not.toContain('$bf->reverse')
  })

  test('lowers .toReversed().join(\' \') via the same bf->reverse helper', () => {
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ items }: { items: string[] }) {
  return <div>{items.toReversed().join(' ')}</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain("join(' ', @{bf->reverse($items)})")
  })

  test('lowers .slice(start, end).join(\' \') via bf->slice + join (#1448 Tier A)', () => {
    // 2-arg form. Canonical Tier A fixture pins the start+end shape.
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ items }: { items: string[] }) {
  return <div>{items.slice(1, 3).join(' ')}</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain("join(' ', @{bf->slice($items, 1, 3)})")
    expect(template).not.toContain('$bf->slice')
  })

  test('lowers .slice(start) (1-arg) via bf->slice with end=undef', () => {
    // 1-arg form. The Perl helper treats undef `end` as
    // "to length", matching the Go variadic-arg-absent case.
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ items }: { items: string[] }) {
  return <div>{items.slice(2).join(' ')}</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain("join(' ', @{bf->slice($items, 2, undef)})")
  })

  test('lowers .concat(other).join(\' \') via bf->concat + join (#1448 Tier A)', () => {
    // Composition pin: the canonical Tier A fixture
    // (`packages/adapter-tests/fixtures/methods/array-concat.ts`)
    // chains `.concat(...).join(' ')`. The Mojo helper returns an
    // ARRAY ref so the downstream `@{...}` dereference in `join(...)`
    // works without an extra coercion.
    const adapter = new MojoAdapter()
    const result = compileJSX(`function A({ left, right }: { left: string[]; right: string[] }) {
  return <div>{left.concat(right).join(' ')}</div>
}
export { A }`, 'A.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain("join(' ', @{bf->concat($left, $right)})")
    expect(template).not.toContain('$bf->concat')
  })

  test('does not leak module-level export statements into the .html.ep template', () => {
    // Regression: trailing `export { Name }` / `export type { ... }` lines
    // were concatenated into the single-component template content, so
    // Mojolicious rendered them as visible HTML text (the create-barefootjs
    // scaffold's registry Button has this shape).
    const result = compileJSX(
      `
type ButtonVariant = 'default' | 'secondary'

function Button(props: { variant?: ButtonVariant, children?: unknown }) {
  return <button className={props.variant ?? 'default'}>{props.children}</button>
}

export { Button }
export type { ButtonVariant }
`.trimStart(),
      'button.tsx',
      { adapter: new MojoAdapter() },
    )
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).not.toContain('export {')
    expect(template!.content).not.toContain('export type')
  })
})

describe('MojoAdapter - templatePrimitives (#1189)', () => {
  // The registry fires when the call appears DIRECTLY in a JSX
  // expression position. Chained-const usage (`const j =
  // JSON.stringify(...); <div data-x={j}>`) routes through the
  // adapter's own const-resolution path; the conformance test for
  // that shape inspects the CLIENT JS, where the call IS inlined
  // (relocate accepts via the registry's boolean-acceptance side).

  test('JSON.stringify(props.x) emits bf->json($x) in SSR template', () => {
    const result = compileAndGenerate(`
'use client'
export function Foo(props: { config: object }) {
  return <div data-config={JSON.stringify(props.config)}>hi</div>
}
`)
    expect(result.template).toContain('bf->json($config)')
    expect(result.template).not.toContain('JSON.stringify')
  })

  test('Math.floor(props.score) emits bf->floor($score) in SSR template', () => {
    const result = compileAndGenerate(`
'use client'
export function Foo(props: { score: number }) {
  return <div data-rounded={Math.floor(props.score)}>hi</div>
}
`)
    expect(result.template).toContain('bf->floor($score)')
    expect(result.template).not.toContain('Math.floor')
  })

  test('Math.ceil / Math.round map to bf->ceil / bf->round', () => {
    const ceilResult = compileAndGenerate(`
'use client'
export function Foo(props: { v: number }) {
  return <div data-x={Math.ceil(props.v)}>hi</div>
}
`)
    expect(ceilResult.template).toContain('bf->ceil($v)')

    const roundResult = compileAndGenerate(`
'use client'
export function Foo(props: { v: number }) {
  return <div data-x={Math.round(props.v)}>hi</div>
}
`)
    expect(roundResult.template).toContain('bf->round($v)')
  })

  test('String(props.x) and Number(props.x) emit bf->string / bf->number', () => {
    const stringResult = compileAndGenerate(`
'use client'
export function Foo(props: { v: number }) {
  return <div data-x={String(props.v)}>hi</div>
}
`)
    expect(stringResult.template).toContain('bf->string($v)')

    const numberResult = compileAndGenerate(`
'use client'
export function Foo(props: { v: string }) {
  return <div data-x={Number(props.v)}>hi</div>
}
`)
    expect(numberResult.template).toContain('bf->number($v)')
  })

  test('nested primitive call (Math.floor(Number(props.x))) chains correctly', () => {
    const result = compileAndGenerate(`
'use client'
export function Foo(props: { v: string }) {
  return <div data-x={Math.floor(Number(props.v))}>hi</div>
}
`)
    expect(result.template).toContain('bf->floor(bf->number($v))')
  })

  test('registry exposes the V1 callee surface', () => {
    // Pin the V1 surface so a future refactor doesn't accidentally
    // drop a primitive. New entries are additive — extend this
    // list rather than replace.
    const a = new MojoAdapter()
    const keys = Object.keys(a.templatePrimitives ?? {}).sort()
    expect(keys).toEqual(['JSON.stringify', 'Math.ceil', 'Math.floor', 'Math.round', 'Number', 'String'])
  })

  test('unregistered identifier-path callee is NOT accepted', () => {
    const a = new MojoAdapter()
    expect(a.templatePrimitives?.['customSerialize']).toBeUndefined()
  })

  test('wrong-arity primitive call falls back instead of emitting invalid Perl', () => {
    // V1 emit fns expect 1 arg. A 2-arg `JSON.stringify(x, replacer)`
    // must not produce `bf->json($x, $replacer)` (which Perl would
    // accept silently) — the arity gate records BF101 and leaves
    // the call un-substituted.
    const result = compileAndGenerate(`
'use client'
export function Foo(props: { config: object; replacer: any }) {
  return <div data-x={JSON.stringify(props.config, props.replacer)}>hi</div>
}
`)
    expect(result.template).not.toContain('bf->json')
  })
})

describe('MojoAdapter - render_child template-parts dispatch (#1275)', () => {
  // The IR producer collapses a structured `template` AttrValue into
  // `expression` for component props (so the value can flow through
  // runtime hydration), but it keeps the parsed parts on
  // `ExpressionAttr.parts`. The Mojo adapter must dispatch to
  // `convertTemplateLiteralPartsToPerl` when those parts are present
  // — otherwise the bare JS source leaks into the Perl template (the
  // original #1275 failure: a `({...})[key]` Perl parse error and the
  // scaffold's Button rendering with no `class` attribute end-to-end).
  test('record-index-lookup via child prop emits Perl hash lookup, not raw JS', () => {
    const result = compileAndGenerate(`
import { Slot } from './slot'
export function V({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = { a: 'class-a', b: 'class-b' }
  return <Slot className={\`base \${classes[variant]}\`}>hi</Slot>
}
`)
    // The Perl hash form means the parts dispatch fired.
    expect(result.template).toContain("'a' => 'class-a'")
    expect(result.template).toContain("'b' => 'class-b'")
    expect(result.template).toContain("->{$variant}")
    // Negative pin: the raw JS object-literal shape must NOT survive
    // into the Mojo template. The original bug emitted
    // `({"a": "class-a", "b": "class-b"})[variant]` directly into the
    // `render_child` argument string.
    expect(result.template).not.toContain('{"a":')
    expect(result.template).not.toContain('"a": "class-a"')
  })

  test('intermediate-const composition (Button shape) carries through', () => {
    const result = compileAndGenerate(`
import { Slot } from './slot'
export function V({ variant }: { variant: 'a' | 'b' }) {
  const classes: Record<'a' | 'b', string> = { a: 'class-a', b: 'class-b' }
  const composed = \`base \${classes[variant]}\`
  return <Slot className={composed}>hi</Slot>
}
`)
    expect(result.template).toContain("'a' => 'class-a'")
    expect(result.template).toContain("->{$variant}")
  })
})

// =============================================================================
// #1448 Tier A — fixture-driven lowering pins
// =============================================================================
//
// The conformance test suite (runAdapterConformanceTests above) renders
// every fixture end-to-end through perl + Mojolicious and compares HTML —
// the strongest possible signal — but it short-circuits with
// `PerlNotAvailableError` on hosts without Mojolicious installed (CI ARM
// runners, contributor laptops without `cpanm Mojolicious`, the sandbox
// each Tier A PR was developed in). Those skips mean a lowering can
// silently regress to BF101 / wrong helper-call shape and the conformance
// run still passes "green" on those hosts.
//
// This block compiles each Tier A fixture's `source` through the
// adapter and pins the emitted helper-call substring directly on the
// template string. No perl needed; runs on every host. The expected
// substring uses the same `$prop` form the fixture's prop bindings
// produce — same lowering path the conformance runner exercises when
// Mojolicious IS present, just with the assertion staged one step
// earlier (template-string rather than rendered HTML).
//
// One row per Tier A method fixture from
// packages/adapter-tests/fixtures/methods/. Each PR in the Tier A
// stack appends its rows as the corresponding lowering lands —
// keeping the block in sync with the `expectedDiagnostics` drops
// above.

import { fixture as arrayIncludesFixture } from '../../../adapter-tests/fixtures/methods/array-includes'
import { fixture as stringIncludesFixture } from '../../../adapter-tests/fixtures/methods/string-includes'
import { fixture as arrayIndexOfFixture } from '../../../adapter-tests/fixtures/methods/array-indexOf'
import { fixture as arrayLastIndexOfFixture } from '../../../adapter-tests/fixtures/methods/array-lastIndexOf'
import { fixture as arrayAtFixture } from '../../../adapter-tests/fixtures/methods/array-at'
import { fixture as arrayConcatFixture } from '../../../adapter-tests/fixtures/methods/array-concat'
import { fixture as arraySliceFixture } from '../../../adapter-tests/fixtures/methods/array-slice'
import { fixture as arrayReverseFixture } from '../../../adapter-tests/fixtures/methods/array-reverse'
import { fixture as arrayToReversedFixture } from '../../../adapter-tests/fixtures/methods/array-toReversed'
import { fixture as stringToLowerCaseFixture } from '../../../adapter-tests/fixtures/methods/string-toLowerCase'
import { fixture as stringToUpperCaseFixture } from '../../../adapter-tests/fixtures/methods/string-toUpperCase'
import { fixture as stringTrimFixture } from '../../../adapter-tests/fixtures/methods/string-trim'
// #1448 Tier B — .sort / .toSorted fixtures (loop-chained + standalone).
import { fixture as arraySortFieldAscFixture } from '../../../adapter-tests/fixtures/methods/array-sort-field-asc'
import { fixture as arraySortFieldDescFixture } from '../../../adapter-tests/fixtures/methods/array-sort-field-desc'
import { fixture as arraySortPrimitiveFixture } from '../../../adapter-tests/fixtures/methods/array-sort-primitive'
import { fixture as arraySortLocaleFixture } from '../../../adapter-tests/fixtures/methods/array-sort-locale'
import { fixture as arrayToSortedFixture } from '../../../adapter-tests/fixtures/methods/array-toSorted'

describe('MojoAdapter - #1448 Tier A/B fixture-driven lowering pins', () => {
  const cases = [
    { fixture: arrayIncludesFixture,    expect: 'bf->includes($items, $target)' },
    { fixture: stringIncludesFixture,   expect: 'bf->includes($value, $needle)' },
    { fixture: arrayIndexOfFixture,     expect: 'bf->index_of($items, $target)' },
    { fixture: arrayLastIndexOfFixture, expect: 'bf->last_index_of($items, $target)' },
    { fixture: arrayAtFixture,          expect: 'bf->at($items, -1)' },
    { fixture: arrayConcatFixture,      expect: 'bf->concat($left, $right)' },
    { fixture: arraySliceFixture,       expect: 'bf->slice($items, 1, 3)' },
    { fixture: arrayReverseFixture,     expect: 'bf->reverse($items)' },
    // .toReversed shares the helper with .reverse — pinning both
    // routings catches a future divergence between them.
    { fixture: arrayToReversedFixture,  expect: 'bf->reverse($items)' },
    { fixture: stringToLowerCaseFixture,expect: 'lc($value)' },
    { fixture: stringToUpperCaseFixture,expect: 'uc($value)' },
    { fixture: stringTrimFixture,       expect: 'bf->trim($value)' },
    // #1448 Tier B — sort / toSorted. The loop-chained field cases
    // hoist into a `my $bf_iter_lN = bf->sort(...)` local; the
    // standalone primitive cases inline the call.
    { fixture: arraySortFieldAscFixture,  expect: `bf->sort($items, { key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'asc' })` },
    { fixture: arraySortFieldDescFixture, expect: `bf->sort($items, { key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'desc' })` },
    { fixture: arraySortPrimitiveFixture, expect: `bf->sort($nums, { key_kind => 'self', compare_type => 'numeric', direction => 'asc' })` },
    { fixture: arraySortLocaleFixture,    expect: `bf->sort($names, { key_kind => 'self', compare_type => 'string', direction => 'asc' })` },
    { fixture: arrayToSortedFixture,      expect: `bf->sort($nums, { key_kind => 'self', compare_type => 'numeric', direction => 'asc' })` },
  ]

  for (const { fixture, expect: expectedHelper } of cases) {
    test(`[${fixture.id}] lowers to \`${expectedHelper}\``, () => {
      const adapter = new MojoAdapter()
      const result = compileJSX(fixture.source, `${fixture.id}.tsx`, { adapter })
      // No BF101 — the parser arm + adapter case took the call.
      expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
      const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
      expect(template).toContain(expectedHelper)
      // Defensive pin against the `$bf->...` form that the
      // test-render `bf->` → `$bf->` patch would mangle to
      // `$$bf->...` (crashes perl with "Not a SCALAR reference"
      // — see the first-PR fix commit in this stack).
      if (expectedHelper.startsWith('bf->')) {
        expect(template).not.toContain(`$${expectedHelper}`)
      }
    })
  }
})
