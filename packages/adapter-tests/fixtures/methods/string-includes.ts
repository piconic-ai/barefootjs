import { createFixture } from '../../src/types'

/**
 * `String.prototype.includes(sub)` lowering (#1448 Tier A).
 *
 * Distinct from `array-includes` — the receiver and lowering target
 * are different (Go's `bf_contains` vs `bf_includes`, Mojo's
 * `index $s $sub != -1` vs `grep { $_ eq $x } @{$arr}`). Pinning
 * both keeps adapters from accidentally routing one through the
 * other's helper.
 */
export const fixture = createFixture({
  id: 'string-includes',
  description: '.includes(sub) on a string renders the matching branch',
  source: `
function StringIncludes({ value, needle }: { value: string; needle: string }) {
  return <div>{value.includes(needle) ? 'yes' : 'no'}</div>
}
export { StringIncludes }
`,
  props: { value: 'hello world', needle: 'world' },
  expectedHtml: `
    <div bf-s="test" bf="s1">yes</div>
  `,
})
