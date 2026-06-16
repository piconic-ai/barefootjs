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
      import { Async } from '@barefootjs/client'
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

    // Tags are emitted under `__Bf`-prefixed aliases so they can't collide
    // with a user component named `ErrorBoundary` / `Suspense` (#1375).
    expect(template).toContain('<__BfErrorBoundary fallback={<>')
    expect(template).toContain('<__BfSuspense fallback={<>')
    // ErrorBoundary must enclose Suspense (catch errors raised while the
    // Suspense body resolves), not the reverse.
    expect(template.indexOf('<__BfErrorBoundary')).toBeLessThan(template.indexOf('<__BfSuspense'))
    expect(template).toContain('</__BfSuspense></__BfErrorBoundary>')
  })

  test('injects the aliased ErrorBoundary import alongside Suspense', () => {
    const template = templateOf(`
      import { Async } from '@barefootjs/client'
      export function Page() {
        return (
          <Async fallback={<p>Loading...</p>}>
            <span>Resolved</span>
          </Async>
        )
      }
    `)

    expect(template).toContain(`import { Suspense as __BfSuspense } from 'hono/jsx/streaming'`)
    expect(template).toContain(`import { ErrorBoundary as __BfErrorBoundary } from 'hono/jsx'`)
  })

  test('aliasing avoids a duplicate import when the body uses a user component named ErrorBoundary', () => {
    // Regression for the bare-name collision: a user component literally
    // named `ErrorBoundary` used inside the boundary must not cause the
    // injected Hono import to duplicate the user's own `ErrorBoundary`
    // binding (which would be a "Duplicate identifier" build error).
    const template = templateOf(`
      import { Async } from '@barefootjs/client'
      import { ErrorBoundary } from './my-error-boundary'
      export function Page() {
        return (
          <Async fallback={<ErrorBoundary><p>fail</p></ErrorBoundary>}>
            <span>Resolved</span>
          </Async>
        )
      }
    `)

    // Exactly one `ErrorBoundary` binding survives — the user's. The Hono
    // wrapper imports under the `__BfErrorBoundary` alias, so no collision.
    const bareImports = template.match(/import \{ ErrorBoundary \} from/g) ?? []
    expect(bareImports.length).toBe(1)
    expect(template).toContain(`import { ErrorBoundary } from './my-error-boundary'`)
    expect(template).toContain(`import { ErrorBoundary as __BfErrorBoundary } from 'hono/jsx'`)
  })

  test('each of multiple boundaries gets its own ErrorBoundary wrapper', () => {
    const template = templateOf(`
      import { Async } from '@barefootjs/client'
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

    const wrappers = template.match(/<__BfErrorBoundary fallback=\{<>/g) ?? []
    expect(wrappers.length).toBe(2)
  })
})
