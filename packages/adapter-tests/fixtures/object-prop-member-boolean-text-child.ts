import { createFixture } from '../src/types'

/**
 * A boolean member of an object-typed prop as a text child renders nothing,
 * read directly, behind `??`, and through a memo over the `??`. The operand
 * typing proves nothing about a member of an object-typed prop, so the
 * template adapters do not route the child through the display helper.
 */
export const fixture = createFixture({
  id: 'object-prop-member-boolean-text-child',
  description: 'A boolean member of an object-typed prop renders nothing as a text child',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ObjectPropMemberBooleanTextChild(props: { cfg: { on?: boolean; off?: boolean; missing?: boolean } }) {
  const shown = createMemo(() => props.cfg.off ?? 'none')
  return <p>[{props.cfg.on}][{props.cfg.off ?? 'none'}][{props.cfg.missing ?? 'none'}][{shown()}]</p>
}
`,
  props: { cfg: { on: true, off: false } },
  expectedHtml: `
    <p bf-s="test" bf="s4">[<!--bf:s0--><!--/-->][<!--bf:s1--><!--/-->][<!--bf:s2-->none<!--/-->][<!--bf:s3--><!--/-->]</p>
  `,
})
