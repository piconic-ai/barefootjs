/**
 * #3692: `/` over a zero divisor is IEEE division, as in JS. `bf.Div` used
 * to give `0`, so `1 / 0` rendered `0` instead of `Infinity`, and a memo
 * dividing by the literal `0` was left out of the boxed `bf.Div` seed and
 * failed `go build`. Renders through `go run`, comparing against the
 * values JS gives.
 */
import { describe, test, expect } from 'bun:test'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { renderGoTemplateComponent, GoNotAvailableError } from '../test-render'

/** The text inside each `<!--bf:sN-->…<!--/-->` marker, in order. */
function texts(html: string): string[] {
  return [...html.matchAll(/<!--bf:s\d+-->(.*?)<!--\/-->/g)].map(m => m[1])
}

async function render(source: string, props: Record<string, unknown>): Promise<string | null> {
  try {
    return await renderGoTemplateComponent({ source: source.trimStart(), adapter: new GoTemplateAdapter(), props })
  } catch (err) {
    if (err instanceof GoNotAvailableError) {
      console.log('Skipping #3692 render: go command not found')
      return null
    }
    throw err
  }
}

describe('#3692 division by a zero divisor', () => {
  test('a template expression gives Infinity, -Infinity and NaN', async () => {
    const html = await render(`
'use client'
import { createSignal } from '@barefootjs/client'
export function T(props: { zero: number; n: number }) {
  const [z] = createSignal(0)
  return (
    <p data-q={props.n / z()}>
      <span>{props.n / props.zero}</span>
      <span>{-props.n / props.zero}</span>
      <span>{props.zero / props.zero}</span>
      <span>{3 / z()}</span>
      <span>{(props.zero - 1) / z()}</span>
      <span>{z() / z()}</span>
    </p>
  )
}
`, { zero: 0, n: 5 })
    if (html === null) return
    expect(html).toContain('data-q="Infinity"')
    expect(texts(html)).toEqual(['Infinity', '-Infinity', 'NaN', 'Infinity', '-Infinity', 'NaN'])
  }, 120_000)

  test('a memo over the literal 0 or a runtime zero builds and gives the JS quotient', async () => {
    const html = await render(`
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function T(props: { n: number; zero: number }) {
  const [count] = createSignal(-3)
  const negative = createMemo(() => count() / 0)
  const positive = createMemo(() => props.n / 0)
  const nan = createMemo(() => props.zero / 0)
  const copy = createMemo(() => negative())
  const doubled = createMemo(() => negative() * 2)
  const runtime = createMemo(() => count() / props.zero)
  return (
    <div data-negative={negative()} data-positive={positive()}>
      <span>{negative()}</span>
      <span>{positive()}</span>
      <span>{nan()}</span>
      <span>{copy()}</span>
      <span>{doubled()}</span>
      <span>{runtime()}</span>
    </div>
  )
}
`, { n: 2, zero: 0 })
    if (html === null) return
    expect(html).toContain('data-negative="-Infinity" data-positive="Infinity"')
    expect(texts(html)).toEqual(['-Infinity', 'Infinity', 'NaN', '-Infinity', '-Infinity', '-Infinity'])
  }, 120_000)
})
