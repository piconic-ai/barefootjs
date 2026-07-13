import { createFixture } from '../src/types'

/**
 * String concatenation with the `+` operator (not a template literal).
 * Backends whose `+` is numeric-only (Perl, PHP) must lower this to
 * their string-concat operator (`.`), so the shape can't share the
 * arithmetic `+` lowering.
 */
export const fixture = createFixture({
  id: 'string-concat-plus',
  description: 'String concatenation via the + operator',
  source: `
function StringConcatPlus({ name }: { name: string }) {
  return <div>{'Hello, ' + name + '!'}</div>
}
export { StringConcatPlus }
`,
  props: { name: 'Ada' },
  // Concat parity with empty and markup-bearing operands — a backend
  // whose `.`/`+` coerces or escapes differently shows up here.
  dataPoints: [
    { name: 'empty', props: { name: '' } },
    { name: 'markup', props: { name: '<i>&' } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->Hello, Ada!<!--/--></div>
  `,
})
