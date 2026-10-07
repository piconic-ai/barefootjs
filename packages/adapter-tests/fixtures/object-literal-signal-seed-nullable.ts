import { createFixture } from '../src/types'

/**
 * An object-literal signal seed keeps its present `''` / `0` members when
 * the signal is typed as a nullable union of an object type (a named type
 * or an inline one) or is untyped (#3353). The plainly typed signal is the
 * control.
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
  return (
    <div>
      <p data-name={a()?.name} data-age={a()?.age}>a</p>
      <p data-name={b()?.name} data-age={b()?.age}>b</p>
      <p data-name={c()?.name}>c</p>
      <p data-name={d()?.name}>d</p>
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
    </div>
  `,
})
