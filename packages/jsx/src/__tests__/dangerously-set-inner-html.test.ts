/**
 * Client-side `dangerouslySetInnerHTML` (the raw-HTML escape hatch).
 *
 * The SSR adapters render `dangerouslySetInnerHTML={{ __html: E }}`
 * natively, but the client codegen used to treat it as a generic reactive
 * attribute — emitting a bogus `dangerouslySetInnerHTML="[object Object]"`
 * and never setting `innerHTML`, so a `"use client"` component silently
 * lost the content on the client. These tests pin the corrected emit:
 *   - the `{ __html }` object is NEVER serialised as an attribute;
 *   - the element's raw HTML is emitted as its content (UNescaped — this
 *     is the intentional escape hatch);
 *   - a reactive value also drives an `innerHTML` assignment in init.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('dangerouslySetInnerHTML (client)', () => {
  test('reactive value: raw content + innerHTML init, no bogus attribute', () => {
    const clientJs = getClientJs(
      `'use client'
       export function Raw({ html }: { html: string }) {
         return <div class="x" dangerouslySetInnerHTML={{ __html: html }} />
       }`,
      'Raw.tsx',
    )
    // Never emitted as an attribute.
    expect(clientJs).not.toMatch(/dangerouslySetInnerHTML="/)
    // Raw `.__html` emitted as element content — not via escapeText.
    expect(clientJs).toMatch(/<div class="x"[^>]*>\$\{.*\.__html.*\}<\/div>/)
    expect(clientJs).not.toMatch(/escapeText\([^)]*__html/)
    // Reactive update assigns innerHTML (not setAttribute).
    expect(clientJs).toMatch(/\.innerHTML = /)
    expect(clientJs).not.toMatch(/setAttribute\('dangerouslySetInnerHTML'/)
  })

  test('static value: raw content emitted in the template (no init needed)', () => {
    const clientJs = getClientJs(
      `'use client'
       export function S() {
         return <div dangerouslySetInnerHTML={{ __html: '<b>hi</b>' }} />
       }`,
      'S.tsx',
    )
    expect(clientJs).not.toMatch(/dangerouslySetInnerHTML="/)
    // The literal HTML survives raw in the template content.
    expect(clientJs).toMatch(/<div[^>]*>\$\{.*__html.*\}<\/div>/)
    expect(clientJs).not.toMatch(/escapeText\([^)]*__html/)
  })
})
