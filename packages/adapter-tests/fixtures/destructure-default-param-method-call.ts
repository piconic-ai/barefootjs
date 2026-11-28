import { createFixture } from '../src/types'

/**
 * A parameter prop whose default is a method call on a literal receiver
 * (`{ parts = 'a-b'.split('-') }`), read directly: an omitted prop reads the
 * call's result, two entries (limitation `destructure-default-literal-method-call`).
 */
export const fixture = createFixture({
  id: 'destructure-default-param-method-call',
  description: 'A parameter default calling a method on a literal applies the call result when the prop is omitted',
  source: `
export function DestructureDefaultParamMethodCall({ parts = 'a-b'.split('-') }: { parts?: string[] }) {
  return <p>{parts.length}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
  dataPoints: [
    { name: 'parts-present', props: { parts: ['x'] } },
  ],
})
