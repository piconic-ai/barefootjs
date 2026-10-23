import { createFixture } from '../src/types'

/**
 * A `.map()` over a scalar array prop whose row is a wrapper component
 * with forwarded children that read the row value
 * (`props.picks.map(g => <Tag key={g}><i>{g}</i></Tag>)`). Covers a string
 * row (as an element's text and as the bare children), a number row
 * (`0` and a fraction), a row reading its index, a prop of the row
 * component reading the row, and a row read from an inner loop inside the
 * forwarded children. Every row renders its own wrapper.
 */
export const fixture = createFixture({
  id: 'loop-row-child-scalar-row-wrapper',
  description:
    'A wrapper component loop row over a string or number array prop renders one wrapper per row with the row value in its children',
  source: `
'use client'
function Tag({ children }: { children?: any }) {
  return <span class="tag">{children}</span>
}

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Num({ children }: { children?: any }) {
  return <span class="num">{children}</span>
}

function Pos({ children }: { children?: any }) {
  return <span class="pos">{children}</span>
}

function Hue({ tone, children }: { tone: string; children?: any }) {
  return <span class={tone}>{children}</span>
}

function Group({ children }: { children?: any }) {
  return <span class="group">{children}</span>
}

export function LoopRowChildScalarRowWrapper(props: {
  picks: string[]
  counts: number[]
  tones: string[]
  sections: string[]
}) {
  return (
    <div>
      <p class="strings">{props.picks.map(g => <Tag key={g}><i>{g}</i></Tag>)}</p>
      <p class="bare">{props.picks.map(g => <Chip key={g}>{g}</Chip>)}</p>
      <p class="numbers">{props.counts.map(n => <Num key={n}><b>{n}</b></Num>)}</p>
      <p class="index">{props.picks.map((g, i) => <Pos key={g}><i>{g}-{i}</i></Pos>)}</p>
      <p class="prop">{props.tones.map(t => <Hue key={t} tone={t}><i>{t}</i></Hue>)}</p>
      <p class="nested">
        {props.sections.map(g => (
          <Group key={g}>
            <ul>{['x', 'y'].map(l => <li key={l}>{g}-{l}</li>)}</ul>
          </Group>
        ))}
      </p>
    </div>
  )
}
`,
  props: {
    picks: ['a', 'b'],
    counts: [0, 2.5],
    tones: ['warm', 'cool'],
    sections: ['p', 'q'],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2" class="strings">
        <span bf-s="Tag_*" class="tag" data-key="a"><i><!--bf:^s0-->a<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="b"><i><!--bf:^s0-->b<!--/--></i></span>
      </p>
      <p bf="s5" class="bare">
        <span bf-s="Chip_*" class="chip" data-key="a"><!--bf:^s3-->a<!--/--></span>
        <span bf-s="Chip_*" class="chip" data-key="b"><!--bf:^s3-->b<!--/--></span>
      </p>
      <p bf="s8" class="numbers">
        <span bf-s="Num_*" class="num" data-key="0"><b><!--bf:^s6-->0<!--/--></b></span>
        <span bf-s="Num_*" class="num" data-key="2.5"><b><!--bf:^s6-->2.5<!--/--></b></span>
      </p>
      <p bf="s12" class="index">
        <span bf-s="Pos_*" class="pos" data-key="a"><i><!--bf:^s9-->a<!--/-->-<!--bf:^s10-->0<!--/--></i></span>
        <span bf-s="Pos_*" class="pos" data-key="b"><i><!--bf:^s9-->b<!--/-->-<!--bf:^s10-->1<!--/--></i></span>
      </p>
      <p bf="s15" class="prop">
        <span bf-s="Hue_*" bf="s0" class="warm" data-key="warm"><i><!--bf:^s13-->warm<!--/--></i></span>
        <span bf-s="Hue_*" bf="s0" class="cool" data-key="cool"><i><!--bf:^s13-->cool<!--/--></i></span>
      </p>
      <p bf="s20" class="nested">
        <span bf-s="Group_*" class="group" data-key="p"><ul bf="^s18"><li data-key-1="x"><!--bf:^s16-->p<!--/-->-<!--bf:^s17-->x<!--/--></li><li data-key-1="y"><!--bf:^s16-->p<!--/-->-<!--bf:^s17-->y<!--/--></li></ul></span>
        <span bf-s="Group_*" class="group" data-key="q"><ul bf="^s18"><li data-key-1="x"><!--bf:^s16-->q<!--/-->-<!--bf:^s17-->x<!--/--></li><li data-key-1="y"><!--bf:^s16-->q<!--/-->-<!--bf:^s17-->y<!--/--></li></ul></span>
      </p>
    </div>
  `,
})
