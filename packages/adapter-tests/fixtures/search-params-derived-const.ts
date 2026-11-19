import { createFixture } from '../src/types'

/**
 * A const read from the `createSearchParams()` env signal
 * (`sp().get('sort') ?? 'none'`), in an attribute and in text (#3926). The
 * CSR template declares the getter itself, so the const can run there; it used
 * to read as `undefined`. The second const passes a prop as the parameter
 * name. The conformance harness issues no query string, so each `??` default
 * is the rendered value.
 */
export const fixture = createFixture({
  id: 'search-params-derived-const',
  description: 'A const derived from createSearchParams() renders its value on a CSR mount',
  source: `
import { createSearchParams } from '@barefootjs/client'
export function SortBadge(props: { param: string }) {
  const [sp] = createSearchParams()
  const sort = sp().get('sort') ?? 'none'
  const named = sp().get(props.param) ?? 'unset'
  return (
    <a href={sort} title={named}>
      <b>{sort}</b>
      <i>{named}</i>
    </a>
  )
}
`,
  props: { param: 'page' },
  expectedHtml: `
    <a bf-s="test" bf="s4" href="none" title="unset">
      <b bf="s1"><!--bf:s0-->none<!--/--></b>
      <i bf="s3"><!--bf:s2-->unset<!--/--></i>
    </a>
  `,
})
