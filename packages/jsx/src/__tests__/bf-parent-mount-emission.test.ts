/**
 * BarefootJS Compiler — bf-parent / bf-mount emission
 *
 * Asserts that the Hono adapter:
 *   1. Threads `__bfParent` / `__bfMount` props through each child-component
 *      JSX call so the child template can pick them up.
 *   2. Emits `bf-parent` / `bf-mount` attributes on the child component's
 *      root element.
 *   3. Passes the parent's `__scope` as the 6th argument to `upsertChild`
 *      (and `upsertChildItem`) so the runtime can derive parent identity
 *      even when the loop-item parent element is a freshly-cloned
 *      detached fragment.
 *
 * These contracts back the recursion-friendly `upsertChild` lookup —
 * regression here would re-introduce the self-referential-recursion
 * exponential duplication bug fixed in #1224.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new HonoAdapter()

describe('bf-parent / bf-mount emission (Hono adapter)', () => {
  test('child component receives __bfParent / __bfMount and stamps bf-parent / bf-mount on root', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Card() {
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <Inner label={count()} />
          </div>
        )
      }

      export function Inner(props: { label: number }) {
        return <span>{props.label}</span>
      }
    `
    const result = compileJSX(source, 'Card.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const ssrTemplate = result.files.find(f => f.path.endsWith('.tsx'))
    expect(ssrTemplate).toBeDefined()

    // 1. The parent's JSX threads __bfParent / __bfMount when mounting Inner.
    expect(ssrTemplate!.content).toContain('__bfParent={__scopeId}')
    expect(ssrTemplate!.content).toContain("__bfMount={'s")

    // 2. The child's root element emits bf-parent / bf-mount when those
    //    props are present (rendered conditionally via {...(__bfParent ? ... : {})}).
    expect(ssrTemplate!.content).toContain('"bf-parent": __bfParent')
    expect(ssrTemplate!.content).toContain('"bf-mount": __bfMount')
  })

  test('child component inside a reactive .map() loop body passes __scope to upsertChild', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [items, setItems] = createSignal([{ id: 1, name: 'a' }])
        return (
          <ul>
            {items().map(item => (
              <li key={item.id}><Row name={item.name} /></li>
            ))}
          </ul>
        )
      }

      export function Row(props: { name: string }) {
        return <span>{props.name}</span>
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()

    // upsertChild call is emitted with __scope as the 6th argument so the
    // runtime can derive bf-parent context for the freshly-cloned <li>.
    expect(clientJs!.content).toMatch(/upsertChild\(.*__scope\)/)
  })

  test('self-referential recursive child still threads __bfParent / __bfMount', () => {
    // The motivating case for #1224: <Tree> renders <Tree> directly inside
    // its own JSX. The compiler must still emit __bfParent / __bfMount on
    // the recursive call site (otherwise the runtime can't disambiguate
    // depths that share the same slot id).
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      export function Tree(props: { item: { id: number; label: string; children: any[] } }) {
        const children = createMemo(() => props.item.children)
        return (
          <div>
            <span>{props.item.label}</span>
            <ul>
              {children().map(c => (
                <li key={c.id}><Tree item={c} /></li>
              ))}
            </ul>
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Tree.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const ssrTemplate = result.files.find(f => f.path.endsWith('.tsx'))
    expect(ssrTemplate).toBeDefined()
    expect(ssrTemplate!.content).toContain('__bfParent={__scopeId}')
    expect(ssrTemplate!.content).toContain("__bfMount={'s")

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Recursive child mount is wired through upsertChild + __scope anchor.
    expect(clientJs!.content).toMatch(/upsertChild\(.*__scope\)/)
  })
})
