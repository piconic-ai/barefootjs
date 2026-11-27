import { createFixture } from '../src/types'

/**
 * A destructured prop spread onto an element, typed as an open record
 * (`Record<string, string>`, an optional `Record<string, unknown>` whose
 * values are a number, a boolean and a `null`, and an omitted optional
 * record after a literal) or as a closed object type (an inline object type
 * whose optional member the caller omits, a named type, and an inline
 * intersection of a named type and an object type, an interface extending
 * a named type). Each element renders
 * the bag's entries. Sibling: `spread-optional-bag-literal-before` (an
 * omitted optional record), `spread-open-object-prop-bag` (an object type
 * with an index signature).
 */
export const fixture = createFixture({
  id: 'spread-record-prop-bag',
  description: 'A destructured record or closed object prop spread onto an element renders its entries',
  source: `
type Attrs = { title?: string; lang?: string }
type Base = { title: string }
interface Ext extends Base { lang?: string }
type P = {
  rec: Record<string, string>
  un?: Record<string, unknown>
  none?: Record<string, string>
  obj: { title: string; lang?: string }
  named: Attrs
  both: Base & { lang?: string }
  ext: Ext
}
export function SpreadRecordPropBag({ rec, un, none, obj, named, both, ext }: P) {
  return (
    <div>
      <p {...rec}>a</p>
      <p {...un}>b</p>
      <p title="kept" {...none}>c</p>
      <p {...obj}>d</p>
      <p {...named}>e</p>
      <p {...both}>f</p>
      <p {...ext}>g</p>
    </div>
  )
}
`,
  props: {
    rec: { title: 'r', 'data-k': 'v' },
    un: { title: 'u', 'data-n': 1, hidden: true, lang: null },
    obj: { title: 'o' },
    named: { title: 'n', lang: 'en' },
    both: { title: 'b', lang: 'fr' },
    ext: { title: 'x', lang: 'de' },
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" data-k="v" title="r">a</p>
      <p bf="s1" data-n="1" hidden title="u">b</p>
      <p bf="s2" title="kept">c</p>
      <p bf="s3" title="o">d</p>
      <p bf="s4" lang="en" title="n">e</p>
      <p bf="s5" lang="fr" title="b">f</p>
      <p bf="s6" lang="de" title="x">g</p>
    </div>
  `,
})
