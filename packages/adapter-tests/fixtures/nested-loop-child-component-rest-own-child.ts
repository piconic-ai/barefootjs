import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-child-component-own-child`: the inner row
 * component also collects a rest object it spreads onto its root.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-rest-own-child',
  description: "A child-component loop inside another loop's row renders a row component that spreads a rest object and renders a child of its own",
  escapes: [{ kind: 'client-directive', fixture: 'nested-loop-child-component-rest-own-child-client' }],
  source: `
'use client'

function Dot(props: { tone: string }) {
  return <i data-tone={props.tone} />
}

function Badge({ label, ...rest }: { label: string; title?: string }) {
  return <em {...rest}><Dot tone={label} />{label}</em>
}

export function NestedLoopChildComponentRestOwnChild({ groups }: { groups: { name: string; tags: string[] }[] }) {
  return (
    <div>
      {groups.map(g => (
        <section key={g.name}>
          {g.tags.map(t => <Badge key={t} label={t} />)}
        </section>
      ))}
    </div>
  )
}
`,
  props: { groups: [{ name: 'x', tags: ['a', 'b'] }, { name: 'y', tags: ['c'] }] },
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section bf="s1" data-key="x">
        <em bf-s="Badge_*" bf="s2" data-key="a"><i bf-s="Badge_*_s0" bf="s0" data-tone="a"></i><!--bf:s1-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s2" data-key="b"><i bf-s="Badge_*_s0" bf="s0" data-tone="b"></i><!--bf:s1-->b<!--/--></em>
      </section>
      <section bf="s1" data-key="y"><em bf-s="Badge_*" bf="s2" data-key="c"><i bf-s="Badge_*_s0" bf="s0" data-tone="c"></i><!--bf:s1-->c<!--/--></em></section>
    </div>
  `,
})
