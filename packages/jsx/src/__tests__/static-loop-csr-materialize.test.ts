/**
 * #1247 — static-array loops whose array references an init-scope local
 * (e.g. `Object.entries(props.x).filter(...)`) substitute `[]` in the
 * CSR template, so a `createComponent`-only mount renders an empty
 * container. The fix emits a clone-and-insert fallback inside the
 * static-loop's per-item forEach so the init function materialises
 * missing children at hydrate time.
 *
 * These tests pin the emit shape:
 *   - materialize branch present when the array is unsafe
 *   - materialize branch absent when the array is safe (no regression)
 *   - SSR path unaffected — when `__iterEl` already exists, the branch is
 *     a dead `if (!__iterEl)` and reactive bindings run as before
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('#1247 — static-loop CSR self-heal', () => {
  test('prop-derived static array emits clone-and-insert fallback', () => {
    const source = `
      'use client'
      type Props = { reactions: Record<string, string[]> }
      export function ReactionBar(props: Props) {
        const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
        return (
          <div data-reaction-bar="true">
            {entries.map(([emoji, users]) => (
              <button key={emoji} type="button">
                <span>{emoji}</span>
                <span>{String(users.length)}</span>
              </button>
            ))}
          </div>
        )
      }
    `
    const clientJs = getClientJs(source, 'ReactionBar.tsx')
    // The forEach must use `let __iterEl` (not `const`) so the materialize
    // branch can reassign after cloning.
    expect(clientJs).toMatch(/let __iterEl = /)
    // Clone-and-insert branch must be present.
    expect(clientJs).toMatch(/if \(!__iterEl\)/)
    expect(clientJs).toMatch(/document\.createElement\('template'\)/)
    expect(clientJs).toMatch(/insertBefore\(/)
  })

  test('inline literal static array does NOT emit the materialize branch', () => {
    // `[1, 2, 3]` is template-safe — the CSR template emits the array
    // inline, so children always exist on the CSR-only mount and no
    // self-heal is needed. Adding the branch here would be dead code on
    // every static loop, undoing the size discipline this path enforces.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function NumberList() {
        const [n] = createSignal(0)
        return (
          <ul data-n={n()}>
            {[1, 2, 3].map(x => <li key={x}>{x}</li>)}
          </ul>
        )
      }
    `
    const clientJs = getClientJs(source, 'NumberList.tsx')
    expect(clientJs).not.toMatch(/if \(!__iterEl\)/)
  })

  test('direct prop array uses mapArray, not static forEach (#1586)', () => {
    // `props.items` is a direct prop reference — props are always
    // potentially reactive, so the compiler promotes to mapArray.
    // mapArray handles CSR mount natively (no materialize needed).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Props = { items: number[] }
      export function PropList(props: Props) {
        const [n] = createSignal(0)
        return (
          <ul data-n={n()}>
            {props.items.map(x => <li key={x}>{x}</li>)}
          </ul>
        )
      }
    `
    const clientJs = getClientJs(source, 'PropList.tsx')
    expect(clientJs).toMatch(/\bmapArray\s*\(/)
    expect(clientJs).not.toMatch(/\.forEach\s*\(/)
  })

  test('materialize branch uses raw destructured param refs (no __bfItem())', () => {
    // The static forEach destructures the param directly; the cloned
    // template literal must reference `emoji` not `__bfItem().emoji` —
    // otherwise the IIFE throws because `__bfItem` is not in scope.
    const source = `
      'use client'
      type Props = { reactions: Record<string, string[]> }
      export function ReactionBar(props: Props) {
        const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
        return (
          <div>
            {entries.map(([emoji, users]) => (
              <button key={emoji} type="button">
                <span>{emoji}</span>
              </button>
            ))}
          </div>
        )
      }
    `
    const clientJs = getClientJs(source, 'ReactionBar.tsx')
    // Find the materialize block.
    const m = clientJs.match(/if \(!__iterEl\) \{[\s\S]*?\n\s+\}\n\s+if \(__iterEl\)/)
    expect(m).toBeTruthy()
    const block = m![0]
    // The cloned template must reference `emoji` directly.
    expect(block).toMatch(/\$\{emoji\}/)
    // It must NOT reference `__bfItem()` — that accessor only exists
    // inside `mapArray` renderItems, not inside a plain forEach.
    expect(block).not.toMatch(/__bfItem\(\)/)
  })

  test('multi-root (Fragment) body emits multi-sibling clone-and-insert', () => {
    // When the per-item body is a JSX Fragment with multiple top-level
    // siblings, `csrMaterialize.bodyIsMultiRoot` is true and the emitter
    // must clone every sibling of the template content, tracking the first
    // one as `__iterEl` so reactive bindings still anchor correctly.
    // This pins the `bodyIsMultiRoot === true` branch in `loop.ts:122-138`.
    const source = `
      'use client'
      type Props = { reactions: Record<string, string[]> }
      export function MultiRootBar(props: Props) {
        const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
        return (
          <div>
            {entries.map(([emoji, users]) => (
              <>
                <span data-emoji>{emoji}</span>
                <span data-count>{String(users.length)}</span>
              </>
            ))}
          </div>
        )
      }
    `
    const clientJs = getClientJs(source, 'MultiRootBar.tsx')
    // `__mtpl` is the multi-root template var — distinct from the
    // single-root `__tpl` to make the branch easy to grep.
    expect(clientJs).toMatch(/const __mtpl = document\.createElement\('template'\)/)
    // The sibling-walk loop:
    expect(clientJs).toMatch(/let __sib = __mtpl\.content\.firstElementChild/)
    expect(clientJs).toMatch(/while \(__sib\) \{/)
    // First-sibling tracking — initialised to null and assigned to
    // `__iterEl` after the walk so reactive bindings attach to the first
    // root.
    expect(clientJs).toMatch(/let __first = null/)
    expect(clientJs).toMatch(/__iterEl = __first/)
    // No `__bfItem()` accessor (this is a plain forEach with destructured
    // params, not a mapArray renderItems).
    expect(clientJs).not.toMatch(/__bfItem\(\)/)
  })

  test('static loop containing inner .map still compiles cleanly', () => {
    // `collect-elements.ts` builds `staticItemTemplate` with
    // `loopParams=undefined` so item-body templates render in caller scope.
    // This test pins that change does NOT break a nested-map case: the
    // outer static loop's materialize branch must include the inner
    // `items.map(...)` expression inside the cloned template, and the
    // compile must produce zero errors.
    const source = `
      'use client'
      type Props = { groups: Record<string, string[]> }
      export function NestedList(props: Props) {
        const entries = Object.entries(props.groups ?? {})
        return (
          <div>
            {entries.map(([name, items]) => (
              <ul key={name}>
                {items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            ))}
          </div>
        )
      }
    `
    // `getClientJs` already asserts zero errors.
    const clientJs = getClientJs(source, 'NestedList.tsx')
    // Outer materialize branch present.
    expect(clientJs).toMatch(/if \(!__iterEl\)/)
    // Inner `items.map(...)` is inlined into the cloned template literal
    // — its expression survives intact (no mangled accessor, no loss of
    // the inner `it` param).
    expect(clientJs).toMatch(/items\.map\(\(it, i\) =>/)
    // The inner per-item HTML references the inner destructured param
    // directly (`${it}` in the template), not via a `__bfItem` accessor.
    expect(clientJs).toMatch(/\$\{it\}/)
    expect(clientJs).not.toMatch(/__bfItem\(\)/)
  })

  test('#1268 — childComponent body emits renderChild materialize template', () => {
    // Loop body is a single child component reading from a prop-derived
    // const (`entries`). Before #1268 the materialize gate excluded
    // childComponent loops, so `createComponent` mounts of `TagList`
    // rendered an empty `<ul>`. Now the per-iteration template is the
    // `${renderChild('Tag', ..., key)}` expression — evaluating that
    // template literal produces the rendered child HTML, which the
    // existing `static-array-child-inits` phase wires via `initChild`.
    const source = `
      'use client'
      type Props = { tags: Record<string, { variant: 'on' | 'off' }> }
      export function TagList(props: Props) {
        const entries = Object.entries(props.tags).filter(([, t]) => t.variant === 'on')
        return (
          <ul>
            {entries.map(([id, t]) => (
              <Tag key={id} id={id} variant={t.variant} />
            ))}
          </ul>
        )
      }
    `
    const clientJs = getClientJs(source, 'TagList.tsx')
    // Materialize branch present.
    expect(clientJs).toMatch(/if \(!__iterEl\)/)
    // The cloned template body is a single `renderChild('Tag', ...)`
    // expression — props read from the destructured forEach param.
    const matMatch = clientJs.match(/__tpl\.innerHTML = `([^`]*)`/)
    expect(matMatch).toBeTruthy()
    const inner = matMatch![1]
    expect(inner).toMatch(/\$\{renderChild\('Tag', \{[^}]*id: id[^}]*variant: t\.variant[^}]*\}, id/)
    // No `__bfItem()` accessor (forEach destructures the param directly).
    expect(clientJs).not.toMatch(/__bfItem\(\)/)
    // The `static-array-child-inits` phase still emits its `initChild`
    // pass — it runs after materialize, finds the cloned children via
    // `qsaChildScopes`, and wires them with the same prop getters as
    // before. Pinning this here is a guard against an accidental
    // double-init by emitting renderChild AND createComponent.
    expect(clientJs).toMatch(/qsaChildScopes\(/)
    expect(clientJs).toMatch(/initChild\('Tag',/)
  })

  test('#1268 — composite element body with nested component materializes via renderChild', () => {
    // Loop body is `<li><Cell /></li>` — a plain element wrapping a
    // nested child component, with the array still prop-derived.
    // `useElementReconciliation` is forced false for static arrays in
    // `decideLoopRendering`, so the per-iteration template comes from
    // `irToHtmlTemplate` (not `irToPlaceholderTemplate`), inlining a
    // `${renderChild('Cell', ...)}` expression inside the `<li>`. The
    // existing materialize plan from #1265 covers this — this test
    // documents the contract so a later refactor doesn't accidentally
    // route this shape through the placeholder path.
    const source = `
      'use client'
      type Props = { rows: Record<string, { label: string }> }
      export function Table(props: Props) {
        const entries = Object.entries(props.rows)
        return (
          <ul>
            {entries.map(([id, row]) => (
              <li key={id}>
                <Cell label={row.label} />
              </li>
            ))}
          </ul>
        )
      }
    `
    const clientJs = getClientJs(source, 'Table.tsx')
    // Materialize branch present.
    expect(clientJs).toMatch(/if \(!__iterEl\)/)
    // Per-iteration template is `<li ...>...renderChild('Cell', ...)...</li>`.
    const matMatch = clientJs.match(/__tpl\.innerHTML = `([^`]*)`/)
    expect(matMatch).toBeTruthy()
    const inner = matMatch![1]
    expect(inner).toMatch(/^<li\b/)
    expect(inner).toMatch(/\$\{renderChild\('Cell', \{[^}]*label: row\.label[^}]*\}/)
    // The materialize must NOT emit a `data-bf-ph` placeholder for
    // composite-with-nested-component static loops — that's the
    // useElementReconciliation shape, which the classifier forbids for
    // static arrays.
    expect(inner).not.toMatch(/data-bf-ph=/)
    // Nested-comp init still runs after materialize.
    expect(clientJs).toMatch(/initChild\('Cell',/)
  })

  test('block-body .map emits mapPreamble at forEach top, visible to both branches', () => {
    // When the arrow body is a block (`{ const count = ...; return ... }`),
    // the const declaration lands in `csrMaterialize.mapPreamble`. The
    // emitter places it at the forEach body's top — BEFORE the
    // `let __iterEl` lookup — so the declared local is in scope for BOTH
    // the materialize-clone template literal AND any reactive bind that
    // happens to reference it. Pinning the preamble inside
    // `if (!__iterEl) { ... }` only would leave reactive bindings
    // depending on `expandConstantForReactivity` rescuing every reference,
    // a brittle hidden dependency.
    const source = `
      'use client'
      type Props = { reactions: Record<string, string[]>; currentUser?: string }
      export function ReactionWithPreamble(props: Props) {
        const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
        return (
          <div>
            {entries.map(([emoji, users]) => {
              const count = users.length
              return <button key={emoji}>{emoji}: {String(count)}</button>
            })}
          </div>
        )
      }
    `
    const clientJs = getClientJs(source, 'ReactionWithPreamble.tsx')

    // Preamble appears at the forEach body's top — directly after the
    // arrow opener, before the `let __iterEl` lookup. The preamble
    // emit preserves the source-level statement (which may include a
    // trailing semicolon).
    expect(clientJs).toMatch(
      /forEach\(\(\[emoji, users\], __idx\) => \{\s*\n\s+const count = users\.length;?\s*\n\s+let __iterEl/,
    )
    // Split into the two halves of the forEach body.
    const matMatch = clientJs.match(/if \(!__iterEl\) \{([\s\S]*?)\n {6}\}\n {6}if \(__iterEl\)/)
    expect(matMatch).toBeTruthy()
    const materializeBlock = matMatch![1]
    // Preamble is NOT duplicated inside the materialize branch.
    expect(materializeBlock).not.toMatch(/const count = users\.length/)
    // The cloned template still references `count` — now resolved by the
    // forEach-scope `const` introduced just above.
    expect(materializeBlock).toMatch(/\$\{String\(count\)\}/)
  })
})
