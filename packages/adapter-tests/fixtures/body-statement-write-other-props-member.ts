import { createFixture } from '../src/types'

/**
 * A body statement that writes one member of the props object
 * (`props.items.push('z')`) beside a markup read of another
 * (`props.title`). The write does not reach `title`, so the server render,
 * which runs no body statement, and JS agree. `checkStatementWrites` refuses
 * a read of the written member only (or of any member, after a write to the
 * props object as a whole).
 */
export const fixture = createFixture({
  id: 'body-statement-write-other-props-member',
  description: 'A read of a props member other than the one a body statement writes renders as passed',
  source: `
'use client'
export function BodyStatementWriteOtherPropsMember(props: { items: string[]; title: string }) {
  props.items.push('z')
  return <p title={props.title}>{props.title}</p>
}
`,
  props: { items: ['y'], title: 'T' },
  expectedHtml: `
    <p bf-s="test" bf="s1" title="T"><!--bf:s0-->T<!--/--></p>
  `,
})
