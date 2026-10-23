import { createFixture } from '../src/types'

/**
 * Rows of an untyped object-literal signal (`createSignal([{ id: … }])`),
 * whose row type an engine synthesizes from the literals, read in text, in
 * an attribute and as the loop key. The ids are a million and a
 * millisecond timestamp: JS prints `1500000` / `1700000000000`; an engine
 * that holds the field as a double and prints it with its default float
 * format writes `1.5e+06`, and its `data-key` no longer matches the key the
 * client computes.
 */
export const fixture = createFixture({
  id: 'number-synth-row-key',
  description: 'Number fields of synthesized signal rows print in decimal in text, attribute and key (1500000)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NumberSynthRowKey() {
  const [rows] = createSignal([{ id: 1500000, label: 'a' }, { id: 1700000000000, label: 'b' }])
  return (
    <ul>
      {rows().map(row => <li key={row.id} data-id={row.id}>{row.label} {row.id}</li>)}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-id="1500000" data-key="1500000"><!--bf:s0-->a<!--/--><!--bf:s1-->1500000<!--/--></li>
      <li bf="s2" data-id="1700000000000" data-key="1700000000000"><!--bf:s0-->b<!--/--><!--bf:s1-->1700000000000<!--/--></li>
    </ul>
  `,
})
