import { createFixture } from '../src/types'

/**
 * A prop named like the row component's plural (#3603): `props.groups`
 * looped into `<Group>` wrapper rows, and `props.teams` (object rows) into
 * `<Team>` wrapper rows. On Go the prop field and the rows field would
 * both be `Groups` / `Teams`; the rows field is renamed so the two don't
 * collide.
 */
export const fixture = createFixture({
  id: 'loop-row-child-prop-named-row-plural',
  description:
    "A loop whose wrapper row component's plural names the array prop it ranges over renders every row",
  source: `
'use client'
function Group({ children }: { children?: any }) {
  return <span class="group">{children}</span>
}

function Team({ children }: { children?: any }) {
  return <span class="team">{children}</span>
}

type T = { id: string; name: string }

export function LoopRowChildPropNamedRowPlural(props: { groups: string[]; teams: T[] }) {
  return (
    <div>
      <p>{props.groups.map(g => <Group key={g}><i>{g}</i></Group>)}</p>
      <p>{props.teams.map(t => <Team key={t.id}><b>{t.name}</b></Team>)}</p>
    </div>
  )
}
`,
  props: {
    groups: ['g1', 'g2'],
    teams: [{ id: 't1', name: 'T1' }],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2">
        <span bf-s="Group_*" class="group" data-key="g1"><i><!--bf:^s0-->g1<!--/--></i></span>
        <span bf-s="Group_*" class="group" data-key="g2"><i><!--bf:^s0-->g2<!--/--></i></span>
      </p>
      <p bf="s5"><span bf-s="Team_*" class="team" data-key="t1"><b><!--bf:^s3-->T1<!--/--></b></span></p>
    </div>
  `,
})
