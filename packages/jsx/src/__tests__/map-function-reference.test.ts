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

  test('cross-kind ambiguity (const AND function of the same name) stays refused', () => {
    const source = `
      const format = (t: string) => 'const:' + t
      function format2() {}
      function TagLine({ tags }: { tags: string[] }) {
        function format(t: string) { return 'fn:' + t }
        return <p>{tags.map(format).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const joinCall = expr.parsed!
    if (joinCall.kind !== 'array-method') throw new Error('expected array-method')
    // Component scope has BOTH a const `format` (module scope) and a
    // `function format` (component scope) in play once findLocalConst /
    // findLocalFunction search across scopes — same cross-kind ambiguity
    // `resolveSortComparatorIdentifier` refuses for `.sort(fnref)`.
    expect(asCallbackMethodCall(joinCall.object)).toBeNull()
    expect(isSupported(joinCall).supported).toBe(false)
  })

  test('.reduce(fnref, init) resolves the callback and preserves the init arg', () => {
    const source = `
      const sum = (acc: number, t: string) => acc + t.length
      function TagLine({ tags }: { tags: string[] }) {
        return <p>{tags.reduce(sum, 0)}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const parsed = expr.parsed!
    const reduceCall = asCallbackMethodCall(parsed)
    expect(reduceCall).not.toBeNull()
    expect(reduceCall!.method).toBe('reduce')
    expect(reduceCall!.arrow.params).toEqual(['acc', 't'])
    // The trailing `0` init arg survives resolution untouched.
    expect(reduceCall!.args).toEqual([{ kind: 'literal', value: 0, literalType: 'number', raw: '0' }])
  })

  // Fable review (#2214): a spliced-in resolved arrow's body is NOT
  // re-walked, so a bare-identifier callback nested inside another
  // resolved declaration stays refused — a deliberate one-hop limit (see
  // resolveCallbackMethodFunctionReferences's docstring), pinned here so a
  // future change to that behavior is a conscious decision, not a silent
  // regression.
  test('a bare-identifier callback nested inside a resolved declaration stays refused (one-hop limit)', () => {
    const source = `
      const inner = (t: string) => '#' + t
      const outer = (xs: string[]) => xs.map(inner).join(',')
      function TagLine({ rows }: { rows: string[][] }) {
        return <p>{rows.map(outer).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const outerJoin = expr.parsed!
    if (outerJoin.kind !== 'array-method') throw new Error('expected array-method')
    const outerMap = asCallbackMethodCall(outerJoin.object)!
    expect(outerMap).not.toBeNull()
    // `outer`'s body resolves one hop (`xs.map(inner).join(',')`), but the
    // nested `.map(inner)` inside that spliced body is never re-walked.
    const innerJoin = outerMap.arrow.body
    if (innerJoin.kind !== 'array-method') throw new Error('expected inner array-method')
    if (innerJoin.object.kind !== 'call') throw new Error('expected inner call')
    expect(innerJoin.object.args[0]).toEqual({ kind: 'identifier', name: 'inner' })
    expect(asCallbackMethodCall(innerJoin.object)).toBeNull()
  })

  // Fable review (#2214): the resolver must respect lexical scoping — a
  // bare identifier in callback position that's actually bound by an
  // ENCLOSING arrow's own parameter (not a same-file const/function) must
  // never be resolved against the const/function tables, or SSR silently
  // renders the wrong function while CSR (which evaluates the raw,
  // correctly-scoped expression) renders the right one.
  test('an enclosing callback arrow param shadows a same-named module const', () => {
    const source = `
      const fn = (t: string) => 'WRONG:' + t
      function TagLine({ rows }: { rows: { tags: string[] }[] }) {
        return <p>{rows.map(fn => fn.tags.map(fn).join(',')).join(' ')}</p>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    const expr = textExpr(ir)
    const outerJoin = expr.parsed!
    if (outerJoin.kind !== 'array-method') throw new Error('expected array-method')
    const outerMap = asCallbackMethodCall(outerJoin.object)!
    // The outer arrow's body is `fn.tags.map(fn).join(',')` — the inner
    // `.map(fn)` refers to the outer arrow's OWN param `fn`, not the
    // module-scope const, so it must stay unresolved (an identifier arg).
    const innerJoin = outerMap.arrow.body
    if (innerJoin.kind !== 'array-method') throw new Error('expected inner array-method')
    if (innerJoin.object.kind !== 'call') throw new Error('expected inner call')
    expect(innerJoin.object.args[0]).toEqual({ kind: 'identifier', name: 'fn' })
    expect(asCallbackMethodCall(innerJoin.object)).toBeNull()
  })

  test('a loop item param shadows a same-named module const inside the loop body', () => {
    const source = `
      const format = (t: string) => 'WRONG:' + t
      function TagLine({ fns, tags }: { fns: string[]; tags: string[] }) {
        return <ul>{fns.map(format => <li>{tags.map(format).join(' ')}</li>)}</ul>
      }
      export { TagLine }
    `
    const ctx = analyzeComponent(source, 'TagLine.tsx')
    const ir = jsxToIR(ctx)
    if (!ir || ir.type !== 'element') throw new Error('expected a root element')
    const loop = ir.children.find(c => c.type === 'loop')
    if (!loop || loop.type !== 'loop') throw new Error('expected a loop child')
    expect(loop.param).toBe('format')
    const li = loop.children.find(c => c.type === 'element')
    if (!li || li.type !== 'element') throw new Error('expected the <li> element')
    const innerExpr = li.children.find(c => c.type === 'expression')
    if (!innerExpr || innerExpr.type !== 'expression') throw new Error('expected an expression child')
    const joinCall = innerExpr.parsed!
    if (joinCall.kind !== 'array-method') throw new Error('expected array-method')
    // `tags.map(format)` inside the loop body refers to the loop's own item
    // variable `format`, not the module-scope const — must stay unresolved.
    if (joinCall.object.kind !== 'call') throw new Error('expected inner call')
    expect(joinCall.object.args[0]).toEqual({ kind: 'identifier', name: 'format' })
    expect(asCallbackMethodCall(joinCall.object)).toBeNull()
  })
})
