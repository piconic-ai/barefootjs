/** @jsxImportSource hono/jsx */
// Variant: identical to variant-full.tsx EXCEPT all hydration markers are
// removed (bf-s, bf-r, bf-h, bf-m, bf="sN" attrs, data-key, bfComment,
// bfText/bfTextEnd). bf-p props serialization is KEPT.

interface RowData {
  id: number
  label: string
}

export function BenchSsr(__allProps: { initialRows: RowData[] } & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const selected = () => 0

  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.initialRows !== 'function' && !(typeof props.initialRows === 'object' && props.initialRows !== null && 'isEscaped' in props.initialRows)) __hydrateProps['initialRows'] = props.initialRows
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <table className="table" bf-p={__bfPropsJson}><tbody id="tbody">{props.initialRows.map((row) => <tr className={`${selected() === row.id ? 'danger' : ''}`}><td className="col-md-1">{row.id}</td><td className="col-md-4"><a className="lbl" onClick={() => {}}>{row.label}</a></td><td className="col-md-1"><a className="remove">x</a></td><td className="col-md-6" /></tr>)}</tbody></table>
  )
}
export default BenchSsr
