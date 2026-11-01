import { createFixture } from '../src/types'

/**
 * A condition on a destructure-rest member (`rest.tone`) reads the
 * prop's value, the same as a plain `{rest.tone}` read: a comparison
 * and a truthiness ternary, both outside and inside a loop row.
 */
export const fixture = createFixture({
  id: 'rest-member-ternary',
  description: 'A ternary on a destructure-rest member reads the prop value, outside and inside a loop row',
  source: `
export function RestMemberTernary({ items, ...rest }: { items: string[]; tone?: string }) {
  return (
    <div className={rest.tone === 'warn' ? 'w' : 'n'}>
      <p>{rest.tone ? rest.tone : 'none'}</p>
      <ul>{items.map(it => <li key={it} className={rest.tone === 'warn' ? 'w' : 'n'}>{it}:{rest.tone ? rest.tone : 'none'}</li>)}</ul>
    </div>
  )
}
`,
  props: { items: ['a', 'b'], tone: 'warn' },
  expectedHtml: `
    <div bf-s="test" class="w">
      <p bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->warn<!--/--><!--bf-cond-end:s0--></p>
      <ul bf="s7">
        <li bf="s6" class="w" data-key="a"><!--bf:s3-->a<!--/-->:<!--bf-cond-start:s4--><!--bf:s5-->warn<!--/--><!--bf-cond-end:s4--></li>
        <li bf="s6" class="w" data-key="b"><!--bf:s3-->b<!--/-->:<!--bf-cond-start:s4--><!--bf:s5-->warn<!--/--><!--bf-cond-end:s4--></li>
      </ul>
    </div>
  `,
})
