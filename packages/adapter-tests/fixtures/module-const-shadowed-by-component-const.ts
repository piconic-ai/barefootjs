import { createFixture } from '../src/types'

/**
 * A component const named like a module const (#3739). Each read resolves
 * lexically: the component const inside the component, the module const in
 * another module const's initializer.
 *
 * - `x` and `z` are string literals on both sides, read as text, as an
 *   attribute and as a condition.
 * - `n` is a module literal hidden by a computed component const
 *   (`props.n * 2`).
 * - `a = x` and `m = n + 1` are module consts that read the hidden module
 *   consts, so they keep the module values.
 */
export const fixture = createFixture({
  id: 'module-const-shadowed-by-component-const',
  description: 'A component const hides a module const of the same name inside the component only',
  source: `
'use client'
const x = 'module'
const a = x
const n = 1
const m = n + 1
const z = 'mz'

export function ModuleConstShadowedByComponentConst(props: { n: number }) {
  const x = 'local'
  const n = props.n * 2
  const z = 'lz'
  return (
    <div>
      <p className="text" title={z}>{x}/{a}/{n}/{m}/{z}</p>
      <p className="cond">{z === 'lz' ? 'component' : 'module'}</p>
    </div>
  )
}
`,
  props: { n: 10 },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2" class="text" title="lz">local/module/<!--bf:s0-->20<!--/-->/<!--bf:s1-->2<!--/-->/lz</p>
      <p class="cond">component</p>
    </div>
  `,
  dataPoints: [
    { name: 'zero', props: { n: 0 } },
    { name: 'fraction', props: { n: 0.25 } },
  ],
})
