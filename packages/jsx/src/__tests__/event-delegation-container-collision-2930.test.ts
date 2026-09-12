/**
 * BarefootJS Compiler — container's own handler vs. a `.map()` row's
 * delegated handler for the same event (#2930).
 *
 * `.map()` rows compiled via delegation share their delegated listener's
 * DOM node with the loop's static container. When the container ALSO
 * carries its own directly-authored handler for the same event, both used
 * to become separate `addEventListener` calls on the identical node, so a
 * row's `stopPropagation()` could never stop the container's own handler
 * (native DOM: `stopPropagation()` only blocks bubbling to *other nodes*,
 * never other listeners already registered on the *same* node).
 *
 * The fix merges the two into ONE listener: the delegated dispatch runs
 * first, and the container's own handler only fires when the event's
 * `cancelBubble` flag is still false — i.e. no row handler called
 * `stopPropagation()`/`stopImmediatePropagation()`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compileClientJs(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('event delegation vs. container own handler (#2930)', () => {
  test('static array: container onContextMenu merges into the row delegation listener', () => {
    const source = `
      'use client'
      const items = ['a', 'b', 'c']

      export function Repro() {
        return (
          <div
            id="container"
            onContextMenu={(e) => {
              e.preventDefault()
              console.log('container handler')
            }}
          >
            {items.map(item => (
              <div
                key={item}
                data-item={item}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log('row handler', item)
                }}
              >
                row {item}
              </div>
            ))}
          </div>
        )
      }
    `
    const content = compileClientJs(source)

    // Exactly one addEventListener('contextmenu', ...) on the shared
    // container — not two separate registrations.
    const registrations = content.match(/\.addEventListener\('contextmenu'/g) ?? []
    expect(registrations).toHaveLength(1)

    // The merged listener fires the row handler, then gates the
    // container's own handler on `cancelBubble`, and also fires it
    // unconditionally when no row matched (click on the container's own
    // background).
    expect(content).toContain('row handler')
    expect(content).toContain('container handler')
    expect(content).toContain('!__bfEvt.cancelBubble')

    // The row handler must be checked (and able to call stopPropagation)
    // BEFORE the cancelBubble-gated container call.
    const rowPos = content.indexOf("console.log('row handler'")
    const gatePos = content.indexOf('!__bfEvt.cancelBubble')
    expect(rowPos).toBeGreaterThan(-1)
    expect(gatePos).toBeGreaterThan(-1)
    expect(rowPos).toBeLessThan(gatePos)
  })

  test('dynamic loop: container onContextMenu merges into the row delegation listener', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Repro() {
        const [items, setItems] = createSignal(['a', 'b', 'c'])
        return (
          <div
            onContextMenu={(e) => {
              e.preventDefault()
              console.log('container handler')
            }}
          >
            {items().map(item => (
              <div
                key={item}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log('row handler', item)
                }}
              >
                row {item}
              </div>
            ))}
          </div>
        )
      }
    `
    const content = compileClientJs(source)

    const registrations = content.match(/\.addEventListener\('contextmenu'/g) ?? []
    expect(registrations).toHaveLength(1)
    expect(content).toContain('!__bfEvt.cancelBubble')
  })

  test('container handler alone (no row collision) stays byte-unaffected', () => {
    const source = `
      'use client'
      const items = ['a', 'b', 'c']

      export function Repro() {
        return (
          <div onContextMenu={(e) => console.log('container handler')}>
            {items.map(item => <div key={item}>row {item}</div>)}
          </div>
        )
      }
    `
    const content = compileClientJs(source)

    // No loop event to delegate at all — the container's own listener is
    // the ordinary direct-listener emission, unaffected by this change.
    expect(content).not.toContain('cancelBubble')
    const registrations = content.match(/\.addEventListener\('contextmenu'/g) ?? []
    expect(registrations).toHaveLength(1)
  })

  test('row handler alone (no container collision) stays byte-unaffected', () => {
    const source = `
      'use client'
      const items = ['a', 'b', 'c']

      export function Repro() {
        return (
          <div>
            {items.map(item => (
              <div key={item} onContextMenu={(e) => { e.stopPropagation(); console.log('row handler', item) }}>
                row {item}
              </div>
            ))}
          </div>
        )
      }
    `
    const content = compileClientJs(source)

    // Delegation-only — no own handler to gate, so no cancelBubble check
    // is introduced.
    expect(content).not.toContain('cancelBubble')
    const registrations = content.match(/\.addEventListener\('contextmenu'/g) ?? []
    expect(registrations).toHaveLength(1)
  })

  test('two real nested elements (no .map()) keep two independent listeners', () => {
    // The structurally simpler case from the issue report: no delegation
    // involved at all, so native bubbling already does the right thing and
    // this change must not touch it.
    const source = `
      'use client'

      export function Repro() {
        return (
          <div onContextMenu={(e) => console.log('outer')}>
            <div onContextMenu={(e) => { e.stopPropagation(); console.log('inner') }}>
              inner
            </div>
          </div>
        )
      }
    `
    const content = compileClientJs(source)

    expect(content).not.toContain('cancelBubble')
    const registrations = content.match(/\.addEventListener\('contextmenu'/g) ?? []
    expect(registrations).toHaveLength(2)
  })
})
