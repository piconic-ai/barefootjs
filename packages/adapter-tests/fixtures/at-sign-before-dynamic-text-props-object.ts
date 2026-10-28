import { createFixture } from '../src/types'

/**
 * `at-sign-before-dynamic-text` with the props read through a props
 * object (`function C(props)`) instead of destructuring.
 */
export const fixture = createFixture({
  id: 'at-sign-before-dynamic-text-props-object',
  description: 'A literal @ directly before a dynamic text expression in text, attribute, branch and loop positions (props object)',
  source: `
export function AtSignBeforeDynamicTextPropsObject(props: { a: string; b: string; show: boolean; items: string[] }) {
  return (
    <div title={\`@\${props.b}\`}>
      <p>{props.a}@{props.b}</p>
      <p>@{props.b}</p>
      <p>{props.show ? <span>@{props.b}</span> : <span>none</span>}</p>
      <p>{props.show && <em>{props.a}@{props.b}</em>}</p>
      <ul>{props.items.map(item => <li key={item}>{item}@{props.b}</li>)}</ul>
    </div>
  )
}
`,
  props: { a: 'x', b: 'y', show: true, items: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test" bf="s18" title="@y">
      <p bf="s2"><!--bf:s0-->x<!--/-->@<!--bf:s1-->y<!--/--></p>
      <p bf="s4">@<!--bf:s3-->y<!--/--></p>
      <p bf="s8"><span bf-c="s5" bf="s7">@<!--bf:s6-->y<!--/--></span></p>
      <p bf="s13"><em bf-c="s9" bf="s12"><!--bf:s10-->x<!--/-->@<!--bf:s11-->y<!--/--></em></p>
      <ul bf="s17">
        <li bf="s16" data-key="r1"><!--bf:s14-->r1<!--/-->@<!--bf:s15-->y<!--/--></li>
        <li bf="s16" data-key="r2"><!--bf:s14-->r2<!--/-->@<!--bf:s15-->y<!--/--></li>
      </ul>
    </div>
  `,
})
