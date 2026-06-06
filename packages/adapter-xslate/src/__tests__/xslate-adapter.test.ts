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
  // Skips here are VERIFIED, not inherited from mojo. Notably, the six
  // fixtures mojo skips for Perl-EP scoping faults — `logical-or-jsx`,
  // `nullish-coalescing-jsx`, `branch-map`, `return-logical-or`,
  // `return-nullish-coalescing`, `return-map` (bare `$label` / `$items`
  // without a `my` binding) — all PASS on Xslate, because Kolon resolves
  // `$label` from the per-render vars rather than a Perl lexical, so there
  // is no undefined-symbol fault. Xslate therefore skips strictly fewer
  // fixtures than mojo. Each entry below was confirmed to fail with
  // skipJsx emptied.
  skipJsx: [
    // `context-provider` graduated: SSR context propagation now mirrors the
    // client `provideContext` / `useContext`. `<Ctx.Provider value>` brackets
    // its children with inline `$bf.provide_context` / `$bf.revoke_context`
    // (a package-level value stack; both return '' so the `<: … :>` discards
    // them), and each `useContext` consumer is seeded with
    // `: my $x = $bf.use_context('Ctx', <default>)`. Renders byte-for-byte
    // against Hono on real Text::Xslate. (#1297)
    // `toggle-shared`: the parent maps a `ToggleItemProps[]` prop into
    // sibling `ToggleItem` children inside a keyed `.map`. Three gaps
    // remain (same as mojo): the loop-child `on = props.defaultOn ??
    // false` signal isn't seeded server-side (so every item renders OFF
    // instead of honouring per-item `defaultOn`), the child scope id is
    // the snake-case `toggle_item_<rand>` rather than the `ToggleItem_*`
    // PascalCase the reference pins, and `key=` → `data-key` isn't
    // emitted. Kolon resolves the unseeded vars to nil rather than
    // aborting, so this surfaces as a render mismatch (not a hard error).
    // Separate follow-up.
    'toggle-shared',
    // `props-reactivity-comparison` graduated: the child `PropsStyleChild`'s
    // `displayValue = props.value * 10` memo has a `null` static SSR default.
    // The adapter now computes such memos in-template from the seeded prop var
    // (`: my $displayValue = $value * 10;`) — mirroring Go's generated child
    // constructor — so `child-computed-value` renders `10` to match Hono. (#1297)
    // (`kbd` is not skipped here — it's a BF101 refusal pinned in
    // `expectedDiagnostics` below, not a render-mismatch.)
  ],
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
    // Rest-destructure `.map()` callbacks — the loop emitter raises the
    // generic BF104 destructure refusal regardless of rest-vs-plain
    // (same surface as mojo).
    'rest-destructure-object-in-map': [{ code: 'BF104', severity: 'error' }],
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
    // JS object literal in an attribute value (`style={{ … }}`) has no
    // Kolon form — refused via the same gate as mojo (BF101).
    'style-3-signals': [{ code: 'BF101', severity: 'error' }],
    // Dynamic `style={{ … }}` object: the Xslate adapter cleanly refuses it
    // with BF101 (no idiomatic Kolon form). mojo *skips* this fixture because
    // its EP path emits invalid Perl silently — Xslate's build-time diagnostic
    // is the stronger contract, so it's pinned here rather than skipped.
    'style-object-dynamic': [{ code: 'BF101', severity: 'error' }],
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
