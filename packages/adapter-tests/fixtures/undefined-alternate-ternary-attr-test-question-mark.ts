import { createFixture } from '../src/types'

/**
 * An attribute ternary with an `undefined` alternate omits the attribute when
 * the test is falsy. The test here contains a `?` of its own: an optional
 * chain, a `?` inside a string literal, and a `??`. The Go adapter used to
 * cut the test at the first `?` of the source text, testing `.Item` for
 * `props.item?.active`, `.Mode == "x"` for `props.mode === 'x?'`, and dropping
 * `?? props.fallback` (#3511). It now lowers the parsed test.
 */
export const fixture = createFixture({
  id: 'undefined-alternate-ternary-attr-test-question-mark',
  description: 'An undefined-alternate attribute ternary lowers a test containing `?.`, `??` or a `?` in a string',
  source: `
export function QuestionMarkTest(props: { item?: { active: boolean }; mode?: string; fallback?: string }) {
  return (
    <div>
      <a aria-current={props.item?.active ? 'page' : undefined}>a</a>
      <a data-m={props.mode === 'x?' ? 'yes' : undefined}>b</a>
      <a data-f={props.mode ?? props.fallback ? 'has' : undefined}>c</a>
    </div>
  )
}
`,
  props: { item: { active: false }, mode: 'x' },
  expectedHtml: `
    <div></div>
  `,
  dataPoints: [
    { name: 'active-and-question-mark', props: { item: { active: true }, mode: 'x?' } },
    { name: 'fallback-only', props: { fallback: 'f' } },
  ],
})
