import { createFixture } from '../src/types'

/**
 * `loop-key-to-string-number-component-row` deferred to the client via
 * `/* @client *\/`, the escape its diagnostic suggests. The array is empty:
 * a client-only loop renders no rows at SSR, while the CSR harness would
 * build them from the props.
 */
export const fixture = createFixture({
  id: 'loop-key-to-string-number-component-row-client',
  description: 'A component loop row over a number array keyed by n.toString(), deferred to the client via /* @client */',
  source: `
'use client'

function Num(props: { label: string }) {
  return <li className="num">{props.label}</li>
}

export function LoopKeyToStringNumberComponentRowClient(props: { values: number[] }) {
  return <ul>{/* @client */ props.values.map(n => <Num key={n.toString()} label={n.toString()} />)}</ul>
}
`,
  props: { values: [] },
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
