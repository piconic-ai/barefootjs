/**
 * `IRComponent.loopItemRoot` / `derivesScopeFromSlot()` (#2444): a
 * component that is the DIRECT root of a loop row gets its own randomized
 * scope id; a component nested BELOW the row root derives its scope id
 * from parent scope + slot, like any other slotted child. Mirrors Hono's
 * `renderChildrenInLoop` / `renderConditional` ctx-forwarding exactly.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { derivesScopeFromSlot } from '../adapters/child-scope'
import type { IRComponent, IRElement, IRLoop, IRNode } from '../types'

const adapter = new TestAdapter()

function findLoop(node: IRNode): IRLoop {
  if (node.type === 'loop') return node
  if (node.type === 'element') {
    for (const child of node.children) {
      if (child.type === 'loop') return child
    }
  }
  throw new Error('no loop found in IR')
}

describe('IRComponent.loopItemRoot (#2444)', () => {
  test('a component nested below a plain-element loop row root is NOT a loop item root', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Badge(props: { text: string }) {
        return <span>{props.text}</span>
      }
      export function Rows(props: { items: { id: number; label: string }[] }) {
        const [rows] = createSignal(props.items)
        return (
          <ul>
            {rows().map(row => (
              <li key={row.id}>
                <Badge text={row.label} />
              </li>
            ))}
          </ul>
        )
      }
    `
    const ctx = analyzeComponent(source, 'Rows.tsx', 'Rows')
    const ir = jsxToIR(ctx)
    expect(ir).not.toBeNull()

    const loop = findLoop(ir!)
    expect(loop.children).toHaveLength(1)
    const li = loop.children[0] as IRElement
    expect(li.type).toBe('element')
    const badge = li.children.find(c => c.type === 'component') as IRComponent
    expect(badge).toBeDefined()
    expect(badge.loopItemRoot).not.toBe(true)
    expect(derivesScopeFromSlot(badge)).toBe(true)
  })

  test('a component that IS the loop row root IS a loop item root', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Row(props: { label: string }) {
        return <li>{props.label}</li>
      }
      export function Rows(props: { items: { id: number; label: string }[] }) {
        const [rows] = createSignal(props.items)
        return (
          <ul>
            {rows().map(row => (
              <Row key={row.id} label={row.label} />
            ))}
          </ul>
        )
      }
    `
    const ctx = analyzeComponent(source, 'Rows.tsx', 'Rows')
    const ir = jsxToIR(ctx)
    expect(ir).not.toBeNull()

    const loop = findLoop(ir!)
    expect(loop.children).toHaveLength(1)
    const row = loop.children[0] as IRComponent
    expect(row.type).toBe('component')
    expect(row.loopItemRoot).toBe(true)
    expect(derivesScopeFromSlot(row)).toBe(false)
  })

  test('a component in a whole-item conditional loop body IS a loop item root (matches Hono ctx-forwarding)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Row(props: { label: string }) {
        return <li>{props.label}</li>
      }
      export function Rows(props: { items: { id: number; label: string; show: boolean }[] }) {
        const [rows] = createSignal(props.items)
        return (
          <ul>
            {rows().map(row => row.show && <Row key={row.id} label={row.label} />)}
          </ul>
        )
      }
    `
    const ctx = analyzeComponent(source, 'Rows.tsx', 'Rows')
    const ir = jsxToIR(ctx)
    expect(ir).not.toBeNull()

    const loop = findLoop(ir!)
    expect(loop.children).toHaveLength(1)
    const cond = loop.children[0]
    expect(cond.type).toBe('conditional')
    if (cond.type !== 'conditional') throw new Error('unreachable')
    const row = cond.whenTrue as IRComponent
    expect(row.type).toBe('component')
    expect(row.loopItemRoot).toBe(true)
  })

  test('a component nested inside a fragment loop body is NOT a loop item root (Hono does not forward through fragments)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Badge(props: { text: string }) {
        return <span>{props.text}</span>
      }
      export function Rows(props: { items: { id: number; label: string }[] }) {
        const [rows] = createSignal(props.items)
        return (
          <ul>
            {rows().map(row => (
              <>
                <Badge key={row.id} text={row.label} />
              </>
            ))}
          </ul>
        )
      }
    `
    const ctx = analyzeComponent(source, 'Rows.tsx', 'Rows')
    const ir = jsxToIR(ctx)
    expect(ir).not.toBeNull()

    const loop = findLoop(ir!)
    expect(loop.children).toHaveLength(1)
    const fragment = loop.children[0]
    expect(fragment.type).toBe('fragment')
    if (fragment.type !== 'fragment') throw new Error('unreachable')
    const badge = fragment.children.find(c => c.type === 'component') as IRComponent
    expect(badge).toBeDefined()
    expect(badge.loopItemRoot).not.toBe(true)
  })

  test('CSR template: a component nested below the row root passes its slot suffix to renderChild', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Badge(props: { text: string }) {
        return <span>{props.text}</span>
      }
      export function Rows(props: { items: { id: number; label: string }[] }) {
        const [rows] = createSignal(props.items)
        return (
          <ul>
            {rows().map(row => (
              <li key={row.id}>
                <Badge text={row.label} />
              </li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'Rows.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // The nested Badge must receive a slot suffix (4th renderChild arg) so
    // it derives its scope id — a bare `renderChild('Badge', {...})` with
    // no suffix would mean the fix regressed.
    expect(clientJs!.content).toMatch(/renderChild\('Badge[^']*',\s*\{text:\s*row\.label\},\s*undefined,\s*'s\d+'\)/)
  })

  test('CSR template: a component that IS the loop row root still passes its slot id, with the loopItemRoot flag (#2833)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Row(props: { label: string }) {
        return <li>{props.label}</li>
      }
      export function Rows(props: { items: { id: number; label: string }[] }) {
        const [rows] = createSignal(props.items)
        return (
          <ul>
            {rows().map(row => (
              <Row key={row.id} label={row.label} />
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'Rows.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // A row root still doesn't DERIVE its scope from the slot (no `_sN`
    // scope-id suffix elsewhere in this file's other assertions), but it
    // must keep slot identity — a pure-CSR mount's static init selector
    // depends on the `bf-h`/`bf-m` this renders, per `renderChild`'s
    // `loopItemRoot` param docstring (component.ts).
    expect(clientJs!.content).toMatch(/renderChild\('Row[^']*',\s*\{label: row\.label\},\s*row\.id,\s*'s\d+',\s*true\)/)
  })
})
