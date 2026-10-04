import { createFixture } from '../src/types'

/**
 * Sibling of `loop-param-prop-member-collision`: a prop spelled like the
 * generated root alias (`__bf_root_value`) keeps its own value. The alias a
 * loop row needs for `props.value` must not overwrite that prop, inside the
 * loop or after it.
 */
export const fixture = createFixture({
  id: 'loop-param-prop-alias-name-collision',
  description: 'A prop named like the generated root-prop alias keeps its own value next to a shadowing loop',
  source: `
export function PropAliasCollision(props: { values: string[]; value: string; __bf_root_value: string }) {
  return (
    <div>
      <ul>{props.values.map(value => <li key={value} data-row={value} data-root={props.value} data-other={props.__bf_root_value} />)}</ul>
      <p data-root={props.value} data-other={props.__bf_root_value} />
    </div>
  )
}
`,
  props: { values: ['a', 'b'], value: 'root', __bf_root_value: 'other' },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li bf="s0" data-key="a" data-other="other" data-root="root" data-row="a"></li>
        <li bf="s0" data-key="b" data-other="other" data-root="root" data-row="b"></li>
      </ul>
      <p bf="s2" data-other="other" data-root="root"></p>
    </div>
  `,
})
