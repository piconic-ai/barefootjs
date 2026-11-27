import { createFixture } from '../src/types'

/**
 * Sibling of `spread-closed-rest-repeated-omitted` where the caller passes
 * the rest keys a larger value reads, with values a nil test must keep: an
 * empty string and `0`. `title={rest.id} {...rest}` renders the earlier
 * write when the rest omits `title`; a ternary branch renders the key's
 * value.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-present',
  description: 'A rest key read inside a larger value renders an empty string and 0',
  source: `
type P = { id?: string; title?: string; n?: number; on?: boolean }
export function SpreadClosedRestRepeatedPresent({ on, ...rest }: P) {
  return (
    <div>
      <p title={rest.id} {...rest}>b</p>
      <p title={on ? rest.id : 'x'}>c</p>
      <p data-n={on ? rest.n : 1}>d</p>
    </div>
  )
}
`,
  props: { on: true, id: '', n: 0 },
  expectedHtml: `
    <div bf-s="test">
      <p id="" n="0" title="">b</p>
      <p bf="s0" title="">c</p>
      <p bf="s1" data-n="0">d</p>
    </div>
  `,
})
