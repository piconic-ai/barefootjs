/**
 * The higher-order callback chain shared by the DSL adapters (#3477): what
 * each `CALLBACK_METHODS` call lowers to, independent of any DSL's spelling,
 * and the support gate's refusal of a callback that reads its index.
 */

import { describe, test, expect } from 'bun:test'
import {
  emitCallbackEval,
  lowerCallbackMethod,
  isUnloweredCall,
  unloweredCallRefusal,
  type CallbackEvalSpelling,
  type CallbackLoweringOptions,
} from '../adapters/callback-method'
import {
  asCallbackMethodCall,
  isSupported,
  parseExpression,
  unboundCallbackParamRead,
  type ParsedExpr,
} from '../expression-parser'

const jinja: CallbackLoweringOptions = { adapterName: 'Jinja' }
const kolon: CallbackLoweringOptions = { adapterName: 'Xslate', nativePredicate: true }

function callOf(source: string) {
  const call = asCallbackMethodCall(parseExpression(source))
  if (!call) throw new Error(`not a callback method call: ${source}`)
  return call
}

const lower = (source: string, options = jinja) => {
  const call = callOf(source)
  return lowerCallbackMethod(call.method, call.arrow, call.args, options)
}

const spelling: CallbackEvalSpelling = {
  call: (helper, operands) => `bf.${helper}(${operands.join(', ')})`,
  string: (value) => `'${value.replace(/'/g, "\\'")}'`,
  boolean: (value) => (value ? 'T' : 'F'),
  env: (entries) => `{${entries.map(([name, value]) => `${name}=${value}`).join(', ')}}`,
}
const emitIdentifier = (e: ParsedExpr) => (e.kind === 'identifier' ? `$${e.name}` : '?')

function render(source: string, options = jinja): string {
  const plan = lower(source, options)
  if (plan.kind !== 'eval') throw new Error(`expected an eval plan, got ${plan.kind}`)
  return emitCallbackEval(plan, 'RECV', emitIdentifier, spelling)
}

describe('lowerCallbackMethod: predicates', () => {
  test('a serializable predicate goes to its evaluator helper with the captured names', () => {
    expect(render('items.filter(x => x > limit)')).toBe(
      `bf.filter_eval(RECV, '{"kind":"binary","op":">","left":{"kind":"identifier","name":"x"},"right":{"kind":"identifier","name":"limit"}}', 'x', {limit=$limit})`,
    )
  })

  test('the find family carries its direction', () => {
    expect(render('items.find(x => x.done)')).toEndWith(`, 'x', T, {})`)
    expect(render('items.findLast(x => x.done)')).toEndWith(`, 'x', F, {})`)
    expect(render('items.findIndex(x => x.done)')).toStartWith('bf.find_index_eval(')
    expect(render('items.findLastIndex(x => x.done)')).toEndWith(`, 'x', F, {})`)
    expect(render('items.every(x => x.done)')).toStartWith('bf.every_eval(')
  })

  test('a predicate the evaluator cannot model: BF101 naming the adapter, or the native form', () => {
    const refused = lower('items.filter(x => x.name.localeCompare(q) > 0)')
    expect(refused).toMatchObject({ kind: 'refuse' })
    expect(refused.kind === 'refuse' && refused.message).toBe(
      `'.filter(...)' predicate is outside the Jinja adapter's evaluable surface`,
    )
    expect(lower('items.filter(x => x.name.startsWith(q))', kolon)).toMatchObject({
      kind: 'native-predicate',
      method: 'filter',
      param: 'x',
    })
  })

  test('the native form never takes an opaque call: it would read the callee instead', () => {
    expect(lower('items.filter(x => x.name.localeCompare(q) > 0)', kolon)).toMatchObject({ kind: 'refuse' })
    expect(lower('items.filter(x => isOk(x))', kolon)).toMatchObject({ kind: 'refuse' })
    // A zero-arg call is a signal getter, which the native form reads correctly.
    expect(lower('items.filter(x => x.n > limit())', kolon)).toMatchObject({ kind: 'native-predicate' })
  })

  test('the native form never takes a nested callback that reads its index: it binds the element only', () => {
    const nested = `rows.filter(row => row.join(',').startsWith('a') && row.filter((x, i) => i > 0).length > 0)`
    expect(lower(nested, kolon)).toMatchObject({ kind: 'refuse' })
    expect(lower(`rows.filter(row => row.join(',').startsWith('a') && row.filter(x => x > 0).length > 0)`, kolon)).toMatchObject({
      kind: 'native-predicate',
    })
    // The evaluator binds the nested index, so a serializable predicate keeps it.
    expect(lower('rows.filter(row => row.filter((x, i) => i > 0).length > 0)', kolon)).toMatchObject({ kind: 'eval' })
  })

  test('the identity filter goes native only on an adapter with a native form', () => {
    expect(lower('items.filter(x => x)', kolon)).toMatchObject({ kind: 'native-predicate', method: 'filter' })
    expect(lower('items.filter(x => x)')).toMatchObject({ kind: 'eval', helper: 'filter_eval' })
  })
})

describe('lowerCallbackMethod: sort, reduce, projections', () => {
  test('a sort comparator goes to the evaluator, then the structured descriptor, then BF101', () => {
    expect(render('items.toSorted((a, b) => a.n - b.n)')).toStartWith(`bf.sort_eval(RECV, '{`)
    expect(render('items.toSorted((a, b) => a.n - b.n)')).toEndWith(`, 'a', 'b', {})`)
    expect(lower('items.sort((a, b) => a.name.localeCompare(b.name))')).toMatchObject({ kind: 'structured-sort' })
    expect(lower('items.sort((a, b) => a.name.localeCompare(b.name, locale))')).toEqual({
      kind: 'refuse',
      message: `'.sort(...)' comparator is outside the Jinja adapter's evaluable / structured surface`,
      suggestion: `Pre-compute the sorted array, or move this position to a '/* @client */' boundary.`,
    })
  })

  test('a reducer needs a string or number literal seed', () => {
    expect(render('items.reduce((acc, x) => acc + x.n, 0)')).toEndWith(`, 'acc', 'x', 0, 'left', {})`)
    expect(render(`items.reduceRight((acc, x) => acc + x, '')`)).toEndWith(`, 'acc', 'x', '', 'right', {})`)
    expect(render('items.reduce((acc, x) => acc + x, 1.5)')).toEndWith(`, 1.5, 'left', {})`)
    for (const source of ['items.reduce((acc, x) => acc + x)', 'items.reduce((acc, x) => acc + x, start)', 'items.reduce((acc, x) => acc + x, true)']) {
      const plan = lower(source)
      expect(plan.kind === 'refuse' && plan.message).toBe(
        `'.reduce(...)' is outside the Jinja adapter's evaluable surface (needs a literal initial value and an evaluable reducer body)`,
      )
    }
  })

  test('map and flatMap project through their evaluators', () => {
    expect(render('items.map(x => x.n * k)')).toEndWith(`, 'x', {k=$k})`)
    expect(render('items.flatMap(x => x.tags)')).toStartWith('bf.flat_map_eval(RECV, ')
    const plan = lower('items.map(x => x.name.localeCompare(q))')
    expect(plan.kind === 'refuse' && plan.message).toBe(`'.map(...)' projection is outside the Jinja adapter's evaluable surface`)
  })

  test('the env names come after the receiver and the operands, in sorted order', () => {
    const order: string[] = []
    const plan = lower('items.filter(x => x > b && x < a)')
    if (plan.kind !== 'eval') throw new Error(plan.kind)
    emitCallbackEval(plan, 'RECV', (e) => (order.push(emitIdentifier(e)), emitIdentifier(e)), spelling)
    expect(order).toEqual(['$a', '$b'])
  })
})

describe('unboundCallbackParamRead: the index and array params', () => {
  const read = (source: string) => {
    const call = callOf(source)
    return unboundCallbackParamRead(call.method, call.arrow)
  }

  test('a callback that reads its index or array param is found', () => {
    expect(read('items.map((x, i) => x + i)')).toBe('i')
    expect(read('items.filter((x, i, all) => all.length > 1)')).toBe('all')
    expect(read('items.reduce((acc, x, i) => acc + i, 0)')).toBe('i')
  })

  test("'evaluator' scope binds a .map / .filter index, nothing more", () => {
    const call = callOf('items.map((x, i, all) => i)')
    expect(unboundCallbackParamRead(call.method, call.arrow, 'evaluator')).toBeNull()
    const arr = callOf('items.filter((x, i, all) => all.length)')
    expect(unboundCallbackParamRead(arr.method, arr.arrow, 'evaluator')).toBe('all')
    const some = callOf('items.some((x, i) => i > 0)')
    expect(unboundCallbackParamRead(some.method, some.arrow, 'evaluator')).toBe('i')
  })

  test('declared but unread, shadowed, or within the bound params: not found', () => {
    expect(read('items.map((x, i) => x)')).toBeNull()
    expect(read('items.reduce((acc, x, i) => acc + x, 0)')).toBeNull()
    expect(read('items.toSorted((a, b) => a - b)')).toBeNull()
    expect(read('rows.filter((r, i) => r.tags.some(i => i > 0))')).toBeNull()
  })

  test('the support gate refuses it, at any depth', () => {
    expect(isSupported(parseExpression('items.map((x, i) => x + i).join(",")'))).toMatchObject({
      supported: false,
      reason: expect.stringContaining(`'.map()' callback reads 'i', its index or array parameter`),
    })
    expect(isSupported(parseExpression('rows.filter(r => r.tags.some((t, j) => j > 1)).length')).supported).toBe(false)
    expect(isSupported(parseExpression('items.map((x, i) => x).join(",")')).supported).toBe(true)
  })

  test('inside an evaluator body, a nested .map / .filter binds its index', () => {
    expect(isSupported(parseExpression(`rows.map(r => r.map((x, i) => i).join(',')).join(';')`)).supported).toBe(true)
    expect(isSupported(parseExpression(`rows.map(r => r.filter((x, i) => i > 0).length)`)).supported).toBe(true)
    expect(isSupported(parseExpression(`rows.some(r => r.map((x, i) => x + i).join('') === q)`)).supported).toBe(true)
    // The evaluator binds neither a nested callback's array param nor the index of
    // a nested callback other than .map / .filter.
    expect(isSupported(parseExpression('rows.map(r => r.map((x, i, all) => all.length))')).supported).toBe(false)
    expect(isSupported(parseExpression('rows.map(r => r.some((x, i) => i > 0))')).supported).toBe(false)
    // The receiver of the outer call is still lowered by the template.
    expect(isSupported(parseExpression('rows.map((r, i) => r.slice(i)).map(r => r.length)')).supported).toBe(false)
  })
})

describe('isUnloweredCall (#3493)', () => {
  function call(source: string): Extract<ParsedExpr, { kind: 'call' }> {
    const parsed = parseExpression(source)
    if (parsed.kind !== 'call') throw new Error(`expected a call: ${source}`)
    return parsed
  }

  const noGlobals = () => false

  test('a method call with arguments outside the catalogue has no lowering', () => {
    for (const source of ["s().localeCompare('m')", "props.label.localeCompare('m')", 'label.codePointAt(0)']) {
      const c = call(source)
      expect(isUnloweredCall(c.callee, c.args, 'props', noGlobals)).toBe(true)
    }
  })

  test('a getter read or a function-valued prop keeps the callee read', () => {
    for (const source of ['props.value()', 'props.value.v()', 'props.renderNode(node)']) {
      const c = call(source)
      expect(isUnloweredCall(c.callee, c.args, 'props', noGlobals)).toBe(false)
    }
    // The props parameter's own name, whatever it is.
    const named = call('p.renderNode(node)')
    expect(isUnloweredCall(named.callee, named.args, 'p', noGlobals)).toBe(false)
    expect(isUnloweredCall(named.callee, named.args, null, noGlobals)).toBe(true)
  })

  test('a zero-arg call rooted at a global has no lowering (#3505)', () => {
    const isGlobal = (name: string) => ['Date', 'Math', 'window', 'location'].includes(name)
    for (const source of ['Date.now()', 'Math.random()', 'window.performance.now()', 'location.toString()', 'Date.now.call()']) {
      const c = call(source)
      expect(isUnloweredCall(c.callee, c.args, 'props', isGlobal)).toBe(true)
    }
  })

  test('a zero-arg call on a bound name keeps the callee read, even when it is named like a global', () => {
    // `isGlobal` is false for a prop, a local (`const navigator = useContext(Nav)`) or a loop binding.
    for (const source of ['ctx.open()', 'navigator.current()', 'document.title()', 'item.label()']) {
      const c = call(source)
      expect(isUnloweredCall(c.callee, c.args, 'props', noGlobals)).toBe(false)
    }
  })
})

describe('unloweredCallRefusal (#3493)', () => {
  test('a zero-arg call on a global names the global, not missing arguments (#3505)', () => {
    const call = parseExpression('Date.now()')
    if (call.kind !== 'call') throw new Error('expected a call')
    expect(unloweredCallRefusal(call.callee, call.args, 'Jinja').message).toBe(
      "Call 'Date.now()' reads a JavaScript global, which has no Jinja template binding; read as a value it would drop the call",
    )
  })

  test('names the whole call and the adapter, and offers both escapes', () => {
    const call = parseExpression("s().localeCompare('m')")
    if (call.kind !== 'call') throw new Error('expected a call')
    const refusal = unloweredCallRefusal(call.callee, call.args, 'Jinja')
    expect(refusal.message).toBe(
      "Call 's().localeCompare(...)' has no Jinja template lowering; read as a value it would drop the call and its arguments",
    )
    expect(refusal.suggestion).toContain('/* @client */')
    expect(refusal.suggestion).toContain('pass it as a prop')
  })
})
