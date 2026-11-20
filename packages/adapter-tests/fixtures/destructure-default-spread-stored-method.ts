import { createFixture } from '../src/types'

/**
 * A spread array const that only a stored, uncalled method of a literal const
 * captures (#3954): `const local = [...b, 'z']; const api = { label: 'ok', add:
 * () => local.length }`, read as `api.label`. The server render never runs
 * `add`, so it never reads `local`: every adapter renders `ok`, with no
 * refusal of the spread it does not evaluate.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-stored-method',
  description: 'A spread array const captured only by an uncalled method is not read on the server (#3954)',
  source: `
export function DestructureDefaultSpreadStoredMethod(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const local = [...b, 'z']
  const api = { label: 'ok', add: () => local.length }
  return <p>{api.label}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->ok<!--/--></p>
  `,
})
