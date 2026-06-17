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
import {
  runAdapterConformanceTests,
  TemplatePrimitiveCaseId,
} from '@barefootjs/adapter-tests'
import { XslateAdapter } from '../adapter'
import { renderXslateComponent, XslateNotAvailableError } from '../test-render'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'

runAdapterConformanceTests({
  name: 'xslate',
  factory: () => new XslateAdapter(),
  render: renderXslateComponent,
  // No JSX-render skips: every shared conformance fixture — including
  // the composed `site/ui` demo corpus (#1467 / #1897) — renders to
  // Hono parity on real Text::Xslate. The last three (`tabs`,
  // `accordion`, `pagination`) came off via: shared module-const
  // resolution (composed template-literal consts), compile-time
  // record-property lookup (`variantClasses.ghost`), ARIA
  // `aria-selected`/`aria-expanded` + boolean-TYPED prop routing
  // through `bool_str`, `attr={cond ? v : undefined}` omission, and
  // literal-const inlining (`totalPages`). Shapes the adapter
  // intentionally refuses at build time stay pinned in
  // `expectedDiagnostics` below.
  //
  // `data-table` is the one JSX-render skip (#1897): it compiles clean
  // (`selected()[index]` → shared `index-access` parser kind,
  // `.toFixed(2)` → `$bf.to_fixed`, `/* @client */`-guarded `sortedData`
  // memo SSR-folded to the unsorted early-return) and renders
  // structurally BYTE-IDENTICAL to Hono on real Text::Xslate. The sole
  // divergence is the scope-ID of imported components inside the keyed
  // `.map` (a hydration-scope concern tracked with #1896, not an
  // expression gap), so it's pinned in `skipJsx` rather than
  // `expectedDiagnostics` (no BF101 fires anymore).
  //
  // `search-params` (router v0.5) now renders: the emitter lowers
  // `searchParams().get('sort')` to a real method call on the per-request
  // `$searchParams` reader (`$searchParams.get('sort')`), and the harness
  // binds it to an empty-query `BarefootJS::SearchParams` (`.get` → nil →
  // `// 'none'` renders the default). See #1922.
  skipJsx: ['data-table'],
  // Per-fixture build-time contracts for shapes the Xslate adapter
  // intentionally refuses to lower. Mirrors mojo's set — the lowering
  // gates are shared code paths in the ported adapter.
  expectedDiagnostics: {
    // Sibling-imported child component in a loop body: emits a
    // cross-template call needing separate registration. BF103 makes
    // the requirement loud (same as mojo).
    'static-array-children': [{ code: 'BF103', severity: 'error' }],
    // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
    // call it inside a keyed `.map`. With the standalone-filter fix in
    // place these reach the SAME BF103 (imported child in `.map`) as
    // mojo — NOT BF101 — confirming the `.filter(...)` chain itself now
    // lowers and the only remaining gate is the imported-child one.
    'todo-app': [{ code: 'BF103', severity: 'error' }],
    'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
    // Array-destructure loop param (`([k, v]) => …`) can't lower to a
    // single Kolon loop variable (same BF104 as mojo).
    'static-array-from-props': [{ code: 'BF104', severity: 'error' }],
    // Both BF103 (imported child) and BF104 (destructure) fire.
    'static-array-from-props-with-component': [
      { code: 'BF103', severity: 'error' },
      { code: 'BF104', severity: 'error' },
    ],
    // Rest-destructure `.map()` callbacks — the object-rest shape read via
    // member access (`rest-destructure-object-in-map`) now lowers via Kolon
    // `: my` binding locals (`$rest` aliases the item). The other three stay
    // refused: rest SPREAD needs a residual object, array-index / nested paths
    // can't unpack a tuple (same surface as mojo).
    'rest-destructure-object-spread-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-array-in-map': [{ code: 'BF104', severity: 'error' }],
    'rest-destructure-nested-in-map': [{ code: 'BF104', severity: 'error' }],
    // XSLATE-SPECIFIC (mojo passes this): the site/ui Button auto-infers a
    // `<Slot>` sibling that spreads `{...props}` / `{...children.props}`
    // onto its root element. Kolon hashref method args can't splat a
    // runtime hash into named entries (no `%$h`-into-call-args form), so
    // the adapter refuses the spread with BF101 rather than emit a broken
    // render_child call. Mojo's EP `%= include` accepts a flat stash, so it
    // lowers the same shape; this is a genuine engine divergence, pinned
    // declaratively here.
    'button': [{ code: 'BF101', severity: 'error' }],
    // `kbd` auto-infers the same `<Slot>` `{...props}` spread as `button`
    // above — refused with BF101 for the identical Kolon engine reason, not a
    // render-mismatch (so it's pinned here, not in `skipJsx`).
    'kbd': [{ code: 'BF101', severity: 'error' }],
    // #1467 demo-corpus context providers (`radio-group`, `select`,
    // `dropdown-menu`, `combobox`, `command`) are no longer pinned — an
    // object-literal provider value (`{ value: currentValue,
    // onValueChange: (v) => {…} }`) lowers to a Kolon hashref via
    // `parseProviderObjectLiteral` (#1897): getter members snapshot
    // their body's SSR value, handler / function-shaped members lower
    // to `nil`. The command demo's `ref={(el) => {…}}` function prop on
    // an imported component is skipped at SSR like `on*` handlers.
    //
    // #1467 Phase 2e: `data-table` is no longer pinned here — it
    // compiles clean now (`selected()[index]` → `index-access`,
    // `.toFixed(2)` → `$bf.to_fixed`, `/* @client */` memo SSR-folded)
    // and is pinned in `skipJsx` above on the keyed-loop scope-ID
    // divergence alone (#1896), not a BF101.
    // `style-3-signals` / `style-object-dynamic` no longer pinned — a
    // `style={{ … }}` object literal now lowers to a CSS string with dynamic
    // values interpolated (`background-color:<: $color :>;padding:8px`) via
    // `tryLowerStyleObject` (#1322).
    // Tagged-template-literal call in a className — same family, same
    // refusal (BF101).
    'tagged-template-classname': [{ code: 'BF101', severity: 'error' }],
    // NB: `.find` / `.findIndex` / `.findLast` / `.findLastIndex` are NOT
    // pinned here — unlike mojo (which refuses them), Xslate lowers them to
    // `$bf.find` / `find_index` / `find_last` / `find_last_index` via the same
    // Kolon-lambda mechanism as `.filter` / `.every` / `.some`, so they render.
  },
  // Template-primitive registry parity: same V1 surface as mojo, so the
  // same two cases stay skipped (bespoke user import + customSerialize
  // can't render server-side without user-supplied helper mappings).
  skipTemplatePrimitives: new Set([
    TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
  ]),
  // Loop boundary markers for `@client` loops aren't emitted by the
  // Xslate adapter yet (ported from mojo, which skips the same set).
  skipMarkerConformance: new Set([
    'client-only',
    'client-only-loop-with-sibling-cond',
    'todo-app',
    // #1467 Phase 2e: same `/* @client */` keyed-map elision (data-table).
    'data-table',
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
