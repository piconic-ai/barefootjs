import { createFixture } from '../src/types'

/**
 * An open rest bag (`[key: string]: unknown`, so no key is known at compile
 * time) carrying the React-style names `className` and `htmlFor`, spread on
 * the root and on a static loop row's element. The reference renders a
 * spread bag key through Hono's JSX key normalization, so they render as
 * `class` and `for`; `httpEquiv` is renamed to `http-equiv` the same way,
 * and a plain or already-hyphenated key renders as it is. Each adapter's
 * native spread helper renders the bag, so this pins their key renaming to
 * the reference.
 */
export const fixture = createFixture({
  id: 'spread-open-bag-attr-names',
  description: 'Open rest bag keys className / htmlFor / httpEquiv render as class / for / http-equiv',
  source: `
type P = { [key: string]: unknown }
export function SpreadOpenBagAttrNames({ ...rest }: P) {
  return (
    <p {...rest}>
      {['x', 'y'].map(t => <label key={t} {...rest}>{t}</label>)}
    </p>
  )
}
`,
  props: {
    className: 'a b',
    htmlFor: 'f',
    httpEquiv: 'refresh',
    id: 'i',
    'data-x': 'y',
  },
  expectedHtml: `
    <p bf-s="test" bf="s2" class="a b" data-x="y" for="f" http-equiv="refresh" id="i">
      <label bf="s1" class="a b" data-key="x" data-x="y" for="f" http-equiv="refresh" id="i"><!--bf:s0-->x<!--/--></label>
      <label bf="s1" class="a b" data-key="y" data-x="y" for="f" http-equiv="refresh" id="i"><!--bf:s0-->y<!--/--></label>
    </p>
  `,
})
