import { createFixture } from '../src/types'

/**
 * A destructured props param whose inline type is a PLAIN OBJECT (not
 * array-wrapped) carrying both a nested array-of-primitives property and a
 * nested object property (#2677).
 *
 * Before #2677, `collectMemberTypes`'s destructured-parameter gate degraded
 * ANY non-primitive member — including this shape — to `kind: 'unknown'`,
 * so a typed adapter's `bf-p` hydration payload for `user` fell back to a
 * PascalCase-keyed `map[string]interface{}` (`{"Name":..., "Tags":[...],
 * "Address":{"City":...}}`) instead of the caller-facing camelCase JSON
 * (`{"name":..., "tags":[...], "address":{"city":...}}`). SSR text output
 * was already correct either way — this fixture's `expectedHtml` alone
 * doesn't observe the divergence (see `hydration-props-inventory.ts` for
 * the bf-p-level check); it exists for the change-time coupling rule
 * (`spec/subset-conformance.md`) covering the newly-admitted shapes:
 *
 *   - a top-level destructured member that is itself `kind: 'object'`
 *     (not wrapped in an array) — none of #2676's three array-of-object
 *     fixtures (`array-map-value-field`, `array-flatmap-tuple`,
 *     `flatmap-expression-body`) exercise this.
 *   - an object member with a nested ARRAY-of-primitives property
 *     (`tags`) — "object-of-arrays".
 *   - an object member with a nested OBJECT property (`address`) —
 *     recursion into `properties`, not `elementType`.
 */
export const fixture = createFixture({
  id: 'destructured-object-prop-nested',
  description: 'Destructured plain-object prop with nested array and nested object properties renders every field',
  source: `
function ProfileCard({ user }: { user: { name: string; tags: string[]; address: { city: string } } }) {
  return <div>{user.name} ({user.tags.join(', ')}) — {user.address.city}</div>
}
export { ProfileCard }
`,
  props: { user: { name: 'Ada', tags: ['math', 'computing'], address: { city: 'London' } } },
  expectedHtml: `
    <div bf-s="test" bf="s3"><!--bf:s0-->Ada<!--/--> (<!--bf:s1-->math, computing<!--/-->) — <!--bf:s2-->London<!--/--></div>
  `,
})
