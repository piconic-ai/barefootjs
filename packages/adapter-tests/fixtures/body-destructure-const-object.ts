import { createFixture } from '../src/types'

/**
 * A component-body destructure of a const object (`const { tone } = conf`)
 * binds each name to what the object holds, as JS does. The template gets
 * the props, not the component's consts, so a backend that reads `tone` or
 * `conf` as a template variable renders it empty or fails the render.
 *
 * Covers a component-scope and a module-scope object, a renamed binding, a
 * nested pattern, a literal default for a key the object does not list,
 * string / number / boolean values, and the attribute, text, ternary, `&&`
 * and loop-row positions. The loop row named `tone` shadows the binding.
 */
export const fixture = createFixture({
  id: 'body-destructure-const-object',
  description: 'a body destructure of a local or module const object binds what the object holds',
  source: `
const MODULE_CONF = { accent: 'blue', inner: { mode: 'dark' } }
export function BodyDestructureConstObject({ title, items }: { title: string; items: string[] }) {
  const conf = { tone: 'info', size: 'md', count: 3, on: false }
  const { tone, size: sz, count, on, missing = 'fallback' } = conf
  const { accent, inner: { mode } } = MODULE_CONF
  return (
    <div class={tone} data-size={sz}>
      {title}-{sz}-{count}
      {on ? <b>on</b> : <i>off</i>}
      {count > 2 && <s>many</s>}
      <span data-accent={accent}>{mode}|{missing}</span>
      <ul>{items.map(tone => <li key={tone}>{tone}-{sz}</li>)}</ul>
    </div>
  )
}
`,
  props: { title: 'Hi', items: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test" bf="s3" class="info" data-size="md">
      <!--bf:s0-->Hi<!--/-->-md-3<i>off</i>
      <s>many</s>
      <span data-accent="blue">dark|fallback</span>
      <ul bf="s2">
        <li data-key="r1"><!--bf:s1-->r1<!--/-->-md</li>
        <li data-key="r2"><!--bf:s1-->r2<!--/-->-md</li>
      </ul>
    </div>
  `,
})
