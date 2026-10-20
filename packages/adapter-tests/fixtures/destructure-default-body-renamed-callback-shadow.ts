import { createFixture } from '../src/types'

/**
 * A renamed body destructure whose default filters an earlier binding with a
 * callback (`destructure-default-body-renamed-callback-earlier`), where the
 * callback parameter has the same name as a signal getter of the component:
 * inside the callback, `x` is the array element, not the signal.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-callback-shadow',
  description: 'A callback parameter in a renamed body destructure default shadows a signal getter of the same name',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DestructureDefaultBodyRenamedCallbackShadow(props: { a: string[]; b?: string[] }) {
  const [x, setX] = createSignal('q')
  const { a, b: local = a.filter((x) => x !== '') } = props
  return <p onClick={() => setX('z')}>{local.length}:{x()}</p>
}
`,
  props: { a: ['y', ''] },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->1<!--/-->:<!--bf:s1-->q<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { a: ['y', ''], b: ['p', 'q', 'r'] } },
    { name: 'b-empty', props: { a: ['y', ''], b: [] } },
  ],
})
