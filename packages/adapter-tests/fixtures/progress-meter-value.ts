import { createFixture } from '../src/types'

/**
 * `<progress value>` / `<meter value>` — the two elements where
 * `value` IS the legitimate state attribute. This is the armor twin
 * of `select-value-ssr` / `textarea-value-ssr` (#2464/#2465): the fix
 * for those must lower `value` per element, not strip it globally —
 * this fixture fails if a fix overcorrects and drops `value` here.
 */
export const fixture = createFixture({
  id: 'progress-meter-value',
  description: 'progress/meter keep their value attribute (armor for the #2464/#2465 fix)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function Usage() {
  const [used, setUsed] = createSignal(30)
  return (
    <div>
      <progress value={used()} max="100" />
      <meter value={used()} min="0" max="100" />
      <button onClick={() => setUsed(used() + 10)}>Add</button>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test"><progress value="30" max="100" bf="s0"></progress><meter value="30" min="0" max="100" bf="s1"></meter><button bf="s2">Add</button></div>
  `,
})
