import { describe, expect, test } from 'bun:test'
import ts from 'typescript'
import { analyzeComponent } from '../analyzer'
import {
  applyPreambleBuilderPasses,
  classifyLoopArray,
  createTransformContext,
  refuseUnloweredJsxCallback,
  resolveLoopKey,
  resolveLoopRowParams,
  resolveLoopSource,
  transformLoopCallbackBody,
  withLoopRowScope,
  type TransformContext,
} from '../jsx-to-ir'
import type { IRLoop } from '../types'

// #3424: `transformMapCall` is a coordinator over one helper per decision.
// These tests pin each helper on its own, against the AST of a small
// component, so the next loop fix can be verified at the decision it
// touches. The end-to-end shapes (slot ids, adapter output) stay covered
// by the loop fixtures and the existing `*loop*` / `*map*` suites.

/** The first `.map()` / `.flatMap()` call in `source`, with a transform context. */
function mapCallOf(source: string, method: 'map' | 'flatMap' = 'map'): { node: ts.CallExpression; ctx: TransformContext } {
  const analyzer = analyzeComponent(source, 'Test.tsx')
  const ctx = createTransformContext(analyzer)
  let found: ts.CallExpression | undefined
  const visit = (n: ts.Node): void => {
    if (
      !found &&
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === method
    ) {
      found = n
    }
    ts.forEachChild(n, visit)
  }
  visit(analyzer.sourceFile)
  if (!found) throw new Error(`no .${method}() call in source`)
  return { node: found, ctx }
}

const arrowOf = (node: ts.CallExpression): ts.ArrowFunction => {
  const cb = node.arguments[0]
  if (!ts.isArrowFunction(cb)) throw new Error('expected an arrow callback')
  return cb
}

/** Lower a callback body the way the coordinator does, under the row's scope. */
function lowerBody(source: string, method: 'map' | 'flatMap' = 'map', isClientOnly = false) {
  const { node, ctx } = mapCallOf(source, method)
  const callback = arrowOf(node)
  const src = resolveLoopSource(node, ctx, isClientOnly)
  const row = resolveLoopRowParams(callback, src, ctx)
  const body = withLoopRowScope(ctx, row, (savedScope) =>
    transformLoopCallbackBody(callback, row, savedScope, ctx, isClientOnly, method),
  )
  return { node, ctx, callback, src, row, body }
}

const component = (body: string, props = '{ items }: { items: Array<{ id: number; name: string }> }') => `
  function Test(${props}) {
    return <ul>${body}</ul>
  }
  export { Test }
`

describe('resolveLoopSource — which array the loop iterates', () => {
  test('a plain .map() iterates the receiver itself', () => {
    const { node, ctx } = mapCallOf(component('{items.map(it => <li key={it.id}>{it.name}</li>)}'))
    const src = resolveLoopSource(node, ctx, false)
    expect(src.array).toBe('items')
    expect(src.filterPredicate).toBeUndefined()
    expect(src.sortComparator).toBeUndefined()
    expect(src.chainOrder).toBeUndefined()
    expect(src.iterationShape).toBeUndefined()
    expect(src.objectIteration).toBeUndefined()
  })

  test('filter().map() lifts the predicate and iterates the inner array', () => {
    const { node, ctx } = mapCallOf(component('{items.filter(it => it.id > 1).map(it => <li key={it.id}>{it.name}</li>)}'))
    const src = resolveLoopSource(node, ctx, false)
    expect(src.array).toBe('items')
    expect(src.filterPredicate?.param).toBe('it')
    expect(src.filterPredicate?.raw).toBe('it.id > 1')
    expect(src.chainOrder).toBeUndefined()
  })

  test('filter().sort().map() records the chain order and both callbacks', () => {
    const { node, ctx } = mapCallOf(
      component('{items.filter(it => it.id > 1).sort((a, b) => a.id - b.id).map(it => <li key={it.id}>{it.name}</li>)}'),
    )
    const src = resolveLoopSource(node, ctx, false)
    expect(src.array).toBe('items')
    expect(src.chainOrder).toBe('filter-sort')
    expect(src.filterPredicate?.raw).toBe('it.id > 1')
    expect(src.sortComparator).toBeDefined()
  })

  test('sort().filter().map() records the other order', () => {
    const { node, ctx } = mapCallOf(
      component('{items.sort((a, b) => a.id - b.id).filter(it => it.id > 1).map(it => <li key={it.id}>{it.name}</li>)}'),
    )
    const src = resolveLoopSource(node, ctx, false)
    expect(src.chainOrder).toBe('sort-filter')
    expect(src.array).toBe('items')
  })

  test('a /* @client */ loop keeps the whole chain in the array string', () => {
    const { node, ctx } = mapCallOf(component('{items.filter(it => it.id > 1).map(it => <li key={it.id}>{it.name}</li>)}'))
    const src = resolveLoopSource(node, ctx, true)
    expect(src.array).toBe('items.filter(it => it.id > 1)')
    expect(src.filterPredicate).toBeUndefined()
    expect(ctx.analyzer.errors).toHaveLength(0)
  })

  test('an off-subset comparator stays in the array string and is refused for a DSL target', () => {
    const { node, ctx } = mapCallOf(component('{items.sort((a, b) => Math.random() - 0.5).map(it => <li key={it.id}>{it.name}</li>)}'))
    const src = resolveLoopSource(node, ctx, false)
    expect(src.array).toBe('items.sort((a, b) => Math.random() - 0.5)')
    expect(src.sortComparator).toBeUndefined()
    expect(ctx.analyzer.errors.map(e => e.code)).toEqual(['BF021'])
  })

  test('an off-subset comparator is accepted when the adapter runs callback bodies', () => {
    const { node, ctx } = mapCallOf(component('{items.sort((a, b) => Math.random() - 0.5).map(it => <li key={it.id}>{it.name}</li>)}'))
    ctx.analyzer.acceptsCallbackBody = () => true
    resolveLoopSource(node, ctx, false)
    expect(ctx.analyzer.errors).toHaveLength(0)
  })

  test('.entries() is stripped and recorded as the iteration shape', () => {
    const { node, ctx } = mapCallOf(component('{items.entries().map(([i, it]) => <li key={it.id}>{i}</li>)}'))
    const src = resolveLoopSource(node, ctx, false)
    expect(src.array).toBe('items')
    expect(src.iterationShape).toBe('entries')
  })

  test('.values() is a no-op: stripped but not recorded', () => {
    const { node, ctx } = mapCallOf(component('{items.values().map(it => <li key={it.id}>{it.name}</li>)}'))
    const src = resolveLoopSource(node, ctx, false)
    expect(src.array).toBe('items')
    expect(src.iterationShape).toBeUndefined()
  })

  test('Object.entries(x) is a separate shape, and records values too', () => {
    const { node, ctx } = mapCallOf(
      component('{Object.values(dict).map(v => <li key={v}>{v}</li>)}', '{ dict }: { dict: Record<string, string> }'),
    )
    const src = resolveLoopSource(node, ctx, false)
    expect(src.array).toBe('dict')
    expect(src.objectIteration).toBe('values')
    expect(src.iterationShape).toBeUndefined()
  })

  test('templateArray carries the _p.-rewritten form of a destructured prop (#2222)', () => {
    const { node, ctx } = mapCallOf(component('{items.filter(it => it.id > 1).map(it => <li key={it.id}>{it.name}</li>)}'))
    const src = resolveLoopSource(node, ctx, false)
    expect(src.templateArray).toBe('_p.items')
  })
})

describe('resolveLoopRowParams — the names a row binds', () => {
  test('item and index params, with their type text', () => {
    const { node, ctx } = mapCallOf(component('{items.map((it: { id: number }, i: number) => <li key={it.id}>{i}</li>)}'))
    const row = resolveLoopRowParams(arrowOf(node), resolveLoopSource(node, ctx, false), ctx)
    expect(row.param).toBe('it')
    expect(row.paramType).toBe('{ id: number }')
    expect(row.index).toBe('i')
    expect(row.indexType).toBe('number')
    expect(row.paramBindings).toBeUndefined()
  })

  test('a callback without parameters binds the default item name', () => {
    const { node, ctx } = mapCallOf(component('{items.map(() => <li>x</li>)}'))
    const row = resolveLoopRowParams(arrowOf(node), resolveLoopSource(node, ctx, false), ctx)
    expect(row.param).toBe('item')
    expect(row.index).toBeNull()
    expect(row.itemTypeNode).toBeUndefined()
  })

  test('a destructured param lowers to per-binding accessor paths', () => {
    const { node, ctx } = mapCallOf(component('{items.map(({ id, name }) => <li key={id}>{name}</li>)}'))
    const row = resolveLoopRowParams(arrowOf(node), resolveLoopSource(node, ctx, false), ctx)
    expect(row.param).toBe('{ id, name }')
    expect(row.paramBindings?.map(b => b.name)).toEqual(['id', 'name'])
  })

  test('.entries() with a 2-tuple destructure resolves into index + param, no bindings', () => {
    const { node, ctx } = mapCallOf(component('{items.entries().map(([i, it]) => <li key={it.id}>{i}</li>)}'))
    const row = resolveLoopRowParams(arrowOf(node), resolveLoopSource(node, ctx, false), ctx)
    expect(row.index).toBe('i')
    expect(row.param).toBe('it')
    expect(row.paramBindings).toBeUndefined()
  })

  test('Object.entries(x) reuses the same 2-tuple extraction', () => {
    const { node, ctx } = mapCallOf(
      component('{Object.entries(dict).map(([k, v]) => <li key={k}>{v}</li>)}', '{ dict }: { dict: Record<string, string> }'),
    )
    const row = resolveLoopRowParams(arrowOf(node), resolveLoopSource(node, ctx, false), ctx)
    expect(row.index).toBe('k')
    expect(row.param).toBe('v')
  })

  test('.entries() with a second parameter does not take it as the index', () => {
    const { node, ctx } = mapCallOf(component('{items.entries().map(([i, it], extra) => <li key={it.id}>{i}</li>)}'))
    const row = resolveLoopRowParams(arrowOf(node), resolveLoopSource(node, ctx, false), ctx)
    expect(row.index).toBe('i')
    expect(row.indexType).toBeUndefined()
  })
})

describe('transformLoopCallbackBody — what the row renders', () => {
  test('a JSX expression body is the row', () => {
    const { body } = lowerBody(component('{items.map(it => <li key={it.id}>{it.name}</li>)}'))
    expect(body.children.map(c => c.type)).toEqual(['element'])
    expect(body.preamble).toBeUndefined()
    expect(body.flatMapCallback).toBeUndefined()
  })

  test('a parenthesized ternary body folds to a conditional', () => {
    const { body } = lowerBody(component('{items.map(it => (it.id > 1 ? <li key={it.id}>a</li> : <b key={it.id}>b</b>))}'))
    expect(body.children.map(c => c.type)).toEqual(['conditional'])
  })

  test('a renderable && body lowers through the JSX expression transformer (#1665)', () => {
    const { body } = lowerBody(component('{items.map(it => it.id > 1 && <li key={it.id}>{it.name}</li>)}'))
    expect(body.children).toHaveLength(1)
    expect(body.children[0].type).toBe('conditional')
  })

  test('a scalar body produces no children', () => {
    const { body, ctx } = lowerBody(component('{items.map(it => it.name)}'))
    expect(body.children).toHaveLength(0)
    expect(ctx.analyzer.errors).toHaveLength(0)
  })

  test('a single-return block body carries the value preamble', () => {
    const { body } = lowerBody(
      component('{items.map(it => { const label = it.name.toUpperCase(); return <li key={it.id}>{label}</li> })}'),
    )
    expect(body.children.map(c => c.type)).toEqual(['element'])
    expect(body.preamble?.declaredNames).toEqual(['label'])
    expect(body.preamble?.builderNames).toEqual([])
  })

  test('a multi-return block body folds to a conditional and keeps its leading preamble', () => {
    const { body } = lowerBody(
      component(
        '{items.map(it => { const n = it.name; if (it.id > 1) return <li key={it.id}>{n}</li>; return <b key={it.id}>{n}</b> })}',
      ),
    )
    expect(body.children.map(c => c.type)).toEqual(['conditional'])
    expect(body.preamble?.declaredNames).toEqual(['n'])
  })

  test('a non-declaration preamble is refused for a DSL target, accepted for a JS runtime', () => {
    const src = component('{items.map(it => { let n = it.name; n = n + "!"; return <li key={it.id}>{n}</li> })}')
    const dsl = lowerBody(src)
    expect(dsl.body.preamble?.declarations).toBeUndefined()
    expect(dsl.ctx.analyzer.errors.map(e => e.code)).toEqual(['BF021'])
    const { node, ctx } = mapCallOf(src)
    ctx.analyzer.acceptsCallbackBody = () => true
    const callback = arrowOf(node)
    const row = resolveLoopRowParams(callback, resolveLoopSource(node, ctx, false), ctx)
    withLoopRowScope(ctx, row, (savedScope) => transformLoopCallbackBody(callback, row, savedScope, ctx, false, 'map'))
    expect(ctx.analyzer.errors).toHaveLength(0)
  })

  test('a JSX-building preamble needs an element root to host the built array', () => {
    const { body, ctx } = lowerBody(
      component('{items.map(it => { const out = []; out.push(<b>{it.name}</b>); return out })}'),
    )
    expect(body.children).toHaveLength(0)
    expect(ctx.analyzer.errors).toHaveLength(1)
    expect(ctx.analyzer.errors[0].message).toContain('no element root')
  })

  test('a JSX-building preamble is refused for a DSL target with the @client escape', () => {
    const { body, ctx } = lowerBody(
      component('{items.map(it => { const out = []; out.push(<b>{it.name}</b>); return <li key={it.id}>{out}</li> })}'),
    )
    expect(body.children).toHaveLength(1)
    expect(body.preamble).toBeUndefined()
    expect(ctx.analyzer.errors[0].message).toContain('cannot be lowered to a template on this backend')
  })

  test('a JSX-building preamble is carried as segments under /* @client */', () => {
    const { body, ctx } = lowerBody(
      component('{items.map(it => { const out = []; out.push(<b>{it.name}</b>); return <li key={it.id}>{out}</li> })}'),
      'map',
      true,
    )
    expect(ctx.analyzer.errors).toHaveLength(0)
    expect(body.preamble?.builderNames).toEqual(['out'])
  })

  test('a preamble local shadowing a prop is bound while the return expression is transformed', () => {
    const { body } = lowerBody(
      component(
        '{items.map(it => { const title = it.name; return <li key={it.id}>{title}</li> })}',
        '{ items, title }: { items: Array<{ id: number; name: string }>; title: string }',
      ),
    )
    const li = body.children[0]
    expect(li.type).toBe('element')
    const text = li.type === 'element' ? li.children.find(c => c.type === 'expression') : undefined
    expect(text?.type === 'expression' ? text.expr : null).toBe('title')
    // Not the outer prop's `_p.title`: the row-local wins inside the window.
    expect(text?.type === 'expression' ? text.templateExpr : null).not.toBe('_p.title')
  })

  test('flatMap with an array literal body renders every element as a row root', () => {
    const { body } = lowerBody(component('{items.flatMap(it => [<li key={it.id}>a</li>, <li key={it.id + "b"}>b</li>])}'), 'flatMap')
    expect(body.children.map(c => c.type)).toEqual(['element', 'element'])
    expect(body.flatMapCallback).toBeUndefined()
  })

  test('flatMap with a nested projection lowers to a neutral inner loop', () => {
    const { body } = lowerBody(
      component(
        '{items.flatMap(it => it.tags.map(tag => <li key={tag}>{tag}</li>))}',
        '{ items }: { items: Array<{ id: number; tags: string[] }> }',
      ),
      'flatMap',
    )
    expect(body.children.map(c => c.type)).toEqual(['loop'])
    expect(body.flatMapCallback).toBeUndefined()
  })

  test('flatMap with statements rides the segments carrier and is refused for a DSL target', () => {
    const { body, ctx } = lowerBody(
      component(
        '{items.flatMap(it => { if (it.tags.length === 0) return []; return it.tags.map(tag => <li key={tag}>{tag}</li>) })}',
        '{ items }: { items: Array<{ id: number; tags: string[] }> }',
      ),
      'flatMap',
    )
    expect(body.children).toHaveLength(0)
    expect(body.flatMapCallback).toBeDefined()
    expect(body.preamble).toBeUndefined()
    // The single-return path's value-preamble gate fires first (the early
    // `return []` is not a declaration), then the flatMap carrier's own gate.
    expect(ctx.analyzer.errors.map(e => e.message)).toEqual([
      expect.stringContaining('callback preamble that is not a sequence of value declarations'),
      expect.stringContaining('.flatMap() callback body with statements'),
    ])
  })
})

describe('refuseUnloweredJsxCallback — the structural net', () => {
  test('an inline JSX body no recognizer lowered is a loud diagnostic', () => {
    const { node, ctx } = mapCallOf(component('{items.map(it => wrap(<li key={it.id}>{it.name}</li>))}'))
    refuseUnloweredJsxCallback(node, ctx, 'map', 0)
    expect(ctx.analyzer.errors).toHaveLength(1)
    expect(ctx.analyzer.errors[0].message).toContain('.map() callback that builds JSX in this shape')
  })

  test('a JSX-helper call body carries no inline JSX and stays silent', () => {
    const { node, ctx } = mapCallOf(component('{items.map(it => renderItem(it))}'))
    refuseUnloweredJsxCallback(node, ctx, 'map', 0)
    expect(ctx.analyzer.errors).toHaveLength(0)
  })

  test('a more specific refusal fired during this call is not stacked on', () => {
    const { node, ctx } = mapCallOf(component('{items.map(it => wrap(<li key={it.id}>{it.name}</li>))}'))
    ctx.analyzer.errors.push({ code: 'BF021', message: 'earlier', severity: 'error', loc: { file: 'Test.tsx', line: 1, column: 1 } })
    refuseUnloweredJsxCallback(node, ctx, 'map', 0)
    expect(ctx.analyzer.errors).toHaveLength(1)
  })
})

describe('resolveLoopKey — the keyFn and the key attribute', () => {
  test('the first child’s key is the keyFn and is stamped as the depth-0 key attribute', () => {
    const { callback, body, ctx } = lowerBody(component('{items.map(it => <li key={it.id}>{it.name}</li>)}'))
    const key = resolveLoopKey(callback, body.children, ctx, false, 0)
    expect(key).toEqual({ key: 'it.id', bodyIsItemConditional: false })
    const li = body.children[0]
    expect(li.type === 'element' ? li.keyAttr?.name : null).toBe('data-key')
    expect(ctx.analyzer.errors).toHaveLength(0)
  })

  test('a nested loop stamps the depth-1 key attribute', () => {
    const { callback, body, ctx } = lowerBody(component('{items.map(it => <li key={it.id}>{it.name}</li>)}'))
    resolveLoopKey(callback, body.children, ctx, true, 1)
    const li = body.children[0]
    expect(li.type === 'element' ? li.keyAttr?.name : null).toBe('data-key-1')
  })

  test('a missing key is BF023 at the top level and BF024 when nested', () => {
    const top = lowerBody(component('{items.map(it => <li>{it.name}</li>)}'))
    resolveLoopKey(top.callback, top.body.children, top.ctx, false, 0)
    expect(top.ctx.analyzer.errors.map(e => e.code)).toEqual(['BF023'])
    const nested = lowerBody(component('{items.map(it => <li>{it.name}</li>)}'))
    resolveLoopKey(nested.callback, nested.body.children, nested.ctx, true, 1)
    expect(nested.ctx.analyzer.errors.map(e => e.code)).toEqual(['BF024'])
  })

  test('a whole-item conditional hoists the key from its rendering branch (#1665)', () => {
    const { callback, body, ctx } = lowerBody(component('{items.map(it => it.id > 1 && <li key={it.id}>{it.name}</li>)}'))
    const key = resolveLoopKey(callback, body.children, ctx, false, 0)
    expect(key).toEqual({ key: 'it.id', bodyIsItemConditional: true })
  })

  test('a ternary whose branches agree on the key lifts it (#1098)', () => {
    const { callback, body, ctx } = lowerBody(component('{items.map(it => it.id > 1 ? <li key={it.id}>a</li> : <b key={it.id}>b</b>)}'))
    expect(resolveLoopKey(callback, body.children, ctx, false, 0).key).toBe('it.id')
  })
})

describe('applyPreambleBuilderPasses — the built element array', () => {
  test('a component root fed by a JSX-building preamble is refused and the preamble dropped', () => {
    const { node, body, ctx } = lowerBody(
      `
      function Row(props: { cells: unknown }) { return <tr>{props.cells}</tr> }
      function Test({ items }: { items: Array<{ id: number; name: string }> }) {
        return <table>{items.map(it => { const out = []; out.push(<td>{it.name}</td>); return <Row key={it.id} cells={out} /> })}</table>
      }
      export { Test }
      `,
      'map',
      true,
    )
    expect(body.children.map(c => c.type)).toEqual(['component'])
    const kept = applyPreambleBuilderPasses(node, body.children, body.preamble, ctx)
    expect(kept).toBeUndefined()
    expect(ctx.analyzer.errors.map(e => e.message)).toEqual([expect.stringContaining('cannot return a component')])
  })

  test('a value-only preamble passes through untouched', () => {
    const { node, body, ctx } = lowerBody(
      component('{items.map(it => { const label = it.name; return <li key={it.id}>{label}</li> })}'),
    )
    expect(applyPreambleBuilderPasses(node, body.children, body.preamble, ctx)).toBe(body.preamble)
  })
})

describe('classifyLoopArray — static vs reconciled', () => {
  test('a prop array is prop-derived, not static', () => {
    const { node, ctx } = mapCallOf(component('{items.map(it => <li key={it.id}>{it.name}</li>)}'))
    const kind = classifyLoopArray(resolveLoopSource(node, ctx, false), 'map', ctx)
    expect(kind).toEqual({ callsReactive: false, hasCalls: false, isDirectPropArray: true, isStaticArray: false })
  })

  test('a signal array calls a reactive getter', () => {
    const { node, ctx } = mapCallOf(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      function Test() {
        const [items, setItems] = createSignal([{ id: 1, name: 'a' }])
        return <ul>{items().map(it => <li key={it.id}>{it.name}</li>)}</ul>
      }
      export { Test }
    `)
    const kind = classifyLoopArray(resolveLoopSource(node, ctx, false), 'map', ctx)
    expect(kind.callsReactive).toBe(true)
    expect(kind.hasCalls).toBe(true)
    expect(kind.isStaticArray).toBe(false)
  })

  test('an unrecognised call is reconciled rather than frozen (#943)', () => {
    const { node, ctx } = mapCallOf(`
      import { getItems } from './items'
      function Test() {
        return <ul>{getItems().map(it => <li key={it.id}>{it.name}</li>)}</ul>
      }
      export { Test }
    `)
    const kind = classifyLoopArray(resolveLoopSource(node, ctx, false), 'map', ctx)
    expect(kind.callsReactive).toBe(false)
    expect(kind.hasCalls).toBe(true)
    expect(kind.isStaticArray).toBe(false)
  })

  test('a module-scope const array is static', () => {
    const { node, ctx } = mapCallOf(`
      const ITEMS = [{ id: 1, name: 'a' }]
      function Test() {
        return <ul>{ITEMS.map(it => <li key={it.id}>{it.name}</li>)}</ul>
      }
      export { Test }
    `)
    expect(classifyLoopArray(resolveLoopSource(node, ctx, false), 'map', ctx).isStaticArray).toBe(true)
  })

  test('Object.entries over a const object is never static (#2168)', () => {
    const { node, ctx } = mapCallOf(`
      const DICT = { a: 'x' }
      function Test() {
        return <ul>{Object.entries(DICT).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
      }
      export { Test }
    `)
    expect(classifyLoopArray(resolveLoopSource(node, ctx, false), 'map', ctx).isStaticArray).toBe(false)
  })
})

describe('transformMapCall — the coordinator', () => {
  test('assembles the decisions into one IRLoop', () => {
    const analyzer = analyzeComponent(
      component('{items.filter(it => it.id > 1).map((it, i) => <li key={it.id}>{i}: {it.name}</li>)}'),
      'Test.tsx',
    )
    const { jsxToIR } = require('../jsx-to-ir') as typeof import('../jsx-to-ir')
    const root = jsxToIR(analyzer)
    const loop = root?.type === 'element' ? (root.children.find(c => c.type === 'loop') as IRLoop | undefined) : undefined
    expect(loop).toBeDefined()
    expect(loop?.array).toBe('items')
    expect(loop?.filterPredicate?.raw).toBe('it.id > 1')
    expect(loop?.param).toBe('it')
    expect(loop?.index).toBe('i')
    expect(loop?.key).toBe('it.id')
    expect(loop?.depth).toBe(0)
    expect(loop?.markerId).toBe('l0')
    expect(loop?.isPropDerivedArray).toBe(true)
    expect(loop?.isStaticArray).toBe(false)
  })
})
