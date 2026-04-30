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
  // Asserting non-empty here defends against the regex silently drifting
  // out of sync with future emit-format changes — without this, every
  // `expect(tpl).toMatch(...)` below would pass spuriously on empty input.
  const body = m ? m[1] : ''
  expect(body.length).toBeGreaterThan(0)
  return body
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

  test('init-scope spread object emits spreadAttrs(undefined) — runtime null-guards it to empty string', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { makeAttrs } from './helpers'

      export function Foo() {
        const cached = makeAttrs()
        const [n] = createSignal(0)
        return <div {...cached} data-n={n()}>hi</div>
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    expect(tpl).not.toMatch(/\bcached\b/)
    // spreadAttrs() in @barefootjs/client null-guards undefined → ''.
    expect(tpl).toMatch(/spreadAttrs\(undefined\)/)
  })

  test('init-scope conditional condition picks the false branch on initial render', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { readFlag } from './helpers'

      export function Foo() {
        const flag = readFlag()
        const [n] = createSignal(0)
        return <div>{flag ? <span>{n()}</span> : <em>off</em>}</div>
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    expect(tpl).not.toMatch(/\bflag\b/)
    // The substituted `undefined ? ... : ...` ternary is well-defined JS —
    // no ReferenceError, false branch wins; init's effect re-renders.
    expect(tpl).toMatch(/\$\{undefined\s*\?/)
  })

  test('init-scope loop array becomes [] — avoids `undefined.map(...)` TypeError', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { readItems } from './helpers'

      export function Foo() {
        const items = readItems()
        const [n] = createSignal(0)
        return <ul>{items.map(it => <li key={it}>{it}: {n()}</li>)}</ul>
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    expect(tpl).not.toMatch(/\bitems\b/)
    // Bare `undefined.map(...)` would throw; substitute `[]` so the
    // template renders an empty list and reconcileList populates it.
    expect(tpl).toMatch(/\$\{\[\]\.map\(/)
  })

  test('init-scope direct text expression emits an empty placeholder, not literal "undefined"', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { readLabel } from './helpers'

      export function Foo() {
        const label = readLabel()
        const [n] = createSignal(0)
        return <span>{label}-{n()}</span>
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    expect(tpl).not.toMatch(/\blabel\b/)
    // Without the per-context guard, this would emit `${undefined}` and
    // render the literal text "undefined" before init's createEffect ran.
    expect(tpl).toMatch(/\$\{''\}/)
    expect(tpl).not.toMatch(/\$\{undefined\}/)
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

describe('#1137 — memo body that closes over init-scope identifiers must not leak into the template', () => {
  test('memo whose body reads an init-scope const does NOT inline the const declaration into the template', () => {
    const source = `
      'use client'
      import { createMemo } from '@barefootjs/client'
      import { makeStore } from './store'

      interface Props { x: number }

      export function Foo(props: Props) {
        const store = makeStore(props)
        const transform = createMemo(() => \`T(\${store.read()})\`)
        return <div data-x={transform()} />
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    // The init-scope const \`store\` must never reach the template — its
    // initializer \`makeStore(props)\` would re-run on every render AND leak
    // a bare \`props\` reference that ReferenceErrors at template-call time.
    expect(tpl).not.toMatch(/\bmakeStore\s*\(/)
    expect(tpl).not.toMatch(/\bstore\b/)
    // Bare \`props\` must never be visible at module scope. The template lambda
    // parameter is \`_p\` — any \`props\` token in the body is a leak.
    expect(tpl).not.toMatch(/\bprops\b/)
  })

  test('memo whose body closes over an init-scope const renders an empty placeholder initially (init effect repaints)', () => {
    const source = `
      'use client'
      import { createMemo } from '@barefootjs/client'
      import { makeStore } from './store'

      interface Props { x: number }

      export function Foo(props: Props) {
        const store = makeStore(props)
        const transform = createMemo(() => \`T(\${store.read()})\`)
        return <div data-x={transform()} />
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    // The dynamic-attribute envelope around an unsafe expression collapses to
    // an empty attribute on the initial render — same pattern as plain
    // init-scope refs (#1128). A reactive effect inside init repaints.
    expect(tpl).toMatch(/\$\{\(undefined\)\s*!=\s*null\s*\?\s*'data-x="/)
    // The init body still has the real memo binding so the effect can repaint.
    expect(clientJs).toMatch(/transform\s*=\s*createMemo/)
  })

  test('memo whose body is purely signal-driven (no init-scope refs) keeps inlining the initial value', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      interface Props { initial: number }

      export function Foo(props: Props) {
        const [count] = createSignal(props.initial)
        const doubled = createMemo(() => count() * 2)
        return <div data-doubled={doubled()} />
      }
    `
    const clientJs = compileClient(source, 'Foo.tsx')
    const tpl = templateBody(clientJs)

    // No init-scope closure → keep current behavior: inline the memo body
    // with signal initial value substituted in. This preserves correct
    // initial render for the common case.
    expect(tpl).toMatch(/_p\.initial/)
    expect(tpl).toMatch(/\*\s*2/)
    expect(tpl).not.toMatch(/\$\{\(undefined\)\s*!=\s*null\s*\?\s*'data-doubled/)
  })
})
