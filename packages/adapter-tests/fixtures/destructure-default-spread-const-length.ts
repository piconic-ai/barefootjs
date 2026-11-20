import { createFixture } from '../src/types'

/**
 * A const spreading a defaulted body-destructured prop into an array literal
 * (#3954): `const { b = ['y'] } = props; const local = [...b, 'z']`, read
 * through `local.length`. No template adapter lowers an array element spread,
 * so each refuses the read (BF101) instead of reading an unbound name;
 * `/* @client *\/` defers it (`destructure-default-spread-const-length-client`).
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-const-length',
  description: 'A const spreading a defaulted destructured array prop renders its length (#3954)',
  escapes: [{ kind: 'client-directive', fixture: 'destructure-default-spread-const-length-client' }],
  source: `
export function DestructureDefaultSpreadConstLength(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const local = [...b, 'z']
  return <p>{local.length}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
