/**
 * #2835 — `isDirectPropBindingName` (jsx-to-ir.ts) checked `ctx.patterns.props`,
 * a regex-matching set that, for a whole `(props: Props)` parameter, includes
 * every one of `Props`'s type-member names regardless of whether that name is
 * bound to anything in the current component (`extractPropsFromTypeMembers`,
 * analyzer.ts — needed there so `props.<key>` still regex-matches). Reused as
 * a "is this name a prop binding" check, that over-inclusion let an unrelated
 * module/local identifier resolve as prop-derived purely by sharing a type
 * member's name, with zero aliasing involved (reproduces identically on
 * pre-#2724 `main`).
 *
 * Fix: `isDirectPropBindingName` now reads `ctx.boundPropNames`
 * (`boundPropLocalNames`, `props-binding.ts`) — empty for a whole
 * non-destructured props parameter, since `propsParams` there is type-member
 * names, not local bindings.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRNode } from '../types'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

/** First `IRLoop` node found in a DFS of the component IR. */
function findLoop(node: IRNode | null, predicate: (n: any) => boolean = () => true): any {
  if (!node || typeof node !== 'object') return undefined
  if ((node as any).type === 'loop' && predicate(node)) return node
  for (const key of Object.keys(node)) {
    const v = (node as any)[key]
    if (Array.isArray(v)) {
      for (const c of v) {
        const found = findLoop(c, predicate)
        if (found) return found
      }
    } else if (v && typeof v === 'object') {
      const found = findLoop(v, predicate)
      if (found) return found
    }
  }
  return undefined
}

/** First element node with a non-null `slotId`, found in a DFS of the IR. */
function findSlottedElement(node: IRNode | null): any {
  if (!node || typeof node !== 'object') return undefined
  if ((node as any).type === 'element' && (node as any).slotId) return node
  for (const key of Object.keys(node)) {
    const v = (node as any)[key]
    if (Array.isArray(v)) {
      for (const c of v) {
        const found = findSlottedElement(c)
        if (found) return found
      }
    } else if (v && typeof v === 'object') {
      const found = findSlottedElement(v)
      if (found) return found
    }
  }
  return undefined
}

function loopFlags(source: string, filename: string, predicate?: (n: any) => boolean) {
  const ctx = analyzeComponent(source, filename, 'List')
  const ir = jsxToIR(ctx)
  expect(ir).not.toBeNull()
  const loop = findLoop(ir, predicate)
  expect(loop).toBeDefined()
  return { isStaticArray: loop.isStaticArray as boolean, isPropDerivedArray: loop.isPropDerivedArray as boolean | undefined }
}

const CHILD = `
  type ItemProps = { label: string }
  function Item(props: ItemProps) {
    const [on, setOn] = createSignal(false)
    return <button onClick={() => setOn(!on())}>{props.label}: {on() ? 'ON' : 'OFF'}</button>
  }
`

describe('#2835 — name collision with a whole-props type member is not prop-derived', () => {
  test('headline: a module const colliding with `Props.base` stays static (type alias)', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      const base = [{ label: 'z' }]
      type Props = { base: ItemProps[] }
      export function List(props: Props) {
        return <div>{base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'ModuleConstCollision.tsx')
    expect(flags.isStaticArray).toBe(true)
    expect(flags.isPropDerivedArray).toBeUndefined()
  })

  test('same collision with `interface Props`', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      const base = [{ label: 'z' }]
      interface Props { base: ItemProps[] }
      export function List(props: Props) {
        return <div>{base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'InterfaceCollision.tsx')
    expect(flags.isStaticArray).toBe(true)
    expect(flags.isPropDerivedArray).toBeUndefined()
  })

  test('same collision with an inline type-literal props annotation', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      const base = [{ label: 'z' }]
      export function List(props: { base: ItemProps[] }) {
        return <div>{base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'InlineTypeCollision.tsx')
    expect(flags.isStaticArray).toBe(true)
    expect(flags.isPropDerivedArray).toBeUndefined()
  })

  test('a component-local const literal colliding with a type member also stays static (not reachable via Go BF101 either — bakedChildLoop screens it out first)', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      type Props = { base: ItemProps[] }
      export function List(props: Props) {
        const base = [{ label: 'z' }]
        return <div>{base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'LocalConstCollision.tsx')
    expect(flags.isStaticArray).toBe(true)
    expect(flags.isPropDerivedArray).toBeUndefined()
  })

  test('the collision survives an alias hop', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      const base = [{ label: 'z' }]
      type Props = { base: ItemProps[] }
      export function List(props: Props) {
        const b = base
        return <div>{b.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'AliasedCollision.tsx')
    expect(flags.isStaticArray).toBe(true)
    expect(flags.isPropDerivedArray).toBeUndefined()
  })

  test('regression guard: destructured props still resolve to mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { base: ItemProps[] }
      export function List({ base }: Props) {
        return <div>{base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'DestructuredRegression.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('regression guard: a renamed destructure ({ base: rows }) still resolves to mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { base: ItemProps[] }
      export function List({ base: rows }: Props) {
        return <div>{rows.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'RenamedDestructureRegression.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('regression guard: a renamed destructure keeps a same-named module const static (no name collision through the rename)', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      const base = [{ label: 'z' }]
      type Props = { base: ItemProps[] }
      export function List({ base: rows }: Props) {
        return <div>{base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'RenamedDestructureModuleConst.tsx')
    expect(flags.isStaticArray).toBe(true)
    expect(flags.isPropDerivedArray).toBeUndefined()
  })

  test('regression guard: whole-props body destructure (`const { base } = props`) still resolves to mapArray via `.parsed`, not the name-only branch', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { base: ItemProps[] }
      export function List(props: Props) {
        const { base } = props
        return <div>{base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'WholePropsBodyDestructure.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('regression guard: direct `props.base` access still resolves to mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { base: ItemProps[] }
      export function List(props: Props) {
        return <div>{props.base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'DirectMemberAccessRegression.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('regression guard: a rest-spread sibling name is unaffected (no collision to guard against)', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      const base = [{ label: 'z' }]
      type Props = { other: string; base: ItemProps[] }
      export function List({ other, ...rest }: Props) {
        return <div>{other}{base.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'RestSpreadSibling.tsx')
    expect(clientJs).not.toMatch(/\bmapArray(Lazy)?\s*\(/)
  })

  test('non-impact pin: `ctx.patterns.props`\' regex detection of `props.<key>` in a whole-props component is unaffected — the element still gets a slot id', () => {
    const ctx = analyzeComponent(`
      'use client'
      type Props = { base: { label: string }[] }
      export function List(props: Props) {
        return <div class={props.base.length ? 'a' : 'b'}>static</div>
      }
    `, 'NonImpactPin.tsx', 'List')
    const ir = jsxToIR(ctx)
    const el = findSlottedElement(ir)
    expect(el).toBeDefined()
    expect(el.slotId).not.toBeNull()
  })
})
