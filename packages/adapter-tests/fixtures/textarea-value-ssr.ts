import { createFixture } from '../src/types'

/**
 * Controlled `<textarea value={signal()}>` — SSR lowers `value` to
 * element content (React semantics): `value` is not an attribute on
 * `<textarea>`, so emitting one left the control empty for no-JS /
 * pre-hydration users.
 *
 * FIXED (#2465): the shared-IR lowering marks the `value` attr
 * `clientOnly` and injects the expression as a NON-reactive child
 * (initial content only — updates keep flowing through the `.value`
 * property binding, deliberately not a live text slot). A textarea with
 * authored children is left untouched. This fixture is the regression
 * armor for the lowering.
 */
export const fixture = createFixture({
  id: 'textarea-value-ssr',
  description: 'Controlled textarea SSRs its value as element content (#2465)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function NoteBox() {
  const [note, setNote] = createSignal('initial note')
  return <textarea value={note()} onInput={(e) => setNote(e.target.value)} />
}
`,
  expectedHtml: `
    <textarea bf-s="test" bf="s0">initial note</textarea>
  `,
})
