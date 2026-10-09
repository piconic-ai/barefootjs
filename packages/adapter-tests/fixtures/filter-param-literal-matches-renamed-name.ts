import { createFixture } from '../src/types'

/**
 * Sibling of `filter-param-named-loop` (#3404): the predicate compares the
 * filter param `loop` with string literals spelled like its renamed forms
 * (`__bf_loop`, and `$loop_` as Blade spelled it before #3408). Renaming
 * the param to the row item must leave those literals alone.
 */
export const fixture = createFixture({
  id: 'filter-param-literal-matches-renamed-name',
  description: 'A filter param named loop compared with literals spelled like its renamed forms keeps the literals',
  source: `
export function FilterParamLiteralMatchesRenamedName(props: { items: string[] }) {
  return <ul>{props.items.filter(loop => loop === '__bf_loop' || loop === '$loop_').map(item => <li key={item}>{item}</li>)}</ul>
}
`,
  props: { items: ['__bf_loop', '$loop_', 'item'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="__bf_loop"><!--bf:s0-->__bf_loop<!--/--></li>
      <li data-key="$loop_"><!--bf:s0-->$loop_<!--/--></li>
    </ul>
  `,
})
