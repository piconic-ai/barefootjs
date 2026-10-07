import { createFixture } from '../src/types'

/**
 * An object-literal signal seed keeps its present `''` / `0` members when
 * the signal is typed as a nullable union of an object type (a named type
 * or an inline one) or is untyped (#3353), while an omitted optional member
 * stays absent and `JSON.stringify` keeps the source keys, nested ones
 * included. The plainly typed signal is the control. The serialized objects'
 * keys are already sorted, since object key order is not part of the
 * cross-adapter contract (#1187).
 */
export const fixture = createFixture({
  id: 'object-literal-signal-seed-nullable',
  description: 'An object-literal signal seed renders its present members for a nullable-union-typed or untyped signal',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type User = { name?: string; age?: number }
export function ObjectSeed() {
  const [a] = createSignal<User | undefined>({ name: '', age: 0 })
  const [b] = createSignal({ name: '', age: 0 })
  const [c] = createSignal<User>({ name: '', age: 0 })
  const [d] = createSignal<{ name?: string } | undefined>({ name: 'x' })
  const [e] = createSignal<User | undefined>({ name: 'x' })
  const [f] = createSignal({ id: 1, meta: { 'data-x': 'y' } })
  const [g] = createSignal<{ id?: number } | undefined>({ id: 2 })
  return (
    <div>
      <p data-name={a()?.name} data-age={a()?.age}>a</p>
      <p data-name={b()?.name} data-age={b()?.age}>b</p>
      <p data-name={c()?.name}>c</p>
      <p data-name={d()?.name}>d</p>
      <p data-name={e()?.name} data-age={e()?.age}>e</p>
      <p data-x={f()?.meta?.['data-x']}>{JSON.stringify(f())}</p>
      <p>{JSON.stringify(g())}</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" data-age="0" data-name="">a</p>
      <p bf="s1" data-age="0" data-name="">b</p>
      <p bf="s2" data-name="">c</p>
      <p bf="s3" data-name="x">d</p>
      <p bf="s4" data-name="x">e</p>
      <p bf="s6" data-x="y"><!--bf:s5-->{&quot;id&quot;:1,&quot;meta&quot;:{&quot;data-x&quot;:&quot;y&quot;}}<!--/--></p>
      <p bf="s8"><!--bf:s7-->{&quot;id&quot;:2}<!--/--></p>
    </div>
  `,
})
