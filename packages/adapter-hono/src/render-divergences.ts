/**
 * Fixtures whose Hono server render diverges from the fixture's contract
 * (`expectedHtml`). Hono is the reference, so an entry here means the
 * contract was authored by hand (see `SKIP_AUTO_UPDATE` in
 * `packages/adapter-tests/scripts/generate-expected-html.ts`) because the
 * reference render itself is the broken side. Each entry cites a limitation.
 */
import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // A binding a body statement mutates (`items.push('z')`) handed to a
  // child as a prop: the server render runs no body statement, so the child
  // renders the value before the push.
  'body-statement-write-child-prop': { limitation: 'init-statement-mutation-unrun-on-server' },
  // A literal `htmlFor` before an open bag that carries `htmlFor`: the JSX
  // this adapter emits writes the literal as `for`, so the bag's `htmlFor`
  // does not replace it and Hono renders `for` twice.
  'spread-open-bag-literal-alias-before': { limitation: 'spread-key-alias-literal-duplicate' },
  'spread-open-bag-literal-renamed-elsewhere': { limitation: 'spread-key-alias-literal-duplicate' },
  // The same closed rest spread before and after an open bag: the later
  // expansion writes the omitted key as an explicit `undefined`, which
  // replaces the earlier write, so Hono renders no `title`.
  'spread-closed-rest-repeated-around-bag': { limitation: 'closed-rest-repeated-around-open-bag' },
}
