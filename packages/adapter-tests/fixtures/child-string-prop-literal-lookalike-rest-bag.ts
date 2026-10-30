import { createFixture } from '../src/types'

/**
 * Quoted literals that look like booleans or numbers, passed to a child
 * that collects undeclared props in a rest object spread onto its root:
 * each one reaches the element as the string written (`data-x="false"`),
 * beside a declared `string` prop given `"true"`.
 */
export const fixture = createFixture({
  id: 'child-string-prop-literal-lookalike-rest-bag',
  description: 'Boolean- and number-looking quoted literals routed into a child rest object',
  source: `
import { Box } from './Box'
export function ChildStringPropLiteralLookalikeRestBag() {
  return (
    <div>
      <Box label="true" data-x="false" data-n="5" title="true" />
    </div>
  )
}
`,
  components: {
    './Box': `
export function Box({ label, ...rest }: { label: string; [key: string]: any }) {
  return <b {...rest}>{label}</b>
}
`,
  },
  expectedHtml: `
    <div bf-s="test"><b bf-s="test_s0" bf="s1" data-n="5" data-x="false" title="true"><!--bf:s0-->true<!--/--></b></div>
  `,
})
