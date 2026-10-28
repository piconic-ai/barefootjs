import { createFixture } from '../src/types'

/**
 * A literal `@` written right before a dynamic expression, in every
 * position a static text run can sit beside one: between two text
 * expressions, at the start of an element, before a ternary branch, an
 * `&&` branch, a loop row, a child's children, and in an attribute
 * template literal. Template engines that reserve `@` (Blade reads
 * `@{{` / `@{!!` as an escaped echo and `@word` as a directive) must
 * still print the `@` and evaluate the expression after it. The last
 * paragraph spells directive-shaped static text (`@php … @endphp`,
 * `@verbatim`, `@@if`) and a static attribute value that must print as
 * written.
 */
export const fixture = createFixture({
  id: 'at-sign-before-dynamic-text',
  description: 'A literal @ directly before a dynamic text expression in text, attribute, branch and loop positions (destructured props)',
  source: `
import { Tag } from './Tag'
export function AtSignBeforeDynamicText({ a, b, show, items }: { a: string; b: string; show: boolean; items: string[] }) {
  return (
    <div title={\`@\${b}\`}>
      <p>{a}@{b}</p>
      <p>@{b}</p>
      <p>{show ? <span>@{b}</span> : <span>none</span>}</p>
      <p>{show && <em>{a}@{b}</em>}</p>
      <ul>{items.map(item => <li key={item}>{item}@{b}</li>)}</ul>
      <Tag label={\`@\${b}\`}>{a}@{b}</Tag>
      <p>{a + '@' + b}|{\`\${a}@\${b}\`}</p>
      <p data-x="@json(1)" data-y="a@b">@json(1) @if(true)T@endif @php echo 1; @endphp @@if mail@example.com @verbatim{b}@endverbatim @@{b} @</p>
    </div>
  )
}
`,
  components: {
    './Tag': `
export function Tag(props: { label: string; children?: any }) {
  return <span data-label={props.label}>{props.label}@{props.children}</span>
}
`,
  },
  props: { a: 'x', b: 'y', show: true, items: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test" bf="s27" title="@y">
      <p bf="s2"><!--bf:s0-->x<!--/-->@<!--bf:s1-->y<!--/--></p>
      <p bf="s4">@<!--bf:s3-->y<!--/--></p>
      <p bf="s8"><span bf-c="s5" bf="s7">@<!--bf:s6-->y<!--/--></span></p>
      <p bf="s13"><em bf-c="s9" bf="s12"><!--bf:s10-->x<!--/-->@<!--bf:s11-->y<!--/--></em></p>
      <ul bf="s17">
        <li bf="s16" data-key="r1"><!--bf:s14-->r1<!--/-->@<!--bf:s15-->y<!--/--></li>
        <li bf="s16" data-key="r2"><!--bf:s14-->r2<!--/-->@<!--bf:s15-->y<!--/--></li>
      </ul>
      <span bf-s="test_s20" bf="s1" data-label="@y"><!--bf:s0-->@y<!--/-->@<!--bf:^s18-->x<!--/-->@<!--bf:^s19-->y<!--/--></span>
      <p bf="s23"><!--bf:s21-->x@y<!--/-->|<!--bf:s22-->x@y<!--/--></p>
      <p bf="s26" data-x="@json(1)" data-y="a@b">@json(1) @if(true)T@endif @php echo 1; @endphp @@if mail@example.com @verbatim<!--bf:s24-->y<!--/-->@endverbatim @@<!--bf:s25-->y<!--/--> @</p>
    </div>
  `,
})
