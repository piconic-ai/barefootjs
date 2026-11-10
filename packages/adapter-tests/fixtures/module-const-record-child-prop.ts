import { createFixture } from '../src/types'

/**
 * Sibling of `module-const-array-child-prop`: a module object const
 * (`REC`) passed whole as a child prop is the object. The child reads its
 * members, through a destructured child and a `function C(props)` child.
 * A component-local object const passed the same way is the control.
 */
export const fixture = createFixture({
  id: 'module-const-record-child-prop',
  description: 'a module object const passed whole as a child prop reaches the child as the object',
  source: `
import { RecKid, PropsRecKid } from './rec-kids'
const REC = { lf: 'r"1', n: 3 }
export function ModuleConstRecordChildProp() {
  const local = { lf: 'loc', n: 7 }
  return (
    <div>
      <RecKid rec={REC} />
      <PropsRecKid rec={REC} />
      <RecKid rec={local} />
    </div>
  )
}
`,
  components: {
    './rec-kids.tsx': `
export function RecKid({ rec }: { rec: { lf: string; n: number } }) {
  return <i data-lf={rec.lf}>{rec.n + 1}</i>
}
export function PropsRecKid(props: { rec: { lf: string; n: number } }) {
  return <b data-lf={props.rec.lf}>{props.rec.n > 2 ? 'big' : 'small'}</b>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s1" data-lf="r&quot;1"><!--bf:s0-->4<!--/--></i>
      <b bf-s="test_s1" bf="s1" data-lf="r&quot;1"><!--bf-cond-start:s0-->big<!--bf-cond-end:s0--></b>
      <i bf-s="test_s2" bf="s1" data-lf="loc"><!--bf:s0-->8<!--/--></i>
    </div>
  `,
})
