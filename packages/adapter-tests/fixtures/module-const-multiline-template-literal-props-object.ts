import { createFixture } from '../src/types'

/**
 * `function C(props)` twin of `module-const-multiline-template-literal`, as
 * a client component: module consts holding a newline, a tab and
 * backslash/quote characters, read in text, an attribute, a ternary, `&&`,
 * a child prop, a loop row and a template literal.
 */
export const fixture = createFixture({
  id: 'module-const-multiline-template-literal-props-object',
  description: 'module consts holding control characters render through props-object reads in a client component',
  source: `
'use client'
const text = \`before
after\`
const tabbed = 'a\\tb\\nc'
const quoted = 'say "hi" \\\\ bye'
function Label(props: { value: string }) {
  return <i title={props.value}>{props.value}</i>
}
export function ModuleConstMultilineTemplateLiteralPropsObject(props: { on: boolean; items: string[] }) {
  return (
    <div title={text} data-t={\`\${text}|\${tabbed}\`}>
      <b>{text}</b>
      <s>{tabbed}</s>
      <p>{props.on ? text : 'none'}</p>
      <p>{props.on && tabbed}</p>
      <Label value={text} />
      <Label value={quoted} />
      <ul>{props.items.map(item => <li key={item} title={text}>{item}:{text}</li>)}</ul>
      <em>{\`\${text}-\${quoted}\`}</em>
    </div>
  )
}
`,
  props: { on: true, items: ['x', 'y'] },
  expectedHtml: `
    <div bf-s="test" data-t="before after|a b c" title="before after">
      <b>before after</b>
      <s>a b c</s>
      <p bf="s1"><!--bf-cond-start:s0-->before after<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->a b c<!--bf-cond-end:s2--></p>
      <i bf-s="test_s4" bf="s1" title="before after"><!--bf:s0-->before after<!--/--></i>
      <i bf-s="test_s5" bf="s1" title="say &quot;hi&quot; \\ bye"><!--bf:s0-->say &quot;hi&quot; \\ bye<!--/--></i>
      <ul bf="s7">
        <li data-key="x" title="before after"><!--bf:s6-->x<!--/-->:before after</li>
        <li data-key="y" title="before after"><!--bf:s6-->y<!--/-->:before after</li>
      </ul>
      <em>before after-say &quot;hi&quot; \\ bye</em>
    </div>
  `,
})
