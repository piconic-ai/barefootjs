import { createFixture } from '../src/types'

/**
 * A module const initialized by an immediately invoked function whose body
 * is a block (`(() => { return … })()`, `(function () { return … })()`).
 * No template evaluates the call, so the template adapters refuse the read
 * (BF101, `const-iife-unlowered`) where they used to render it empty.
 */
export const fixture = createFixture({
  id: 'module-const-iife-block-body',
  description: 'a module const initialized by an immediately invoked function with a block body renders client-side',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-iife-block-body-client' }],
  source: `
'use client'
const A = (() => { return { k: 'a' } })()
const F = (function () { return { k: 'f' } })()
const N = (() => { return { k: 'n' } })()!
export function ModuleConstIifeBlockBody() {
  return <p>{A.k}|{F.k}|{N.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">a|f|n</p>
  `,
})
