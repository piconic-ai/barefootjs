/**
 * BF040 `COMPONENT_NOT_FOUND` deletion audit.
 *
 * BF040 was reserved for "Component not found" but was never emitted.
 * Missing components are caught by ESM's ReferenceError at runtime
 * and by TypeScript's undeclared-identifier diagnostics at compile time.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { ErrorCodes } from '../errors'

function compileToIR(source: string) {
  const ctx = analyzeComponent(source, '/tmp/Test.tsx')
  const ir = jsxToIR(ctx)
  return { ctx, ir, errors: ctx.errors }
}

describe('BF040 COMPONENT_NOT_FOUND — deletion audit', () => {
  test('valid component usage compiles without errors', () => {
    const src = `
function Child() { return <span>child</span> }
export function App() {
  return <div><Child /></div>
}
`
    const { errors } = compileToIR(src)
    expect(errors).toHaveLength(0)
  })

  test('BF040 code no longer exists in ErrorCodes', () => {
    const allCodes = Object.values(ErrorCodes)
    expect(allCodes).not.toContain('BF040')
  })
})
