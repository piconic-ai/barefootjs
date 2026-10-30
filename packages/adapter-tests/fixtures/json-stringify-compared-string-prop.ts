import { createFixture } from '../src/types'

/**
 * A string prop that looks like a number (`'1e5'`) is first compared with
 * a number (`s < 0`) and then passed to `JSON.stringify`. JS keeps it a
 * string, so it is written quoted (`"1e5"`), in an attribute, in text and
 * inside an array, in the parent and in a `function C(props)` child, and in
 * a loop row. A runtime whose relational operator caches a number on the
 * string must still classify it as a string when writing JSON.
 */
export const fixture = createFixture({
  id: 'json-stringify-compared-string-prop',
  description: 'JSON.stringify of a numeric-looking string prop stays quoted after a numeric comparison',
  source: `
function ShowJson(props: { v: string }) {
  return <i data-neg={props.v < 0 ? 'neg' : 'pos'} data-j={JSON.stringify(props.v)}>{JSON.stringify([props.v])}</i>
}
export function JsonStringifyComparedStringProp({ s, items }: { s: string; items: string[] }) {
  return (
    <div data-neg={s < 0 ? 'neg' : 'pos'} data-j={JSON.stringify(s)}>
      <span>{s < 0 ? 'neg' : JSON.stringify(s)}</span>
      <span>{JSON.stringify([s, '007'])}</span>
      <span>{'j=' + JSON.stringify(s)}</span>
      <ShowJson v={s} />
      <ul>{items.map(item => <li key={item} data-neg={item < 0 ? 'neg' : 'pos'}>{JSON.stringify(item)}</li>)}</ul>
    </div>
  )
}
`,
  props: { s: '1e5', items: ['-2.0', '1e5'] },
  expectedHtml: `
    <div bf-s="test" bf="s11" data-j="&quot;1e5&quot;" data-neg="pos">
      <span bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->&quot;1e5&quot;<!--/--><!--bf-cond-end:s0--></span>
      <span bf="s4"><!--bf:s3-->[&quot;1e5&quot;,&quot;007&quot;]<!--/--></span>
      <span bf="s6"><!--bf:s5-->j=&quot;1e5&quot;<!--/--></span>
      <i bf-s="test_s7" bf="s1" data-j="&quot;1e5&quot;" data-neg="pos"><!--bf:s0-->[&quot;1e5&quot;]<!--/--></i>
      <ul bf="s10">
        <li bf="s9" data-key="-2.0" data-neg="neg"><!--bf:s8-->&quot;-2.0&quot;<!--/--></li>
        <li bf="s9" data-key="1e5" data-neg="pos"><!--bf:s8-->&quot;1e5&quot;<!--/--></li>
      </ul>
    </div>
  `,
})
