/**
 * #2724 — a bare `const x = y` alias hop between a prop and a keyed
 * `.map()` of child components made the loop's array look, to
 * `isArrayExprDirectPropRef` (jsx-to-ir.ts), like a local constant with no
 * prop/signal origin. The loop was then classified `isStaticArray: true`
 * and compiled to the static `qsaChildScopes` + `forEach` init path instead
 * of `mapArray`. That static path's `renderChild()` calls (client runtime)
 * carry no `bf-h`/`bf-m` scope-relationship attributes on a CSR-only mount
 * (no existing SSR markup to hydrate against), so the `qsaChildScopes`
 * selector in the static init never matches — the row's child component
 * never gets `initChild`ed, so its signals and event listeners never wire
 * up. Found by the #2481 mutation sweep's `alias-props` mutation against
 * the `toggle-shared` fixture (`packages/adapter-tests/e2e/
 * mutation-quarantine.ts`'s former G4 entry).
 *
 * Fix: `isArrayExprDirectPropRef` now resolves a bare identifier through a
 * `const x = y` alias-hop chain via `resolveAliasOrigin`
 * (`props-binding.ts`) — the same shared walker `forwardsCallerRestProps`
 * already uses for the rest/props-spread alias case — checking, at each
 * hop, whether the name is itself a destructured prop OR a local constant
 * whose `.parsed` shape is a bare `<propsObjName>.<key>` member access.
 * Deliberately structural (AST-derived), not the regex-based
 * `isPropsReference`: this return value also feeds `IRLoop.
 * isPropDerivedArray`, which the Go adapter reads to decide whether a
 * nested component's field is literally the loop's prop-sourced data, so a
 * regex false positive here would misclassify DSL-adapter codegen too, not
 * just add a redundant `mapArray`.
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

const CHILD = `
  type ItemProps = { label: string }
  function Item(props: ItemProps) {
    const [on, setOn] = createSignal(false)
    return <button onClick={() => setOn(!on())}>{props.label}: {on() ? 'ON' : 'OFF'}</button>
  }
`

describe('#2724 — prop-alias keyed loop stays on mapArray, not the static path', () => {
  test('one-hop alias of a destructured prop uses mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List({ items }: Props) {
        const items__alias = items
        return <div>{items__alias.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'AliasHop.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('local const derived from a whole-props member access uses mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List(props: Props) {
        const arr = props.items
        return <div>{arr.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'MemberAlias.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('two-hop alias chain uses mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List({ items }: Props) {
        const a1 = items
        const a2 = a1
        return <div>{a2.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'TwoHop.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('regression guard: a genuinely static module-level array still takes the static path', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      const ITEMS: ItemProps[] = [{ label: 'a' }, { label: 'b' }]
      export function List() {
        return <div>{ITEMS.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'ModuleConst.tsx')
    expect(clientJs).toMatch(/qsaChildScopes\(/)
    expect(clientJs).not.toMatch(/\bmapArray(Lazy)?\s*\(/)
  })

  test('false-positive guard: an unrelated local object that merely shares a prop-like key name stays static', () => {
    // `state.items` must not be mistaken for `props.items` just because
    // `items` is also a destructured prop name elsewhere in the component —
    // the alias walk only ever resolves `state`'s OWN declaration, never a
    // same-named identifier's meaning at a different binding site.
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List({ items }: Props) {
        const state = { items: [{ label: 'z' }] }
        return <div>{state.items.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'NameCollision.tsx')
    expect(clientJs).toMatch(/qsaChildScopes\(/)
    expect(clientJs).not.toMatch(/\bmapArray(Lazy)?\s*\(/)
  })
})
