import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Query action accessor read in a template position',
  given: "a `createQuery` action's accessor read in a template position, e.g. `aria-busy={fetchPosts.isPending()}` or `{fetchPosts.error() ? <p>…</p> : null}`",
  expected: 'the accessors render their pre-request values (`isPending()` false, `error()` undefined), like any seeded reactive value',
  diagnostic: 'BF117',
  fixtures: ['create-query-action-read'],
})
