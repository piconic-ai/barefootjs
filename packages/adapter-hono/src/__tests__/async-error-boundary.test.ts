/**
 * Hono adapter: compiled `<Async>` boundary wraps its body in ErrorBoundary
 * for the body error path (#1375).
 *
 * The compiler lowers `<Async fallback={…}>…</Async>` to an `IRAsync` node;
 * the Hono adapter's `renderAsync` emits it into the generated SSR template.
 * A bare `<Suspense>` mishandles a body that fails at render time: a
 * synchronous throw aborts the stream with empty output, and a Promise
 * rejection during async resolution escapes as an unhandled rejection while
 * the loading fallback is left stranded.
 *
 * The fix wraps the streaming body in Hono's `ErrorBoundary` with the same
 * `fallback`, mirroring the hand-written `BfAsync` runtime component
 * (`../async.tsx`). The runtime behaviour itself is asserted in
 * `async.test.tsx`; this test pins the *emit shape* of the compiled path.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter'

const adapter = new HonoAdapter()

function templateOf(source: string): string {
  const result = compileJSX(source, 'Page.tsx', { adapter })
  expect(result.errors.filter((e) => e.severity === 'error')).toEqual([])
  return result.files.find((f) => f.type === 'markedTemplate')?.content ?? ''
}

describe('compiled <Async> boundary — ErrorBoundary wrapping (#1375)', () => {
  test('emits ErrorBoundary enclosing Suspense, sharing the fallback', () => {
    const template = templateOf(`
      export function Page() {
        return (
          <div>
            <Async fallback={<p>Loading...</p>}>
              <span>Resolved</span>
            </Async>
          </div>
        )
      }
    `)

    expect(template).toContain('<ErrorBoundary fallback={<>')
    expect(template).toContain('<Suspense fallback={<>')
    // ErrorBoundary must enclose Suspense (catch errors raised while the
    // Suspense body resolves), not the reverse.
    expect(template.indexOf('<ErrorBoundary')).toBeLessThan(template.indexOf('<Suspense'))
    expect(template).toContain('</Suspense></ErrorBoundary>')
  })

  test('injects the ErrorBoundary import alongside Suspense', () => {
    const template = templateOf(`
      export function Page() {
        return (
          <Async fallback={<p>Loading...</p>}>
            <span>Resolved</span>
          </Async>
        )
      }
    `)

    expect(template).toContain(`import { Suspense } from 'hono/jsx/streaming'`)
    expect(template).toContain(`import { ErrorBoundary } from 'hono/jsx'`)
  })

  test('each of multiple boundaries gets its own ErrorBoundary wrapper', () => {
    const template = templateOf(`
      export function Dashboard() {
        return (
          <div>
            <Async fallback={<p>A...</p>}>
              <span>A</span>
            </Async>
            <Async fallback={<p>B...</p>}>
              <span>B</span>
            </Async>
          </div>
        )
      }
    `)

    const wrappers = template.match(/<ErrorBoundary fallback=\{<>/g) ?? []
    expect(wrappers.length).toBe(2)
  })
})
