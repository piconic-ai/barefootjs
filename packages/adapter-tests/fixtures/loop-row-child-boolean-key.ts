import { createFixture } from '../src/types'

/**
 * Component loop rows over a boolean array prop, keyed by the row itself
 * (`key={f}`) and by `String(f)`, with and without forwarded children. A
 * boolean key stringifies as JS does: `data-key="true"` / `"false"`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-boolean-key',
  description: 'Component loop rows keyed by a boolean row render data-key as true / false',
  source: `
'use client'

function Flag(props: { on: boolean }) {
  return <s className="flag">{props.on ? 'y' : 'n'}</s>
}

function Tag({ children }: { children?: any }) {
  return <span className="tag">{children}</span>
}

export function LoopRowChildBooleanKey(props: { bits: boolean[] }) {
  return (
    <div>
      <p className="row">
        {props.bits.map(f => <Flag key={f} on={f} />)}
      </p>
      <p className="string-call">
        {props.bits.map(f => <Flag key={String(f)} on={f} />)}
      </p>
      <p className="children">
        {props.bits.map(f => <Tag key={String(f)}><b>{f ? 'y' : 'n'}</b></Tag>)}
      </p>
    </div>
  )
}
`,
  props: {
    bits: [true, false],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1" class="row">
        <s bf-s="Flag_*" bf="s1" class="flag" data-key="true"><!--bf-cond-start:s0-->y<!--bf-cond-end:s0--></s>
        <s bf-s="Flag_*" bf="s1" class="flag" data-key="false"><!--bf-cond-start:s0-->n<!--bf-cond-end:s0--></s>
      </p>
      <p bf="s3" class="string-call">
        <s bf-s="Flag_*" bf="s1" class="flag" data-key="true"><!--bf-cond-start:s0-->y<!--bf-cond-end:s0--></s>
        <s bf-s="Flag_*" bf="s1" class="flag" data-key="false"><!--bf-cond-start:s0-->n<!--bf-cond-end:s0--></s>
      </p>
      <p bf="s6" class="children">
        <span bf-s="Tag_*" class="tag" data-key="true"><b><!--bf-cond-start:^s4-->y<!--bf-cond-end:^s4--></b></span>
        <span bf-s="Tag_*" class="tag" data-key="false"><b><!--bf-cond-start:^s4-->n<!--bf-cond-end:^s4--></b></span>
      </p>
    </div>
  `,
})
