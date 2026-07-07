import { createFixture } from '../src/types'

/**
 * JSX comment children (`{/* ... *&#8205;/}`) must render nothing — no
 * empty text node, no comment marker, no whitespace artifact — and
 * must not disturb the slot numbering of surrounding dynamic children.
 */
export const fixture = createFixture({
  id: 'jsx-comment-child',
  description: 'JSX expression-container comments render nothing',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function JsxCommentChild() {
  const [count, setCount] = createSignal(3)
  return (
    <div>
      {/* leading comment */}
      <span>before</span>
      {/* middle comment */}
      <span>{count()}</span>
      {/* trailing comment */}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span>before</span>
      <span bf="s1"><!--bf:s0-->3<!--/--></span>
    </div>
  `,
})
