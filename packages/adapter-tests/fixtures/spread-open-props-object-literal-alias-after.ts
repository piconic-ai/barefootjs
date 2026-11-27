import { createFixture } from '../src/types'

/**
 * An attribute written after a spread of the whole props object, whose type
 * admits undeclared keys (`Record<string, unknown>`), when the caller passes
 * the attribute under its React-style spread key (`htmlFor`). JSX keeps the
 * last write, so the element renders one `for`, the literal's; the caller's
 * other keys (`id`) still render.
 */
export const fixture = createFixture({
  id: 'spread-open-props-object-literal-alias-after',
  description: 'An attribute after a spread of an open props object carrying its htmlFor spread key renders once, with the later write',
  source: `
export function SpreadOpenPropsObjectLiteralAliasAfter(props: Record<string, unknown>) {
  return <label {...props} htmlFor="explicit">x</label>
}
`,
  props: { htmlFor: 'bag', id: 'i' },
  expectedHtml: `
    <label bf-s="test" bf="s0" for="explicit" id="i">x</label>
  `,
})
