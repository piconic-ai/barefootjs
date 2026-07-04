import { createFixture } from '../../src/types'

/**
 * `Array.prototype.flatMap(fn, thisArg)` — the 2-arg form (#2094 part 3).
 *
 * The parser has always kept the extra `thisArg` argument (rather than
 * refusing the call), and every adapter has always ignored it — which is
 * semantically CORRECT: only arrow callbacks are accepted through this
 * path, and an arrow ignores `this`/`thisArg` entirely, same as native JS.
 * This fixture pins that the 2-arg form renders BYTE-IDENTICAL output to
 * the 1-arg form (`array-flatmap-field`), proving the extra argument is a
 * true no-op rather than accidentally influencing the projection.
 *
 * `thisArg` is a plain identifier (a destructured prop) rather than an
 * inline object literal: the rest-arg is still passed through
 * `isSupported`'s generic recursion (meaningful for `.reduce`'s `init`,
 * which — unlike `thisArg` — really is rendered), and an object literal
 * isn't supported as a standalone expression. Widening that gate to skip
 * validating an ignored `thisArg` is a follow-up, not part of this fixture.
 */
export const fixture = createFixture({
  id: 'array-flatmap-thisarg',
  description: '.flatMap(i => i.tags, thisArg) renders identically to the 1-arg form',
  source: `
function ArrayFlatMapThisArg({ items, ctx }: { items: { tags: string[] }[]; ctx: unknown }) {
  return <div>{items.flatMap(i => i.tags, ctx).join(' ')}</div>
}
export { ArrayFlatMapThisArg }
`,
  props: { items: [{ tags: ['a', 'b'] }, { tags: ['c'] }, { tags: ['d', 'e'] }], ctx: null },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a b c d e<!--/--></div>
  `,
})
