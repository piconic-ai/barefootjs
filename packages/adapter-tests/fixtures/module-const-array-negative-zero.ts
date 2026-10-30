import { createFixture } from '../src/types'

/**
 * A module array const element written `-0` keeps its sign: `1 / NZ[0]` is
 * `-Infinity`, so `1 / NZ[0] < 0` holds, while the element printed as text
 * or an attribute is `0`, as JS stringifies it. The read sits in a ternary
 * in text and in an attribute, in direct text, and in a child prop read in
 * arithmetic, in a destructured-props parent and a `function C(props)`
 * child that also reads the module array itself.
 */
export const fixture = createFixture({
  id: 'module-const-array-negative-zero',
  description: 'a -0 element of a module array const keeps its sign in arithmetic and prints as 0',
  source: `
import { NzPropsChild } from './nz-child'
const NZ = [-0, 0]
export function ModuleConstArrayNegativeZero({ on = true }: { on?: boolean }) {
  return (
    <div data-s={1 / NZ[0] < 0 ? 'negative' : 'positive'} data-z={NZ[0]}>
      <p>{1 / NZ[0] < 0 ? 'negative' : 'positive'}</p>
      <p>{1 / NZ[1] < 0 ? 'negative' : 'positive'}</p>
      <p>{NZ[0]}</p>
      {on && <NzPropsChild z={NZ[0]} />}
    </div>
  )
}
`,
  components: {
    './nz-child.tsx': `
const CZ = [-0]
export function NzPropsChild(props: { z: number }) {
  return (
    <span data-s={1 / CZ[0] < 0 ? 'negative' : 'positive'}>
      {1 / props.z < 0 ? 'negative' : 'positive'}
    </span>
  )
}
`,
  },
  expectedHtml: `
    <div bf-s="test" bf="s2" data-s="negative" data-z="0">
      <p>negative</p>
      <p>positive</p>
      <p>0</p>
      <!--bf-cond-start:s0-->
      <span bf-s="test_s1" bf="s1" data-s="negative"><!--bf-cond-start:s0-->negative<!--bf-cond-end:s0--></span>
      <!--bf-cond-end:s0-->
    </div>
  `,
})
