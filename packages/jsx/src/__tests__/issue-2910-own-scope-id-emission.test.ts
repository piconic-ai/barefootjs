/**
 * Regression test for #2910 (bug 1): `generateInitFunction` must emit
 * `const __scopeId = ownScopeId(__scope)` for a comment-scoped root (a
 * fragment root, or a root that is itself a single child-component call,
 * #2649) and keep the plain `__scope.getAttribute('bf-s')` read for an
 * ordinary element-scoped root. See `packages/client/src/runtime/scope.ts`'s
 * `ownScopeId` for why the two differ: a comment-scoped component is
 * mounted on a PROXY element whose own `bf-s` names its host/parent scope,
 * not its own — reading it directly resolves every `.map()`-produced
 * child lookup (`[bf-h="${__scopeId}"]`) against the wrong id.
 */
import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../index.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'

function clientJsOf(source: string, path: string): string {
  const result = compileJSX(source, path, { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])
  const js = result.files.find(f => f.path.endsWith('.client.js'))?.content
  if (!js) throw new Error(`no client JS emitted for ${path}`)
  return js
}

describe('#2910 — __scopeId reads the comment-scope registry for a comment-scoped root', () => {
  test('root is a single child-component call (#2649 shape) uses ownScopeId', () => {
    const js = clientJsOf(
      `'use client'
function Panel(props: { children?: unknown }) {
  return <div className="panel">{props.children}</div>
}

export function Host() {
  return <Panel><span>hi</span></Panel>
}
`,
      'host.tsx',
    )

    expect(js).toContain('function initHost')
    const initHost = js.slice(js.indexOf('function initHost'))
    expect(initHost).toContain('const __scopeId = ownScopeId(__scope)')
    expect(initHost).not.toContain("__scope.getAttribute('bf-s')")
  })

  test('an ordinary element-scoped root keeps reading the bf-s attribute directly', () => {
    const js = clientJsOf(
      `'use client'
function Leaf(props: { label: string }) {
  return <span>{props.label}</span>
}

export function Host() {
  return <div className="panel"><Leaf label="hi" /></div>
}
`,
      'host-plain.tsx',
    )

    const initHost = js.slice(js.indexOf('function initHost'))
    expect(initHost).toContain("const __scopeId = __scope.getAttribute('bf-s')")
    expect(initHost).not.toContain('ownScopeId')
  })
})
