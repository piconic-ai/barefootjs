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
import {
  runAdapterConformanceTests,
  TemplatePrimitiveCaseId,
} from '@barefootjs/adapter-tests'
import { ErbAdapter } from '../adapter'
import { renderErbComponent, ErbNotAvailableError } from '../test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

runAdapterConformanceTests({
  name: 'erb',
  factory: () => new ErbAdapter(),
  render: renderErbComponent,
  // No JSX-render skips: every shared conformance fixture — including
  // the composed `site/ui` demo corpus (#1467 / #1897) — renders to
  // Hono parity on real Ruby `erb`. `data-table` came off via the
  // body-children `inLoop` reset (#1896): the loop-item component
  // (TableRow) still gets `ComponentName_<random>` scope IDs, but its
  // body children (TableCell) now receive `_bf_slot` for deterministic
  // parent-scope-derived IDs matching Hono.
  // Per-fixture build-time contracts for shapes the ERB adapter
  // intentionally refuses to lower. Mirrors mojo's set — the lowering
  // gates (`isLowerableLoopDestructure`, `collectImportedLoopChild
  // ComponentErrors`, `refuseUnsupportedAttrExpression`, the #2038
  // nested-higher-order-callback gate) are shared code in `@barefootjs/jsx`
  // that every EP/ERB-family adapter reuses verbatim.
  expectedDiagnostics: {
    // Sibling-imported child component in a loop body: emits a
    // cross-template call needing separate registration. BF103 makes
    // the requirement loud (same as mojo).
    'static-array-children': [{ code: 'BF103', severity: 'error' }],
    // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
    // call it inside a keyed `.map`. Same BF103 surface as the
    // synthetic `static-array-children` above — pinned at adapter
    // level so the shared-component corpus stays adapter-neutral.
    'todo-app': [{ code: 'BF103', severity: 'error' }],
    'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
    // `static-array-from-props` / `static-array-from-props-with-component`:
    // the `.map(([emoji, users]) => …)` / `.map(([id, t]) => …)` callback is
    // a plain array-index destructure (the `.filter(...)` runs on a
    // separate `const entries = …` statement, so `loop.filterPredicate` is
    // unset — this is not the `.filter().map(destructure)` chain
    // `isLowerableLoopDestructure` still refuses), and #2087 Phase B's
    // segments-walking accessor DOES lower it natively. But both fixtures'
    // loop array is that same `entries` — a component-scope `const`
    // computed from `Object.entries(props.x).filter(...)`, a runtime
    // expression the ERB adapter has no mechanism to evaluate at SSR
    // render time (only a pure-literal or module-string const is ever
    // inlined; a computed const falls through to an unseeded `v[:entries]`
    // and crashes). This is a pre-existing, orthogonal gap the widened
    // destructure gate merely exposes — it reproduces identically with a
    // non-destructured param (verified) — not a destructure-lowering
    // limitation, so it is NOT part of #2087's scope. Tracked as its own
    // gap under https://github.com/piconic-ai/barefootjs/issues/2087;
    // pinned honestly as BF101 (the adapter's own check, see `renderLoop`'s
    // "Loop array is a bare identifier..." comment) rather than faked as
    // BF104 or silently producing broken Ruby.
    'static-array-from-props': [{ code: 'BF101', severity: 'error' }],
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF101', severity: 'error' },
    ],
    // #2087 Phase B: `isLowerableLoopDestructure` now admits every fixed-
    // binding shape (any field/index depth — `destructure-array-index-in-map`,
    // `destructure-nested-object-in-map`), array-rest (`rest-destructure-
    // array-in-map`, native `bf.slice`), and object-rest whose every use is a
    // member read or a `{...rest}` spread onto an intrinsic element
    // (`rest-destructure-object-in-map`, `rest-destructure-object-spread-in-
    // map`, `rest-destructure-nested-in-map` — native `Hash#except` builds a
    // true residual Hash). None of the six destructure-in-map fixtures are
    // pinned here any more; all render to Hono parity. See
    // `rubyAccessorFromSegments` / the object-rest-in-loop branch in
    // `erb-adapter.ts`'s `renderLoop`.
    // #1244 stress catalog #12 (#1323): tagged-template-literal call
    // (`cn\`base \${tone()}\``) has no idiomatic ERB template form — refused
    // via `refuseUnsupportedAttrExpression`, same gate mojo/xslate share.
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // #2038: a filter predicate containing a nested `.find(...)` callback.
    // `find*` returns an element, not a boolean — there is no inline
    // predicate form, and the emitter used to silently degrade the call to
    // its receiver. The nested `.some` sibling
    // (`filter-nested-callback-predicate`) is NOT pinned: like mojo, ERB
    // lowers it to a real inline Ruby block predicate and must render to
    // Hono parity instead.
    // https://github.com/piconic-ai/barefootjs/issues/2038
    'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error' }],
    // #1467 demo-corpus context providers (`radio-group`, `accordion`,
    // `dialog`, `popover`, `select`, `dropdown-menu`, `combobox`,
    // `command`) are NOT pinned — an object-literal provider value lowers
    // to a Ruby Hash via `parseProviderObjectLiteral` (#1897): getter
    // members snapshot their body's SSR value, handler / function-shaped
    // members lower to `nil`.
    //
    // `button` / `kbd` are NOT pinned (unlike xslate): the auto-inferred
    // `<Slot>` sibling's `{...props}` / `{...children.props}` spread onto
    // its root element lowers via Ruby's native `**hash` double-splat in
    // the component-invocation Hash literal — the same shape mojo's EP
    // `%{$props}` flatten already handles.
    //
    // `data-table` is NOT pinned here either — it compiles clean
    // (`selected()[index]` → `index-access`, `.toFixed(2)` →
    // `bf.to_fixed`, `/* @client */` memo SSR-folded) and renders to Hono
    // parity. It stays in `skipMarkerConformance` below for the shared
    // `/* @client */` keyed-map slot-id elision contract only (same as
    // `todo-app`), not a render or BF101 gap.
    //
    // #2073 follow-up: a function-reference `.map(format)` callback has no
    // arrow body to serialize — not a CALLBACK_METHODS shape — so the
    // UNSUPPORTED_METHODS gate (shared `@barefootjs/jsx` code) refuses it
    // with BF101 rather than emitting a broken template. Same pin as
    // mojo/xslate.
    'array-map-function-reference': [{ code: 'BF101', severity: 'error' }],
  },
  // Template-primitive registry parity: same V1 surface as mojo/xslate, so
  // the same two cases stay skipped:
  //   - `USER_IMPORT_VIA_CONST` — a bespoke user import isn't in the
  //     registry and can't be rendered server-side without user-supplied
  //     helper mappings.
  //   - `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT` — uses `customSerialize` too,
  //     same reason.
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
  skipMarkerConformance: new Set([
    // Same as Hono / Mojo / Xslate: `/* @client */` markers on TodoApp's
    // keyed `.map` intentionally elide a slot id from the SSR template
    // that the IR still declares (s6). See hono-adapter.test for the
    // contract.
    'todo-app',
    // #1467 Phase 2e: same `/* @client */` keyed-map elision (data-table).
    'data-table',
  ]),
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
