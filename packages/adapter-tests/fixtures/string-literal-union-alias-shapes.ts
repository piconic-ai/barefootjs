import { createFixture } from '../src/types'

/**
 * String-literal union aliases in the layouts the Go adapter used to miss:
 * an exported alias, a multi-line union with a leading `|`, double quotes,
 * and a union that mixes in `number`. Go read the union from the definition
 * text with a regex that saw only the single-line, single-quoted,
 * unexported form, and took any alias opening with a string literal as
 * `string`, so `'auto' | number` could not hold a number; Phase 1 now
 * records the members (#3542).
 */
export const fixture = createFixture({
  id: 'string-literal-union-alias-shapes',
  description: 'String-literal union aliases in every quoting and layout type their props on every adapter (#3542)',
  source: `
export type Mode =
  | 'light'
  | 'dark'
type Tone = "warm" | "cool"
type Size = 'auto' | number

export function StringLiteralUnionShapes(props: { mode: Mode; tone: Tone; size: Size }) {
  return <p data-mode={props.mode} data-tone={props.tone}>{props.size}</p>
}
`,
  props: { mode: 'dark', tone: 'cool', size: 3 },
})
