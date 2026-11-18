import { createFixture } from '../src/types'

/**
 * `/* @client *\/` escape twin of
 * `nested-loop-child-component-rest-own-child`: the inner loop is deferred
 * to the browser, so SSR renders every outer row empty on every adapter.
 *
 * The inner arrays are empty (the `static-loop-item-boolean-attr-client`
 * precedent): CSR conformance compares `expectedHtml` against the
 * client-rendered DOM, and empty arrays keep that identical to the empty SSR
 * output.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-rest-own-child-client',
  description: "/* @client */ twin of nested-loop-child-component-rest-own-child — the inner loop renders in the browser",
  source: `
'use client'

function Dot(props: { tone: string }) {
  return <i data-tone={props.tone} />
}

function Badge({ label, ...rest }: { label: string; title?: string }) {
  return <em {...rest}><Dot tone={label} />{label}</em>
}

export function NestedLoopChildComponentRestOwnChildClient({ groups }: { groups: { name: string; tags: string[] }[] }) {
  return (
    <div>
      {groups.map(g => (
        <section key={g.name}>
          {/* @client */ g.tags.map(t => <Badge key={t} label={t} />)}
        </section>
      ))}
    </div>
  )
}
`,
  props: { groups: [{ name: 'x', tags: [] }, { name: 'y', tags: [] }] },
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section bf="s1" data-key="x"></section>
      <section bf="s1" data-key="y"></section>
    </div>
  `,
})
