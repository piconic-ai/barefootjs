import { createFixture } from '../src/types'

/**
 * Tests fragment conditional (multiple sibling elements in each branch).
 * Must use comment markers, not bf-c on the first element only.
 */
export const fixture = createFixture({
  id: 'fragment-conditional',
  description: 'Conditional with fragment branches (multiple sibling elements)',
  source: `
'use client'
import { createSignal } from '@barefootjs/dom'
export function FragmentConditional() {
  const [editing, setEditing] = createSignal(false)
  return (
    <div>
      {editing() ? (
        <>
          <input type="text" />
          <button>Save</button>
        </>
      ) : (
        <>
          <span>View</span>
          <button>Edit</button>
        </>
      )}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0--><span>View</span><button>Edit</button><!--bf-cond-end:s0--></div>
  `,
})
