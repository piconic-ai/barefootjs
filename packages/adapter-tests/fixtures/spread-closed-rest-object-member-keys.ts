import { createFixture } from '../src/types'

/**
 * Closed rest keys named like `Object.prototype` members (`toString`,
 * `constructor`, `hasOwnProperty`, `valueOf`). They are no attribute aliases:
 * each renders as a plain attribute on an element and reaches a child as a
 * plain prop.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-object-member-keys',
  description: 'Closed rest keys named like Object.prototype members render as plain attributes and props',
  source: `
import { Forward } from './forward'
type P = { toString?: string; constructor?: string; hasOwnProperty?: string; valueOf?: string }
export function SpreadClosedRestObjectMemberKeys({ ...rest }: P) {
  return (
    <div>
      <p {...rest}>a</p>
      <Forward {...rest} />
    </div>
  )
}
`,
  components: {
    './forward.tsx': `
export function Forward({ toString, valueOf }: { toString?: string; constructor?: string; hasOwnProperty?: string; valueOf?: string }) {
  return <span>{toString}-{valueOf}</span>
}
`,
  },
  props: { toString: 't', constructor: 'c', hasOwnProperty: 'h', valueOf: 'v' },
  expectedHtml: `
    <div bf-s="test">
      <p constructor="c" hasOwnProperty="h" toString="t" valueOf="v">a</p>
      <span bf-s="test_s0" bf="s2"><!--bf:s0-->t<!--/-->-<!--bf:s1-->v<!--/--></span>
    </div>
  `,
})
