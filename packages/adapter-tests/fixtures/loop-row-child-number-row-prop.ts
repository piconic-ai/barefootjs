import { createFixture } from '../src/types'

/**
 * Component loop rows over a number array prop that pass the row itself
 * as the child's number prop (`values.map(n => <Num key={n} value={n} />)`),
 * keyed by the row (`key={n}`) and by the index (`key={i}`) (#3625). Every
 * row renders its own number, also beside a row that forwards children
 * pass it on (`<Tag key={n}><i>{n}</i></Tag>`). (An unkeyed `.map()` of components is a
 * compile error on every adapter, so there is no unkeyed case.)
 */
export const fixture = createFixture({
  id: 'loop-row-child-number-row-prop',
  description: 'Component loop rows over a number array prop pass the row as a number prop, keyed by the row or the index',
  source: `
'use client'

function Num(props: { value: number }) {
  return <b className="num">{props.value}</b>
}

function Tag({ children }: { children?: any }) {
  return <span className="tag">{children}</span>
}

export function LoopRowChildNumberRowProp(props: { values: number[] }) {
  return (
    <div>
      <p className="row-key">
        {props.values.map(n => <Num key={n} value={n} />)}
      </p>
      <p className="index-key">
        {props.values.map((n, i) => <Num key={i} value={n} />)}
      </p>
      <p className="children">
        {props.values.map(n => <Tag key={n}><i>{n}</i></Tag>)}
      </p>
    </div>
  )
}
`,
  props: {
    values: [1, 2.5, 30],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1" class="row-key">
        <b bf-s="Num_*" bf="s1" class="num" data-key="1"><!--bf:s0-->1<!--/--></b>
        <b bf-s="Num_*" bf="s1" class="num" data-key="2.5"><!--bf:s0-->2.5<!--/--></b>
        <b bf-s="Num_*" bf="s1" class="num" data-key="30"><!--bf:s0-->30<!--/--></b>
      </p>
      <p bf="s3" class="index-key">
        <b bf-s="Num_*" bf="s1" class="num" data-key="0"><!--bf:s0-->1<!--/--></b>
        <b bf-s="Num_*" bf="s1" class="num" data-key="1"><!--bf:s0-->2.5<!--/--></b>
        <b bf-s="Num_*" bf="s1" class="num" data-key="2"><!--bf:s0-->30<!--/--></b>
      </p>
      <p bf="s6" class="children">
        <span bf-s="Tag_*" class="tag" data-key="1"><i><!--bf:^s4-->1<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="2.5"><i><!--bf:^s4-->2.5<!--/--></i></span>
        <span bf-s="Tag_*" class="tag" data-key="30"><i><!--bf:^s4-->30<!--/--></i></span>
      </p>
    </div>
  `,
})
