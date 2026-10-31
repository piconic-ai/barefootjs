/**
 * The JS primitive plan's classifier and decision (#3824,
 * `spec/js-primitive-semantics.md` "Decision point"): `collectOperandTyping`
 * and its scoped view, `operandFacts`, and `planPrimitive` over a
 * `NativeSafeTable`.
 */

import { describe, test, expect } from 'bun:test'
import {
  analyzeComponent,
  BindingScope,
  buildMetadata,
  collectOperandTyping,
  EMPTY_OPERAND_TYPING,
  operandFacts,
  parseExpression,
  planPrimitive,
  type IRMetadata,
  type NativeSafeTable,
  type OperandFacts,
  type ScopedOperandTyping,
  type TypeInfo,
} from '../index'

const prim = (primitive: 'string' | 'number' | 'boolean' | 'null' | 'undefined'): TypeInfo => ({ kind: 'primitive', raw: primitive, primitive })
const union = (...unionTypes: TypeInfo[]): TypeInfo => ({ kind: 'union', raw: unionTypes.map(t => t.raw).join(' | '), unionTypes })
const array = (elementType: TypeInfo): TypeInfo => ({ kind: 'array', raw: `${elementType.raw}[]`, elementType })

type Meta = Pick<IRMetadata, 'signals' | 'memos' | 'propsParams' | 'localConstants' | 'propsObjectName' | 'typeDefinitions'>

function meta(partial: Partial<Meta>): Meta {
  return { signals: [], memos: [], propsParams: [], localConstants: [], propsObjectName: null, typeDefinitions: [], ...partial }
}

function param(name: string, type: TypeInfo, optional = false, defaultValue?: string): Meta['propsParams'][number] {
  return { name, type, optional, ...(defaultValue !== undefined ? { defaultValue } : {}) } as Meta['propsParams'][number]
}

function signal(getter: string, type: TypeInfo, initialValue: string): Meta['signals'][number] {
  return { getter, setter: null, type, initialValue, parsed: parseExpression(initialValue) } as unknown as Meta['signals'][number]
}

const COMPONENT = meta({
  propsObjectName: 'props',
  propsParams: [
    param('n', prim('number')),
    param('s', prim('string')),
    param('on', prim('boolean')),
    param('maybe', prim('number'), true),
    param('nothing', union(prim('number'), prim('null'))),
    param('either', union(prim('number'), prim('null')), true),
    param('size', prim('string'), true, "'md'"),
    param('rows', array(prim('number'))),
  ],
  signals: [signal('count', prim('number'), '0'), signal('und', prim('number'), ''), signal('label', { kind: 'unknown', raw: 'unknown' }, "'x'")],
})

const typing = collectOperandTyping(COMPONENT).at(BindingScope.forComponent('props'))

/** `facts.types` as a sorted list, with the nil reading when there is one. */
function show(facts: OperandFacts): string {
  const types = [...facts.types].sort().join('|')
  return facts.nil ? `${types} (${facts.nil})` : types
}

const factsOf = (src: string, at: ScopedOperandTyping = typing) => show(operandFacts(parseExpression(src), at))

describe('collectOperandTyping', () => {
  test('a required prop is its declared type; an optional one without a default may be undefined', () => {
    expect(factsOf('props.n')).toBe('number')
    expect(factsOf('props.s')).toBe('string')
    expect(factsOf('props.on')).toBe('boolean')
    expect(factsOf('props.maybe')).toBe('nil|number (undefined)')
    expect(factsOf('props.nothing')).toBe('nil|number (null)')
    expect(factsOf('props.either')).toBe('nil|number (either)')
    // With a props object, a default comes from a body destructure and
    // types that local binding, not `props.size`.
    expect(factsOf('props.size')).toBe('nil|string (undefined)')
  })

  test('a signal is its declared type or literal seed, nil when it has none', () => {
    expect(factsOf('count()')).toBe('number')
    expect(factsOf('und()')).toBe('nil|number (undefined)')
    expect(factsOf('label()')).toBe('string')
  })

  test('destructured props are bare names; a props object reads them only as members', () => {
    const destructured = collectOperandTyping(meta({ propsParams: [param('n', prim('number'))] })).at(BindingScope.EMPTY)
    expect(factsOf('n', destructured)).toBe('number')
    expect(factsOf('n')).toBe('unknown')
  })

  test('a loop binding shadows an outer name; a loop index is a non-negative integer', () => {
    const row = BindingScope.forComponent('props').enterLoopRow({ param: 'count', index: 'i' })
    const at = collectOperandTyping(COMPONENT).at(row)
    expect(factsOf('count', at)).toBe('unknown')
    const index = operandFacts(parseExpression('i'), at)
    expect(show(index)).toBe('number')
    expect(index.index).toBe(true)
  })

  test('a row read takes its type from the loop row type', () => {
    const rowType: TypeInfo = {
      kind: 'object',
      raw: '{ id: string; n?: number }',
      properties: [
        { name: 'id', type: prim('string'), optional: false, readonly: false },
        { name: 'n', type: prim('number'), optional: true, readonly: false },
      ],
    }
    const row = BindingScope.forComponent('props').enterLoopRow({ param: 'r', itemType: rowType })
    const at = collectOperandTyping(COMPONENT).at(row)
    expect(factsOf('r.id', at)).toBe('string')
    expect(factsOf('r.n', at)).toBe('nil|number (undefined)')
    expect(factsOf('r', at)).toBe('object')
  })

  test('a binding named `props` reads its own member, not the prop', () => {
    const shadow = BindingScope.forComponent('props').enterCallback(['props'])
    expect(factsOf('props.n', collectOperandTyping(COMPONENT).at(shadow))).toBe('unknown')
  })
})

describe('operandFacts', () => {
  test('literals and structural results', () => {
    expect(factsOf("'a'")).toBe('string')
    expect(factsOf('1')).toBe('number')
    expect(factsOf('true')).toBe('boolean')
    expect(factsOf('null')).toBe('nil (null)')
    expect(factsOf('undefined')).toBe('nil (undefined)')
    expect(factsOf('`a${props.n}`')).toBe('string')
    expect(factsOf('props.n < 1')).toBe('boolean')
    expect(factsOf('!props.n')).toBe('boolean')
    expect(factsOf('-props.s')).toBe('number')
    expect(factsOf('props.n % 2')).toBe('number')
    expect(factsOf('[1, 2]')).toBe('object')
  })

  test('`+` is a string when either side is one, a number when neither can be', () => {
    expect(factsOf("props.n + 'x'")).toBe('string')
    expect(factsOf('props.n + count()')).toBe('number')
    expect(factsOf('props.n + props.maybe')).toBe('number')
    expect(factsOf('props.n + label2()')).toBe('unknown')
  })

  test('`&&` / `||` / `?:` are the union of their values; `??` drops the nil of its left side', () => {
    expect(factsOf('props.on && props.n > 1')).toBe('boolean')
    expect(factsOf("props.on ? 'a' : 1")).toBe('number|string')
    expect(factsOf("props.on ? 'a' : null")).toBe('nil|string (null)')
    expect(factsOf('props.maybe ?? 0')).toBe('number')
    expect(factsOf('props.on || x()')).toBe('unknown')
  })

  test('a method result and an index read are not typed in step 0', () => {
    expect(factsOf('props.rows.includes(1)')).toBe('unknown')
    expect(factsOf('props.rows[0]')).toBe('unknown')
  })
})

const NONE: NativeSafeTable = {}
const ALL: NativeSafeTable = {
  'to-boolean': ['boolean', 'unproven'],
  'to-number': ['number-pair', 'number', 'unproven'],
  plus: ['number-pair', 'string', 'unproven'],
  'strict-eq': ['number-pair', 'string-pair', 'boolean-pair', 'unproven'],
  relational: ['number-pair', 'unproven'],
  neg: ['number', 'unproven'],
  'number-literal': ['safe-integer', 'unproven'],
  nullish: ['non-nil', 'unproven'],
  get: ['array-index', 'unproven'],
}
const PROVEN_ONLY: NativeSafeTable = {
  'to-boolean': ['boolean'],
  'to-number': ['number-pair', 'number'],
  plus: ['number-pair', 'string'],
  'strict-eq': ['number-pair', 'string-pair', 'boolean-pair'],
  relational: ['number-pair'],
  neg: ['number'],
  'number-literal': ['safe-integer'],
  nullish: ['non-nil'],
  get: ['array-index'],
}

/** The plan as `mode op proof|helper`. */
function plan(src: string, target: NativeSafeTable, at: ScopedOperandTyping = typing): string {
  const p = planPrimitive(parseExpression(src), at, target)
  if (p === null) return 'none'
  if (p.mode === 'native') return `native ${p.op} ${p.proof}`
  if (p.mode === 'helper') return `helper ${p.op} ${p.helper} ${p.proof}`
  if (p.mode === 'const') return `const ${p.op} ${p.value}`
  return `refuse ${p.op}`
}

describe('planPrimitive', () => {
  test('ToBoolean (a test position) is native only for a proven boolean the target claims', () => {
    expect(plan('!props.on', PROVEN_ONLY)).toBe('native to-boolean boolean')
    expect(plan('!props.s', PROVEN_ONLY)).toBe('helper to-boolean truthy unproven')
    expect(plan('!props.s', ALL)).toBe('native to-boolean unproven')
    expect(plan('props.on ? 1 : 2', NONE)).toBe('helper to-boolean truthy boolean')
    expect(plan('props.s && 1', PROVEN_ONLY)).toBe('helper to-boolean truthy unproven')
  })

  test('relational and arithmetic are native only for two proven non-nil numbers', () => {
    expect(plan('props.n < count()', PROVEN_ONLY)).toBe('native relational number-pair')
    expect(plan('props.n <= props.maybe', PROVEN_ONLY)).toBe('helper relational le unproven')
    expect(plan("props.s > '9'", PROVEN_ONLY)).toBe('helper relational gt unproven')
    expect(plan('props.n - 1', PROVEN_ONLY)).toBe('native to-number number-pair')
    expect(plan('props.n * props.nothing', PROVEN_ONLY)).toBe('helper to-number mul unproven')
    expect(plan('props.n - props.maybe', NONE)).toBe('helper to-number sub unproven')
  })

  test('`/` and `%` always name their helper', () => {
    expect(plan('props.n / 2', ALL)).toBe('helper to-number div number-pair')
    expect(plan('props.n % 2', ALL)).toBe('helper to-number mod number-pair')
  })

  test('`+` adds two numbers, concatenates over a proven string, and is `plus` otherwise', () => {
    expect(plan('props.n + 1', PROVEN_ONLY)).toBe('native plus number-pair')
    expect(plan('props.n + 1', NONE)).toBe('helper plus add number-pair')
    expect(plan("props.n + 'x'", PROVEN_ONLY)).toBe('native plus string')
    expect(plan('props.maybe + 1', PROVEN_ONLY)).toBe('helper plus plus unproven')
  })

  test('`===` is native for a same-typed pair the target pins, and constant across proven types', () => {
    expect(plan("props.s === 'a'", PROVEN_ONLY)).toBe('native strict-eq string-pair')
    expect(plan('props.n === count()', PROVEN_ONLY)).toBe('native strict-eq number-pair')
    expect(plan('props.maybe === 1', PROVEN_ONLY)).toBe('helper strict-eq strict_eq unproven')
    expect(plan("props.n === 'a'", ALL)).toBe('const strict-eq false')
    expect(plan("props.n !== 'a'", ALL)).toBe('const strict-eq true')
  })

  test('unary minus is native only over a non-zero number literal', () => {
    expect(plan('-1', PROVEN_ONLY)).toBe('native neg number')
    expect(plan('-0', PROVEN_ONLY)).toBe('helper neg neg unproven')
    expect(plan('-props.n', PROVEN_ONLY)).toBe('helper neg neg unproven')
    expect(plan('+props.n', PROVEN_ONLY)).toBe('native to-number number')
  })

  test('a number literal is native only when it is a safe integer', () => {
    expect(plan('42', PROVEN_ONLY)).toBe('native number-literal safe-integer')
    expect(plan('1.5', PROVEN_ONLY)).toBe('helper number-literal number unproven')
    expect(plan('1e21', PROVEN_ONLY)).toBe('helper number-literal number unproven')
    expect(plan("'42'", PROVEN_ONLY)).toBe('none')
  })

  test('`??` is native when its left side is proven never nil', () => {
    expect(plan("props.s ?? 'x'", PROVEN_ONLY)).toBe('native nullish non-nil')
    expect(plan('props.maybe ?? 0', PROVEN_ONLY)).toBe('helper nullish coalesce unproven')
  })

  test('an index read is native only for a proven array read by a loop index', () => {
    const row = BindingScope.forComponent('props').enterLoopRow({ param: 'item', index: 'i' })
    const at = collectOperandTyping(COMPONENT).at(row)
    expect(plan('props.rows[i]', PROVEN_ONLY, at)).toBe('native get array-index')
    expect(plan('props.rows[props.n]', PROVEN_ONLY, at)).toBe('helper get get unproven')
    // A literal key is a computed member, never a proven index.
    expect(plan('props.rows[0]', PROVEN_ONLY, at)).toBe('helper get get unproven')
    expect(plan('props.rows.length', PROVEN_ONLY, at)).toBe('none')
  })

  test('loose equality and other operators are not planned', () => {
    expect(plan('props.n == 1', ALL)).toBe('none')
    expect(plan("'a' in props", ALL)).toBe('none')
    expect(plan('typeof props.n', ALL)).toBe('none')
  })

  test('the empty typing proves only structure', () => {
    const empty = EMPTY_OPERAND_TYPING.at(BindingScope.EMPTY)
    expect(plan('!props.on', PROVEN_ONLY, empty)).toBe('helper to-boolean truthy unproven')
    expect(plan('!(a < b)', PROVEN_ONLY, empty)).toBe('native to-boolean boolean')
  })
})

/** The typing of the one component in `src`, at component scope, from the analyzer's metadata. */
function analyzed(src: string): ScopedOperandTyping {
  const metadata = buildMetadata(analyzeComponent(src, 'foo.tsx'))
  return collectOperandTyping(metadata).at(BindingScope.forComponent(metadata.propsObjectName))
}

const NON_NIL_NULLISH: NativeSafeTable = { nullish: ['non-nil'] }

describe('defaults, from analyzed components', () => {
  test('a renamed body-destructure default types the local binding, not the original property', () => {
    const at = analyzed(
      "export function Foo(props: { label?: string }) { const { label: text = 'none' } = props; return <div>{props.label ?? 'fallback'}{text}</div> }",
    )
    expect(factsOf('props.label', at)).toBe('nil|string (undefined)')
    expect(plan("props.label ?? 'fallback'", NON_NIL_NULLISH, at)).toBe('helper nullish coalesce unproven')
    expect(factsOf('text', at)).toBe('string')
    expect(plan("text ?? 'fallback'", NON_NIL_NULLISH, at)).toBe('native nullish non-nil')
  })

  test('an unrenamed body-destructure default types the local binding, not the original property', () => {
    const at = analyzed(
      "export function Foo(props: { label?: string }) { const { label = 'none' } = props; return <div>{props.label ?? 'fallback'}{label}</div> }",
    )
    expect(factsOf('props.label', at)).toBe('nil|string (undefined)')
    expect(plan("props.label ?? 'fallback'", NON_NIL_NULLISH, at)).toBe('helper nullish coalesce unproven')
    expect(factsOf('label', at)).toBe('string')
  })

  test('a body destructure without a default keeps the optional nil', () => {
    const at = analyzed('export function Foo(props: { label?: string }) { const { label } = props; return <div>{label}</div> }')
    expect(factsOf('label', at)).toBe('nil|string (undefined)')
  })

  test('a literal parameter default proves its own type; an `undefined` default does not prove non-nil', () => {
    const at = analyzed(
      "export function Foo({ on = undefined, n = 1, size = 'md', off = false, alias = off }: { on?: boolean; n?: number; size?: string; off?: boolean; alias?: boolean }) { return <div>{on ?? true}{n}{size}{alias}</div> }",
    )
    expect(factsOf('on', at)).toBe('boolean|nil (undefined)')
    expect(plan('on ?? true', NON_NIL_NULLISH, at)).toBe('helper nullish coalesce unproven')
    expect(factsOf('n', at)).toBe('number')
    expect(plan('n ?? 0', NON_NIL_NULLISH, at)).toBe('native nullish non-nil')
    expect(factsOf('size', at)).toBe('string')
    // A default reading an earlier binding takes that binding's facts.
    expect(factsOf('alias', at)).toBe('boolean')
  })

  test('a destructuring default replaces only `undefined`: a declared `null` survives it', () => {
    const param = analyzed("export function Foo({ label = 'none' }: { label?: string | null }) { return <div>{label ?? 'fallback'}</div> }")
    expect(factsOf('label', param)).toBe('nil|string (null)')
    expect(plan("label ?? 'fallback'", NON_NIL_NULLISH, param)).toBe('helper nullish coalesce unproven')
    const renamed = analyzed(
      "export function Foo(props: { label?: string | null }) { const { label: text = 'none' } = props; return <div>{text ?? 'fallback'}</div> }",
    )
    expect(factsOf('text', renamed)).toBe('nil|string (null)')
    expect(plan("text ?? 'fallback'", NON_NIL_NULLISH, renamed)).toBe('helper nullish coalesce unproven')
    const unrenamed = analyzed(
      "export function Foo(props: { label?: string | null }) { const { label = 'none' } = props; return <div>{label ?? 'fallback'}</div> }",
    )
    expect(factsOf('label', unrenamed)).toBe('nil|string (null)')
    // A required nullable prop keeps its `null` too.
    const required = analyzed("export function Foo({ label = 'none' }: { label: string | null }) { return <div>{label}</div> }")
    expect(factsOf('label', required)).toBe('nil|string (null)')
  })

  test('a hand-written `??` const is never nil: `??` replaces `null` too', () => {
    const at = analyzed(
      "export function Foo(props: { label?: string | null }) { const text = props.label ?? 'none'; return <div>{text ?? 'fallback'}</div> }",
    )
    expect(factsOf('text', at)).toBe('string')
    expect(plan("text ?? 'fallback'", NON_NIL_NULLISH, at)).toBe('native nullish non-nil')
  })

  test('`||` and `&&` initializers prove nothing (a falsy non-nil left side survives `||`)', () => {
    const at = analyzed(
      "export function Foo(props: { label?: string | null; n: number }) { const a = props.label || 'none'; const b = props.n && 'x'; return <div>{a}{b}</div> }",
    )
    expect(factsOf('a', at)).toBe('unknown')
    expect(factsOf('b', at)).toBe('unknown')
  })

  test('a default that may be nil, or proves nothing, does not prove non-nil', () => {
    const at = analyzed(
      'export function Foo({ a = null, b = make() }: { a?: number | null; b?: number }) { return <div>{a}{b}</div> }\nfunction make(): number { return 1 }',
    )
    expect(factsOf('a', at)).toBe('nil|number (null)')
    expect(factsOf('b', at)).toBe('unknown')
    expect(plan('b ?? 0', NON_NIL_NULLISH, at)).toBe('helper nullish coalesce unproven')
  })
})
