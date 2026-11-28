import { createFixture } from '../src/types'

/**
 * A block-bodied memo with more than one statement computing `typeof` of a prop
 * (#3981): `const t = typeof props.x; return t`. The block parse leaves the
 * statement out and no single expression stands for the block, so it renders
 * empty where Hono renders `string`, with no diagnostic.
 */
export const fixture = createFixture({
  id: 'memo-typeof-block-statements',
  description: 'A block memo computing typeof of a prop in a local renders the type name',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoTypeofBlockStatements(props: { x: string }) {
  const kind = createMemo(() => {
    const t = typeof props.x
    return t
  })
  return <p>{kind()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})
