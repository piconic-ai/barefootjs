/** @jsxImportSource hono/jsx */
// Part B ablation baseline — SSR render-gap investigation. Byte-identical
// to the real compiler's output for benchmarks/ssr/apps/barefoot/components
// /BenchSsr.tsx (verify by re-running `compileJSX` + diffing; see
// measure-props-cost.ts's docstring). Hand-copied here (rather than
// generated at harness runtime) so the three ablation variants stay
// visually diffable against each other.
import { bfComment, bfText, bfTextEnd } from '@barefootjs/hono/utils'

interface RowData {
  id: number
  label: string
}

export function BenchSsr(__allProps: { initialRows: RowData[] } & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `BenchSsr_${Math.random().toString(36).slice(2, 8)}`
  const selected = () => 0

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.initialRows !== 'function' && !(typeof props.initialRows === 'object' && props.initialRows !== null && 'isEscaped' in props.initialRows)) __hydrateProps['initialRows'] = props.initialRows
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <table className="table" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})}><tbody id="tbody" bf="s4">{bfComment('loop:l0')}{props.initialRows.map((row) => <tr key={row.id} className={`${selected() === row.id ? 'danger' : ''}`} data-key={String(row.id)} bf="s3"><td className="col-md-1">{bfText("s0")}{row.id}{bfTextEnd()}</td><td className="col-md-4"><a className="lbl" onClick={() => {}} bf="s2">{bfText("s1")}{row.label}{bfTextEnd()}</a></td><td className="col-md-1"><a className="remove">x</a></td><td className="col-md-6" /></tr>)}{bfComment('/loop:l0')}</tbody></table>
  )
}
export default BenchSsr
