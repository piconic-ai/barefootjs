import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `<div {...signal()} />` — JSX spread of a
 * reactive object. SSR renders the initial keys correctly. CSR
 * currently throws `ReferenceError: spreadAttrs is not defined` because
 * the emitted client JS template calls `spreadAttrs(...)` without
 * importing it — surfaced limitation, skipped in CSR conformance until
 * the import is wired in. Sub-issue of #1244.
 */
export const fixture = createFixture({
  id: 'jsx-spread-reactive',
  description: 'JSX spread of a signal-returned object renders initial keys',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function JsxSpreadReactive() {
  const [attrs, setAttrs] = createSignal<Record<string, string>>({ id: 'a', class: 'on' })
  return <div onClick={() => setAttrs({ id: 'b', class: 'off' })} {...attrs()} />
}
`,
  expectedHtml: `
    <div id="a" class="on" bf-s="test" bf="s0"></div>
  `,
})
