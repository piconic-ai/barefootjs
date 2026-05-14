import { createFixture } from '../src/types'

/**
 * Self-closing elements in both branches of a conditional.
 *
 * Exercises `transformConditionalBranch` for `JsxSelfClosingElement` on
 * both sides (`ternary.ts` covers `JsxElement`; `fragment-conditional.ts`
 * covers `JsxFragment`). Matrix cell: JsxSelfClosingElement × conditional
 * branch. Void-element normalization (`<br/>` → `<br>`) is applied by
 * `normalizeHTML` — both branches use void tags so adapter self-closing
 * differences are covered.
 */
export const fixture = createFixture({
  id: 'branch-self-closing',
  description: 'Conditional with self-closing void-element branches',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function BranchSelfClosing() {
  const [show, setShow] = createSignal(false)
  return <div>{show() ? <hr/> : <br/>}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><br bf-c="s0"></div>
  `,
})
