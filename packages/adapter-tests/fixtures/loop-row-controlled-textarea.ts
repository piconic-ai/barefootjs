import { createFixture } from '../src/types'

/**
 * The keyed-loop-row form of `textarea-value-ssr`: a controlled
 * `<textarea value={signal()}>` rendered once per row.
 *
 * `lowerFormControlValueSsr` marks `value` `clientOnly` and re-expresses
 * it as element content in the SHARED IR, so every adapter's SSR omits
 * the attribute here exactly as it does outside a loop. #2756 was the
 * client half of the same contract: `irToHtmlTemplate` — the builder for
 * rows the reconciler rebuilds and for conditional branches — ignored
 * `clientOnly` and baked `value="…"` back in, so a rebuilt row and a
 * hydration-reused row disagreed the moment a row-count change made both
 * coexist in one list. The builder-side pin is
 * `packages/jsx/src/__tests__/issue-2756-loop-row-honors-client-only.test.ts`
 * (no fixture layer evaluates the row builder); this fixture pins the
 * shape's SSR + CSR-template output the builder has to agree with.
 */
export const fixture = createFixture({
  id: 'loop-row-controlled-textarea',
  description: 'Controlled textarea inside a keyed loop row SSRs its value as element content (#2756)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function DraftRows() {
  const [draft, setDraft] = createSignal('hello')
  const [rows] = createSignal([1, 2])
  return (
    <ul>
      {rows().map(r => (
        <li key={r}>
          <textarea value={draft()} onInput={(e) => setDraft(e.target.value)} />
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><textarea bf="s0">hello</textarea></li>
      <li data-key="2"><textarea bf="s0">hello</textarea></li>
    </ul>
  `,
})
