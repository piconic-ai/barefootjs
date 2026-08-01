import { createFixture } from '../src/types'

/**
 * Controlled `<textarea value={signal()}>` — SSR must lower `value` to
 * element content (React semantics): `value` is not an attribute on
 * `<textarea>`, so emitting one leaves the control empty for no-JS /
 * pre-hydration users.
 *
 * Pins #2465 (sibling of the `<select value>` bug, #2464).
 * `expectedHtml` is hand-authored to the correct output because the
 * emission bug lives in the shared compiler layer, so the Hono
 * reference that normally generates `expectedHtml` produces the wrong
 * form (`<textarea value="initial note"></textarea>`). Adapters still
 * emitting the attribute skip this fixture with a pointer to
 * https://github.com/piconic-ai/barefootjs/issues/2465; graduating
 * means fixing the emission, regenerating `expectedHtml` from the
 * fixed reference, and deleting the skip entries.
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
