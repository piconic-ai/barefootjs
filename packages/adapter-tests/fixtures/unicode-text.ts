import { createFixture } from '../src/types'

/**
 * Non-ASCII output: multi-byte text (Japanese), emoji (astral-plane
 * code points), and a non-ASCII attribute value must survive each
 * adapter's template encoding and its backend's string handling
 * (Go/Ruby/Perl/PHP/Python source-file escaping) byte-identically.
 */
export const fixture = createFixture({
  id: 'unicode-text',
  description: 'Multi-byte text, emoji, and non-ASCII attribute values',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function UnicodeText() {
  const [label, setLabel] = createSignal('こんにちは')
  return (
    <div title="日本語タイトル">
      <span>{label()}</span>
      <span>🎉 émojis &amp; accents: café</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" title="日本語タイトル">
      <span bf="s1"><!--bf:s0-->こんにちは<!--/--></span>
      <span>🎉 émojis &amp; accents: café</span>
    </div>
  `,
})
