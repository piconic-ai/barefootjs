import { createFixture } from '../src/types'

/**
 * Optional chaining (`?.`) into an object-valued prop, with a `??`
 * fallback. One access hits a present object, the other a missing one,
 * so both the short-circuit and the happy path render in one fixture.
 */
export const fixture = createFixture({
  id: 'optional-chaining-prop',
  description: 'Optional chaining into an object prop with nullish fallback',
  source: `
type User = { name: string }
function OptionalChainingProp({ user, owner }: { user?: User; owner?: User }) {
  return (
    <div>
      <span>{user?.name ?? 'anonymous'}</span>
      <span>{owner?.name ?? 'nobody'}</span>
    </div>
  )
}
export { OptionalChainingProp }
`,
  props: { user: { name: 'Ada' } },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->Ada<!--/--></span>
      <span bf="s3"><!--bf:s2-->nobody<!--/--></span>
    </div>
  `,
})
