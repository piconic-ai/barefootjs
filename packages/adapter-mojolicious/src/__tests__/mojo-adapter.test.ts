/**
 * MojoAdapter - Tests
 *
 * Conformance tests (shared across adapters) + Mojo-specific tests.
 */

import { describe, test, expect } from 'bun:test'
import { MojoAdapter } from '../adapter/mojo-adapter'
import { runAdapterConformanceTests } from '@barefootjs/adapter-tests'
import { renderMojoComponent, PerlNotAvailableError } from '../test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { conformancePins } from '../conformance-pins'
import { renderDivergences } from '../render-divergences'

runAdapterConformanceTests({
  name: 'mojo',
  factory: () => new MojoAdapter(),
  render: renderMojoComponent,
  // Priority-12 edge-case sweep (炙り出し, #2168): render-level
  // divergences are declared in `../render-divergences` (exported from the
  // package index and published to `ui/compat.lock.json` / the docs
  // compatibility-matrix page by `packages/compat`). Deriving the skip
  // list from that object keeps the public declaration and these test
  // skips from drifting; each entry's rationale lives there.
  skipJsx: Object.keys(renderDivergences),
  // (Pre-sweep note) Otherwise no JSX-render skips: every shared conformance fixture — including
  // the composed `site/ui` demo corpus (#1467 / #1897) — renders to
  // Hono parity on real Mojolicious. `data-table` came off via the
  // body-children `inLoop` reset (#1896): the loop-item component
  // (TableRow) still gets `ComponentName_<random>` scope IDs, but its
  // body children (TableCell) now receive `_bf_slot` for deterministic
  // parent-scope-derived IDs matching Hono.
  // Per-fixture build-time contracts for shapes the Mojo adapter
  // intentionally refuses to lower. Lives in `../conformance-pins` (not
  // by the shared fixtures) so adding a new adapter doesn't require
  // touching any cross-adapter file.
  expectedDiagnostics: conformancePins,
  // `JSON_STRINGIFY_VIA_CONST` and `MATH_FLOOR_VIA_CONST` pass via
  // `MojoAdapter.templatePrimitives` (#1189) — the identifier-path
  // registry for well-known JS builtins. `USER_IMPORT_VIA_CONST` and
  // `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` now ALSO pass (#2069): a bespoke
  // user import can never be added to the string-keyed registry, but the
  // shared `RelocateEnv.loweringMatchers` acceptance path recognises it
  // via a `LoweringPlugin` the case setup registers around the compile
  // (see `packages/adapter-tests/src/cases/template-primitives.ts`) — the
  // same seam a real userland plugin author would use. No skips left, so
  // `skipTemplatePrimitives` is omitted entirely (defaults to "skip
  // nothing").
  // `client-only` / `client-only-loop-with-sibling-cond` /
  // `filter-nested-callback-predicate-client` are no longer skipped —
  // `renderLoop` now emits the `bf->comment("loop:<id>")` boundary pair
  // for clientOnly loops (Hono / Go parity), so mapArray() can locate
  // its insertion anchor at hydration time (#872 / #1087).
  skipMarkerConformance: new Set([
    // Same as Hono: `/* @client */` markers on TodoApp's keyed `.map`
    // intentionally elide a slot id from the SSR template that the IR
    // still declares (s6). See hono-adapter.test for the contract.
    'todo-app',
    // #1467 Phase 2e: same `/* @client */` keyed-map elision (data-table).
    'data-table',
  ]),
  skipDataPoints: new Set<string>(),
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

describe('MojoAdapter - conditional inline-object spread (textarea aria-describedby)', () => {
  // `{...(cond ? { 'aria-describedby': cond } : {})}` lowers to a Perl
  // inline ternary of hashrefs so the falsy `{}` branch OMITS the key
  // (bf->spread_attrs does not filter empty strings). The shared
  // fixture only exercises the falsy branch; this pins the truthy one.
  test('emits a Perl inline ternary of hashrefs through bf->spread_attrs', () => {
    const { template } = compileAndGenerate(`
function Box({ describedBy }: { describedBy?: string }) {
  return <div {...(describedBy ? { 'aria-describedby': describedBy } : {})} />
}
`)
    expect(template).toContain(
      "bf->spread_attrs($describedBy ? { 'aria-describedby' => $describedBy } : {})",
    )
  })

  test('resolves the value reference and preserves the static key for a second prop', () => {
    const { template } = compileAndGenerate(`
function Box({ label }: { label: string }) {
  return <div {...(label ? { 'data-label': label } : {})} />
}
`)
    expect(template).toContain(
      "bf->spread_attrs($label ? { 'data-label' => $label } : {})",
    )
  })

  test('falls back to BF101 for a computed (non-static) object key', () => {
    const adapter = new MojoAdapter()
    const ir = compileToIR(`
function Box({ k, v }: { k?: string; v?: string }) {
  return <div {...(v ? { [k]: v } : {})} />
}
`, adapter)
    adapter.generate(ir)
    const errs = (adapter as unknown as { errors: { code: string }[] }).errors
    expect(errs.some(e => e.code === 'BF101')).toBe(true)
  })
})

describe('MojoAdapter - searchParams() env-signal lowering (#1922)', () => {
  // `searchParams().get(k)` is an env-signal method call: it must lower to a
  // real method call on the per-request `$searchParams` reader, not the
  // generic hash deref `$searchParams->{get}` (which drops the arg).
  test('lowers searchParams().get(k) to a method call on $searchParams', () => {
    const { template } = compileAndGenerate(`
import { createSearchParams } from '@barefootjs/client'
function SortLabel() {
  const [searchParams] = createSearchParams()
  return <p>{searchParams().get('sort') ?? 'none'}</p>
}
`)
    expect(template).toContain("($searchParams->get('sort') // 'none')")
    expect(template).not.toContain('$searchParams->{get}')
  })

  // An aliased destructured getter binds the env signal to a different local
  // name; the expression reads `sp()`, but it still lowers to the canonical
  // `$searchParams` reader (the harness/plugin seed that fixed var).
  test('matches an aliased env-signal getter (`const [sp] = createSearchParams()`) and emits canonical $searchParams', () => {
    const { template } = compileAndGenerate(`
import { createSearchParams } from '@barefootjs/client'
function SortLabel() {
  const [sp] = createSearchParams()
  return <p>{sp().get('sort') ?? 'none'}</p>
}
`)
    expect(template).toContain("($searchParams->get('sort') // 'none')")
  })
})

describe('MojoAdapter - local-const conditional-spread resolution (#checkbox icon)', () => {
  // A FUNCTION-scope const holding a `cond ? {…} : {}` ternary, spread as
  // a bare identifier (`{...attrs}`), resolves through the same Perl
  // ternary-of-hashrefs lowering as the inline form. CheckIcon's
  // `const sizeAttrs = size ? {…} : {}` is exactly this shape.
  test('resolves a bare-identifier spread of a function-scope conditional const', () => {
    const { template } = compileAndGenerate(`
function Box({ flag }: { flag?: boolean }) {
  const attrs = flag ? { 'data-on': 'yes' } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain(
      "bf->spread_attrs($flag ? { 'data-on' => 'yes' } : {})",
    )
  })

  // A const that aliases another bare identifier must NOT be forwarded
  // (loop guard): the resolver bails, so the spread falls through to the
  // standard `convertExpressionToPerl` path emitting the bare `$attrs`
  // variable rather than recursively resolving the alias into a hashref.
  test('does not forward a const that aliases another identifier (loop guard)', () => {
    const { template } = compileAndGenerate(`
function Box({ other }: { other?: object }) {
  const attrs = other
  return <div {...attrs} />
}
`)
    expect(template).toContain('bf->spread_attrs($attrs)')
  })
})

// #2221: same class of hazard as the Twig-family `_resolveLiteralConst`
// flat-lookup bug, but this adapter's story is different. `resolveLiteralConst`
// / `resolveStaticRecordLiteral` (mojo-adapter.ts) already guard against it —
// they consult `loopBoundNames`, a LIVE ref-counted map that
// `renderLoop` populates/depopulates as it descends/ascends into each loop
// body (#1749), not a static whole-component set like the Twig family's
// `collectLoopBoundNames(ir)`. That makes the guard scope-PRECISE rather
// than coarse: a name loop-bound only inside one loop still inlines fine
// at a genuinely separate, non-shadowed occurrence elsewhere in the
// component (see the third test below) — the Twig-family's documented
// coarse trade-off (a same-named const anywhere else in the component also
// stops inlining) does not apply here. So no `staticLoopSourceBoundNames`
// field was added; the existing live tracking already covers this call
// site and is strictly more precise.
//
// The ONE actual gap found: `emitSpread`'s bare-identifier local-const
// spread resolution (mojo-adapter.ts, the `this.localConstants.find(...)`
// call keyed by `trimmed`, `{...attrs}` → `{ … }` hashref, #checkbox/icon)
// read `this.localConstants` directly with no `loopBoundNames` guard at
// all — a loop param named the same as an outer conditional-object const
// (`.map((attrs) => <li {...attrs} />)` shadowing `const attrs = cond ?
// {…} : {}`) incorrectly forwarded the outer object's literal hashref
// instead of falling through to the per-iteration `$attrs` value. Fixed
// with the same `loopBoundNames` guard as the other two call sites.
//
// Not covered here (upstream, shared-compiler hazard, out of this
// package's scope): `key={label}` shadowed by an enclosing loop param of
// the same name is folded to the OUTER const's literal at IR-generation
// time (`tryResolveIdentifierAsTemplateLiteral` → `findLocalConst` in
// `packages/jsx/src/jsx-to-ir.ts`), before any adapter runs — so this
// adapter (and every other adapter, including Hono's native JSX
// re-emission) still renders a `key`/`data-key` value shadowed this way
// as the outer literal, unconditionally, every iteration.
describe('MojoAdapter - const inlining vs loop-param shadowing (#2221)', () => {
  test('a loop param shadowing an outer literal const emits the identifier, not the const value', () => {
    const { template } = compileAndGenerate(`
function Widget() {
  const label: string = 'x'
  return <ul>{[2, 5].map((label) => <li key={label}>{1 + label}</li>)}</ul>
}
`)
    expect(template).toContain('1 + $label')
    expect(template).not.toContain("1 + 'x'")
  })

  test('a numeric const shadowed by a loop param emits the identifier too', () => {
    const { template } = compileAndGenerate(`
function Widget() {
  const count = 7
  return <ul>{[2, 5].map((count) => <li key={count}>{1 + count}</li>)}</ul>
}
`)
    expect(template).toContain('1 + $count')
    expect(template).not.toContain('1 + 7')
  })

  test('a literal const NOT shadowed by any loop still inlines (#1897 pin)', () => {
    const { template } = compileAndGenerate(`
function Widget({ values }: { values: number[] }) {
  const totalPages = 5
  return <div>
    <p>Page 1 of {1 + totalPages}</p>
    <ul>{values.map((v) => <li key={v}>{v}</li>)}</ul>
  </div>
}
`)
    expect(template).toContain('1 + 5')
  })

  // Unlike the Twig-family's coarse-but-safe `collectLoopBoundNames(ir)`
  // exclusion, this adapter's LIVE `loopBoundNames` tracking is scoped to
  // the actual render position: a name loop-bound ONLY inside the `.map`
  // callback still inlines correctly at a separate, non-shadowed
  // occurrence outside the loop — no accepted trade-off here.
  test('a const referenced outside the loop whose name is loop-bound elsewhere still inlines (more precise than Twig family)', () => {
    const { template } = compileAndGenerate(`
function Widget({ values }: { values: number[] }) {
  const label: string = 'x'
  return <div>
    <p>{1 + label}</p>
    <ul>{values.map((label) => <li key={label}>{2 + label}</li>)}</ul>
  </div>
}
`)
    expect(template).toContain("1 + 'x'")
    expect(template).toContain('2 + $label')
  })

  // The actual gap this issue found in this adapter: `emitSpread`'s
  // bare-identifier local-const resolution (`{...attrs}` → the outer
  // conditional object's hashref) had no `loopBoundNames` guard.
  test('a loop param shadowing an outer conditional-object const spread emits the loop var, not the outer hashref', () => {
    const { template } = compileAndGenerate(`
function Widget({ items }: { items: object[] }) {
  const attrs = true ? { 'data-on': 'outer' } : {}
  return <ul>{items.map((attrs) => <li {...attrs} />)}</ul>
}
`)
    expect(template).toContain('bf->spread_attrs($attrs)')
    expect(template).not.toContain("'data-on' => 'outer'")
  })
})

// #2237: the record-literal sibling of #2221's `resolveLiteralConst` bug —
// `resolveStaticRecordLiteral` (`IDENT.key` on a module-scope object-literal
// const, e.g. `variantClasses.ghost` — #1896/#1897) is confirmed reproducible
// on the Twig-family adapters (flat `objectName` lookup with no notion of AST
// scope, so an enclosing loop callback's own param of the same name resolved
// to the OUTER const's member value at every iteration). This adapter's
// `resolveStaticRecordLiteral` already guards against it (mojo-adapter.ts:
// `if (this.loopBoundNames?.has?.(objectName)) return null`) — the same LIVE,
// ref-counted `loopBoundNames` map `resolveLiteralConst` consults (#1749),
// scope-precise rather than the Twig family's coarse whole-component set.
// Pinned here (mirroring the #2221 scope-precision pin above) rather than
// fixed, since no code change was needed.
describe('MojoAdapter - record-literal member lookup vs loop-param shadowing (#2237)', () => {
  test('a loop param shadowing an outer module object const emits the member access, not the outer literal', () => {
    const { template } = compileAndGenerate(`
const cfg = { x: 'outer-lit' }
function Widget({ rows }: { rows: { x: string }[] }) {
  return <ul>{rows.map((cfg) => <li key={cfg.x}>{cfg.x}</li>)}</ul>
}
`)
    // The loop body must reference the per-iteration member access...
    expect(template).toContain('$cfg->{x}')
    // ...never the outer const's hard-coded value.
    expect(template).not.toContain("'outer-lit'")
  })

  test('a module object const NOT shadowed by any loop still inlines (variantClasses.ghost shape, #1896/#1897 pin)', () => {
    const { template } = compileAndGenerate(`
const variantClasses = { solid: 'bg-solid', ghost: 'bg-ghost' }
function Widget({ variant }: { variant: 'solid' | 'ghost' }) {
  return <div>{variantClasses.ghost}</div>
}
`)
    expect(template).toContain("'bg-ghost'")
  })

  // Unlike the Twig-family's coarse-but-safe `staticLoopSourceBoundNames`
  // exclusion, this adapter's LIVE `loopBoundNames` tracking is scoped to
  // the actual render position: an object name loop-bound ONLY inside the
  // `.map` callback still inlines its member lookup correctly at a
  // separate, non-shadowed occurrence outside the loop — no accepted
  // trade-off here.
  test('an object name loop-bound only inside the loop still inlines its member lookup outside it (more precise than Twig family)', () => {
    const { template } = compileAndGenerate(`
const cfg = { x: 'outer-lit' }
function Widget({ rows }: { rows: { x: string }[] }) {
  return <div>
    <p>{cfg.x}</p>
    <ul>{rows.map((cfg) => <li key={cfg.x}>{cfg.x}</li>)}</ul>
  </div>
}
`)
    expect(template).toContain("<p><%= 'outer-lit' %></p>")
    expect(template).toContain('$cfg->{x}')
  })
})

describe('MojoAdapter - Record<staticKeys,scalar>[propKey] spread value (#checkbox icon)', () => {
  // `const sizeMap: Record<IconSize, number> = { sm: 16, ... }` indexed by
  // a prop inside a conditional-spread object value lowers to an inline
  // indexed Perl hashref `{ ... }->{$key}`. This is CheckIcon's
  // `{ width: sizeMap[size], height: sizeMap[size] }` shape.
  test('lowers an indexed module-const map to an inline hashref index', () => {
    const { template } = compileAndGenerate(`
const sizeMap: Record<string, number> = { sm: 16, md: 20, lg: 24, xl: 32 }
function Box({ size }: { size?: string }) {
  const attrs = size ? { width: sizeMap[size] } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain(
      "{ 'sm' => 16, 'md' => 20, 'lg' => 24, 'xl' => 32 }->{$size}",
    )
  })

  test('lowers string-valued record maps too', () => {
    const { template } = compileAndGenerate(`
const labelMap: Record<string, string> = { a: 'Alpha', b: 'Beta' }
function Box({ k }: { k?: string }) {
  const attrs = k ? { 'data-label': labelMap[k] } : {}
  return <div {...attrs} />
}
`)
    expect(template).toContain("{ 'a' => 'Alpha', 'b' => 'Beta' }->{$k}")
  })

  // A non-scalar record value (object) is out of shape: the spread object
  // value can't lower, so the whole spread falls back to BF101.
  test('refuses a non-scalar record value with BF101 (out-of-shape fallback)', () => {
    const adapter = new MojoAdapter()
    const ir = compileToIR(`
const sizeMap: Record<string, object> = { sm: { w: 1 } }
function Box({ size }: { size?: string }) {
  const attrs = size ? { width: sizeMap[size] } : {}
  return <div {...attrs} />
}
`, adapter)
    adapter.generate(ir)
    const errs = (adapter as unknown as { errors: { code: string }[] }).errors
    expect(errs.some(e => e.code === 'BF101')).toBe(true)
  })
})

describe('MojoAdapter - props-object inherited-attribute enumeration (#checkbox)', () => {
  // A SolidJS props-object component reads inherited attributes (`props.id`)
  // not enumerated in `propsParams`. The bare optional attribute must be
  // guarded with Perl `defined` so it's omitted when unset (Hono parity),
  // even though `id` isn't a declared param.
  test('guards a props-object bare optional attr (props.id) with defined', () => {
    const { template } = compileAndGenerate(`
"use client"
interface P { tone?: string }
export function Widget(props: P) {
  return <button id={props.id}>x</button>
}
`)
    expect(template).toContain('<% if (defined $id) { %>id="<%= $id %>"<% } %>')
  })
})

describe('MojoAdapter - hyphenated child attr hash key (#checkbox)', () => {
  // A child component prop whose JSX name isn't a bare Perl identifier
  // (`<CheckIcon data-slot="..."/>`) must be quoted in the `render_child`
  // named-arg list — an unquoted `data-slot => ...` parses as `data - slot`.
  test('quotes a hyphenated child attribute name in render_child', () => {
    const { template } = compileAndGenerate(`
"use client"
import { Leaf } from './leaf'
export function Host() {
  return <div><Leaf data-slot="indicator" size="sm" /></div>
}
`)
    expect(template).toContain("'data-slot' => 'indicator'")
    // A bare-identifier name stays unquoted.
    expect(template).toContain('size => ')
    expect(template).not.toContain('data-slot => ')
  })
})

describe('MojoAdapter - nullish optional-attribute omission (textarea rows)', () => {
  // A no-destructure-default, nillable-typed prop is `undef` when the
  // caller omits it; guard its bare-reference attribute with Perl
  // `defined` so it DROPS instead of rendering `attr=""` — matching
  // Hono's nullish-attribute omission. Concrete/defaulted props are
  // never `undef` and stay unconditional.
  test('guards a no-default nillable attr with a Perl defined check', () => {
    const { template } = compileAndGenerate(`
function C({ rows }: { rows?: number }) {
  return <textarea rows={rows} />
}
`)
    expect(template).toContain('<% if (defined $rows) { %>rows="<%= $rows %>"<% } %>')
    // Must NOT emit the bare unconditional form.
    expect(template).not.toMatch(/(?<!\{ %>)rows="<%= \$rows %>"/)
  })

  test('leaves a defaulted attr unconditional (scope did not widen)', () => {
    const { template } = compileAndGenerate(`
function C({ value = '' }: { value?: string }) {
  return <textarea value={value} />
}
`)
    // `value` has a destructure default → never undef → unconditional,
    // exactly like Hono's value="".
    expect(template).toContain('value="<%= $value %>"')
    expect(template).not.toContain('defined $value')
  })
})

describe('MojoAdapter - SSR context propagation (#1297)', () => {
  // `<Ctx.Provider value>` brackets its children with a provide/revoke pair
  // on the shared package-level context stack; descendant `useContext`
  // consumers read it during the same render (mirrors the client
  // `provideContext` / `useContext`).
  test('provider brackets children with provide_context / revoke_context', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createContext, useContext } from '@barefootjs/client'
const ThemeContext = createContext('light')
export function ThemeRoot() {
  return <div><ThemeContext.Provider value="dark"><ThemeLabel /></ThemeContext.Provider></div>
}
function ThemeLabel() { const theme = useContext(ThemeContext); return <span>{theme}</span> }
`)
    expect(template).toContain("bf->provide_context('ThemeContext', 'dark');")
    expect(template).toContain("bf->revoke_context('ThemeContext');")
    // The provide precedes the child render, the revoke follows it.
    expect(template.indexOf('provide_context')).toBeLessThan(template.indexOf('render_child'))
    expect(template.indexOf('render_child')).toBeLessThan(template.indexOf('revoke_context'))
  })

  test('consumer seeds its local from use_context with the createContext default', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createContext, useContext } from '@barefootjs/client'
const ThemeContext = createContext('light')
export function ThemeLabel() { const theme = useContext(ThemeContext); return <span>{theme}</span> }
`)
    expect(template).toContain("% my $theme = bf->use_context('ThemeContext', 'light');")
  })
})

describe('MojoAdapter - prop-derived memo SSR seeding (#1297)', () => {
  // A memo whose body can't be statically folded (`props.value * 10`) gets a
  // `null` SSR default; the adapter computes it in-template from the seeded
  // prop var so the child renders the value instead of empty.
  test('seeds a prop-derived memo from the prop var', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function Child(props: { value: number }) {
  const displayValue = createMemo(() => props.value * 10)
  return <span>{displayValue()}</span>
}
`)
    expect(template).toContain('% my $displayValue = $value * 10;')
  })

  test('seeds a memo over a destructured prop', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function Child({ value }: { value: number }) {
  const displayValue = createMemo(() => value * 10)
  return <span>{displayValue()}</span>
}
`)
    expect(template).toContain('% my $displayValue = $value * 10;')
  })
})

describe('MojoAdapter - prop-derived signal SSR seeding + data-key (#1297, toggle-shared)', () => {
  // A prop-derived signal (`createSignal(props.defaultOn ?? false)`) is seeded
  // in-template from the passed prop, so a loop child honours its own
  // per-item prop instead of the static default.
  test('seeds a prop-derived signal from the prop var', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Item(props: { defaultOn?: boolean }) {
  const [on, setOn] = createSignal(props.defaultOn ?? false)
  return <button>{on() ? 'ON' : 'OFF'}</button>
}
`)
    expect(template).toContain('% my $on = ($defaultOn // 0);')
  })

  // An object/array-valued signal can't lower to Perl and must NOT be seeded
  // in-template (it would record a BF101) — it keeps the existing ssr-defaults
  // seeding.
  test('does not in-template-seed an object-valued signal', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Spread() {
  const [attrs, setAttrs] = createSignal<Record<string, string>>({ id: 'a' })
  return <div {...attrs()} />
}
`)
    expect(template).not.toContain('my $attrs =')
  })

  // The component root carries data-key, emitted from the bf instance
  // (render_child sets it from the JSX key); non-keyed renders add nothing.
  test('emits data_key_attr on the component root', () => {
    const { template } = compileAndGenerate(`
export function Item() { return <div className="x">hi</div> }
`)
    expect(template).toContain('bf->data_key_attr')
  })

  // An early-return (if-statement) root has no single root element; data-key
  // must land on each branch's top element so a keyed loop item still stamps it.
  test('emits data_key_attr on each branch root of an if-statement root', () => {
    const { template } = compileAndGenerate(`
export function Item({ on }: { on?: boolean }) {
  if (on) return <div className="a">A</div>
  return <div className="b">B</div>
}
`)
    const count = (template.match(/bf->data_key_attr/g) ?? []).length
    expect(count).toBe(2)
  })
})

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

  test('module pure-string const referenced in className inlines the literal (#1467 Phase 2b)', () => {
    // A module-scope `const X = 'literal'` used inside a className template
    // literal must inline its value, NOT emit `$X` against a stash variable
    // that is never bound (the value would render empty). Hono inlines it at
    // runtime; this restores byte-parity.
    const result = compileAndGenerate(`
"use client"
const labelClasses = 'flex items-center group-data-[disabled=true]:opacity-50'
export function Label({ className = '' }: { className?: string }) {
  return <label className={\`\${labelClasses} \${className}\`} />
}
`)
    // Inlined as a Perl single-quoted literal, escaped tokens intact.
    expect(result.template).toContain(
      "'flex items-center group-data-[disabled=true]:opacity-50'",
    )
    // No stash-variable reference to the const.
    expect(result.template).not.toContain('$labelClasses')
  })

  test('module pure-string const is NOT inlined when shadowed by a loop variable (#1749 review)', () => {
    // A loop param whose name matches a module const must keep its loop
    // binding (`$label`) inside the body — the const literal must not leak
    // in. `renderLoop` guards module-const inlining for the loop body.
    const result = compileAndGenerate(`
"use client"
const label = 'MODULE_CONST'
export function List({ items }: { items: string[] }) {
  return <ul>{items.map(label => <li>{label}</li>)}</ul>
}
`)
    // Inside the loop the param wins — emit the loop variable, not the const.
    expect(result.template).toContain('$label')
    expect(result.template).not.toContain('MODULE_CONST')
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

  test('compares string signals with Perl `eq`, not numeric `==` (#1672)', () => {
    // `sel() === t.id` where `sel` is a string signal must lower to `eq`.
    // Perl numeric `==` coerces non-numeric strings to 0, so `"b" == "a"` is
    // true and every loop item would render its true branch.
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function LoopItemConditional() {
  const [items] = createSignal([{ id: "a" }, { id: "b" }, { id: "c" }])
  const [sel] = createSignal("b")
  return <ul>{items().map(t => sel() === t.id && <li key={t.id}>{t.id}</li>)}</ul>
}
`)
    expect(result.template).toContain('$sel eq $t->{id}')
    expect(result.template).not.toContain('$sel == $t->{id}')
  })

  test('compares number signals with Perl `==` (#1672)', () => {
    // A numeric signal comparison must stay `==`, not flip to `eq`.
    const result = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"

export function L() {
  const [items] = createSignal([{ n: 1 }, { n: 2 }])
  const [sel] = createSignal(2)
  return <ul>{items().map(t => sel() === t.n && <li key={t.n}>{t.n}</li>)}</ul>
}
`)
    expect(result.template).toContain('$sel == $t->{n}')
    expect(result.template).not.toContain('$sel eq $t->{n}')
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
      // The arithmetic-fold `.reduce(fn, init)` catalogue now lowers
      // (positive-output tests below + the reduce-* conformance
      // fixtures); the no-init form stays refused — JS throws on an
      // empty array there, which a template can't mirror.
      { name: 'reduce (no init)',  body: `<div>{items().reduce((s, x) => s + x)}</div>`,                                                             needle: '.reduce(' },
      { name: 'forEach',           body: `<ul>{items().forEach(x => x)}</ul>`,                                                                       needle: '.forEach(' },
      // #2018 P5: an array-literal projection with a literal element
      // (`x => [x.tag, "x"]`) now lowers through the runtime evaluator
      // (`bf->flat_map_eval`) — the structured-tuple restriction that
      // refused a non-`self`/`field` leaf is gone. See the positive
      // flat_map_eval pins below. The remaining BF101 flatMap surface
      // (a projection the evaluator can't serialize) has no example here.
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
    // #2018 P2: the `.filter().map()` loop hoists over the filtered array,
    // now produced by the evaluator (`bf->filter_eval`). (Hoisting the call
    // into a single `my` var is a P3 optimization.)
    expect(template).toContain('bf->filter_eval($items,')
    expect(template).toContain('"property":"done"')
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

  test('lowers nested .some(...) in filter predicate to an inline grep — no BF101 (#2038)', () => {
    // The evaluator refuses the nested arrow (`serializeParsedExpr` → null),
    // but the Perl filter emitter has a FAITHFUL form for nested
    // filter / every / some: a real inline `grep` closing over the outer
    // loop var. Pin the emitted EP shape positively so the #2038 loudness
    // fix (which targets the degrade-only arms: nested `find*`,
    // sort / reduce / flatMap — see the `filter-nested-find-predicate`
    // expectedDiagnostics entry) never over-reaches into this supported
    // shape. The rendered-HTML side of this contract lives in the shared
    // `filter-nested-callback-predicate` fixture (Hono-parity render).
    const adapter = new MojoAdapter()
    const result = compileJSX(`'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number }
export function Picker() {
  const [items] = createSignal<Item[]>([])
  const [picked] = createSignal<Item[]>([])
  return <ul>{items().filter(t => !picked().some(p => p.id === t.id)).map(t => <li key={t.id}>{t.id}</li>)}</ul>
}`, 'C.tsx', { adapter })
    expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
    const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).toContain('grep')
    expect(template).toContain('@{$picked}')
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
    // #2018 P2: the `.filter().map()` loop hoists over the filtered array,
    // now produced by the evaluator (`bf->filter_eval`). (Hoisting the call
    // into a single `my` var is a P3 optimization.)
    expect(template).toContain('bf->filter_eval($items,')
    expect(template).toContain('"property":"done"')
  })

  test('lowers the registry Slot\'s [a, b].filter(Boolean).join(\' \') chain (#1443)', () => {
    // The registry `<Slot>` builds its merged className via
    // `[className, childClass].filter(Boolean).join(' ')`. Pre-#1443
    // each link in the chain (array literal, `Boolean` callable
    // filter, `.join`) hit a separate refusal gate and the chain
    // emitted BF101 — making the scaffold `<Button>` / `<Card>`
    // unusable on Mojo. The fix lowers all three to Embedded Perl
    // (`bf->join([grep { $_ } @{[...]}], ' ')`), unblocking the
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
    expect(template).toContain(`bf->join([grep { $_ } @{[$className]}], ' ')`)
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

  test('lowers .find / .findIndex / .findLast / .findLastIndex via the evaluator', () => {
    // #2018 P2: the pure predicate `x => x === 'b'` serializes and lowers
    // through the evaluator. find / findIndex share `bf->find_eval` /
    // `bf->find_index_eval` with findLast / findLastIndex, distinguished by
    // the `forward` flag (1 = forward, 0 = backward).
    const cases: Array<[string, string, number]> = [
      ['find', 'find_eval', 1],
      ['findIndex', 'find_index_eval', 1],
      ['findLast', 'find_eval', 0],
      ['findLastIndex', 'find_index_eval', 0],
    ]
    for (const [js, helper, fwd] of cases) {
      const adapter = new MojoAdapter()
      const result = compileJSX(`function A({ items }: { items: string[] }) {
  return <div>{items.${js}(x => x === 'b')}</div>
}
export { A }`, 'A.tsx', { adapter })
      expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
      const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
      expect(template).toContain(`bf->${helper}($items,`)
      expect(template).toContain(`'x', ${fwd}, {})`)
      expect(template).not.toContain(`$bf->${helper}`)
    }
  })

  test('lowers .every / .some via the evaluator, with grep fallback for a method-call predicate', () => {
    // #2018 P2: a pure predicate routes `.every` / `.some` through
    // `bf->every_eval` / `bf->some_eval`; a method-call predicate the
    // evaluator can't model (`serializeParsedExpr` → null) falls back to the
    // inline `grep` form.
    const evalCases: Array<[string, string]> = [
      ['every', 'every_eval'],
      ['some', 'some_eval'],
    ]
    for (const [js, helper] of evalCases) {
      const adapter = new MojoAdapter()
      const result = compileJSX(`function A({ items }: { items: { done: boolean }[] }) {
  return <div>{items.${js}(x => x.done) ? 'y' : 'n'}</div>
}
export { A }`, 'A.tsx', { adapter })
      expect(result.errors?.filter(e => e.code === 'BF101') ?? []).toEqual([])
      const template = result.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
      expect(template).toContain(`bf->${helper}($items,`)
      expect(template).toContain('"property":"done"')
    }

    // #2075: `.includes(x)` is now in the evaluator surface (`array-method`
    // gate, shared with the Perl `Evaluator.pm` runtime), so a method-call
    // predicate built from it ALSO routes through `every_eval` rather than
    // falling back — it's no longer the "unsupported method call" example.
    const includesAdapter = new MojoAdapter()
    const includesResult = compileJSX(`function A({ items }: { items: { name: string }[] }) {
  return <div>{items.every(x => x.name.includes('a')) ? 'y' : 'n'}</div>
}
export { A }`, 'A.tsx', { adapter: includesAdapter })
    const includesTemplate = includesResult.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(includesTemplate).toContain('bf->every_eval($items,')
    expect(includesTemplate).toContain('"method":"includes"')
    expect(includesTemplate).not.toContain('grep {')

    // Fallback: a method-call predicate the evaluator still can't model
    // (`.toUpperCase()` is outside the `array-method` gate — only `includes`
    // is recognized there) keeps the inline grep form.
    const adapter = new MojoAdapter()
    const fb = compileJSX(`function A({ items }: { items: { name: string }[] }) {
  return <div>{items.every(x => x.name.toUpperCase() === 'A') ? 'y' : 'n'}</div>
}
export { A }`, 'A.tsx', { adapter })
    const fbTemplate = fb.files.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(fbTemplate).toContain('grep {')
    expect(fbTemplate).not.toContain('every_eval')
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
    expect(template).toContain("bf->join(bf->reverse($items), ' ')")
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
    expect(template).toContain("bf->join(bf->reverse($items), ' ')")
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
    expect(template).toContain("bf->join(bf->slice($items, 1, 3), ' ')")
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
    expect(template).toContain("bf->join(bf->slice($items, 2, undef), ' ')")
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
    expect(template).toContain("bf->join(bf->concat($left, $right), ' ')")
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
    expect(keys).toEqual(['JSON.stringify', 'Math.abs', 'Math.ceil', 'Math.floor', 'Math.max', 'Math.min', 'Math.round', 'Number', 'String', 'isValidElement'])
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
import { fixture as arraySliceCopyFixture } from '../../../adapter-tests/fixtures/methods/array-slice-copy'
import { fixture as arrayJoinDefaultFixture } from '../../../adapter-tests/fixtures/methods/array-join-default'
import { fixture as arrayAtDefaultFixture } from '../../../adapter-tests/fixtures/methods/array-at-default'
import { fixture as arrayConcatCopyFixture } from '../../../adapter-tests/fixtures/methods/array-concat-copy'
import { fixture as arrayReverseFixture } from '../../../adapter-tests/fixtures/methods/array-reverse'
import { fixture as arrayToReversedFixture } from '../../../adapter-tests/fixtures/methods/array-toReversed'
import { fixture as stringToLowerCaseFixture } from '../../../adapter-tests/fixtures/methods/string-toLowerCase'
import { fixture as stringToUpperCaseFixture } from '../../../adapter-tests/fixtures/methods/string-toUpperCase'
import { fixture as stringTrimFixture } from '../../../adapter-tests/fixtures/methods/string-trim'
// #1448 Tier B — string methods.
import { fixture as stringSplitFixture } from '../../../adapter-tests/fixtures/methods/string-split'
import { fixture as stringSplitLimitFixture } from '../../../adapter-tests/fixtures/methods/string-split-limit'
import { fixture as stringStartsWithFixture } from '../../../adapter-tests/fixtures/methods/string-startsWith'
import { fixture as stringStartsWithPositionFixture } from '../../../adapter-tests/fixtures/methods/string-startsWith-position'
import { fixture as stringEndsWithFixture } from '../../../adapter-tests/fixtures/methods/string-endsWith'
import { fixture as stringEndsWithPositionFixture } from '../../../adapter-tests/fixtures/methods/string-endsWith-position'
import { fixture as stringReplaceFixture } from '../../../adapter-tests/fixtures/methods/string-replace'
import { fixture as stringRepeatFixture } from '../../../adapter-tests/fixtures/methods/string-repeat'
import { fixture as stringPadStartFixture } from '../../../adapter-tests/fixtures/methods/string-padStart'
import { fixture as stringPadEndFixture } from '../../../adapter-tests/fixtures/methods/string-padEnd'
// #1448 Tier B — .sort / .toSorted fixtures (loop-chained + standalone).
import { fixture as arraySortFieldAscFixture } from '../../../adapter-tests/fixtures/methods/array-sort-field-asc'
import { fixture as arraySortFieldDescFixture } from '../../../adapter-tests/fixtures/methods/array-sort-field-desc'
import { fixture as arraySortPrimitiveFixture } from '../../../adapter-tests/fixtures/methods/array-sort-primitive'
import { fixture as arraySortLocaleFixture } from '../../../adapter-tests/fixtures/methods/array-sort-locale'
import { fixture as arraySortMultiKeyFixture } from '../../../adapter-tests/fixtures/methods/array-sort-multikey'
import { fixture as arraySortTernaryFixture } from '../../../adapter-tests/fixtures/methods/array-sort-ternary'
import { fixture as arrayToSortedFixture } from '../../../adapter-tests/fixtures/methods/array-toSorted'
// #1448 Tier B — .entries / .keys / .values iteration shapes.
import { fixture as arrayEntriesFixture } from '../../../adapter-tests/fixtures/methods/array-entries'
import { fixture as arrayKeysFixture } from '../../../adapter-tests/fixtures/methods/array-keys'
import { fixture as arrayValuesFixture } from '../../../adapter-tests/fixtures/methods/array-values'
// #1448 Tier C — .reduce(fn, init) arithmetic-fold catalogue.
import { fixture as reduceSumFieldFixture } from '../../../adapter-tests/fixtures/methods/reduce-sum-field'
import { fixture as reduceSumSelfFixture } from '../../../adapter-tests/fixtures/methods/reduce-sum-self'
import { fixture as reduceConcatFixture } from '../../../adapter-tests/fixtures/methods/reduce-concat'
import { fixture as reduceProductFixture } from '../../../adapter-tests/fixtures/methods/reduce-product'
import { fixture as reduceRightConcatFixture } from '../../../adapter-tests/fixtures/methods/reduce-right-concat'

describe('MojoAdapter - #1448 Tier A/B fixture-driven lowering pins', () => {
  const cases = [
    { fixture: arrayIncludesFixture,    expect: 'bf->includes($items, $target)' },
    { fixture: stringIncludesFixture,   expect: 'bf->includes($value, $needle)' },
    { fixture: arrayIndexOfFixture,     expect: 'bf->index_of($items, $target)' },
    { fixture: arrayLastIndexOfFixture, expect: 'bf->last_index_of($items, $target)' },
    { fixture: arrayAtFixture,          expect: 'bf->at($items, -1)' },
    { fixture: arrayConcatFixture,      expect: 'bf->concat($left, $right)' },
    { fixture: arraySliceFixture,       expect: 'bf->slice($items, 1, 3)' },
    // #1448 full-arity — zero-arg defaults.
    { fixture: arraySliceCopyFixture,   expect: 'bf->slice($items, 0, undef)' },
    { fixture: arrayJoinDefaultFixture, expect: `bf->join($items, ',')` },
    // `.at()` → index 0; `.concat()` → the receiver (shallow copy).
    { fixture: arrayAtDefaultFixture,   expect: 'bf->at($items, 0)' },
    { fixture: arrayConcatCopyFixture,  expect: `bf->join($items, '|')` },
    { fixture: arrayReverseFixture,     expect: 'bf->reverse($items)' },
    // .toReversed shares the helper with .reverse — pinning both
    // routings catches a future divergence between them.
    { fixture: arrayToReversedFixture,  expect: 'bf->reverse($items)' },
    { fixture: stringToLowerCaseFixture,expect: 'lc($value)' },
    { fixture: stringToUpperCaseFixture,expect: 'uc($value)' },
    { fixture: stringTrimFixture,       expect: 'bf->trim($value)' },
    // #1448 Tier B — string → array. `.split(',')` lowers to
    // `bf->split`, here chained into `.join('|')` so the array ref is
    // observable (`bf->join(bf->split($value, ','), '|')`).
    { fixture: stringSplitFixture,      expect: `bf->split($value, ',')` },
    { fixture: stringSplitLimitFixture, expect: `bf->split($value, ',', 2)` },
    // #1448 Tier B — string → boolean at condition position (`% if`).
    { fixture: stringStartsWithFixture, expect: 'bf->starts_with($value, $prefix)' },
    { fixture: stringStartsWithPositionFixture, expect: `bf->starts_with($value, 'world', 6)` },
    { fixture: stringEndsWithFixture,   expect: 'bf->ends_with($value, $suffix)' },
    { fixture: stringEndsWithPositionFixture,   expect: `bf->ends_with($value, 'hello', 5)` },
    // #1448 Tier B — string → string, first-occurrence replace.
    { fixture: stringReplaceFixture,    expect: `bf->replace($value, 'o', '0')` },
    // #1448 Tier B — string → string, repeat n times.
    { fixture: stringRepeatFixture,     expect: 'bf->repeat($value, 3)' },
    // #1448 Tier B — string → string, padded to a target width.
    { fixture: stringPadStartFixture,   expect: `bf->pad_start($value, 5, '0')` },
    { fixture: stringPadEndFixture,     expect: `bf->pad_end($value, 5, '.')` },
    // #1448 Tier B — sort / toSorted. EXPR2 migration (#2018): both a
    // STANDALONE `.sort(cmp)` value call AND the `.sort().map()` loop-hoist
    // (#2018 P3) serialize the comparator body and emit `bf->sort_eval(...)`
    // (JSON body + param names + captured env). `localeCompare` comparators
    // fall back to the structured `bf->sort` — `serializeParsedExpr` refuses
    // them. (Loop-hoist field cases pin only the helper + receiver; their
    // comparator JSON is verified by the render conformance.)
    { fixture: arraySortFieldAscFixture,  expect: `bf->sort_eval($items,` },
    { fixture: arraySortFieldDescFixture, expect: `bf->sort_eval($items,` },
    { fixture: arraySortPrimitiveFixture, expect: `bf->sort_eval($nums, '{"kind":"binary","op":"-","left":{"kind":"identifier","name":"a"},"right":{"kind":"identifier","name":"b"}}', 'a', 'b', {})` },
    // localeCompare → outside the evaluator surface → legacy `bf->sort`.
    { fixture: arraySortLocaleFixture,    expect: `bf->sort($names, { keys => [{ key_kind => 'self', compare_type => 'string', direction => 'asc' }] })` },
    // Multi-key (`||`-chain): the second key is a `localeCompare`, so the
    // whole comparator falls back to the structured `bf->sort` (one hash
    // per comparison key, in order).
    { fixture: arraySortMultiKeyFixture,  expect: `bf->sort($items, { keys => [{ key_kind => 'field', key => 'price', compare_type => 'numeric', direction => 'asc' }, { key_kind => 'field', key => 'name', compare_type => 'string', direction => 'asc' }] })` },
    // Relational-ternary comparator — a pure body, so the loop-hoist now
    // serializes it through `bf->sort_eval` like the other field sorts.
    { fixture: arraySortTernaryFixture,   expect: `bf->sort_eval($items,` },
    { fixture: arrayToSortedFixture,      expect: `bf->sort_eval($nums, '{"kind":"binary","op":"-","left":{"kind":"identifier","name":"a"},"right":{"kind":"identifier","name":"b"}}', 'a', 'b', {})` },
    // #1448 Tier B — iteration shapes. These are loop-level patterns.
    // .entries() → for loop with both $i index var and $v value var
    { fixture: arrayEntriesFixture,       expect: '% my $v = $items->[$i];' },
    // .keys() → for loop with $k as the index var, no value assignment
    { fixture: arrayKeysFixture,          expect: '% for my $k (0..$#{$items})' },
    // .values() → standard for loop (same as plain .map())
    { fixture: arrayValuesFixture,        expect: '% my $v = $items->[$_i];' },
    // #1448 Tier C — .reduce(fn, init) arithmetic fold. EXPR2 migration
    // (#2018): the reducer body is serialized to ParsedExpr JSON and
    // folded by `bf->reduce_eval(json, accName, itemName, init, direction,
    // env)` — the runtime evaluator subsumes the old `+`/`*` catalogue.
    // A numeric seed passes through bare (`0` / `1`); a concat seed as a
    // single-quoted string (`''`). Each shape exercises one arm: field-
    // numeric sum, self-numeric sum, string-concat fold, the product
    // (`*`) operator, and the right-to-left `direction` of reduceRight.
    { fixture: reduceSumFieldFixture,     expect: `bf->reduce_eval($items, '{"kind":"binary","op":"+","left":{"kind":"identifier","name":"sum"},"right":{"kind":"member","object":{"kind":"identifier","name":"t"},"property":"duration"}}', 'sum', 't', 0, 'left', {})` },
    { fixture: reduceSumSelfFixture,      expect: `bf->reduce_eval($nums, '{"kind":"binary","op":"+","left":{"kind":"identifier","name":"a"},"right":{"kind":"identifier","name":"b"}}', 'a', 'b', 0, 'left', {})` },
    { fixture: reduceConcatFixture,       expect: `bf->reduce_eval($items, '{"kind":"binary","op":"+","left":{"kind":"identifier","name":"acc"},"right":{"kind":"member","object":{"kind":"identifier","name":"x"},"property":"label"}}', 'acc', 'x', '', 'left', {})` },
    { fixture: reduceProductFixture,      expect: `bf->reduce_eval($items, '{"kind":"binary","op":"*","left":{"kind":"identifier","name":"acc"},"right":{"kind":"member","object":{"kind":"identifier","name":"x"},"property":"qty"}}', 'acc', 'x', 1, 'left', {})` },
    { fixture: reduceRightConcatFixture,  expect: `bf->reduce_eval($items, '{"kind":"binary","op":"+","left":{"kind":"identifier","name":"acc"},"right":{"kind":"member","object":{"kind":"identifier","name":"x"},"property":"label"}}', 'acc', 'x', '', 'right', {})` },
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

describe('MojoAdapter - #1448 Tier C .flat(depth?)', () => {
  function emitFlat(expr: string): string {
    const a = new MojoAdapter()
    const ir = compileToIR(`
function C({ rows }: { rows: { x: string }[][] }) {
  return <div>{${expr}}</div>
}
export { C }
`, a)
    return a.generate(ir).template ?? ''
  }

  test('.flat() emits bf->flat with default depth 1', () => {
    expect(emitFlat('rows.flat()')).toContain('bf->flat($rows, 1)')
  })

  test('.flat(2) emits the explicit depth', () => {
    expect(emitFlat('rows.flat(2)')).toContain('bf->flat($rows, 2)')
  })

  test('.flat(Infinity) emits the -1 full-depth sentinel', () => {
    expect(emitFlat('rows.flat(Infinity)')).toContain('bf->flat($rows, -1)')
  })
})

describe('MojoAdapter - #2075 searchParams()-derived memo seeding', () => {
  // A memo derived from the createSearchParams() env signal must seed
  // in-template from the canonical per-request `$searchParams` reader —
  // including under a local alias (`const [sp] = …`), which the expression
  // lowering canonicalises.
  test('seeds an aliased scalar derived memo from the canonical reader', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo, createSearchParams } from '@barefootjs/client'
export function SortStatus() {
  const [sp] = createSearchParams()
  const sort = createMemo(() => sp().get('sort') ?? 'date')
  return <p>sort: {sort()}</p>
}
`)
    expect(template).toContain("% my $sort = ($searchParams->get('sort') // 'date');")
  })

  // A list-filter memo chained off the derived memo seeds too: the inline
  // grep's `$_` topic and the callback param are lowering-internal bindings,
  // not out-of-scope template vars (the pre-#2075 availability check
  // rejected them and the list rendered empty at SSR).
  test('seeds a filter memo chained off the derived memo', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo, createSearchParams } from '@barefootjs/client'
export function TaggedList(props: { items: { title: string; tags: string[] }[] }) {
  const [searchParams] = createSearchParams()
  const tag = createMemo(() => searchParams().get('tag') ?? '')
  const visible = createMemo(() => props.items.filter((p) => !tag() || p.tags.includes(tag())))
  return <ul>{visible().map((p) => <li key={p.title}>{p.title}</li>)}</ul>
}
`)
    expect(template).toContain("% my $tag = ($searchParams->get('tag') // '');")
    expect(template).toMatch(/% my \$visible = \[grep/)
  })

  // The seed-scope guard used to scan the LOWERED
  // Perl string, allowing every arrow-callback param tree-wide. That let an
  // outer, unbound `p` (shadowed only inside the callback) slip past the
  // guard as if it were the callback's own bound `$p` — emitting a bogus
  // seed line that would crash Perl strict mode. The guard now walks the
  // parsed SOURCE tree with proper lexical scoping (`freeIdentifiers`), so
  // this shape seeds nothing and falls back to the null/ssr-defaults path.
  test('an outer unbound `p` shadowed only inside the callback does not seed', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function C(props: { items: { ok: boolean }[] }) {
  const visible = createMemo(() => props.items.filter((p) => p.ok) && p)
  return <div>{String(visible())}</div>
}
`)
    expect(template).not.toContain('my $visible')
  })

  // An out-of-scope bare `_` reference (not the `grep` topic var of an
  // in-scope higher-order lowering) must not seed either — the old
  // unconditional `allowed.add('_')` masked this.
  test('an out-of-scope bare `_` reference does not seed', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function C(props: { count: number }) {
  const doubled = createMemo(() => props.count * 2 + _)
  return <div>{doubled()}</div>
}
`)
    expect(template).not.toContain('my $doubled')
  })
})

describe('MojoAdapter - #2073 value-producing .map(cb)', () => {
  function emitMap(expr: string): string {
    const a = new MojoAdapter()
    const ir = compileToIR(`
function C({ tags, users }: { tags: string[]; users: { name: string }[] }) {
  return <div>{${expr}}</div>
}
export { C }
`, a)
    return a.generate(ir).template ?? ''
  }

  // The blog-showcase shape (#1938/#1939): a value-returning `.map` (string
  // projection, not JSX) lowers through the evaluator — `bf->map_eval`
  // projects each element (no flatten) and composes through `.join`.
  test('.map(t => `#${t}`).join(" ") emits bf->map_eval composed into join', () => {
    const t = emitMap("tags.map(t => `#${t}`).join(' ')")
    expect(t).toContain(`bf->join(bf->map_eval($tags,`)
    expect(t).toContain(`"kind":"template-literal"`)
  })

  test('.map(u => u.name) emits bf->map_eval with the field projection', () => {
    const t = emitMap("users.map(u => u.name).join(', ')")
    expect(t).toContain(`bf->map_eval($users,`)
    expect(t).toContain(`"property":"name"`)
  })

  // The function-reference `.map(format)` case is now covered cross-adapter
  // by the `array-map-function-reference` shared fixture — `format` resolves
  // to its declaration (#2206) and the fixture compiles clean rather than
  // refusing with BF101.
})

describe('MojoAdapter - #1448 Tier C .flatMap(field projection)', () => {
  function emitFlatMap(expr: string): string {
    const a = new MojoAdapter()
    const ir = compileToIR(`
function C({ rows }: { rows: { a: string; b: string; tags: string[] }[] }) {
  return <div>{${expr}}</div>
}
export { C }
`, a)
    return a.generate(ir).template ?? ''
  }

  // #2018 P3: `.flatMap(proj)` lowers through the evaluator — the projection
  // body serializes to ParsedExpr JSON and `bf->flat_map_eval` flattens the
  // results one level. (In Mojo the JSON rides in a single-quoted Perl string,
  // so its double quotes are literal and assertable.)
  test('.flatMap(i => i.field) emits bf->flat_map_eval with the field projection', () => {
    const t = emitFlatMap('rows.flatMap(i => i.tags).join(" ")')
    expect(t).toContain(`bf->flat_map_eval($rows,`)
    expect(t).toContain(`"property":"tags"`)
  })

  test('.flatMap(i => i) emits bf->flat_map_eval (self/identifier projection)', () => {
    const t = emitFlatMap('rows.flatMap(i => i).join(" ")')
    expect(t).toContain(`bf->flat_map_eval($rows,`)
    expect(t).toContain(`"kind":"identifier","name":"i"`)
  })

  test('.flatMap(i => [i.a, i.b]) emits bf->flat_map_eval over an array-literal projection', () => {
    const t = emitFlatMap('rows.flatMap(i => [i.a, i.b]).join(" ")')
    expect(t).toContain(`bf->flat_map_eval($rows,`)
    expect(t).toContain(`"kind":"array-literal"`)
  })

  test('field-projection flatMap as a loop base lowers (no BF101)', () => {
    const a = new MojoAdapter()
    const ir = compileToIR(`'use client'
import { createSignal } from '@barefootjs/client'
export function C() {
  const [items] = createSignal<{ tags: string[] }[]>([])
  return <ul>{items().flatMap(x => x.tags).map(t => <li key={t}>{t}</li>)}</ul>
}`, a)
    const template = a.generate(ir).template ?? ''
    expect((a.errors ?? []).filter(e => e.code === 'BF101')).toEqual([])
    expect(template).toContain(`bf->flat_map_eval($items,`)
  })
})

// =============================================================================
// #1448 — `/* @client */` escape hatch for STILL-UNSUPPORTED methods
// =============================================================================
//
// Mojo sibling of the Go block: #1448 documents `/* @client */` as the
// universal workaround for any Array/String method the template
// adapters can't lower. This pins that contract for the Mojo adapter —
// the BARE form must surface a BF021/BF101 build error, and wrapping
// the expression in the directive must clear it and emit a client-only
// placeholder so the Mojo SSR pass renders valid `.html.ep` the client
// runtime fills at hydration.
//
// History (#1448 follow-up): the unsupported *string* methods used to
// raise NO build diagnostic — bare `.startsWith` / `.repeat` / … fell
// into the regex pipeline and lowered to a Perl hash-deref-and-call
// (`$name->{startsWith}('a')`) that passed the gate, then died at
// render with `Can't use string (...) as a HASH ref while "strict
// refs"`. They are now routed through the AST path in
// `convertExpressionToPerl` so `isSupported`'s `UNSUPPORTED_METHODS`
// gate fires BF101 — parity with the Go adapter. These tests pin it.
describe('MojoAdapter - #1448 @client escape hatch (unsupported methods)', () => {
  function emit(expr: string, client: boolean) {
    const marker = client ? '/* @client */ ' : ''
    const adapter = new MojoAdapter()
    const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [items, setItems] = createSignal<{ name: string; n: number; tags: string[] }[]>([])
  const [name, setName] = createSignal("x")
  return <div>{${marker}${expr}}</div>
}
`, adapter)
    const template = adapter.generate(ir).template ?? ''
    return { errors: adapter.errors ?? [], template }
  }

  function emitLoop(chain: string, client: boolean) {
    const marker = client ? '/* @client */ ' : ''
    const adapter = new MojoAdapter()
    const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [items, setItems] = createSignal<{ name: string; n: number }[]>([])
  const myCmp = (a: { n: number }, b: { n: number }) => a.n - b.n
  return <ul>{${marker}${chain}}</ul>
}
`, adapter)
    const template = adapter.generate(ir).template ?? ''
    return { errors: adapter.errors ?? [], template }
  }

  // Unsupported methods that surface as BF101 at build time: Tier C
  // array methods + Tier B/C string methods. `badEmit` is the invalid
  // Perl fragment that must NOT survive into the template (the pre-fix
  // silent-footgun output for the string rows).
  const unsupported: Array<{ name: string; expr: string; badEmit: string }> = [
    // Tier C array methods. The arithmetic-fold `.reduce(fn, init)`
    // catalogue now lowers (pinned in the positive reduce-* fixtures);
    // the no-initial-value form stays refused — JS throws on an empty
    // array there, which a template can't mirror.
    { name: 'reduce (no init)', expr: `items().reduce((a, b) => a + b.n)`, badEmit: '->{reduce}' },
    // #2018 P5: an array-literal projection with a literal element
    // (`i => [i.name, "x"]`) now lowers through the runtime evaluator
    // (`bf->flat_map_eval`) rather than refusing — the structured-tuple
    // leaf restriction is gone. (Cross-adapter isomorphic with the Go
    // adapter's `bf_flat_map_eval`.) Pinned positively below.
    // Lowered methods whose MEANINGFUL extra argument isn't lowered yet
    // (#1448): the `fromIndex` of `.includes`/`.indexOf`/`.lastIndexOf`
    // and the variadic `.concat`. The parser refuses these (silently
    // dropping the arg would change the result). (The zero-arg defaults
    // `.join()`/`.slice()` and JS-ignored trailing args like `.trim(1)`
    // are accepted — pinned in the positive blocks.)
    { name: 'includes (2-arg fromIndex)', expr: `items().includes("a", 1)`, badEmit: '->{includes}' },
    { name: 'concat (variadic)', expr: `items().concat(items(), items())`, badEmit: '->{concat}' },
    // Tier B/C string methods — previously slipped through with no
    // diagnostic; now routed through the AST / `isSupported` gate. The
    // full Tier B string set (`split`, `startsWith`, `endsWith`,
    // `replace`, `repeat`, `padStart`, `padEnd`) has since landed its
    // full-arity lowering and moved to the positive fixture-pin block
    // above (the regex-pattern `replace` form stays refused — pinned
    // separately below). `charAt` is Tier C and stays refused entirely.
    { name: 'charAt', expr: `name().charAt(0)`, badEmit: '->{charAt}' },
  ]
  for (const { name, expr, badEmit } of unsupported) {
    test(`.${name}: bare raises BF101, @client clears it + emits client placeholder`, () => {
      const bare = emit(expr, false)
      expect(bare.errors.some(e => e.code === 'BF101')).toBe(true)
      // The invalid deref-and-call must NOT leak into the template;
      // the adapter degrades to a safe empty slot alongside the error.
      expect(bare.template).not.toContain(badEmit)

      const guarded = emit(expr, true)
      expect(guarded.errors).toEqual([])
      // Client-only text slot → `<%== bf->comment("client:sN") %>`.
      expect(guarded.template).toMatch(/bf->comment\("client:s\d+"\)/)
      expect(guarded.template).not.toContain(badEmit)
    })
  }

  // Routing guard regression: the unsupported-string-method regex is an
  // unanchored substring test, and these names (`replace`, `split`, …)
  // are ordinary words that also appear inside string literals. A
  // SUPPORTED expression whose literal merely contains `.replace(` must
  // NOT be diverted onto the AST path — doing so would bypass
  // `rewriteTemplatePrimitives` and silently emit broken Perl
  // (`$JSON->{stringify} + '.replace('`). The `isSupported` gate on the
  // regex keeps such expressions on the normal pipeline.
  test('string-method regex does not misroute a supported expr with a method name inside a literal', () => {
    const adapter = new MojoAdapter()
    const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C(props: { config: string }) {
  return <div>{JSON.stringify(props.config) + ".replace("}</div>
}
`, adapter)
    const template = adapter.generate(ir).template ?? ''
    expect(adapter.errors ?? []).toEqual([])
    // templatePrimitive lowering preserved...
    expect(template).toContain('bf->json($config)')
    // ...and the literal is NOT mangled into a hash-deref.
    expect(template).not.toContain('$JSON->{stringify}')
  })

  // Predicate-level use of an unsupported string method also fails the
  // build loudly (intended): a `.filter(t => t.name.charAt(0) === "a")`
  // whose predicate calls one of the gated methods now refuses the whole
  // loop with BF101 (via the shared `isSupported` predicate gate in
  // jsx-to-ir) rather than lowering to a broken `->{charAt}` inside
  // the grep. Pinning this so the loud-failure contract can't silently
  // regress back to the old emit-broken-template behaviour. (`charAt`
  // is a Tier C method that stays refused — earlier this test used
  // `startsWith`, which has since landed its Tier B lowering.)
  test('unsupported string method inside a .filter() predicate raises BF101', () => {
    const result = compileJSX(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [items, setItems] = createSignal<{ name: string }[]>([])
  return <ul>{items().filter(t => t.name.charAt(0) === "a").map(t => <li key={t.name}>{t.name}</li>)}</ul>
}
`.trimStart(), 'test.tsx', { adapter: new MojoAdapter() })
    expect(result.errors?.some(e => e.code === 'BF101')).toBe(true)
  })

  // The string-pattern form of `.replace` lowers (#1448 Tier B), but
  // the regex-pattern form stays refused with BF101 — the Perl `s///`
  // vs Go `regexp.ReplaceAllString` flavour gap is the open design
  // question. Pinning the refusal so it can't regress into a broken
  // `->{replace}` emit for the regex form.
  test('regex-pattern .replace raises BF101 (string-pattern form is lowered)', () => {
    const result = compileJSX(`
function C({ value }: { value: string }) {
  return <div>{value.replace(/o/g, "0")}</div>
}
export { C }
`.trimStart(), 'test.tsx', { adapter: new MojoAdapter() })
    expect(result.errors?.some(e => e.code === 'BF101')).toBe(true)
    const template = result.files?.find(f => f.path.endsWith('.html.ep'))?.content ?? ''
    expect(template).not.toContain('->{replace}')
  })

  // Tier B `.sort` / `.toSorted` follow-ups still refused with BF021.
  // The Mojo client-only loop placeholder is an empty element (the
  // client runtime repopulates it via the `bf-s` scope marker), so the
  // contract here is: no errors + the comparator never lowers + no
  // rendered `<li>` survives.
  const unsupportedSort: Array<[string, string]> = [
    ['localeCompare locale/options arg', `items().toSorted((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true })).map(x => <li key={x.name}>{x.name}</li>)`],
  ]
  for (const [label, chain] of unsupportedSort) {
    test(`sort follow-up (${label}): bare raises BF021, @client clears it`, () => {
      const bare = compileJSX(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [items, setItems] = createSignal<{ name: string; n: number }[]>([])
  const myCmp = (a: { n: number }, b: { n: number }) => a.n - b.n
  return <ul>{${chain}}</ul>
}
`.trimStart(), 'test.tsx', { adapter: new MojoAdapter() })
      expect(bare.errors?.some(e => e.code === 'BF021')).toBe(true)

      const guarded = emitLoop(chain, true)
      expect(guarded.errors).toEqual([])
      // Empty client-only loop placeholder — no item rows emitted SSR.
      expect(guarded.template).not.toContain('<li')
      expect(guarded.template).not.toContain('localeCompare')
    })
  }

  // #2090: a function-reference comparator (`.toSorted(myCmp)`, `myCmp` a
  // same-file const arrow) now resolves through the analyzer's scope
  // machinery and compiles — no BF021, and the sort lowers exactly like an
  // inline comparator (a `bf->sort` / `bf->sort_eval` call in the template).
  test('sort follow-up (function-reference comparator): resolves and compiles without BF021', () => {
    const chain = `items().toSorted(myCmp).map(x => <li key={x.name}>{x.name}</li>)`
    const result = emitLoop(chain, false)
    expect(result.errors).toEqual([])
    expect(result.template).toMatch(/bf->sort/)
  })

  // End-to-end proof via perl + Mojolicious: the `@client` form renders
  // a `<!--bf-client:sN-->` placeholder. The bare form is now caught at
  // build with BF101 and degrades to an empty, render-safe slot (no
  // more `HASH ref` crash), so we assert the build error rather than a
  // render crash. Skipped on hosts without Mojolicious installed.
  test('e2e: @client renders placeholder; bare is caught at build with BF101', async () => {
    // Uses the Tier C `charAt` (still refused) — earlier this test used
    // `repeat`, which has since landed its #1448 Tier B lowering.
    const bare = emit(`name().charAt(0)`, false)
    expect(bare.errors.some(e => e.code === 'BF101')).toBe(true)

    try {
      const html = await renderMojoComponent({
        source: `
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [name, setName] = createSignal("hello")
  return <div>{/* @client */ name().charAt(0)}</div>
}
`.trimStart(),
        adapter: new MojoAdapter(),
      })
      expect(html).toContain('<!--bf-client:s0-->')
    } catch (err) {
      if (err instanceof PerlNotAvailableError) {
        console.log('Skipping #1448 @client e2e: perl/Mojolicious not found')
        return
      }
      throw err
    }
  })
})

// =============================================================================
// #1682: parse-first expression lowering regressions
// =============================================================================
// The parse-first refactor routes every supported expression through the
// AST emitter. These pin the four behaviours the Copilot review surfaced
// so they can't silently regress.
describe('MojoAdapter - #1682 parse-first lowering', () => {
  function gen(inner: string) {
    const adapter = new MojoAdapter()
    const out = compileAndGenerate(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [role, setRole] = createSignal("admin")
  const [count, setCount] = createSignal(1)
  const [obj, setObj] = createSignal({ a: 1 })
  const [it, setIt] = createSignal("x")
  return <div>{${inner}}</div>
}
`, adapter)
    return { template: out.template ?? '', errors: adapter.errors ?? [] }
  }

  test('string === lowers to Perl eq with the literal on EITHER operand', () => {
    // Reversed literal (`"admin" === role()`) must still use string `eq`,
    // not numeric `==` (which coerces both sides to 0 in Perl).
    const { template } = gen('"admin" === role() ? "A" : "B"')
    expect(template).toContain("'admin' eq $role")
    expect(template).not.toContain("'admin' ==")
    expect(template).not.toContain("== 'admin'")
  })

  test('template literal with a complex expr lowers to Perl concatenation', () => {
    // Double-quote interpolation would leave `+ 1` unevaluated; concat
    // (with parens for precedence) evaluates the arithmetic.
    const { template } = gen('`n=${count() + 1}`')
    expect(template).toContain('"n=" . ($count + 1)')
  })

  test('static template-literal text escapes Perl $ and @ sigils', () => {
    const { template } = gen('`Price: $${it()} @user`')
    expect(template).toContain('\\$')
    expect(template).toContain('\\@user')
  })

  test('wrong-arity templatePrimitive records BF101 and emits no hash-deref', () => {
    const { template, errors } = gen('JSON.stringify(obj(), null)')
    expect(errors.some(e => e.code === 'BF101')).toBe(true)
    // The invalid `$JSON->{stringify}` hash-deref must NOT leak out.
    expect(template).not.toContain('$JSON->{stringify}')
  })
})

// =============================================================================
// #1966 — `/* @client */` defers ATTRIBUTE bindings (not just child/text)
// =============================================================================
//
// `renderAttributes` skips SSR emission for `attr.clientOnly`, so a
// deferred attribute predicate is omitted from the Mojo template (and the
// unsupported-expression lowering is never reached → no BF101/BF102). The
// client runtime sets the attribute on hydrate. Mirrors the Go pins.
describe('MojoAdapter - #1966 @client defers attribute bindings', () => {
  function compileAttr(attrExpr: string) {
    const adapter = new MojoAdapter()
    const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [sel] = createSignal(0)
  const pred = (n: number) => sel() === n
  return <div data-x={${attrExpr}}>hi</div>
}
`, adapter)
    const template = adapter.generate(ir).template ?? ''
    const errors = (adapter as unknown as { errors: { code: string }[] }).errors ?? []
    return { errors, template }
  }

  test('bare emits data-x; @client omits it from SSR', () => {
    expect(compileAttr('pred(1)').template).toContain('data-x')
    const deferred = compileAttr('/* @client */ pred(1)')
    expect(deferred.errors).toEqual([])
    expect(deferred.template).not.toContain('data-x')
  })
})

describe('MojoAdapter - named-slot capture identifier safety (#2168 jsx-element-prop)', () => {
  // A JSX-valued prop under a hyphenated name (`data-slot`, a valid JSX
  // attribute name) must not leak into the `begin %>...<% end` capture
  // variable — Perl variable tokens can't contain `-`. The capture
  // variable is purely counter-based (never derived from the prop name);
  // the hash KEY passed to `render_child` still carries the real name,
  // quoted via `perlHashKey`.
  test('a hyphenated prop name does not appear in the capture variable', () => {
    const { template } = compileAndGenerate(`
function Card(props) { return null }
export function Parent() {
  return <Card data-slot={<strong>Title</strong>}>text</Card>
}
`)
    expect(template).toContain('<% my $bf_prop_0 = begin %>')
    expect(template).toContain("'data-slot' => $bf_prop_0")
    expect(template).not.toContain('$bf_prop_data')
  })
})
