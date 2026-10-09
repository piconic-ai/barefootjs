import { createFixture } from '../src/types'

/**
 * Sibling of `reserved-name-and-internal-twin` (#3404): `loop` and
 * `__bf_loop` bind items of two sibling loops. They become the same template
 * variable on Jinja, MiniJinja, Twig and Pebble, but never in the same row,
 * so each list renders its own values and BF105 does not fire.
 */
export const fixture = createFixture({
  id: 'reserved-name-in-sibling-loops',
  description: 'Sibling loops binding loop and __bf_loop render their own items',
  source: `
export function ReservedNameInSiblingLoops(props: { a: string[]; b: string[] }) {
  return (
    <div>
      <ul>{props.a.map(loop => <li key={loop}>{loop}</li>)}</ul>
      <ul>{props.b.map(__bf_loop => <li key={__bf_loop}>{__bf_loop}</li>)}</ul>
    </div>
  )
}
`,
  props: { a: ['first'], b: ['second'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1"><li data-key="first"><!--bf:s0-->first<!--/--></li></ul>
      <ul bf="s3"><li data-key="second"><!--bf:s2-->second<!--/--></li></ul>
    </div>
  `,
})
