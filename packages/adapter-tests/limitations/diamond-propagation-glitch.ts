import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An effect behind a diamond dependency observes a half-updated memo pair and runs once per edge',
  given:
    'one signal read through two `createMemo`s by a single `createEffect` (a diamond: `a` → `b`, `a` → `c`, effect reads `a`, `b`, `c`), then written once — with or without `batch`',
  expected:
    'the effect runs once per write and every run reads both memos already recomputed from the new signal value, so a side effect keyed on them (a counter, a fetch, a request descriptor) fires once with a consistent snapshot',
  actual:
    'leaves the second memo at its previous value during the effect\'s first re-run and runs the effect three times per write (once per memo recompute plus once for its own subscription), because the runtime dispatches subscribers synchronously in subscription order with no topological stage — the DOM is never painted mid-handler, so only side-effecting effects observe it',
  fixtures: ['diamond-propagation'],
})
