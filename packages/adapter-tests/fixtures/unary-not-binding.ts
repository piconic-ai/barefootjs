import { createFixture } from '../src/types'

/**
 * Logical negation of a signal in both an attribute binding
 * (`disabled={!enabled()}`) and a conditional (`{!enabled() && ...}`).
 * Pins that `!` lowers as a real boolean negation, not string
 * truthiness, in each template language.
 */
export const fixture = createFixture({
  id: 'unary-not-binding',
  description: 'Unary ! negation in attribute and conditional positions',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function UnaryNotBinding() {
  const [enabled, setEnabled] = createSignal(false)
  return (
    <div>
      <button disabled={!enabled()}>Go</button>
      {!enabled() && <span>disabled hint</span>}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <button bf="s0" disabled>Go</button>
      <span bf-c="s1">disabled hint</span>
    </div>
  `,
})
