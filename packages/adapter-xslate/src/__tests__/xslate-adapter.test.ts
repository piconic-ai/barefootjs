/**
 * XslateAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the Text::Xslate (Kolon)
 * adapter, rendering each fixture end-to-end through real Text::Xslate +
 * `BarefootJS::Backend::Xslate` via `renderXslateComponent`.
 *
 * The Xslate adapter was ported from the Mojolicious adapter and shares
 * its Perl-scoping + SSR-context limitations, so the skip / diagnostic
 * sets below start from mojo's and diverge only where the engine
 * genuinely differs. Every divergence carries a one-line rationale.
 */

import { describe, test, expect } from 'bun:test'
import { runAdapterConformanceTests } from '@barefootjs/adapter-tests'
import { XslateAdapter } from '../adapter'
import { renderXslateComponent, XslateNotAvailableError } from '../test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { conformancePins } from '../conformance-pins'
import { renderDivergences } from '../render-divergences'

runAdapterConformanceTests({
  name: 'xslate',
  factory: () => new XslateAdapter(),
  render: renderXslateComponent,
  // Priority-12 edge-case sweep (炙り出し, #2168): render-level
  // divergences are declared in `../render-divergences` (exported from the
  // package index and published to `ui/compat.lock.json` / the docs
  // compatibility-matrix page by `packages/compat`). Deriving the skip
  // list from that object keeps the public declaration and these test
  // skips from drifting; each entry's rationale lives there.
  skipJsx: Object.keys(renderDivergences),
  // (Pre-sweep note) Otherwise no JSX-render skips: every shared conformance fixture — including
  // the composed `site/ui` demo corpus (#1467 / #1897) — renders to
  // Hono parity on real Text::Xslate. `data-table` came off via the
  // body-children `inLoop` reset (#1896): the loop-item component
  // (TableRow) still gets `ComponentName_<random>` scope IDs, but its
  // body children (TableCell) now receive `_bf_slot` for deterministic
  // parent-scope-derived IDs matching Hono.
  // Per-fixture build-time contracts for shapes the Xslate adapter
  // intentionally refuses to lower. Lives in `../conformance-pins` —
  // mirrors mojo's set (the lowering gates are shared code paths in
  // the ported adapter).
  expectedDiagnostics: conformancePins,
  // Template-primitive registry: `USER_IMPORT_VIA_CONST` and
  // `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` now pass (#2069) — a bespoke user
  // import can never be added to the string-keyed registry, but the
  // shared `RelocateEnv.loweringMatchers` acceptance path recognises it
  // via a `LoweringPlugin` the case setup registers around the compile
  // (see `packages/adapter-tests/src/cases/template-primitives.ts`). No
  // skips left, so `skipTemplatePrimitives` is omitted entirely.
  // `client-only` / `client-only-loop-with-sibling-cond` /
  // `filter-nested-callback-predicate-client` are no longer skipped —
  // `renderLoop` now emits the `$bf.comment("loop:<id>")` boundary pair
  // for clientOnly loops (Hono / Go parity), so mapArray() can locate
  // its insertion anchor at hydration time (#872 / #1087).
  skipMarkerConformance: new Set([
    // Same as Hono / Mojo: `/* @client */` markers on TodoApp's keyed
    // `.map` intentionally elide a slot id from the SSR template that
    // the IR still declares (s6). See hono-adapter.test for the contract.
    'todo-app',
    // #1467 Phase 2e: same `/* @client */` keyed-map elision (data-table).
    'data-table',
  ]),
  skipDataPoints: new Set<string>([
    // #2260 — controlled boolean props: the SSR seed evaluates only the
    // static fallback of `props.X ?? internal()` chains.
    'toggle:gen:pressed:true',
    'switch:gen:checked:true',
    'checkbox:gen:checked:true',
    // #2261 — invalid dynamic CSS value kept (escaped) where the oracle
    // drops the property.
    'style-object-dynamic:gen:color:markup',
    // #2262 — dynamic `.flat` depth 0/negative violates the documented
    // shallow-copy contract (shared with the Mojo Perl runtime).
    'array-flat-dynamic-depth:gen:depth:zero',
    'array-flat-dynamic-depth:gen:depth:negative',
  ]),
  onRenderError: (err, id) => {
    if (err instanceof XslateNotAvailableError) {
      console.log(`Skipping [${id}]: ${err.message}`)
      return true
    }
    return false
  },
})

// =============================================================================
// Helpers
// =============================================================================

function compileToIR(source: string): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: new XslateAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string) {
  return new XslateAdapter().generate(compileToIR(source))
}

// =============================================================================
// Xslate-Specific Tests
// =============================================================================

describe('XslateAdapter - SSR context propagation (#1297)', () => {
  // `<Ctx.Provider value>` brackets its children with inline provide/revoke
  // calls (both return '' so the `<: … :>` discards them); descendant
  // `useContext` consumers read the value during the same render.
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
    expect(template).toContain("$bf.provide_context('ThemeContext', 'dark')")
    expect(template).toContain("$bf.revoke_context('ThemeContext')")
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
    expect(template).toContain(": my $theme = $bf.use_context('ThemeContext', 'light');")
  })
})

describe('XslateAdapter - prop-derived memo SSR seeding (#1297)', () => {
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
    expect(template).toContain(': my $displayValue = $value * 10;')
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
    expect(template).toContain(': my $displayValue = $value * 10;')
  })
})

describe('XslateAdapter - prop-derived signal SSR seeding + data-key (#1297, toggle-shared)', () => {
  test('seeds a prop-derived (different-name) signal from the prop var', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Item(props: { defaultOn?: boolean }) {
  const [on, setOn] = createSignal(props.defaultOn ?? false)
  return <button>{on() ? 'ON' : 'OFF'}</button>
}
`)
    expect(template).toContain(': my $on = ($defaultOn // 0);')
  })

  // Kolon can't `: my $x = … $x …`; a same-name signal stays on the existing
  // (harness/manifest) seeding rather than an in-template seed.
  test('does NOT in-template-seed a same-name signal', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { x?: number }) {
  const [x, setX] = createSignal(props.x ?? 7)
  return <span>{x()}</span>
}
`)
    expect(template).not.toContain(': my $x =')
  })

  test('emits data_key_attr on the component root', () => {
    const { template } = compileAndGenerate(`
export function Item() { return <div class="x">hi</div> }
`)
    expect(template).toContain('$bf.data_key_attr()')
  })

  test('emits data_key_attr on each branch root of an if-statement root', () => {
    const { template } = compileAndGenerate(`
export function Item({ on }: { on?: boolean }) {
  if (on) return <div class="a">A</div>
  return <div class="b">B</div>
}
`)
    const count = (template.match(/\$bf\.data_key_attr\(\)/g) ?? []).length
    expect(count).toBe(2)
  })
})

// =============================================================================
// #1966 — `/* @client */` defers ATTRIBUTE bindings (not just child/text)
// =============================================================================
//
// `renderAttributes` skips SSR emission for `attr.clientOnly`, so a
// deferred attribute predicate is omitted from the Xslate template (and the
// unsupported-expression lowering is never reached → no BF101/BF102). The
// client runtime sets the attribute on hydrate. Mirrors the Go pins.
describe('XslateAdapter - #1966 @client defers attribute bindings', () => {
  function compileAttr(attrExpr: string) {
    const adapter = new XslateAdapter()
    const ir = compileToIR(`
"use client"
import { createSignal } from "@barefootjs/client"
export function C() {
  const [sel] = createSignal(0)
  const pred = (n: number) => sel() === n
  return <div data-x={${attrExpr}}>hi</div>
}
`)
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

// #2018 P2: higher-order predicates lower through the runtime evaluator
// (`$bf.*_eval`), isomorphic with the Go / Mojo `*_eval` helpers. A predicate
// the evaluator can't model (a method-call predicate) falls back to the Kolon
// lambda runtime call. Template-text pins guard against silent divergence.
describe('XslateAdapter - #2075 searchParams()-derived memo seeding', () => {
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
    expect(template).toContain(": my $sort = ($searchParams.get('sort') // 'date');")
  })

  // The Kolon lambda param and the `$bf` runtime object are
  // lowering-internal, not out-of-scope template vars (#2075).
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
    expect(template).toContain(": my $tag = ($searchParams.get('tag') // '');")
    expect(template).toContain(': my $visible = $bf.filter($items,')
  })

  // The seed-scope guard used to scan the LOWERED
  // Kolon string, allowing every arrow-callback param tree-wide. That let an
  // outer, unbound `p` (shadowed only inside the callback) slip past the
  // guard as if it were the callback's own bound `$p` — emitting a bogus
  // seed line. The guard now walks the parsed SOURCE tree with proper
  // lexical scoping (`freeIdentifiers`), so this shape seeds nothing and
  // falls back to the null/ssr-defaults path.
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

  // An out-of-scope bare `_` reference must not seed either — the old
  // unconditional `allowed.add('_')` / `allowed.add('bf')` masked this.
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

describe('XslateAdapter - #2073 value-producing .map(cb)', () => {
  // The blog-showcase shape (#1938/#1939): a value-returning `.map` (string
  // projection, not JSX) lowers through the evaluator — `$bf.map_eval`
  // projects each element (no flatten) and composes through `$bf.join`.
  test('.map(t => `#${t}`).join(" ") emits $bf.map_eval composed into $bf.join', () => {
    const { template } = compileAndGenerate(`
function TagLine({ tags }: { tags: string[] }) {
  return <p>{tags.map((t) => \`#\${t}\`).join(' ')}</p>
}
export { TagLine }
`)
    expect(template).toContain("$bf.join($bf.map_eval($tags,")
    expect(template).toContain('"kind":"template-literal"')
  })

  test('.map(u => u.name) emits $bf.map_eval with the field projection', () => {
    const { template } = compileAndGenerate(`
function NameList({ users }: { users: { name: string }[] }) {
  return <div>{users.map((u) => u.name).join(', ')}</div>
}
export { NameList }
`)
    expect(template).toContain('$bf.map_eval($users,')
    expect(template).toContain('"property":"name"')
  })
})

describe('XslateAdapter - higher-order predicate lowering (#2018 P2)', () => {
  test('a serializable predicate lowers to $bf.filter_eval with the JSON body + env', () => {
    // A standalone `.filter().length` exercises the higher-order emitter (the
    // `.filter().map()` form is a loop-hoist with an inline `: if`, handled by
    // renderLoop, not this emitter).
    const { template } = compileAndGenerate(`
function A({ items }: { items: { done: boolean }[] }) {
  return <div>{items.filter(x => x.done).length}</div>
}
export { A }
`)
    expect(template).toContain('$bf.filter_eval(')
    expect(template).toContain('"property":"done"')
    expect(template).toContain("'x'")
  })

  test('.find / .findLast share $bf.find_eval, distinguished by the forward flag', () => {
    const find = compileAndGenerate(`
function A({ items }: { items: { done: boolean }[] }) {
  return <div>{items.find(x => x.done) ? 'y' : 'n'}</div>
}
export { A }
`).template
    expect(find).toContain('$bf.find_eval(')
    expect(find).toContain(', 1, {})')

    const findLast = compileAndGenerate(`
function A({ items }: { items: { done: boolean }[] }) {
  return <div>{items.findLast(x => x.done) ? 'y' : 'n'}</div>
}
export { A }
`).template
    expect(findLast).toContain('$bf.find_eval(')
    expect(findLast).toContain(', 0, {})')
  })

  test('.includes() in a predicate now lowers via the evaluator, not the Kolon-lambda fallback', () => {
    // #2075: `.includes(x)` joined the evaluator's `array-method` surface
    // (shared with the Perl `Evaluator.pm` runtime), so a predicate built
    // from it routes through `$bf.every_eval` like any other pure predicate.
    const { template } = compileAndGenerate(`
function A({ items }: { items: { name: string }[] }) {
  return <div>{items.every(x => x.name.includes('a')) ? 'y' : 'n'}</div>
}
export { A }
`)
    expect(template).toContain('$bf.every_eval(')
    expect(template).toContain('"method":"includes"')
    expect(template).not.toContain('-> $x {')
  })

  test('a method-call predicate outside the evaluator surface falls back to the Kolon-lambda runtime call', () => {
    const { template } = compileAndGenerate(`
function A({ items }: { items: { name: string }[] }) {
  return <div>{items.every(x => x.name.toUpperCase() === 'A') ? 'y' : 'n'}</div>
}
export { A }
`)
    // `.toUpperCase()` is outside the evaluator's `array-method` gate (only
    // `includes` is recognized there), so the predicate keeps the
    // `-> $x { … }` lambda form passed to the runtime `$bf.every`.
    expect(template).not.toContain('every_eval')
    expect(template).toContain('$bf.every(')
    expect(template).toContain('-> $x {')
  })
})

describe('XslateAdapter - named-slot capture identifier safety (#2168 jsx-element-prop)', () => {
  // A JSX-valued prop under a hyphenated name (`data-slot`, a valid JSX
  // attribute name) must not leak into the Kolon macro's identifier — Kolon
  // macro names can't contain `-`. The macro name is purely counter-based
  // (never derived from the prop name); the hash KEY passed to
  // `render_child` still carries the real name, quoted via `kolonHashKey`.
  test('a hyphenated prop name does not appear in the macro name', () => {
    const { template } = compileAndGenerate(`
function Card(props) { return null }
export function Parent() {
  return <Card data-slot={<strong>Title</strong>}>text</Card>
}
`)
    expect(template).toContain('<: macro bf_prop_0 -> ()')
    expect(template).toContain("'data-slot' => bf_prop_0()")
    expect(template).not.toContain('data-slot -> ()')
    expect(template).not.toContain('data-slot_')
  })
})

// #2038 nested-callback-predicate loudness is pinned at the shared
// conformance layer: `filter-nested-callback-predicate` /
// `filter-nested-find-predicate` (BF101 via `expectedDiagnostics` above) and
// `filter-nested-callback-predicate-client` (the `/* @client */` suppression
// twin, which must render clean).

// #2221: `_resolveLiteralConst` is a flat name lookup against
// `ir.metadata.localConstants` with no notion of AST scope — it used to
// substitute an outer const's literal value even at an occurrence that is
// actually an enclosing loop callback's own (shadowing) parameter, so every
// iteration rendered the same hard-coded literal. Guarded with the same
// coarse `collectLoopBoundNames` exclusion as #2212: any name a loop binds
// anywhere in the component never inlines, falling back to the bare
// identifier.
describe('XslateAdapter - const inlining vs loop-param shadowing (#2221)', () => {
  test('a loop param shadowing an outer literal const emits the identifier, not the const value', () => {
    const { template } = compileAndGenerate(`
function Widget() {
  const label: string = 'x'
  return <ul>{[2, 5].map((label) => <li key={label}>{1 + label}</li>)}</ul>
}
`)
    // The loop body must reference the per-iteration loop var...
    expect(template).toContain('1 + $label')
    // ...never the outer const's hard-coded value.
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

  // The accepted coarse-exclusion trade-off (same as #2212): a name that is
  // loop-bound ANYWHERE in the component never inlines, even at a genuinely
  // non-shadowed occurrence outside the loop — the bare identifier is
  // emitted instead of the value.
  test('a const referenced outside the loop whose name is loop-bound elsewhere falls back to the identifier (accepted trade-off)', () => {
    const { template } = compileAndGenerate(`
function Widget({ values }: { values: number[] }) {
  const label: string = 'x'
  return <div>
    <p>{1 + label}</p>
    <ul>{values.map((label) => <li key={label}>{2 + label}</li>)}</ul>
  </div>
}
`)
    expect(template).not.toContain("1 + 'x'")
    expect(template).toContain('2 + $label')
  })
})

// #2237: `_resolveStaticRecordLiteral` (`IDENT.key` on a module-scope
// object-literal const, e.g. `variantClasses.ghost` — #1896/#1897) is a
// flat name lookup on `objectName` with no notion of AST scope, the
// record-literal sibling of #2221's `_resolveLiteralConst` bug. It used to
// substitute the outer const's member value even at an occurrence that is
// actually an enclosing loop callback's own (shadowing) parameter, so every
// iteration rendered the same hard-coded literal instead of the per-item
// value. Guarded with the same coarse `staticLoopSourceBoundNames`
// exclusion as #2221: any name a loop binds anywhere in the component
// never inlines, falling back to the bare `$cfg.x` member expression.
describe('XslateAdapter - record-literal member lookup vs loop-param shadowing (#2237)', () => {
  test('a loop param shadowing an outer module object const emits the member access, not the outer literal', () => {
    const { template } = compileAndGenerate(`
const cfg = { x: 'outer-lit' }
function Widget({ rows }: { rows: { x: string }[] }) {
  return <ul>{rows.map((cfg) => <li key={cfg.x}>{cfg.x}</li>)}</ul>
}
`)
    // The loop body must reference the per-iteration member access...
    expect(template).toContain('<: $cfg.x :>')
    // ...never the outer const's hard-coded value.
    expect(template).not.toContain("<: 'outer-lit' :>")
  })

  test('a module object const NOT shadowed by any loop still inlines (variantClasses.ghost shape, #1896/#1897 pin)', () => {
    const { template } = compileAndGenerate(`
const variantClasses = { solid: 'bg-solid', ghost: 'bg-ghost' }
function Widget({ variant }: { variant: 'solid' | 'ghost' }) {
  return <div>{variantClasses.ghost}</div>
}
`)
    expect(template).toContain("<: 'bg-ghost' :>")
  })

  // The accepted coarse-exclusion trade-off (same as #2221/#2212): an
  // object name that is loop-bound ANYWHERE in the component never
  // inlines its member lookups, even at a genuinely non-shadowed
  // occurrence outside the loop — the bare member expression is emitted
  // instead of the value.
  test('a record member referenced outside the loop whose object name is loop-bound elsewhere falls back to the member expression (accepted trade-off)', () => {
    const { template } = compileAndGenerate(`
const cfg = { x: 'outer-lit' }
function Widget({ rows }: { rows: { x: string }[] }) {
  return <div>
    <p>{cfg.x}</p>
    <ul>{rows.map((cfg) => <li key={cfg.x}>{cfg.x}</li>)}</ul>
  </div>
}
`)
    expect(template).not.toContain("<: 'outer-lit' :>")
    expect(template).toContain('<: $cfg.x :>')
  })
})
