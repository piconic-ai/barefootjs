/**
 * #3509: whether a component's `template:` lambda takes the static path
 * (`irToComponentTemplate`, expressions emitted as written) or the CSR path
 * (`generateCsrTemplate`, signal/memo reads replaced by their initial values)
 * is decided from the IR's free identifiers, not the expression text. The
 * lambda runs at module scope, where a signal getter or memo is not defined,
 * so an expression that reads one must take the CSR path wherever the read
 * sits in it. The text check classified `label + count()` by its leading
 * identifier (a prop) and sent it to the static path, which emitted a bare
 * `count()`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function templateLambda(source: string): string {
  const result = compileJSX(source, 'T.tsx', { adapter })
  expect(result.errors.filter((e) => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find((f) => f.type === 'clientJs')!
  const line = clientJs.content.split('\n').find((l) => l.includes('hydrate('))
  if (!line) throw new Error('no hydrate() call in client JS')
  const match = line.match(/template: (\(_p\) => `.*`) \}\)$/)
  if (!match) throw new Error(`no template lambda in: ${line}`)
  return match[1]
}

/** Evaluate the lambda at "module scope": only the escape helpers exist. */
function render(lambda: string, props: Record<string, unknown>): string {
  const template = new Function('escapeTextOrMarkup', 'escapeText', 'escapeAttr', `return ${lambda}`)(String, String, String)
  return template(props)
}

const header = `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
`

describe('static template eligibility reads IR free identifiers (#3509)', () => {
  test('a prop-first expression that calls a signal, in text, attribute and condition', () => {
    const lambda = templateLambda(`${header}
export function PropFirst({ label }: { label: string }) {
  const [count, setCount] = createSignal(0)
  return (
    <button data-x={label + count()} onClick={() => setCount(count() + 1)}>
      {label + count()}
      {label.length > count() ? <b>y</b> : <i>n</i>}
    </button>
  )
}`)
    expect(lambda).not.toContain('count()')
    const html = render(lambda, { label: 'Clicks: ' })
    expect(html).toContain('data-x="Clicks: 0"')
    expect(html).toContain('Clicks: 0')
    expect(html).toContain('<b')
  })

  test('the result does not depend on operand order', () => {
    const source = (expr: string) => `${header}
export function Order({ label }: { label: string }) {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{${expr}}</button>
}`
    const propFirst = render(templateLambda(source('label + count()')), { label: 'n=' })
    const signalFirst = render(templateLambda(source('count() + label')), { label: 'n=' })
    expect(propFirst).toContain('n=0')
    expect(signalFirst).toContain('0n=')
  })

  test('a prop-first expression that reads a memo', () => {
    const lambda = templateLambda(`${header}
export function Derived({ label }: { label: string }) {
  const [count, setCount] = createSignal(1)
  const doubled = createMemo(() => count() * 2)
  return (
    <button onClick={() => setCount(count() + 1)}>
      {label + doubled()}
    </button>
  )
}`)
    expect(lambda).not.toContain('doubled()')
    expect(render(lambda, { label: 'x' })).toContain('x2')
  })

  test('a prop-only expression with a call renders from the prop', () => {
    const lambda = templateLambda(`${header}
export function PropOnly({ label }: { label: string }) {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{label.toUpperCase()}</button>
}`)
    expect(render(lambda, { label: 'hi' })).toContain('HI')
  })

  test('a signal passed into an inlined JSX helper, in text, attribute and condition', () => {
    const lambda = templateLambda(`${header}
export function Helper({ label }: { label: string }) {
  const [count, setCount] = createSignal(0)
  function text(value: number) {
    return <span>{value}</span>
  }
  function attr(value: number) {
    return <span data-x={value} />
  }
  function cond(value: number) {
    return <span>{value ? <b>yes</b> : <i>no</i>}</span>
  }
  return (
    <button onClick={() => setCount(count() + 1)}>
      {label}
      {text(count())}
      {attr(count())}
      {cond(count())}
    </button>
  )
}`)
    expect(lambda).not.toContain('count()')
    const html = render(lambda, { label: 'n' })
    expect(html).toContain('data-x="0"')
    expect(html).toContain('<i')
  })

  test('a signal passed into an inlined multi-return JSX helper', () => {
    const lambda = templateLambda(`${header}
export function MultiHelper({ label }: { label: string }) {
  const [count, setCount] = createSignal(0)
  function pick(value: number) {
    if (value > 0) return <b>{value}</b>
    return <i>{value}</i>
  }
  return <button onClick={() => setCount(count() + 1)}>{label}{pick(count())}</button>
}`)
    expect(lambda).not.toContain('count()')
    expect(render(lambda, { label: 'n' })).toContain('<i')
  })
})
