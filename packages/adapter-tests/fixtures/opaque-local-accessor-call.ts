import { createFixture } from '../src/types'

/**
 * A component-body `const` bound to the result of a call the compiler cannot
 * evaluate (`const label = makeLabel()` — a module helper returning a
 * function), then invoked with `()` in text position. The reference adapter
 * runs `label()` at render time and prints its result, and its CSR template
 * inlines the call (`(makeLabel())()`) because Hono's `acceptsTemplateCall`
 * accepts it. A DSL template cannot run the helper, so every DSL adapter
 * refuses the shape with BF101 (pinned in each adapter's
 * `conformancePins`) instead of lowering it to an unbound template variable.
 * Same shape as an accessor returned by an imported library
 * (`const posts = createQuery(…)`, `{posts()}`); the same-file helper is the
 * minimal reproduction. The adapter-less CSR harness does not inline the
 * call, so the fixture is in `CSR_SKIP_FIXTURES` (see the note there).
 *
 * The sibling signal read (`count()`) is here to keep the fixture an
 * ordinary hydrated island and to show the refusal is specific to the
 * opaque accessor, not to text slots in general. `expectedHtml` is generated
 * from the reference adapter, which is correct for this shape.
 */
export const fixture = createFixture({
  id: 'opaque-local-accessor-call',
  description: 'Local accessor bound to an opaque helper call, invoked in text position, renders its result on the reference and is refused (BF101) on DSL adapters',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function makeLabel() {
  return () => 'ready'
}

export function Widget() {
  const [count, setCount] = createSignal(0)
  const label = makeLabel()
  return (
    <div>
      <span>{label()}</span>
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </div>
  )
}
`,
  escapes: [{ kind: 'client-directive', fixture: 'opaque-local-accessor-call-client' }],
  expectedHtml: `
    <div bf-s="test">
      <span><!--bf:s0-->ready<!--/--></span>
      <button bf="s2"><!--bf:s1-->0<!--/--></button>
    </div>
  `,
})
