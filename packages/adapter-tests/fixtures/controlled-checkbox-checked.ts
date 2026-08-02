import { createFixture } from '../src/types'

/**
 * Controlled checkbox: `checked={sig()}` on `<input type="checkbox">`.
 * `checked` is an HTML boolean attribute — the true control must carry
 * bare `checked`, the false control must OMIT it entirely (an emitted
 * `checked="false"` string would still check the box). Part of the
 * HTML element/attribute semantics checklist (state-carrying
 * attributes; sibling of `select-value-ssr` / `textarea-value-ssr`,
 * which pin the two members of this family that are broken today).
 */
export const fixture = createFixture({
  id: 'controlled-checkbox-checked',
  description: 'Controlled checkbox SSRs boolean checked (true bare, false omitted)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function Prefs() {
  const [news, setNews] = createSignal(true)
  const [spam, setSpam] = createSignal(false)
  return (
    <fieldset>
      <input type="checkbox" checked={news()} onChange={(e) => setNews(e.target.checked)} />
      <input type="checkbox" checked={spam()} onChange={(e) => setSpam(e.target.checked)} />
    </fieldset>
  )
}
`,
  expectedHtml: `
    <fieldset bf-s="test">
      <input bf="s0" checked type="checkbox">
      <input bf="s1" type="checkbox">
    </fieldset>
  `,
})
