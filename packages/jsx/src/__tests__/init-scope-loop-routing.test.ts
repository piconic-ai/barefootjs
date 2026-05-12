'use client'
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

describe('init-scope loop array routes through mapArray (#1245)', () => {
  test('component-local const array derived from props uses mapArray', () => {
    const source = `
      'use client'
      export function Bar(props) {
        const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
        return (
          <div>
            {entries.map(([emoji, users]) => (
              <button key={emoji} type="button" onClick={() => props.onClick(emoji)}>
                <span>{emoji}</span>
                <span>{String(users.length)}</span>
              </button>
            ))}
          </div>
        )
      }
    `
    const clientJs = getClientJs(source, 'Bar.tsx')
    // Before #1245 this loop hit the static-array path: `forEach` over the
    // array in init scope, attaching reactive effects to pre-existing
    // `containerVar.children[idx]` — but the template emitted `${[].map(...)}`
    // for the unsafe array, so SSR rendered zero children and init's loop
    // silently skipped every iteration. After #1245 the dispatch detects
    // the unsafe array and routes through `mapArray`, which materialises
    // children at init time.
    expect(clientJs).toContain('mapArray(')
    // Negative assertion: the broken static-loop signature should NOT appear.
    expect(clientJs).not.toMatch(/entries\.forEach\(/)
  })
})
