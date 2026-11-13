import { createFixture } from '../src/types'

/**
 * A (props)-arg component whose locals share names with its typed props,
 * every caller-supplied: each read resolves lexically, as in JS. A
 * zero-param arrow `value` called from a memo, an attribute, text and a loop
 * row returns its `1`; a const `label` read in an attribute, text and a row
 * is `'L'` while the renamed body binding `text` holds the `label` prop; a
 * body-destructured `count` stays the prop although a nested function
 * declares a `count` inside its own body; a module function `tag` called in
 * text returns its `'T'`. A condition testing the call and a child prop
 * forwarding it read the function too.
 */
export const fixture = createFixture({
  id: 'local-bindings-named-like-props',
  description: 'Locals and module functions named like typed props keep their lexical meaning in memos, attributes, text and loop rows',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
function tag() { return 'T' }
function Badge(props: { n?: number }) { return <b>{props.n}</b> }
export function LocalBindingsNamedLikeProps(props: { value?: number; label?: string; count?: number; tag?: string; items: string[] }) {
  const { label: text, count } = props
  const label = 'L'
  const value = () => 1
  function inner() {
    function count() { return 1 }
    return count() + 1
  }
  const n = createMemo(() => value() + 1)
  return (
    <div data-value={value()} data-label={label}>
      <p>{n()}|{value()}|{label}|{text}|{count}|{tag()}</p>
      <ul>{props.items.map(item => <li key={item}>{item}:{value()}:{label}</li>)}</ul>
      <span>{value() > 0 ? 'pos' : 'neg'}</span>
      <Badge n={value()} />
    </div>
  )
}
`,
  props: { value: 9, label: 'P', count: 5, tag: 'X', items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s15" data-label="L" data-value="1">
      <p bf="s6"><!--bf:s0-->2<!--/-->|<!--bf:s1-->1<!--/-->|<!--bf:s2-->L<!--/-->|<!--bf:s3-->P<!--/-->|<!--bf:s4-->5<!--/-->|<!--bf:s5-->T<!--/--></p>
      <ul bf="s11">
        <li bf="s10" data-key="a"><!--bf:s7-->a<!--/-->:<!--bf:s8-->1<!--/-->:<!--bf:s9-->L<!--/--></li>
        <li bf="s10" data-key="b"><!--bf:s7-->b<!--/-->:<!--bf:s8-->1<!--/-->:<!--bf:s9-->L<!--/--></li>
      </ul>
      <span bf="s13"><!--bf-cond-start:s12-->pos<!--bf-cond-end:s12--></span>
      <b bf-s="test_s14" bf="s1"><!--bf:s0-->1<!--/--></b>
    </div>
  `,
  dataPoints: [
    { name: 'props-absent', props: { items: ['a'] } },
  ],
})
