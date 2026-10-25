import { createFixture } from '../src/types'

/**
 * Bodyless sibling of `loop-row-child-prop-named-row-plural` (#3616): a
 * prop named like a bodyless row component's plural. `props.labels` (scalar
 * rows) loops into `<Label>`, `props.teams` (object rows) into `<Team>`, and
 * `props.nums` (number rows) into `<Num>`. On Go the prop field and the
 * rows field would both be `Labels` / `Teams` / `Nums`; the prop keeps its
 * own type and the rows field is renamed (`LabelRows` …).
 */
export const fixture = createFixture({
  id: 'loop-row-child-bodyless-prop-named-row-plural',
  description:
    "A bodyless loop whose row component's plural names the array prop it ranges over renders every row",
  source: `
'use client'
function Label(props: { text: string }) {
  return <span class="label">{props.text}</span>
}

function Team(props: { name: string }) {
  return <b class="team">{props.name}</b>
}

function Num(props: { value: number }) {
  return <i class="num">{props.value}</i>
}

type T = { id: string; name: string }

export function LoopRowChildBodylessPropNamedRowPlural(props: { labels: string[]; teams: T[]; nums: number[] }) {
  return (
    <div>
      <p>{props.labels.map(l => <Label key={l} text={l} />)}</p>
      <p>{props.teams.map(t => <Team key={t.id} name={t.name} />)}</p>
      <p>{props.nums.map(n => <Num key={n} value={n} />)}</p>
    </div>
  )
}
`,
  props: {
    labels: ['a', 'b'],
    teams: [{ id: 't1', name: 'T1' }, { id: 't2', name: 'T2' }],
    nums: [1, 2, 3],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1">
        <span bf-s="Label_*" bf="s1" class="label" data-key="a"><!--bf:s0-->a<!--/--></span>
        <span bf-s="Label_*" bf="s1" class="label" data-key="b"><!--bf:s0-->b<!--/--></span>
      </p>
      <p bf="s3">
        <b bf-s="Team_*" bf="s1" class="team" data-key="t1"><!--bf:s0-->T1<!--/--></b>
        <b bf-s="Team_*" bf="s1" class="team" data-key="t2"><!--bf:s0-->T2<!--/--></b>
      </p>
      <p bf="s5">
        <i bf-s="Num_*" bf="s1" class="num" data-key="1"><!--bf:s0-->1<!--/--></i>
        <i bf-s="Num_*" bf="s1" class="num" data-key="2"><!--bf:s0-->2<!--/--></i>
        <i bf-s="Num_*" bf="s1" class="num" data-key="3"><!--bf:s0-->3<!--/--></i>
      </p>
    </div>
  `,
})
