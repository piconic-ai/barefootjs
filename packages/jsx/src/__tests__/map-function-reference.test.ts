import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { asCallbackMethodCall, isSupported } from '../expression-parser'
import type { IRExpression } from '../types'

// #2206: a bare-identifier callback passed to a value-position higher-order
// array method (`tags.map(format)`) resolves one hop to its declaration
// (`resolveCallbackMethodFunctionReferences` in jsx-to-ir.ts), reusing the
// SAME `findLocalConst` / `findLocalFunction` scope machinery #2090
// established for `.sort(cb)` — but as a post-parse pass over the whole
// `ParsedExpr` tree, since the value-returning `.map(cb).join(...)` form is
// recognized generically downstream of parsing (`asCallbackMethodCall`), not
// during it.
describe('function-reference .map(cb) callback (#2206)', () => {
  function textExpr(ir: ReturnType<typeof jsxToIR>): IRExpression {
    if (!ir || ir.type !== 'element') throw new Error('expected a root element')
    const expr = ir.children.find(c => c.type === 'expression')
    if (!expr || expr.type !== 'expression') throw new Error('expected an expression child')
    return expr
  }

  test('const arrow reference resolves like an inline arrow', () => {
    const source = `
      const format = (t: string) => '#' + t
      function TagLine({ tags }: { tags: string[] }) {
        return <p>{tags.map(format).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)

    expect(expr.parsed).toBeDefined()
    // .join(' ') is the outer call; its object is the resolved .map(...) call.
    const joinCall = expr.parsed!
    expect(joinCall.kind).toBe('array-method')
    if (joinCall.kind !== 'array-method') return
    const mapCall = asCallbackMethodCall(joinCall.object)
    expect(mapCall).not.toBeNull()
    expect(mapCall!.method).toBe('map')
    expect(mapCall!.arrow.kind).toBe('arrow')
    expect(mapCall!.arrow.params).toEqual(['t'])
    // Resolved body is identical to what an inline `t => '#' + t` would parse to.
    expect(isSupported(joinCall).supported).toBe(true)
  })

  test('function-declaration reference resolves too', () => {
    const source = `
      function format(t: string) { return '#' + t }
      function TagLine({ tags }: { tags: string[] }) {
        return <p>{tags.map(format).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)

    expect(expr.parsed).toBeDefined()
    const joinCall = expr.parsed!
    expect(joinCall.kind).toBe('array-method')
    if (joinCall.kind !== 'array-method') return
    const mapCall = asCallbackMethodCall(joinCall.object)
    expect(mapCall).not.toBeNull()
    expect(mapCall!.arrow.params).toEqual(['t'])
  })

  test('component-scope const shadows a module-scope const of the same name', () => {
    const source = `
      const format = (t: string) => 'module:' + t
      function TagLine({ tags }: { tags: string[] }) {
        const format = (t: string) => 'local:' + t
        return <p>{tags.map(format).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const joinCall = expr.parsed!
    if (joinCall.kind !== 'array-method') throw new Error('expected array-method')
    const mapCall = asCallbackMethodCall(joinCall.object)!
    // The resolved body must be the component-scope binding ('local:'), not
    // the module-scope one ('module:').
    expect(JSON.stringify(mapCall.arrow.body)).toContain('local:')
  })

  test('unresolvable reference (imported) stays refused with BF101', () => {
    const source = `
      import { format } from './format'
      function TagLine({ tags }: { tags: string[] }) {
        return <p>{tags.map(format).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const joinCall = expr.parsed!
    if (joinCall.kind !== 'array-method') throw new Error('expected array-method')
    // The identifier arg passes through untouched — asCallbackMethodCall
    // still refuses it, so the adapter's UNSUPPORTED_METHODS gate fires.
    expect(asCallbackMethodCall(joinCall.object)).toBeNull()
    expect(isSupported(joinCall).supported).toBe(false)
  })

  test('non-function const (unresolvable) stays refused with BF101', () => {
    const source = `
      const format = 5
      function TagLine({ tags }: { tags: string[] }) {
        return <p>{tags.map(format).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const joinCall = expr.parsed!
    if (joinCall.kind !== 'array-method') throw new Error('expected array-method')
    expect(asCallbackMethodCall(joinCall.object)).toBeNull()
    expect(isSupported(joinCall).supported).toBe(false)
  })

  test('/* @client */ still suppresses regardless of resolvability', () => {
    const source = `
      import { format } from './format'
      function TagLine({ tags }: { tags: string[] }) {
        return <p>{/* @client */ tags.map(format).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    expect(expr.clientOnly).toBe(true)
  })

  test('inline arrow callback is unaffected (pre-existing #2073 shape)', () => {
    const source = `
      function TagLine({ tags }: { tags: string[] }) {
        return <p>{tags.map(t => '#' + t).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const joinCall = expr.parsed!
    if (joinCall.kind !== 'array-method') throw new Error('expected array-method')
    expect(isSupported(joinCall).supported).toBe(true)
  })

  test('resolution generalizes to other CALLBACK_METHODS (e.g. value-position .sort)', () => {
    const source = `
      const byLen = (a: string, b: string) => a.length - b.length
      function TagLine({ tags }: { tags: string[] }) {
        return <p>{tags.sort(byLen).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const joinCall = expr.parsed!
    if (joinCall.kind !== 'array-method') throw new Error('expected array-method')
    const sortCall = asCallbackMethodCall(joinCall.object)
    expect(sortCall).not.toBeNull()
    expect(sortCall!.arrow.params).toEqual(['a', 'b'])
  })
})
