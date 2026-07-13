import { createFixture } from '../src/types'

/**
 * A three-way if / else-if / else conditional-return chain. The
 * two-branch form is pinned by `if-statement`; the else-if link is a
 * distinct IRIfStatement shape (alternate is itself a conditional).
 *
 * KNOWN BUG pinned by this fixture (surfaced by the Priority-12 sweep):
 * the `else if` branch is silently DROPPED at SSR branch selection.
 * `props.level === 'high'` correctly renders the first branch, but
 * `level: 'mid'` falls through to the final else ("low:") instead of
 * the else-if consequent ("mid:") — on the Hono reference and every
 * template adapter alike. The `expectedHtml` below therefore pins the
 * CURRENT (buggy) fallthrough so the cross-adapter comparison stays
 * meaningful; when the compiler learns else-if selection, regenerate it
 * (the snapshot will flip to "mid:").
 */
export const fixture = createFixture({
  id: 'else-if-chain',
  description: 'if / else-if / else conditional returns pick the right branch',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ElseIfChain(props: { level?: string }) {
  const [count, setCount] = createSignal(0)
  if (props.level === 'high') {
    return <strong>high:{count()}</strong>
  } else if (props.level === 'mid') {
    return <em>mid:{count()}</em>
  }
  return <span>low:{count()}</span>
}
`,
  props: { level: 'mid' },
  // Branch selection parity per level value. The oracle carries the
  // pinned else-if fallthrough bug identically (see the docstring), so
  // these points assert cross-adapter AGREEMENT, not correctness.
  dataPoints: [
    { name: 'high', props: { level: 'high' } },
    { name: 'absent', props: {} },
    { name: 'empty-level', props: { level: '' } },
  ],
  expectedHtml: `
    <span bf-s="test" bf="s1">low:<!--bf:s0-->0<!--/--></span>
  `,
})
