/**
 * The helpers the eight DSL template adapters (Blade, ERB, Jinja,
 * MiniJinja, Mojolicious, Pebble, Twig, Xslate) used to carry one copy each
 * of, now shared from `src/adapters/` (#3475). The adapters' own suites
 * cover the lowering they drive; these pin each helper on its own.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { isExplicitStringCall } from '../adapters/boolean-result'
import { collectImportedLoopChildComponentErrors, hasClientInteractivity } from '../adapters/component-tree'
import { isBareStringLiteral, isLiteralIndex, isStringTypeInfo } from '../adapters/literal-value'
import { collectBooleanTypedProps, collectNullableOptionalProps, isBooleanTypedPropRef } from '../adapters/prop-classes'
import { childTemplateName } from '../adapters/component-props'
import { parseExpression } from '../expression-parser'
import type { ComponentIR } from '../types'

function compileToIR(source: string, file = 'demo.tsx'): ComponentIR {
  const result = compileJSX(source, file, { adapter: new TestAdapter(), outputIR: true })
  const ir = result.files.find(f => f.type === 'ir')
  if (!ir) throw new Error('No IR output')
  return JSON.parse(ir.content) as ComponentIR
}

describe('isExplicitStringCall', () => {
  test('a one-argument String(x) call is explicit', () => {
    expect(isExplicitStringCall('String(props.checked ?? false)')).toBe(true)
    expect(isExplicitStringCall('  String(on())  ')).toBe(true)
  })

  test('other arities, other callees and non-calls are not', () => {
    expect(isExplicitStringCall('String()')).toBe(false)
    expect(isExplicitStringCall('String(a, b)')).toBe(false)
    expect(isExplicitStringCall('Number(x)')).toBe(false)
    expect(isExplicitStringCall('obj.String(x)')).toBe(false)
    expect(isExplicitStringCall('checked()')).toBe(false)
  })
})

describe('literal-value', () => {
  test('isStringTypeInfo holds only for the string primitive', () => {
    expect(isStringTypeInfo({ kind: 'primitive', raw: 'string', primitive: 'string' })).toBe(true)
    expect(isStringTypeInfo({ kind: 'primitive', raw: 'number', primitive: 'number' })).toBe(false)
    expect(isStringTypeInfo(undefined)).toBe(false)
  })

  test('isBareStringLiteral accepts a single- or double-quoted literal only', () => {
    expect(isBareStringLiteral("'a'")).toBe(true)
    expect(isBareStringLiteral(' "b" ')).toBe(true)
    expect(isBareStringLiteral('`c`')).toBe(false)
    expect(isBareStringLiteral('0')).toBe(false)
    expect(isBareStringLiteral(undefined)).toBe(false)
  })

  test('isLiteralIndex holds for a number or string literal index, not a variable or other literal', () => {
    expect(isLiteralIndex(parseExpression('0'))).toBe(true)
    expect(isLiteralIndex(parseExpression("'k'"))).toBe(true)
    expect(isLiteralIndex(parseExpression('size'))).toBe(false)
    expect(isLiteralIndex(parseExpression('true'))).toBe(false)
  })
})

describe('prop-classes', () => {
  const ir = compileToIR(`
type Props = { active: boolean; label?: string; rows?: number; tone: string; count?: number; items: string[]; flag?: boolean }
export function Demo({ active, label, rows, tone, count = 0, items, flag }: Props) {
  return <div data-active={active} data-flag={flag}>{label}{rows}{tone}{count}{items.length}</div>
}
`)

  test('collectBooleanTypedProps collects the boolean-typed props', () => {
    expect([...collectBooleanTypedProps(ir)].sort()).toEqual(['active', 'flag'])
  })

  test('collectNullableOptionalProps collects no-default props that are optional or non-primitive', () => {
    // `count` has a default; `active` / `tone` are required primitives.
    expect([...collectNullableOptionalProps(ir)].sort()).toEqual(['flag', 'items', 'label', 'rows'])
  })
})

describe('component-tree', () => {
  test('hasClientInteractivity: a signal makes the component interactive, propless static markup does not', () => {
    const reactive = compileToIR(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [n, setN] = createSignal(0)
  return <button onClick={() => setN(n() + 1)}>{n()}</button>
}
`)
    // A component that reads props still needs init (the analyzer's
    // `needsInit`), so the inert case takes none.
    const inert = compileToIR(`
export function Label() {
  return <span>static</span>
}
`)
    expect(hasClientInteractivity(reactive)).toBe(true)
    expect(hasClientInteractivity(inert)).toBe(false)
  })

  test('collectImportedLoopChildComponentErrors names the adapter and fires only inside a loop', () => {
    const ir = compileToIR(`
import { Row } from './row'
export function List({ items }: { items: string[] }) {
  return <ul>{items.map(item => <Row key={item} label={item} />)}<Row label="last" /></ul>
}
`, 'list.tsx')
    const errors = collectImportedLoopChildComponentErrors(ir, 'List', 'Twig')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe('BF103')
    expect(errors[0]!.message).toContain('The Twig adapter emits a cross-template call')
    expect(errors[0]!.suggestion?.message).toContain('register the resulting Twig template alongside the parent')
  })

  test('collectImportedLoopChildComponentErrors walks conditionals and component children, in render order', () => {
    const ir = compileToIR(`
import { Row } from './row'
import { Card } from './card'
export function List({ items, open }: { items: string[]; open: boolean }) {
  return (
    <div>
      {open ? <ul>{items.map(item => <Card key={item}>{item ? <Row label={item} /> : null}</Card>)}</ul> : null}
      <Card><Row label="outside" /></Card>
    </div>
  )
}
`, 'list.tsx')
    const errors = collectImportedLoopChildComponentErrors(ir, 'List', 'Jinja')
    expect(errors.map(e => e.message.match(/<(\w+)>/)?.[1])).toEqual(['Card', 'Row'])
  })

  test('collectImportedLoopChildComponentErrors ignores a non-relative import', () => {
    const ir = compileToIR(`
import { Row } from '@acme/ui'
export function List({ items }: { items: string[] }) {
  return <ul>{items.map(item => <Row key={item} label={item} />)}</ul>
}
`, 'list.tsx')
    expect(collectImportedLoopChildComponentErrors(ir, 'List', 'Twig')).toEqual([])
  })
})

describe('isBooleanTypedPropRef', () => {
  const ctx = { propsObjectName: 'props', booleanTypedProps: new Set(['open']), isBound: (n: string) => n === 'row' }

  test('a bare or props-object read of a boolean prop', () => {
    expect(isBooleanTypedPropRef('open', ctx)).toBe(true)
    expect(isBooleanTypedPropRef(' props.open ', ctx)).toBe(true)
    expect(isBooleanTypedPropRef('label', ctx)).toBe(false)
    expect(isBooleanTypedPropRef('open()', ctx)).toBe(false)
    expect(isBooleanTypedPropRef('open.value', ctx)).toBe(false)
  })

  test('a loop binding that shares the name is the row, not the prop (#2488)', () => {
    expect(isBooleanTypedPropRef('open', { ...ctx, isBound: (n) => n === 'open' })).toBe(false)
  })
})

describe('childTemplateName', () => {
  test('snake_cases the declared name, through an import alias (#2822)', () => {
    expect(childTemplateName('TodoItem', new Map())).toBe('todo_item')
    expect(childTemplateName('Item', new Map([['Item', 'TodoItem']]))).toBe('todo_item')
    expect(childTemplateName('Button', new Map())).toBe('button')
  })
})
