import { createFixture } from '../src/types'

/**
 * The `undefined` identifier is nullish under `??`, in text and in an
 * attribute (#3860), the same as `null`. A ternary whose taken branch is
 * `undefined` still omits its attribute.
 */
export const fixture = createFixture({
  id: 'undefined-identifier-nullish',
  description: 'undefined ?? x renders x in text and attribute position (#3860)',
  source: `
export function UndefinedIdentifierNullish(props: { on: boolean }) {
  return (
    <div>
      <p title={undefined ?? 'x'}>{undefined ?? 'x'}</p>
      <p>{null ?? 'y'}</p>
      <a aria-current={props.on ? 'page' : undefined}>a</a>
      <b data-v={props.on ? undefined : 'off'}>b</b>
    </div>
  )
}
`,
  props: { on: false },
  expectedHtml: `
    <div bf-s="test">
      <p title="x">x</p>
      <p>y</p>
      <a bf="s0">a</a>
      <b bf="s1" data-v="off">b</b>
    </div>
  `,
  dataPoints: [
    { name: 'on', props: { on: true } },
  ],
})
