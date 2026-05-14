import { createFixture } from '../src/types'

/**
 * If-statement (conditional return) rendering.
 *
 * Tests the IRIfStatement node type where component-level if/else
 * branches return different JSX. The default branch (no variant prop)
 * renders a <button>; the "alt" branch renders a <span>.
 */
export const fixture = createFixture({
  id: 'if-statement',
  description: 'If-statement conditional return renders correct branch',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

interface Props { variant?: string }
export function IfDemo(props: Props) {
  const [count, setCount] = createSignal(0)
  if (props.variant === 'alt') {
    return <span className="alt">{count()}</span>
  }
  return <button className="default">{count()}</button>
}
`,
  props: { variant: '' },
  expectedHtml: `
    <button class="default" bf-s="test" bf="s1"><!--bf:s0-->0<!--/--></button>
  `,
})
