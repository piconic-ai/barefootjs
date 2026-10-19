import { createFixture } from '../src/types'

/**
 * A loop filter whose predicate compares against a string literal that
 * spells the param with a Perl sigil (`'$t'`). The Perl adapters mapped the
 * filter param onto the loop variable with a regex over the rendered
 * predicate, which also rewrote the literal to `'$todo'` and filtered out
 * the wrong row; the binding now decides the spelling (#3542).
 */
export const fixture = createFixture({
  id: 'filter-param-sigil-in-string',
  description: 'A loop filter predicate comparing against a string that spells the param with a sigil keeps the string (#3542)',
  source: `
export function FilterParamSigilInString(props: { items: { name: string }[] }) {
  return <ul>{props.items.filter(t => t.name !== '$t').map(todo => <li key={todo.name}>{todo.name}</li>)}</ul>
}
`,
  props: { items: [{ name: '$t' }, { name: '$todo' }, { name: 'x' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="$todo"><!--bf:s0-->$todo<!--/--></li>
      <li data-key="x"><!--bf:s0-->x<!--/--></li>
    </ul>
  `,
})
