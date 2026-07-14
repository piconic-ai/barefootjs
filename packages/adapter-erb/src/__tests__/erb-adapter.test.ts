/**
 * ErbAdapter — Conformance Tests
 *
 * Runs the shared adapter conformance corpus (JSX fixtures, template
 * primitives, marker conformance) against the ERB (Embedded Ruby)
 * adapter, rendering each fixture end-to-end through real Ruby stdlib
 * `erb` + `BarefootJS::Backend::Erb` via `renderErbComponent`.
 *
 * The ERB adapter was ported from the Mojolicious adapter (EP → ERB is a
 * 1:1 embedded-language mapping — see `packages/adapter-erb/src/adapter/
 * erb-adapter.ts`'s file docstring), so the skip / diagnostic sets below
 * start from mojo's and diverge only where the engine genuinely differs.
 * Every divergence carries a one-line rationale.
 *
 * Unlike Kolon (Text::Xslate), Ruby is a full general-purpose language:
 * component-invocation Hash literals support a real double-splat
 * (`**hash`), the direct analog of Perl's `%{$props}` flatten. So the
 * `button` / `kbd` shapes that Xslate refuses (BF101 — Kolon has no
 * "splat a runtime hash into named call args" form) LOWER cleanly on
 * ERB, matching mojo rather than xslate.
 */

import { describe, test, expect } from 'bun:test'
import { runAdapterConformanceTests } from '@barefootjs/adapter-tests'
import { ErbAdapter } from '../adapter'
import { renderErbComponent, ErbNotAvailableError } from '../test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { conformancePins } from '../conformance-pins'
import { renderDivergences } from '../render-divergences'

runAdapterConformanceTests({
  name: 'erb',
  factory: () => new ErbAdapter(),
  render: renderErbComponent,
  // Priority-12 edge-case sweep (炙り出し, #2168): render-level
  // divergences are declared in `../render-divergences` (exported from the
  // package index and published to `ui/compat.lock.json` / the docs
  // compatibility-matrix page by `packages/compat`). Deriving the skip
  // list from that object keeps the public declaration and these test
  // skips from drifting; each entry's rationale lives there.
  skipJsx: Object.keys(renderDivergences),
  // No JSX-render skips: every shared conformance fixture — including
  // the composed `site/ui` demo corpus (#1467 / #1897) — renders to
  // Hono parity on real Ruby `erb`. `data-table` came off via the
  // body-children `inLoop` reset (#1896): the loop-item component
  // (TableRow) still gets `ComponentName_<random>` scope IDs, but its
  // body children (TableCell) now receive `_bf_slot` for deterministic
  // parent-scope-derived IDs matching Hono.
  // Per-fixture build-time contracts for shapes the ERB adapter
  // intentionally refuses to lower. Lives in `../conformance-pins` —
  // mirrors mojo's set (the lowering gates — `isLowerableLoopDestructure`,
  // `collectImportedLoopChildComponentErrors`, `refuseUnsupportedAttr
  // Expression`, the #2038 nested-higher-order-callback gate — are shared
  // code in `@barefootjs/jsx` that every EP/ERB-family adapter reuses
  // verbatim).
  expectedDiagnostics: conformancePins,
  // Template-primitive registry: `USER_IMPORT_VIA_CONST` and
  // `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` now pass (#2069) — a bespoke user
  // import can never be added to the string-keyed registry, but the
  // shared `RelocateEnv.loweringMatchers` acceptance path recognises it
  // via a `LoweringPlugin` the case setup registers around the compile
  // (see `packages/adapter-tests/src/cases/template-primitives.ts`). No
  // skips left, so `skipTemplatePrimitives` is omitted entirely.
  skipMarkerConformance: new Set([
    // Same as Hono / Mojo / Xslate: `/* @client */` markers on TodoApp's
    // keyed `.map` intentionally elide a slot id from the SSR template
    // that the IR still declares (s6). See hono-adapter.test for the
    // contract.
    'todo-app',
    // #1467 Phase 2e: same `/* @client */` keyed-map elision (data-table).
    'data-table',
  ]),
  skipDataPoints: new Set<string>(),
  onRenderError: (err, id) => {
    if (err instanceof ErbNotAvailableError) {
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
    adapter: new ErbAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileAndGenerate(source: string) {
  return new ErbAdapter().generate(compileToIR(source))
}

// =============================================================================
// ERB-Specific Tests
// =============================================================================

describe('ErbAdapter - SSR context propagation (#1297)', () => {
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
    expect(template).toContain("bf.provide_context('ThemeContext', 'dark')")
    expect(template).toContain("bf.revoke_context('ThemeContext')")
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
    expect(template).toContain("v[:theme] = bf.use_context('ThemeContext', 'light')")
  })
})

describe('ErbAdapter - prop-derived memo SSR seeding (#1297)', () => {
  test('seeds a prop-derived memo from the prop var', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function Child(props: { value: number }) {
  const displayValue = createMemo(() => props.value * 10)
  return <span>{displayValue()}</span>
}
`)
    expect(template).toMatch(/v\[:displayValue\]\s*=\s*\(v\[:value\]\s*\*\s*10\)/)
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
    expect(template).toMatch(/v\[:displayValue\]\s*=\s*\(v\[:value\]\s*\*\s*10\)/)
  })
})

describe('ErbAdapter - #2075 searchParams()-derived memo seeding', () => {
  // A memo derived from the createSearchParams() env signal must seed
  // in-template from the canonical per-request `v[:search_params]` reader —
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
    expect(template).toContain(
      "v[:sort] = ((v[:search_params].get('sort')).nil? ? 'date' : v[:search_params].get('sort'))",
    )
  })

  // A list-filter memo chained off the derived memo seeds too: the block
  // param (`p`) is a lowering-internal binding, not an out-of-scope
  // template var (the pre-#2075 availability check rejected them and the
  // list rendered empty at SSR).
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
    expect(template).toContain(
      "v[:tag] = ((v[:search_params].get('tag')).nil? ? '' : v[:search_params].get('tag'))",
    )
    expect(template).toMatch(/v\[:visible\] = v\[:items\]\.select \{ \|p\|/)
  })

  // The seed-scope guard used to scan the LOWERED Ruby string, allowing
  // every arrow-callback param tree-wide. That let an outer, unbound `p`
  // (shadowed only inside the callback) slip past the guard as if it were
  // the callback's own bound `p` — emitting a bogus seed line that would
  // read an un-seeded key. The guard now walks the parsed SOURCE tree with
  // proper lexical scoping (`freeIdentifiers`), so this shape seeds nothing
  // and falls back to the nil/ssr-defaults path.
  test('an outer unbound `p` shadowed only inside the callback does not seed', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function C(props: { items: { ok: boolean }[] }) {
  const visible = createMemo(() => props.items.filter((p) => p.ok) && p)
  return <div>{String(visible())}</div>
}
`)
    expect(template).not.toMatch(/v\[:visible\] =/)
  })

  // An out-of-scope bare `_` reference (not a lowering-internal loop-index
  // binding) must not seed either — the old unconditional allow-list masked
  // this.
  test('an out-of-scope bare `_` reference does not seed', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createMemo } from '@barefootjs/client'
export function C(props: { count: number }) {
  const doubled = createMemo(() => props.count * 2 + _)
  return <div>{doubled()}</div>
}
`)
    expect(template).not.toMatch(/v\[:doubled\] =/)
  })
})

describe('ErbAdapter - prop-derived signal SSR seeding + data-key (#1297, toggle-shared)', () => {
  test('seeds a prop-derived (different-name) signal from the prop var', () => {
    const { template } = compileAndGenerate(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Item(props: { defaultOn?: boolean }) {
  const [on, setOn] = createSignal(props.defaultOn ?? false)
  return <button>{on() ? 'ON' : 'OFF'}</button>
}
`)
    expect(template).toMatch(/v\[:on\]\s*=\s*\(\(v\[:defaultOn\]\)\.nil\?/)
  })

  test('emits data_key_attr on the component root', () => {
    const { template } = compileAndGenerate(`
export function Item() { return <div class="x">hi</div> }
`)
    expect(template).toContain('bf.data_key_attr')
  })

  test('emits data_key_attr on each branch root of an if-statement root', () => {
    const { template } = compileAndGenerate(`
export function Item({ on }: { on?: boolean }) {
  if (on) return <div class="a">A</div>
  return <div class="b">B</div>
}
`)
    const count = (template.match(/bf\.data_key_attr/g) ?? []).length
    expect(count).toBe(2)
  })
})

describe('ErbAdapter - #1966 @client defers attribute bindings', () => {
  function compileAttr(attrExpr: string) {
    const adapter = new ErbAdapter()
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

describe('ErbAdapter - component-prop spread via Ruby **hash (button/kbd shape)', () => {
  // The direct engine-divergence case from xslate: a `{...props}` spread
  // into a CHILD component's invocation Hash lowers to Ruby's native
  // double-splat, unlike Kolon (no such call-arg splat form).
  test('spreads a rest-props bag into a child component call via **hash', () => {
    const { template } = compileAndGenerate(`
'use client'
import { Leaf } from './leaf'
function Slot({ ...rest }: { [key: string]: unknown }) {
  return <Leaf {...rest} />
}
export { Slot }
`)
    expect(template).toMatch(/\*\*v\[:rest\]/)
  })
})

describe('ErbAdapter - filter().map() predicate matches the FILTER param, not the loop param (#2245)', () => {
  // `todos.filter(t => t.done).map(todo => ...)`: the predicate's own `t`
  // used to be matched against the LOOP's (map's) param `todo` inside
  // `ErbFilterEmitter.identifier()`, so every reference to `t` inside the
  // predicate fell to the `v[:t]` vars-Hash fallback instead of resolving
  // to the loop-bound `todo` local — `v[:t]` is never seeded, and real
  // Ruby raises `NoMethodError: undefined method '[]' for nil` on
  // `v[:t][:done]` at render time (masked in the shipped `todo-app-ssr`
  // corpus by its `'all'`-default filter short-circuiting the buggy
  // branch away — see `filter-wrapper-props-reachable`'s docstring).
  const DIFFERENTLY_NAMED_SOURCE = `
'use client'
import { createSignal } from '@barefootjs/client'

type Todo = { id: number; text: string; done: boolean }

export function TodoList(props: { initialTodos?: Todo[] }) {
  const [todos] = createSignal<Todo[]>(props.initialTodos ?? [])
  return (
    <ul>
      {todos().filter(t => !t.done).map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  )
}
`

  function compileToIR(source: string): ComponentIR {
    const result = compileJSX(source.trimStart(), 'test.tsx', {
      adapter: new ErbAdapter(),
      outputIR: true,
    })
    const irFile = result.files.find(f => f.type === 'ir')
    if (!irFile) throw new Error('No IR output')
    return JSON.parse(irFile.content) as ComponentIR
  }

  test('predicate reference lowers through the loop-bound local, never the filter-param vars-Hash fallback', () => {
    const ir = compileToIR(DIFFERENTLY_NAMED_SOURCE)
    const { template } = new ErbAdapter().generate(ir)
    // The loop-gating `<if>` must reference the loop's actual bound Ruby
    // local (`todo[:done]`, from the MAP callback's param)...
    expect(template).toContain('todo[:done]')
    // ...never the filter callback's own param name resolved as an
    // (unseeded) vars-Hash key — the literal pre-fix bug.
    expect(template).not.toContain('v[:t]')
  })

  test('same-named filter/map params render byte-identically to the pre-#2245 form (regression pin)', () => {
    const sameNamedSource = DIFFERENTLY_NAMED_SOURCE.replace(
      'filter(t => !t.done)',
      'filter(todo => !todo.done)',
    )
    const ir = compileToIR(sameNamedSource)
    const { template } = new ErbAdapter().generate(ir)
    expect(template).toContain('<%- if bf.truthy?(!bf.truthy?(todo[:done])) -%>')
  })

  test('real Ruby render: reachable predicate on differently-named params renders correctly (pre-fix NoMethodError pin)', async () => {
    // `filter` defaults to `'active'` (never `'all'`) so the predicate
    // branch referencing `t.done` is actually REACHABLE at render time —
    // an `'all'`-style short-circuiting default is exactly what hid this
    // bug in the shipped `todo-app-ssr` fixture. Block-body predicate
    // (folded to one expression by #2040's `foldBlockToExpr` +
    // `predicateTernaryToLogical`) matches the real `TodoAppSSR.tsx` shape.
    const source = `
'use client'
import { createSignal } from '@barefootjs/client'

type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active'

export function TodoList(props: { initialTodos?: Todo[] }) {
  const [todos] = createSignal<Todo[]>(props.initialTodos ?? [])
  const [filter] = createSignal<Filter>('active')
  return (
    <ul>
      {todos().filter(t => {
        const f = filter()
        if (f === 'active') return !t.done
        return true
      }).map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  )
}
`
    let html: string
    try {
      html = await renderErbComponent({
        source: source.trimStart(),
        adapter: new ErbAdapter(),
        props: {
          initialTodos: [
            { id: 1, text: 'Eat breakfast', done: true },
            { id: 2, text: 'Write tests', done: false },
          ],
        },
      })
    } catch (err) {
      if (err instanceof ErbNotAvailableError) {
        console.log('Skipping #2245 filter-param e2e: ruby/erb not available')
        return
      }
      throw err
    }
    // Pre-fix: real Ruby raises `NoMethodError: undefined method '[]' for
    // nil` evaluating `v[:t][:done]` — `renderErbComponent` surfaces that
    // as a thrown "ruby render failed" error, so a `NoMethodError` string
    // anywhere in a caught error would fail this test outright rather than
    // reaching these assertions. Post-fix: only the not-done todo (id 2)
    // survives the 'active' filter.
    expect(html).not.toContain('Eat breakfast')
    expect(html).toContain('Write tests')
    expect(html).toContain('data-key="2"')
    expect(html).not.toContain('data-key="1"')
  })
})

describe('ErbAdapter - named-slot capture identifier safety (#2168 jsx-element-prop)', () => {
  // A JSX-valued prop under a hyphenated name (`data-slot`, a valid JSX
  // attribute name) must not leak into the buffer-slice capture's local
  // variables — Ruby local variable names can't contain `-`. The capture
  // suffix is purely counter-based (never derived from the prop name); the
  // hash KEY passed to `render_child` still carries the real name, quoted
  // via `rubySymbolKey`.
  test('a hyphenated prop name does not appear in the capture variables', () => {
    const { template } = compileAndGenerate(`
function Card(props) { return null }
export function Parent() {
  return <Card data-slot={<strong>Title</strong>}>text</Card>
}
`)
    expect(template).toContain('__bf_len_0 = _erbout.length')
    expect(template).toContain('__bf_prop_0 = bf.backend.mark_raw(__bf_praw_0)')
    expect(template).toContain('"data-slot": __bf_prop_0')
    expect(template).not.toContain('bf_prop_data')
  })
})
