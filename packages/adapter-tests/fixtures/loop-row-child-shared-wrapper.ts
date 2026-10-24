import { createFixture } from '../src/types'

/**
 * Two `.map()` loops in one component whose row is the SAME wrapper
 * component with forwarded children (#3599): each loop renders its own
 * rows. Covers object rows, scalar rows, and a bodyless row component
 * shared by two loops. On Go each loop site gets its own rows field.
 */
export const fixture = createFixture({
  id: 'loop-row-child-shared-wrapper',
  description:
    'Two loops whose row is the same wrapper component with forwarded children each render their own rows',
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Tag({ children }: { children?: any }) {
  return <span class="tag">{children}</span>
}

function Item(props: { label: string }) {
  return <li>{props.label}</li>
}

type Opt = { id: string; label: string }

export function LoopRowChildSharedWrapper(props: {
  a: Opt[]
  b: Opt[]
  picks: string[]
  others: string[]
}) {
  return (
    <div>
      <p class="objects">
        {props.a.map(o => <Chip key={o.id}><b>{o.label}</b></Chip>)}
        {props.b.map(o => <Chip key={o.id}><i>{o.label}</i></Chip>)}
      </p>
      <p class="scalars">
        {props.picks.map(g => <Tag key={g}><b>{g}</b></Tag>)}
        {props.others.map(g => <Tag key={g}><i>{g}</i></Tag>)}
      </p>
      <ul>{props.a.map(o => <Item key={o.id} label={o.label} />)}</ul>
      <ul>{props.b.map(o => <Item key={o.id} label={o.label} />)}</ul>
    </div>
  )
}
`,
  props: {
    a: [{ id: 'a1', label: 'A1' }, { id: 'a2', label: 'A2' }],
    b: [{ id: 'b1', label: 'B1' }],
    picks: ['p', 'q'],
    others: ['x'],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s4" class="objects">
        <span bf-s="Chip_*" class="chip" data-key="a1"><b><!--bf:^s0-->A1<!--/--></b></span>
        <span bf-s="Chip_*" class="chip" data-key="a2"><b><!--bf:^s0-->A2<!--/--></b></span>
        <span bf-s="Chip_*" class="chip" data-key="b1"><i><!--bf:^s2-->B1<!--/--></i></span>
      </p>
      <p bf="s9" class="scalars">
        <span bf-s="Tag_*" class="tag" data-key="p"><b><!--bf:^s5-->p<!--/--></b></span>
        <span bf-s="Tag_*" class="tag" data-key="q"><b><!--bf:^s5-->q<!--/--></b></span>
        <span bf-s="Tag_*" class="tag" data-key="x"><i><!--bf:^s7-->x<!--/--></i></span>
      </p>
      <ul bf="s11">
        <li bf-s="Item_*" bf="s1" data-key="a1"><!--bf:s0-->A1<!--/--></li>
        <li bf-s="Item_*" bf="s1" data-key="a2"><!--bf:s0-->A2<!--/--></li>
      </ul>
      <ul bf="s13"><li bf-s="Item_*" bf="s1" data-key="b1"><!--bf:s0-->B1<!--/--></li></ul>
    </div>
  `,
})
