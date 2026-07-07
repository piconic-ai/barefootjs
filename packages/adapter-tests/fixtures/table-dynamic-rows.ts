import { createFixture } from '../src/types'

/**
 * A full `<table>` structure (caption/thead/tbody/th/td) with a keyed
 * row loop and a dynamic cell. Table elements have strict content
 * models — a stray wrapper `<div>` or comment marker in the wrong
 * place gets re-parented by the HTML parser, so hydration markers
 * must land inside cells, not between `<tr>`s. (`data-table` covers
 * the composed site/ui component; this is the minimal-element probe.)
 */
export const fixture = createFixture({
  id: 'table-dynamic-rows',
  description: 'Table with keyed row loop and dynamic cells',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { name: string; qty: number }
export function TableDynamicRows() {
  const [rows, setRows] = createSignal<Row[]>([
    { name: 'bolt', qty: 12 },
    { name: 'nut', qty: 9 },
  ])
  return (
    <table>
      <caption>stock</caption>
      <thead>
        <tr><th>name</th><th>qty</th></tr>
      </thead>
      <tbody>
        {rows().map(row => (
          <tr key={row.name}>
            <td>{row.name}</td>
            <td>{row.qty}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
`,
  expectedHtml: `
    <table bf-s="test">
      <caption>stock</caption>
      <thead><tr><th>name</th><th>qty</th></tr></thead>
      <tbody bf="s2">
        <tr data-key="bolt">
          <td><!--bf:s0-->bolt<!--/--></td>
          <td><!--bf:s1-->12<!--/--></td>
        </tr>
        <tr data-key="nut">
          <td><!--bf:s0-->nut<!--/--></td>
          <td><!--bf:s1-->9<!--/--></td>
        </tr>
      </tbody>
    </table>
  `,
})
