/**
 * Pins the **Template scope visibility contract**: the standalone
 * `template: (_p) => \`...\`` lambda runs at S2-entry with only `_p` and
 * module-level imports visible. Any reference to an init-scope-only
 * binding (signal getter, memo getter, init-local const) is a
 * cross-stage violation and must be either:
 *   (a) statically inlinable → inlined as a literal, OR
 *   (b) rewritten to `_p.X` if the value is just a destructured prop, OR
 *   (c) substituted with a safe fallback (`undefined`, `[]`) that the
 *       runtime null-guards, with init's effect populating the real value.
 *
 * Covers issue shapes #1127, #1128, #1137.
 */

import { describe, test, expect } from 'bun:test'
import { compile, expectNoBareNames } from './helpers'

describe('Template scope: init-locals never leak into template body', () => {
  test('init-scope const reached via child prop is dropped from renderChild', () => {
    const { templateBody, clientJs } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { makeViewport } from './nodes'

      interface Props { roomId: string }

      export function DeskCanvas(props: Props) {
        const cachedViewport = makeViewport()
        return <Flow defaultViewport={cachedViewport ?? { x: 0, y: 0, zoom: 1 }} />
      }
    `)

    expectNoBareNames(templateBody, ['\\bcachedViewport\\b'])
    expect(templateBody).not.toMatch(/defaultViewport\s*:/)
    expect(clientJs).toMatch(/get defaultViewport\(\)\s*\{\s*return cachedViewport\s*\?\?/)
  })

  test('module-scope import IS visible to template (positive control)', () => {
    const { templateBody } = compile(`
      'use client'
      import { nodeTypes } from './nodes'

      interface Props { roomId: string }

      export function Foo(props: Props) {
        return <Flow nodeTypes={nodeTypes} data-room={props.roomId} />
      }
    `)

    // Module imports survive — they ARE in template's lexical scope.
    expect(templateBody).toMatch(/nodeTypes/)
  })

  test('createMemo getter is referenced (not inlined) — closure deps preserved', () => {
    // #1137: inlining a memo body recursively expanded `props` into bare form,
    // throwing ReferenceError at template-call time.
    const { templateBody, initBody } = compile(`
      'use client'
      import { createMemo } from '@barefootjs/client'

      interface Props { x: number }

      export function Foo(props: Props) {
        const store = makeStore(props)
        const transform = createMemo(() => \`T(\${store.read()})\`)
        return <div style={transform()} />
      }
    `)

    // Bare props/store must NOT survive into template body.
    expectNoBareNames(templateBody, ['\\bprops\\b', '\\bstore\\b'])
    // Init body should still hold the real memo / store binding.
    expect(initBody).toMatch(/createMemo|store/)
  })

  test('init-scope const used as plain attribute → undefined fallback', () => {
    const { templateBody, clientJs } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { readViewport } from './nodes'

      interface Props { roomId: string }

      export function Foo(props: Props) {
        const cachedViewport = readViewport()
        const [count] = createSignal(0)
        return <div data-cache={JSON.stringify(cachedViewport)} data-count={count()}>hi</div>
      }
    `)

    expectNoBareNames(templateBody, ['\\bcachedViewport\\b'])
    // The `${(undefined) != null ? '...' : ''}` envelope is the documented
    // null-guard. Init's createEffect later populates the real value.
    expect(templateBody).toMatch(/\$\{\(undefined\)\s*!=\s*null\s*\?\s*'data-cache="/)
    expect(clientJs).toMatch(/JSON\.stringify\(cachedViewport\)/)
  })

  test('init-scope spread attrs object → spreadAttrs(undefined)', () => {
    const { templateBody } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { makeAttrs } from './helpers'

      export function Foo() {
        const cached = makeAttrs()
        const [n] = createSignal(0)
        return <div {...cached} data-n={n()}>hi</div>
      }
    `)

    expectNoBareNames(templateBody, ['\\bcached\\b'])
    expect(templateBody).toMatch(/spreadAttrs\(undefined\)/)
  })

  test('init-scope condition in ternary → undefined (false branch wins on init render)', () => {
    const { templateBody } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { readFlag } from './helpers'

      export function Foo() {
        const flag = readFlag()
        const [n] = createSignal(0)
        return <div>{flag ? <span>{n()}</span> : <em>off</em>}</div>
      }
    `)

    expectNoBareNames(templateBody, ['\\bflag\\b'])
    expect(templateBody).toMatch(/\$\{undefined\s*\?/)
  })

  test('init-scope loop array → []', () => {
    const { templateBody } = compile(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { readItems } from './helpers'

      export function Foo() {
        const items = readItems()
        const [n] = createSignal(0)
        return <ul>{items.map(it => <li key={it}>{it}: {n()}</li>)}</ul>
      }
    `)

    expectNoBareNames(templateBody, ['\\bitems\\b'])
    expect(templateBody).toMatch(/\$\{\[\]\.map\(/)
  })
})
