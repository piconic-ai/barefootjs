import { createFixture } from '../src/types'

/**
 * `/* @client *\/` escape twin of `static-literal-loop-component-in-row`:
 * the same loop, deferred to the browser, so SSR renders the `<ul>` empty
 * on every adapter and no BF101 fires.
 *
 * `items` is an EMPTY literal array (unlike the base's populated one), the
 * `static-loop-item-boolean-attr-client` precedent: CSR conformance compares
 * `expectedHtml` against the client-rendered DOM, and an empty array keeps
 * that identical to the empty SSR output.
 */
export const fixture = createFixture({
  id: 'static-literal-loop-component-in-row-client',
  description: '/* @client */ twin of static-literal-loop-component-in-row — the loop renders in the browser',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

const items: string[] = []

export function StaticLiteralLoopComponentInRowClient() {
  return (
    <ul>
      {/* @client */ items.map(i => (
        <li key={i}>
          <Badge label={i} />
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
