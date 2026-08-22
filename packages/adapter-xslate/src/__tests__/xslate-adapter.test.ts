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
  skipDataPoints: new Set<string>(),
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

describe('XslateAdapter - fragment scope comment begin/end pairing (#2289)', () => {
  // A fragment-rooted component's scope comment needs a paired END marker
  // immediately after its last top-level node — without it, client-side
  // queries from the fragment scope leak onto later siblings owned by the
  // parent. `wrapWithScopeComment`'s Hono shape is the reference; this
  // pins the Kolon `renderFragment` mirror.
  test('emits scope_comment before and scope_comment_end after the fragment children', () => {
    const { template } = compileAndGenerate(`
export function FragmentDemo() {
  return <><span>A</span><span>B</span></>
}
`)
    expect(template).toContain('$bf.scope_comment() | mark_raw')
    expect(template).toContain('$bf.scope_comment_end() | mark_raw')
    expect(template.indexOf('scope_comment()')).toBeLessThan(template.indexOf('scope_comment_end()'))
    // The end marker directly follows the fragment's rendered children —
    // no other node interposes between the last child and the end marker.
    const endIdx = template.indexOf('scope_comment_end()')
    expect(template.slice(endIdx - 40, endIdx)).toContain('<span>B</span>')
  })

  test('does not emit the end marker for a non-fragment (single-root) component', () => {
    const { template } = compileAndGenerate(`
export function Single() {
  return <div>A</div>
}
`)
    expect(template).not.toContain('scope_comment')
  })
})

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

  // Kolon can't `: my $x = … $x …` directly (the declaration shadows the
  // RHS's own reference), so a same-name signal captures the lowered
  // expression into a throwaway `__bf_seed_<name>` local BEFORE `$x` is
  // declared, then binds `$x` off that capture (#2679).
  test('in-template-seeds a same-name signal via capture-before-shadow', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { x?: number }) {
  const [x, setX] = createSignal(props.x ?? 7)
  return <span>{x()}</span>
}
`)
    expect(template).toContain(': my $__bf_seed_x = ($x // 7);')
    expect(template).toContain(': my $x = $__bf_seed_x;')
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
// iteration rendered the same hard-coded literal. Guarded via the threaded,
// position-accurate `BindingScope` (#2482 Stage 2 — previously a coarse
// whole-component exclusion, same as #2212's, that also suppressed a
// genuinely non-shadowed occurrence outside the loop; the threaded scope
// only shadows AT the enclosing loop's own body).
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

  // Position-accurate scope (#2482 Stage 2): a name that is loop-bound
  // elsewhere in the component but NOT at THIS occurrence still inlines
  // here — the coarse whole-component exclusion this used to hit (and
  // accept as a trade-off) is gone; only the loop's own body shadows.
  test('a const referenced outside the loop whose name is loop-bound elsewhere still inlines outside, stays the identifier inside', () => {
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
})

// #2237: `_resolveStaticRecordLiteral` (`IDENT.key` on a module-scope
// object-literal const, e.g. `variantClasses.ghost` — #1896/#1897) is a
// flat name lookup on `objectName` with no notion of AST scope, the
// record-literal sibling of #2221's `_resolveLiteralConst` bug. It used to
// substitute the outer const's member value even at an occurrence that is
// actually an enclosing loop callback's own (shadowing) parameter, so every
// iteration rendered the same hard-coded literal instead of the per-item
// value. Guarded via the threaded, position-accurate `BindingScope` (#2482
// Stage 2), same as #2221's fix above.
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

  // Position-accurate scope (#2482 Stage 2): an object name that is
  // loop-bound elsewhere in the component but NOT at THIS occurrence still
  // inlines its member lookup here — the coarse whole-component exclusion
  // this used to hit (and accept as a trade-off) is gone; only the loop's
  // own body shadows.
  test('a record member referenced outside the loop whose object name is loop-bound elsewhere still inlines outside, stays the member expression inside', () => {
    const { template } = compileAndGenerate(`
const cfg = { x: 'outer-lit' }
function Widget({ rows }: { rows: { x: string }[] }) {
  return <div>
    <p>{cfg.x}</p>
    <ul>{rows.map((cfg) => <li key={cfg.x}>{cfg.x}</li>)}</ul>
  </div>
}
`)
    expect(template).toContain("<: 'outer-lit' :>")
    expect(template).toContain('<: $cfg.x :>')
  })
})

// Copilot review on #2600 (#2482 Stage 2 follow-up): the position-accurate
// `this.scope` (replacing the old coarse `staticLoopSourceBoundNames` set)
// was only threaded around `renderChildren(loop.children)` in `renderLoop`
// — narrower than the coarse set's always-on coverage. Two row-context
// conversions sit OUTSIDE that window: a `.map()` preamble local's own
// initializer, and the whole-item-conditional `loop-i:` key anchor
// (`loop.key`). Both genuinely evaluate PER ROW and must see the row's own
// bindings — a loop param shadowing a same-named outer const must resolve
// to the row value there too, exactly as it already does inside the loop
// body proper. `renderLoop` now enters the row scope before converting
// either and pops it after, closing the gap.
describe('XslateAdapter - row scope covers preamble/key conversions outside renderChildren (#2482 Stage 2 Copilot follow-up)', () => {
  test('a loop param shadowing an outer const resolves to the row value inside a whole-item-conditional loop-i: key anchor', () => {
    const { template } = compileAndGenerate(`
function Widget({ values }: { values: number[] }) {
  const label: string = 'x'
  return <ul>{values.map((label) => (label > 0 ? <li key={label}>{label}</li> : null))}</ul>
}
`)
    expect(template).toContain('$bf.comment("loop-i:" ~ $label)')
    expect(template).not.toContain('$bf.comment("loop-i:" ~ \'x\')')
  })

  test('a loop param shadowing an outer const resolves to the row value inside a .map() preamble local initializer', () => {
    const { template } = compileAndGenerate(`
function Widget({ values }: { values: number[] }) {
  const label: string = 'x'
  return <ul>{values.map((label) => {
    const cls = label
    return <li key={label} class={cls}>{label}</li>
  })}</ul>
}
`)
    expect(template).toContain(': my $cls = $label;')
    expect(template).not.toContain(": my $cls = 'x';")
  })
})

describe('XslateAdapter - scriptAssets (Vite late-binding, PR1)', () => {
  const CLIENT_COMPONENT = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

  test('emits one register_script per URL, in order, when scriptAssets is set', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      scriptAssets: ['/assets/runtime-abc123.js', '/assets/counter-def456.js'],
    })
    const runtimeIdx = template.indexOf("$bf.register_script('/assets/runtime-abc123.js')")
    const compIdx = template.indexOf("$bf.register_script('/assets/counter-def456.js')")
    expect(runtimeIdx).toBeGreaterThanOrEqual(0)
    expect(compIdx).toBeGreaterThanOrEqual(0)
    expect(runtimeIdx).toBeLessThan(compIdx)
    expect(template).toContain('_bf_reg0')
    expect(template).toContain('_bf_reg1')
    expect(template).not.toContain('/static/components/barefoot.js')
    expect(template).not.toContain('Counter.client.js')
  })

  test('emits a single registration for a single-element scriptAssets array', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      scriptAssets: ['/assets/only-one.js'],
    })
    expect(template).toContain("$bf.register_script('/assets/only-one.js')")
    expect(template.match(/register_script/g)?.length).toBe(1)
  })

  test('an empty scriptAssets array emits no script registrations', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, { scriptAssets: [] })
    expect(template).not.toContain('register_script')
  })

  test('skipScriptRegistration still wins when scriptAssets is also set', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      skipScriptRegistration: true,
      scriptAssets: ['/assets/should-not-appear.js'],
    })
    expect(template).not.toContain('register_script')
  })

  test('absent scriptAssets falls back to adapter-computed script paths', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const computed = new XslateAdapter().generate(ir).template
    const explicitUndefined = new XslateAdapter().generate(ir, { scriptAssets: undefined }).template
    expect(computed).toContain("$bf.register_script('/static/components/barefoot.js')")
    expect(computed).toContain("$bf.register_script('/static/components/Counter.client.js')")
    expect(explicitUndefined).toBe(computed)
  })
})

describe('XslateAdapter - preloadAssets', () => {
  const CLIENT_COMPONENT = `
'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

  test('non-empty preloadAssets + non-empty scriptAssets: preload registrations emitted, in order, before script registrations', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      scriptAssets: ['/assets/runtime-abc123.js', '/assets/counter-def456.js'],
      preloadAssets: ['/assets/index-pre1.js', '/assets/shared-pre2.js'],
    })
    const pre1Idx = template.indexOf(": my $_bf_pre0 = $bf.register_preload('/assets/index-pre1.js');")
    const pre2Idx = template.indexOf(": my $_bf_pre1 = $bf.register_preload('/assets/shared-pre2.js');")
    const script1Idx = template.indexOf(": my $_bf_reg0 = $bf.register_script('/assets/runtime-abc123.js');")
    const script2Idx = template.indexOf(": my $_bf_reg1 = $bf.register_script('/assets/counter-def456.js');")
    expect(pre1Idx).toBeGreaterThanOrEqual(0)
    expect(pre2Idx).toBeGreaterThan(pre1Idx)
    expect(script1Idx).toBeGreaterThan(pre2Idx)
    expect(script2Idx).toBeGreaterThan(script1Idx)
  })

  test('preloadAssets: [] emits no preload registration', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      scriptAssets: ['/assets/runtime-abc123.js'],
      preloadAssets: [],
    })
    expect(template).not.toContain('register_preload')
    expect(template).toContain("$bf.register_script('/assets/runtime-abc123.js')")
  })

  test('preloadAssets: undefined emits no preload registration', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      scriptAssets: ['/assets/runtime-abc123.js'],
      preloadAssets: undefined,
    })
    expect(template).not.toContain('register_preload')
    expect(template).toContain("$bf.register_script('/assets/runtime-abc123.js')")
  })

  test('preloadAssets non-empty but scriptAssets: [] emits no preload registration (preloads are only meaningful alongside a real script)', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      scriptAssets: [],
      preloadAssets: ['/assets/index-pre1.js'],
    })
    expect(template).not.toContain('register_preload')
    expect(template).not.toContain('register_script')
  })

  test('skipScriptRegistration: true suppresses both preloads and scripts', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      skipScriptRegistration: true,
      scriptAssets: ['/assets/runtime-abc123.js'],
      preloadAssets: ['/assets/index-pre1.js'],
    })
    expect(template).not.toContain('register_preload')
    expect(template).not.toContain('register_script')
  })

  // Regression guard: a previous attempt emitted a literal
  // `<link rel="modulepreload">` tag directly into the component template,
  // which injected a rendered DOM node before the component's root and
  // broke hydration across all eight integrations (blade, erb,
  // go-template, jinja, mojolicious, rust, twig, xslate). Preload hints
  // must ONLY ever be emitted as no-output register statements (here,
  // `: my $_bf_preN = $bf.register_preload(...);`) that the adapter's
  // runtime later renders itself — never as literal markup baked into the
  // template.
  test('never emits a literal <link tag into the template', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new XslateAdapter().generate(ir, {
      scriptAssets: ['/assets/runtime-abc123.js'],
      preloadAssets: ['/assets/index-pre1.js'],
    })
    expect(template).not.toContain('<link')
  })
})
