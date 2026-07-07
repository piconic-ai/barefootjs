import { createFixture } from '../../src/types'

/**
 * `String.prototype.replaceAll(search, replacement)` — the all-
 * occurrences sibling of the #1448 `string-replace` fixture (which
 * pins first-occurrence-only semantics). Backends whose native
 * replace is global by default (Go strings.ReplaceAll, PHP
 * str_replace, Ruby gsub) trivially pass; the risk is an adapter
 * reusing its first-only `replace` lowering.
 */
export const fixture = createFixture({
  id: 'string-replaceall',
  description: '.replaceAll replaces every occurrence, not just the first',
  source: `
function StringReplaceAll({ path }: { path: string }) {
  return <div>{path.replaceAll('/', ' > ')}</div>
}
export { StringReplaceAll }
`,
  props: { path: 'a/b/c' },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->a &gt; b &gt; c<!--/--></div>
  `,
})
