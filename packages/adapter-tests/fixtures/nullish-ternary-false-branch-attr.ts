import { createFixture } from '../src/types'

/**
 * Sibling of `nullish-ternary-attr` (#3322): a ternary attribute whose
 * other branch can be nullish still renders a taken `false` branch as
 * `"false"`.
 */
export const fixture = createFixture({
  id: 'nullish-ternary-false-branch-attr',
  description: 'A ternary attribute with a nullable branch renders a taken false branch as "false"',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function NullishTernaryFalseBranchAttr() {
  const [s] = createSignal<string | undefined>(undefined)
  const [yes] = createSignal(true)
  return (
    <div>
      <p className="false" data-choice={yes() ? false : s()}>a</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" class="false" data-choice="false">a</p>
    </div>
  `,
})
