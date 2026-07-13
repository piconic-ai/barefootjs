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
  // Probes `?.` short-circuit and `??` member-fallback at every presence
  // combination: both objects present, both absent, an explicit null
  // object, and a present object whose member is '' (kept by `??` —
  // not nullish).
  dataPoints: [
    { name: 'both-present', props: { user: { name: 'Ada' }, owner: { name: 'Bob' } } },
    { name: 'both-absent', props: {} },
    { name: 'null-user', props: { user: null } },
    { name: 'empty-name', props: { user: { name: '' } } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->Ada<!--/--></span>
      <span bf="s3"><!--bf:s2-->nobody<!--/--></span>
    </div>
  `,
})
