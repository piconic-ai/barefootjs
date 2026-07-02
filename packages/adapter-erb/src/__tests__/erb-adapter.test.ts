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
  // gates (`isLowerableObjectRestDestructure`, `collectImportedLoopChild
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
    // Array-destructure loop param (`([k, v]) => ...`) lowers to
    // invalid Ruby block-param syntax (`|[k, v]|` can't unpack a tuple
    // into scalar locals the way this adapter's loop emission needs).
    // Same BF104 gate (`isLowerableObjectRestDestructure`) as mojo.
    'static-array-from-props': [{ code: 'BF104', severity: 'error' }],
    // Both BF103 (imported child) and BF104 (destructure) fire.
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF104', severity: 'error' },
    ],
    // Rest-destructure `.map()` callbacks — the object-rest shape read via
    // member access (`rest-destructure-object-in-map`) lowers via a per-item
    // Ruby local plus one local per binding (`rest` aliases the item so
    // `rest[:flag]` resolves). The other three stay refused: rest SPREAD
    // (`{...rest}`) needs a residual Hash, and array-index / nested paths
    // can't unpack into scalar locals (same surface as mojo).
    'rest-destructure-object-spread-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-array-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-nested-in-map': [{ code: 'BF104', severity: 'error' }],
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
