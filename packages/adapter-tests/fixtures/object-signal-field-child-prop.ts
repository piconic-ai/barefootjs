import { createFixture } from '../src/types'

/**
 * A field of an object signal typed by a named type forwarded into a child
 * component's prop (#3437): string and number fields into concrete child
 * props, and a field whose struct type is `interface{}` on go-template
 * because a missing value is observable through an attribute (#3421).
 */
export const fixture = createFixture({
  id: 'object-signal-field-child-prop',
  description: 'an object signal\'s fields forwarded into a child\'s string and number props',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type User = { name?: string; age?: number }
function Child({ name, age }: { name: string; age: number }) {
  return <span>{name}:{age}</span>
}
export function ObjectSignalFieldChildProp() {
  const [u] = createSignal<User>({ name: 'pat', age: 3 })
  const [v] = createSignal<User>({ age: 4 })
  return (
    <div>
      <Child name={u().name!} age={u().age!} />
      <p data-name={v()?.name}>{v().age}</p>
      <Child name={v().name ?? 'anon'} age={(v().age ?? 0) + 1} />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s2"><!--bf:s0-->pat<!--/-->:<!--bf:s1-->3<!--/--></span>
      <p bf="s2"><!--bf:s1-->4<!--/--></p>
      <span bf-s="test_s3" bf="s2"><!--bf:s0-->anon<!--/-->:<!--bf:s1-->5<!--/--></span>
    </div>
  `,
})
