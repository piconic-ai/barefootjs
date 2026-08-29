/**
 * Regression tests for #2749: a `ref` on a CHILD-COMPONENT call site must not
 * be mirrored onto the child's root element as a DOM attribute.
 *
 * Measured before the fix: `collectReactiveChildProps` (collect-elements.ts)
 * hand-rolled an `on[A-Z]` event check and had no `ref` case, so a reactive
 * `ref` prop fell through to the generic dynamic-prop mirror and emitted
 *
 *   if (__v != null) __scope.setAttribute('ref', String(__v))
 *
 * i.e. the callback's SOURCE TEXT as an attribute value. SSR never emits a
 * `ref` attribute, so only the hydrate leg grew it and the SSR-vs-hydrated
 * snapshot diverged. The same prop was — and still is — passed correctly to
 * `initChild` as `get ref() { … }`; the runtime child then routes it through
 * `applyRestAttrs`, whose `classifyDOMProp` read already returns `kind: 'ref'`
 * and invokes the callback instead of setting an attribute.
 *
 * The fix makes the compile-time mirror read the same classifier. These tests
 * pin BOTH directions: `ref` (and `on*`) must not reach the mirror, and an
 * ordinary reactive attribute prop must still reach it.
 */

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

const REF_ON_CHILD = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  import { Row } from './Row'

  export function Case() {
    const [val, setVal] = createSignal(0)
    const handleMount = (el: Element) => {
      el.setAttribute('data-mounted', String(val()))
    }
    return <Row ref={handleMount} data-x="1"><span>{val()}</span></Row>
  }
`

describe('ref on a child-component call site (#2749)', () => {
  test('is never mirrored into a setAttribute(\'ref\', …) update', () => {
    const js = getClientJs(REF_ON_CHILD, 'Case.tsx')
    expect(js).not.toContain(`setAttribute('ref'`)
    expect(js).not.toContain(`removeAttribute('ref'`)
  })

  test('still reaches the child through initChild as a getter', () => {
    const js = getClientJs(REF_ON_CHILD, 'Case.tsx')
    expect(js).toContain('initChild(')
    expect(js).toContain('get ref()')
  })

  test('does not appear as an attribute in the CSR template either', () => {
    const js = getClientJs(REF_ON_CHILD, 'Case.tsx')
    const template = js.slice(js.indexOf('template:'))
    expect(template).not.toContain('ref=')
  })

  test('an ordinary reactive attribute prop on the same call site is still mirrored', () => {
    // Reverse direction: the fix must not silence the generic mirror. `title`
    // classifies as `attr`, so it keeps its setAttribute update.
    const js = getClientJs(
      `
        'use client'
        import { createSignal } from '@barefootjs/client'
        import { Row } from './Row'

        export function Case() {
          const [val, setVal] = createSignal(0)
          const onMount = (el: Element) => { el.setAttribute('data-mounted', '1') }
          return <Row ref={onMount} title={String(val())}>x</Row>
        }
      `,
      'Case.tsx',
    )
    expect(js).toContain(`setAttribute('title'`)
    expect(js).not.toContain(`setAttribute('ref'`)
  })
})
