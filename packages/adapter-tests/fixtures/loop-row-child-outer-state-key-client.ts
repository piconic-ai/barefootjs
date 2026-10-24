import { createFixture } from '../src/types'

/**
 * `loop-row-child-outer-state-key` deferred to the client via
 * `/* @client *\/`, the escape its diagnostic suggests. The array is empty:
 * a client-only loop renders no rows at SSR, while the CSR harness would
 * build them from the props.
 */
export const fixture = createFixture({
  id: 'loop-row-child-outer-state-key-client',
  description: 'A component loop row keyed by an expression reading outer state, deferred to the client via /* @client */',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

export function LoopRowChildOuterStateKeyClient(props: { prefix: string; names: string[] }) {
  return (
    <ul>
      {/* @client */ props.names.map(n => <Badge key={props.prefix + n} label={n} />)}
    </ul>
  )
}
`,
  props: {
    prefix: 'p-',
    names: [],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
