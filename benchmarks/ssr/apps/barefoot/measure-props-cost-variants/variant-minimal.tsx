/** @jsxImportSource hono/jsx */
// Variant: neither hydration markers NOR bf-p props serialization — just
// the bare structural JSX-to-string render (closest analogue to what
// react/solid's renderPage() does: build a tree from `initialRows` and
// stringify it, no hydration payload of any kind).

interface RowData {
  id: number
  label: string
}

export function BenchSsr(__allProps: { initialRows: RowData[] }) {
  const { ...props } = __allProps
  const selected = () => 0

  return (
    <table className="table"><tbody id="tbody">{props.initialRows.map((row) => <tr className={`${selected() === row.id ? 'danger' : ''}`}><td className="col-md-1">{row.id}</td><td className="col-md-4"><a className="lbl" onClick={() => {}}>{row.label}</a></td><td className="col-md-1"><a className="remove">x</a></td><td className="col-md-6" /></tr>)}</tbody></table>
  )
}
export default BenchSsr
