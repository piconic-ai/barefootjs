import { createFixture } from '../src/types'

/**
 * A child-component loop inside another loop's row that hands the child
 * both rows: the outer row object whole (`row={row}`, a
 * `Record<string, string>`) and the inner scalar row (`field={field}`).
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-record-cell',
  description: "A child-component loop inside another loop's row passes the child the outer row object and the inner row",
  source: `
'use client'

function Cell(props: { row: Record<string, string>; field: string }) {
  return <td>{props.row[props.field]}</td>
}

export function NestedLoopChildComponentRecordCell({ rows, fields }: { rows: Record<string, string>[]; fields: string[] }) {
  return (
    <table>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {fields.map(field => <Cell key={field} row={row} field={field} />)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
`,
  props: { rows: [{ a: '1', b: '2', c: '3' }, { a: '4', b: '', c: '6' }], fields: ['a', 'b', 'c'] },
  expectedHtml: `
    <table bf-s="test"><tbody bf="s2"><tr bf="s1" data-key="0"><td bf-s="Cell_*" bf="s1" data-key="a"><!--bf:s0-->1<!--/--></td><td bf-s="Cell_*" bf="s1" data-key="b"><!--bf:s0-->2<!--/--></td><td bf-s="Cell_*" bf="s1" data-key="c"><!--bf:s0-->3<!--/--></td></tr><tr bf="s1" data-key="1"><td bf-s="Cell_*" bf="s1" data-key="a"><!--bf:s0-->4<!--/--></td><td bf-s="Cell_*" bf="s1" data-key="b"><!--bf:s0--><!--/--></td><td bf-s="Cell_*" bf="s1" data-key="c"><!--bf:s0-->6<!--/--></td></tr></tbody></table>
  `,
})
