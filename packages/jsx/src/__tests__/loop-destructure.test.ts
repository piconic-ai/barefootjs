/**
 * Tests for #2087 Phase A: `isLowerableLoopDestructure` (née
 * `isLowerableObjectRestDestructure`) — the gate template adapters use to
 * decide whether a `.map()` callback's destructure param can be lowered
 * natively, versus falling back to the BF104 diagnostic.
 *
 * Compiles a small component to IR (`analyzeComponent` + `jsxToIR`, the same
 * helper pattern as `ir-sort-comparator.test.ts`), locates the `IRLoop`
 * node, and asserts the gate's verdict plus (where relevant) the structured
 * `segments` path each binding carries.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { isLowerableLoopDestructure, isLowerableObjectRestDestructure } from '../loop-destructure'
import { ErrorCodes } from '../errors'
import type { IRLoop, IRNode } from '../types'

function findFirstLoop(node: IRNode): IRLoop {
  if (node.type === 'loop') return node
  if (node.type === 'element' || node.type === 'fragment') {
    for (const child of node.children) {
      if (child.type === 'loop') return child
      if (child.type === 'element' || child.type === 'fragment') {
        try {
          return findFirstLoop(child)
        } catch {
          // keep scanning siblings
        }
      }
    }
  }
  throw new Error('no loop node found in IR')
}

function compileLoop(
  source: string,
  targetComponentName?: string,
  filename = 'Test.tsx',
): { loop: IRLoop; errors: ReturnType<typeof analyzeComponent>['errors'] } {
  const ctx = analyzeComponent(source, filename, targetComponentName)
  const ir = jsxToIR(ctx)
  expect(ir).not.toBeNull()
  return { loop: findFirstLoop(ir!), errors: ctx.errors }
}

describe('isLowerableLoopDestructure (#2087)', () => {
  test('simple .field bindings + object-rest read via member access → true (existing behavior)', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Task = { id: string; title: string; flag: string }
      export function RestObject() {
        const [tasks, setTasks] = createSignal<Task[]>([])
        return (
          <ul onClick={() => setTasks(t => t)}>
            {tasks().map(({ id, title, ...rest }) => (
              <li key={id}>{title}:{rest.flag}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(true)
  })

  test('array-index tuple destructure ([k, v]) → true (NEW)', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Row = readonly [string, string]
      export function IndexPairs() {
        const [rows, setRows] = createSignal<Row[]>([])
        return (
          <ul onClick={() => setRows(r => r)}>
            {rows().map(([k, v]) => (
              <li key={k}>{k}:{v}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(true)
  })

  test('nested { id, cells: [head] } → true (NEW)', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Row = { id: string; cells: readonly string[] }
      export function NestedHead() {
        const [rows, setRows] = createSignal<Row[]>([])
        return (
          <ul onClick={() => setRows(r => r)}>
            {rows().map(({ id, cells: [head] }) => (
              <li key={id}>{head}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(true)
  })

  test('array-rest [first, ...tail] with tail.length read → true (NEW)', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function RestTuple() {
        const [rows, setRows] = createSignal<string[][]>([])
        return (
          <ul onClick={() => setRows(r => r)}>
            {rows().map(([first, ...tail]) => (
              <li key={first}>{first} (+{tail.length})</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(true)
  })

  test('object-rest {...rest} spread onto the loop-item root <li> → true (NEW)', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Task = { id: string; title: string; flag: string }
      export function RestSpread() {
        const [tasks, setTasks] = createSignal<Task[]>([])
        return (
          <ul onClick={() => setTasks(t => t)}>
            {tasks().map(({ id, title, ...rest }) => (
              <li key={id} {...rest}>{title}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(true)
  })

  test('object-rest spread on a COMPONENT (<Child {...rest} />) → false', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Task = { id: string; title: string; flag: string }
      function Child(props: { title: string; flag: string }) {
        return <span>{props.title}</span>
      }
      export function RestOntoComponent() {
        const [tasks, setTasks] = createSignal<Task[]>([])
        return (
          <ul onClick={() => setTasks(t => t)}>
            {tasks().map(({ id, ...rest }) => (
              <li key={id}><Child {...rest} /></li>
            ))}
          </ul>
        )
      }
    `, 'RestOntoComponent')
    expect(isLowerableLoopDestructure(loop)).toBe(false)
  })

  test('object-rest bare value use in a text expression ({String(rest)}) → false', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Task = { id: string; title: string; flag: string }
      export function RestBareText() {
        const [tasks, setTasks] = createSignal<Task[]>([])
        return (
          <ul onClick={() => setTasks(t => t)}>
            {tasks().map(({ id, ...rest }) => (
              <li key={id}>{String(rest)}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(false)
  })

  test('object-rest bare value use in an event handler (onClick={() => fn(rest)}) → false', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Task = { id: string; title: string; flag: string }
      export function RestBareHandler() {
        const [tasks, setTasks] = createSignal<Task[]>([])
        const fn = (t: unknown) => {}
        return (
          <ul>
            {tasks().map(({ id, ...rest }) => (
              <li key={id} onClick={() => fn(rest)}>{id}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(false)
  })

  test('.filter(...).map(({a}) => ...) chain → false', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Task = { id: string; done: boolean }
      export function FilterChain() {
        const [tasks, setTasks] = createSignal<Task[]>([])
        return (
          <ul onClick={() => setTasks(t => t)}>
            {tasks().filter(t => !t.done).map(({ id }) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(false)
  })

  test('binding named __bf_item → false', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ReservedName() {
        const [rows, setRows] = createSignal<{ __bf_item: string }[]>([])
        return (
          <ul onClick={() => setRows(r => r)}>
            {rows().map(({ __bf_item }) => (
              <li key={__bf_item}>{__bf_item}</li>
            ))}
          </ul>
        )
      }
    `)
    expect(isLowerableLoopDestructure(loop)).toBe(false)
  })

  test('computed property key still raises BF025 and produces no paramBindings (unchanged)', () => {
    const { loop, errors } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      const KEY = 'a' as const
      export function Computed() {
        const [items, setItems] = createSignal<Record<string, number>[]>([])
        return (
          <ul onClick={() => setItems(i => i)}>
            {items().map(({ [KEY]: v }) => <li key={v}>{v}</li>)}
          </ul>
        )
      }
    `)
    const bf025 = errors.filter(e => e.code === ErrorCodes.UNSUPPORTED_DESTRUCTURE_REST)
    expect(bf025.length).toBe(1)
    expect(bf025[0].severity).toBe('error')
    expect(loop.paramBindings).toBeUndefined()
    expect(isLowerableLoopDestructure(loop)).toBe(false)
  })

  test('deprecated alias isLowerableObjectRestDestructure is the same function', () => {
    expect(isLowerableObjectRestDestructure).toBe(isLowerableLoopDestructure)
  })

  test('segments: nested { id, cells: [head, ...rest] } pins field/index/non-ident classification', () => {
    const { loop } = compileLoop(`
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Row = { id: string; cells: readonly string[]; 'data-priority': string }
      export function NestedSegments() {
        const [rows, setRows] = createSignal<Row[]>([])
        return (
          <ul onClick={() => setRows(r => r)}>
            {rows().map(({ id, cells: [head, ...rest], 'data-priority': prio }) => (
              <li key={id}>{head}:{String(rest.length)}:{prio}</li>
            ))}
          </ul>
        )
      }
    `)
    const bindings = loop.paramBindings
    expect(bindings).toBeDefined()

    const idBinding = bindings!.find(b => b.name === 'id')
    expect(idBinding?.segments).toEqual([{ kind: 'field', key: 'id', isIdent: true }])

    const headBinding = bindings!.find(b => b.name === 'head')
    expect(headBinding?.segments).toEqual([
      { kind: 'field', key: 'cells', isIdent: true },
      { kind: 'index', index: 0 },
    ])

    const restBinding = bindings!.find(b => b.name === 'rest')
    expect(restBinding?.rest?.kind).toBe('array')
    expect(restBinding?.segments).toEqual([{ kind: 'field', key: 'cells', isIdent: true }])

    const prioBinding = bindings!.find(b => b.name === 'prio')
    expect(prioBinding?.segments).toEqual([{ kind: 'field', key: 'data-priority', isIdent: false }])
  })
})
