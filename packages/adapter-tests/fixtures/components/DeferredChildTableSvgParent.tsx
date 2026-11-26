'use client'

// Test fixture: child components deferred to the client's init (their prop
// reads `label`, an init-only local) under parents whose content the HTML
// parser restricts to specific elements: a `<tr>` row component in a
// `<tbody>`, a `<td>` cell component in a `<tr>`, and a `<circle>` component
// in an `<svg>`. A `<div>` placeholder is moved out of all three by the
// parser (foster-parented before the table, or ending the SVG), so the
// mounted child landed outside its parent.

import { createSignal } from '@barefootjs/client'

function TableRow(props: { label: string }) {
  return (
    <tr className="row">
      <td>{props.label}</td>
    </tr>
  )
}

function TableCell(props: { label: string }) {
  return <td className="cell">{props.label}</td>
}

function SvgDot(props: { label: string }) {
  return <circle className="dot" r="2" data-label={props.label} />
}

export function DeferredChildTableSvgParent() {
  const [name] = createSignal('a')
  // A block body keeps `label` init-only: the client template splices an
  // expression-bodied zero-param helper's call as its body, which would
  // render the child in place instead of deferring it.
  const read = () => {
    return name()
  }
  const label = read()
  return (
    <div>
      <table>
        <tbody className="body">
          <TableRow label={label} />
          <tr className="host-row">
            <TableCell label={label} />
          </tr>
        </tbody>
      </table>
      <svg className="pic" viewBox="0 0 4 4">
        <SvgDot label={label} />
      </svg>
    </div>
  )
}
