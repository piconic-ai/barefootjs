import { createFixture } from '../src/types'

/**
 * Module-level string consts whose value holds control characters: a
 * template literal with a real newline, a string literal with `\t` / `\n`
 * escapes, and a backslash-and-quote literal. Each is read in text, an
 * attribute, a ternary, `&&`, a child prop, a loop row and a template
 * literal, with destructured props. A backend whose string-literal spelling
 * keeps the raw newline cannot parse its own template.
 */
export const fixture = createFixture({
  id: 'module-const-multiline-template-literal',
  description: 'module consts holding a newline, a tab and backslash/quote characters render in text, attribute, ternary, &&, child prop, loop row and template-literal positions',
  source: `
const text = \`before
after\`
const tabbed = 'a\\tb\\nc'
const quoted = 'say "hi" \\\\ bye'
function Label({ value }: { value: string }) {
  return <i title={value}>{value}</i>
}
export function ModuleConstMultilineTemplateLiteral({ on, items }: { on: boolean; items: string[] }) {
  return (
    <div title={text} data-t={\`\${text}|\${tabbed}\`}>
      <b>{text}</b>
      <s>{tabbed}</s>
      <u>{quoted}</u>
      <p>{on ? text : 'none'}</p>
      <p>{on && tabbed}</p>
      <Label value={text} />
      <Label value={quoted} />
      <ul>{items.map(item => <li key={item} title={text}>{item}:{text}</li>)}</ul>
      <em>{text + '|' + quoted}</em>
    </div>
  )
}
`,
  props: { on: true, items: ['x', 'y'] },
  expectedHtml: `
    <div bf-s="test" data-t="before after|a b c" title="before after">
      <b>before after</b>
      <s>a b c</s>
      <u>say &quot;hi&quot; \\ bye</u>
      <p bf="s1"><!--bf-cond-start:s0-->before after<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->a b c<!--bf-cond-end:s2--></p>
      <i bf-s="test_s4" bf="s1" title="before after"><!--bf:s0-->before after<!--/--></i>
      <i bf-s="test_s5" bf="s1" title="say &quot;hi&quot; \\ bye"><!--bf:s0-->say &quot;hi&quot; \\ bye<!--/--></i>
      <ul bf="s7">
        <li data-key="x" title="before after"><!--bf:s6-->x<!--/-->:before after</li>
        <li data-key="y" title="before after"><!--bf:s6-->y<!--/-->:before after</li>
      </ul>
      <em>before after|say &quot;hi&quot; \\ bye</em>
    </div>
  `,
})
