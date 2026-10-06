import { createFixture } from '../src/types'

/**
 * An absent optional nested object loosely equals `null`
 * and guards a member read. On go-template the absent object is a nil
 * struct pointer, which `bf_eq` / `bf_ne` must still treat as nil (#3330).
 */
export const fixture = createFixture({
  id: 'optional-object-nullish-compare',
  description: 'An absent optional nested object loosely equals null and guards a member read',
  source: `
export function OptionalUserGuard(props: { user?: { name: string } }) {
  return (
    <div>
      <p>{props.user != null ? props.user.name : 'anon'}</p>
      <span data-absent={props.user == null ? 'y' : 'n'} data-present={props.user != null ? 'y' : 'n'}>x</span>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2"><!--bf-cond-start:s0-->anon<!--bf-cond-end:s0--></p>
      <span bf="s3" data-absent="y" data-present="n">x</span>
    </div>
  `,
})
