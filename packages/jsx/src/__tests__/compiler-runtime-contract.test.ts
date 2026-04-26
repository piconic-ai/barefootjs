/**
 * Compiler-Runtime Contract Tests
 *
 * Verifies that compiler-generated code uses conventions that the runtime
 * expects. These tests catch mismatches between the two layers that would
 * otherwise fail silently at runtime.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '..'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'

const adapter = new HonoAdapter()
function compileClient(source: string, filename = 'Test.tsx') {
  const result = compileJSXSync(source, filename, { adapter })
  return result.files.find(f => f.type === 'clientJs')?.content ?? ''
}

describe('Compiler-Runtime Contract', () => {
  describe('event names are lowercase', () => {
    test('onClick generates lowercase click', () => {
      const js = compileClient(`
        "use client"
        export function Test() {
          return <button onClick={() => {}}>click</button>
        }
      `)
      // All addEventListener calls should use lowercase event names
      const eventMatches = js.match(/addEventListener\('([^']+)'/g) ?? []
      for (const match of eventMatches) {
        const eventName = match.match(/addEventListener\('([^']+)'/)?.[1]
        if (eventName) {
          expect(eventName).toBe(eventName.toLowerCase())
        }
      }
    })

    test('onKeyDown generates lowercase keydown', () => {
      const js = compileClient(`
        "use client"
        export function Test() {
          return <input onKeyDown={() => {}} />
        }
      `)
      expect(js).toContain("'keydown'")
      expect(js).not.toContain("'keyDown'")
    })

    test('onDoubleClick generates dblclick', () => {
      const js = compileClient(`
        "use client"
        export function Test() {
          return <div onDoubleClick={() => {}}>dbl</div>
        }
      `)
      expect(js).toContain("'dblclick'")
      expect(js).not.toContain("'doubleclick'")
    })
  })

  describe('scope ID patterns', () => {
    test('hydrate uses ComponentName_ prefix', () => {
      const js = compileClient(`
        "use client"
        export function MyWidget() {
          return <div>hello</div>
        }
      `)
      expect(js).toContain("hydrate('MyWidget'")
      expect(js).toContain('function initMyWidget(')
    })

    test('child components use slot suffix in renderChild', () => {
      const js = compileClient(`
        "use client"
        import { Button } from './Button'
        export function Test() {
          return <Button>click</Button>
        }
      `)
      // renderChild should pass a slot suffix like 's0', 's1', etc.
      expect(js).toMatch(/renderChild\('Button',\s*\{[^}]*\},\s*undefined,\s*'s\d+'\)/)
    })
  })

  describe('key pipeline', () => {
    test('outer loop uses data-key attribute', () => {
      const js = compileClient(`
        "use client"
        import { createSignal } from '@barefootjs/client'
        export function Test() {
          const [items] = createSignal([{id: 1}])
          return <ul>{items().map(item => <li key={item.id}>{item.id}</li>)}</ul>
        }
      `)
      expect(js).toContain("data-key")
      expect(js).not.toContain("data-item-key")
    })

    test('nested loop uses data-key-N for inner levels', () => {
      const js = compileClient(`
        "use client"
        import { createSignal } from '@barefootjs/client'
        export function Test() {
          const [groups] = createSignal([{id: 'g1', items: [{id: 'i1'}]}])
          return <div>{groups().map(group => (
            <div key={group.id}>
              {group.items.map(item => <span key={item.id}>{item.id}</span>)}
            </div>
          ))}</div>
        }
      `)
      // Outer loop: data-key
      expect(js).toContain('data-key')
      // Inner loop: data-key-1 (depth 1)
      expect(js).toContain('data-key-1')
      // Should not have data-key-0 (depth 0 uses data-key, not data-key-0)
      expect(js).not.toContain('data-key-0')
    })

    test('loop inside conditional: outer=data-key, inner=data-key-1 in SSR template', () => {
      // Regression: SSR template for conditional branch used to generate
      // data-key-1/data-key-2 (off-by-one), mismatching the event dispatcher
      // which expects data-key/data-key-1. Broke click handlers on inner-loop
      // elements inside conditional branches.
      const js = compileClient(`
        "use client"
        import { createSignal } from '@barefootjs/client'
        export function Test() {
          const [show] = createSignal(true)
          const [groups] = createSignal([{id: 'g1', items: [{id: 'i1'}]}])
          return (
            <div>
              {show() ? (
                <div>
                  {groups().map(group => (
                    <div key={group.id}>
                      {group.items.map(item => (
                        <button key={item.id} onClick={() => {}}>
                          {item.id}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }
      `)
      // The SSR template inside insert(..., { template: () => ... }) must use
      // data-key for outer items and data-key-1 for inner items, matching
      // what the event dispatcher searches for.
      expect(js).not.toContain('data-key-2')
      // Outer loop items must have data-key in the SSR branch template.
      // Post-O-7 the emission is an unguarded template-literal interpolation
      // (`data-key="${group.id}"`) instead of a `... != null ? ... : ''`
      // ternary string concat.
      expect(js).toMatch(/data-key="\$\{group\.id\}"/)
      // Inner loop items must have data-key-1 in the SSR branch template.
      expect(js).toMatch(/data-key-1="\$\{item\.id\}"/)
    })

    test('loop inside conditional wires reactive conditionals in mapArray callback', () => {
      // Regression: simple loops inside conditional branches used to skip
      // reactive-effect setup and just `return __existing` for hydrated items.
      // That meant conditionals inside the loop body that read non-item signals
      // (e.g., memos) never re-evaluated when those signals changed.
      const js = compileClient(`
        "use client"
        import { createSignal, createMemo } from '@barefootjs/client'
        type CountMap = Record<string, number>
        export function Test() {
          const [show] = createSignal(true)
          const [events] = createSignal<number[]>([])
          const [days] = createSignal([{key: 'd1'}, {key: 'd2'}])
          const countByDay = createMemo<CountMap>(() => ({ d1: events().length }))
          return (
            <div>
              {show() ? (
                <div>
                  {days().map(d => (
                    <div key={d.key}>
                      {(countByDay()[d.key] ?? 0) > 0 ? (
                        <span className="count">{countByDay()[d.key]}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }
      `)
      // The mapArray callback must set up the reactive conditional via insert()
      // instead of short-circuiting with `if (__existing) return __existing`.
      expect(js).toMatch(/mapArray\(\(\) => days\(\),[\s\S]+?insert\(__el,/)
    })

    test('key in HTML template uses data-key attribute name', () => {
      const result = compileJSXSync(`
        "use client"
        import { createSignal } from '@barefootjs/client'
        export function Test() {
          const [items] = createSignal([{id: 1}])
          return <ul>{items().map(item => <li key={item.id}>{item.id}</li>)}</ul>
        }
      `, 'Test.tsx', { adapter })
      const template = result.files.find(f => f.type === 'markedTemplate')?.content ?? ''
      // Template should have data-key attribute for loop items
      expect(template).toContain('data-key')
    })
  })

  describe('variable name safety', () => {
    test('parent-owned slot IDs do not contain ^ in variable names', () => {
      const js = compileClient(`
        "use client"
        import { createSignal } from '@barefootjs/client'
        import { Button } from './Button'
        export function Test() {
          const [items] = createSignal(['a', 'b'])
          return <div>{items().map(item => (
            <div key={item}>
              <Button onClick={() => {}}>{item}</Button>
            </div>
          ))}</div>
        }
      `)
      // ^ should never appear in variable names (would cause syntax error)
      const varDecls = js.match(/const __\w+/g) ?? []
      for (const decl of varDecls) {
        expect(decl).not.toContain('^')
      }
    })
  })

  describe('module-level functions', () => {
    test('module-level function without component deps emits at module scope', () => {
      // Uses the existing test from client-js-generation.test.ts (module-level function scope isolation)
      const js = compileClient(`
        "use client"
        import { createSignal } from '@barefootjs/client'
        function computeError(field: { value: string }, allFields: { id: number; value: string }[]) {
          const basicError = field.value === '' ? 'Required' : ''
          const isDuplicate = allFields.some(f => f.id !== 0 && f.value === field.value)
          return isDuplicate ? 'Duplicate' : basicError
        }
        export function MyComponent() {
          const [items, setItems] = createSignal([{ id: 1, value: '' }])
          const error = computeError(items()[0], items())
          return <div>{error}</div>
        }
      `)
      // Module-level function should appear before init function using var ?? pattern
      expect(js).toContain('var computeError = computeError ?? function(')
      const helperPos = js.indexOf('var computeError')
      const initPos = js.indexOf('export function initMyComponent(')
      expect(helperPos).toBeGreaterThan(-1)
      expect(helperPos).toBeLessThan(initPos)
    })

    test('component-level function referencing signals stays inside init', () => {
      const js = compileClient(`
        "use client"
        import { createSignal } from '@barefootjs/client'
        export function Test() {
          const [count, setCount] = createSignal(0)
          function increment() { setCount(c => c + 1) }
          return <button onClick={increment}>{count()}</button>
        }
      `)
      // Component-level function should be inside init (as arrow function const)
      const initPos = js.indexOf('export function initTest(')
      const fnPos = js.indexOf('const increment')
      expect(fnPos).toBeGreaterThan(initPos)
    })
  })
})
