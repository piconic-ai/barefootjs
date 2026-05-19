import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `<div {...signal()} />` — JSX spread of a
 * reactive object. SSR renders the initial keys correctly, and the CSR
 * client JS imports `spreadAttrs` from `@barefootjs/client/runtime`
 * so the template lambda resolves it at hydration time (#1317).
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
    <div bf-s="test" bf="s0" class="on" id="a"></div>
  `,
})
