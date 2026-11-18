import { createFixture } from '../src/types'

/**
 * A destructured prop named like a module const (#3739). A read in the
 * component is the prop; a module const whose initializer reads the name
 * (`const tag = z + '!'`, `const wide = on ? 'wide' : 'narrow'`) keeps the
 * module value, whatever the caller passes.
 */
export const fixture = createFixture({
  id: 'module-const-shadowed-by-prop',
  description: 'A prop hides a module const of the same name inside the component only',
  source: `
'use client'
const z = 'mz'
const tag = z + '!'
const on = true
const wide = on ? 'wide' : 'narrow'

export function ModuleConstShadowedByProp({ z, on }: { z: string; on: boolean }) {
  return <p title={z} className={wide}>{z}/{tag}/{on ? 'on' : 'off'}</p>
}
`,
  props: { z: 'pz', on: false },
  expectedHtml: `
    <p bf-s="test" bf="s4" class="wide" title="pz"><!--bf:s0-->pz<!--/-->/<!--bf:s1-->mz!<!--/-->/<!--bf-cond-start:s2-->off<!--bf-cond-end:s2--></p>
  `,
  dataPoints: [
    { name: 'empty-on', props: { z: '', on: true } },
    { name: 'markup', props: { z: '<b>&"', on: false } },
  ],
})
