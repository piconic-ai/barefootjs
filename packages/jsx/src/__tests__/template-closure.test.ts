/**
 * Pins the CSR template emit so that init-body-only references never
 * survive into the `template:` lambda body (#1128).
 *
 * The CSR template runs at module scope (via `render()` / `renderChild()`).
 * Any reference to an init-scope-only name (a local `const` that calls an
 * external helper, a `let` mutated by a `try` block, etc.) would
 * `ReferenceError` at template-call time. The fix substitutes such
 * references with `undefined` for plain attributes / expressions, and drops
 * affected entries from a child component's `renderChild(...)` props bag —
 * `init` then populates the real values via `initChild` getter bindings.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compileClient(source: string, fileName: string): string {
  const result = compileJSXSync(source, fileName, { adapter })
  expect(result.errors).toHaveLength(0)
  const clientJs = result.files.find((f) => f.type === 'clientJs')
  return clientJs?.content ?? ''
}

/** Extract the `template: (_p) => \`...\`` body from emitted client JS. */
function templateBody(clientJs: string): string {
  // Match the template lambda body up to the next prop key inside hydrate().
  // Handles both `template: (_p) => \`...\`}` and `template: (_p) => \`...\`, comment: ...`.
  const m = clientJs.match(/template:\s*\(_p\)\s*=>\s*`([\s\S]*?)`(?=,\s*\w|\s*\})/)
  return m ? m[1] : ''
}

describe('#1128 — template body never reaches init-scope identifiers', () => {
  test('init-scope const passed to a child component is dropped from renderChild props', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { makeViewport } from './nodes'

      interface Props { roomId: string }

      export function DeskCanvas(props: Props) {
        const cachedViewport = makeViewport()
        return (
          <Flow defaultViewport={cachedViewport ?? { x: 0, y: 0, zoom: 1 }} />
        )
      }
    `
    const clientJs = compileClient(source, 'DeskCanvas.tsx')
    const tpl = templateBody(clientJs)

    // The bare init-scope name must not survive into the template body.
    expect(tpl).not.toMatch(/\bcachedViewport\b/)
    // The `defaultViewport` prop must be dropped from renderChild — initChild
    // populates it once init runs.
    expect(tpl).not.toMatch(/defaultViewport\s*:/)
    // initChild still binds the prop via a getter so the child receives the
    // real value at hydration time.
    expect(clientJs).toMatch(/get defaultViewport\(\)\s*\{\s*return cachedViewport\s*\?\?/)
  })

  test('module import passed to a child component stays as a bare reference', () => {
    const source = `
      'use client'
      import { nodeTypes } from './nodes'

      interface Props { roomId: string }

      export function Foo(props: Props) {
        return <Flow nodeTypes={nodeTypes} data-room={props.roomId} />
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    // Module-scope import is lexically visible to the template lambda.
    expect(tpl).toMatch(/nodeTypes\s*:\s*nodeTypes/)
  })

  test('init-scope reference inside a plain attribute is replaced with undefined', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { readViewport } from './nodes'

      interface Props { roomId: string }

      export function Foo(props: Props) {
        const cachedViewport = readViewport()
        const [count] = createSignal(0)
        return (
          <div data-cache={JSON.stringify(cachedViewport)} data-count={count()}>
            hi
          </div>
        )
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    // Bare `cachedViewport` must not appear inside the template lambda — it
    // would ReferenceError at module scope when render() invokes template().
    expect(tpl).not.toMatch(/\bcachedViewport\b/)
    // The substitution emits `undefined` so the existing
    // `${(...) != null ? 'data-cache="...' : ''}` envelope produces an empty
    // attribute. The signal-driven `data-count` is unaffected.
    expect(tpl).toMatch(/\$\{\(undefined\)\s*!=\s*null\s*\?\s*'data-cache="/)
    // Init's createEffect still references the real binding so the DOM gets
    // the actual value once init runs.
    expect(clientJs).toMatch(/JSON\.stringify\(cachedViewport\)/)
  })

  test('serializable literal props still inline into renderChild (no over-trigger)', () => {
    const source = `
      'use client'

      interface Props { roomId: string }

      export function Foo(props: Props) {
        return <Greeter name="world" answer={42} active={true} />
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    expect(tpl).toMatch(/renderChild\('Greeter',\s*\{[^}]*name:\s*"world"/)
    expect(tpl).toMatch(/answer:\s*42/)
    expect(tpl).toMatch(/active:\s*true/)
  })

  test('regression — destructured prop refs (#1127) keep working', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props { org: string }

      export function Page(props: Props) {
        const { org } = props
        const [count] = createSignal(0)
        return <div data-org={org}>{count()}</div>
      }
    `
    const clientJs = compileClient(source, 'Page.tsx')
    const tpl = templateBody(clientJs)

    // org → _p.org rewrite must still apply inside the template.
    expect(tpl).toMatch(/_p\.org/)
    expect(tpl).not.toMatch(/data-org="\$\{\(undefined\)/)
  })

  test('regression — localConstants value rewrite (#1132) keeps working', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props { org: string; projectNumber: number }

      export function Page(props: Props) {
        const { org, projectNumber } = props
        const cacheKey = \`desk-\${org}-\${projectNumber}\`
        const [count, setCount] = createSignal(0)
        return (
          <div onClick={() => setCount(count() + cacheKey.length)}>
            {count()}
          </div>
        )
      }
    `
    const clientJs = compileClient(source, 'Page.tsx')

    // The cacheKey rewrite from #1132 must still produce `_p.org` / `_p.projectNumber`.
    expect(clientJs).toMatch(/cacheKey\s*=\s*`desk-\$\{_p\.org\}-\$\{_p\.projectNumber\}`/)
  })
})
