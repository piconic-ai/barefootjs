"use client"

// JSX-native simple-edge component (#1081 step 2).
//
// Translates the per-edge `mountSimpleEdge` scope from edge-renderer.ts
// (the #1078 PoC translation target) into the JSX form
// `edges().map(e => <path d={...} />)`. The component renders the two
// `<path>` elements that make up a simple edge:
//   - A wide invisible hit-area path (stroke=transparent, stroke-width=20)
//     that captures `mousedown` for selection.
//   - The visible edge path with `bf-flow__edge` plus the per-edge
//     `--selected` / `--animated` modifier classes.
//
// Custom-edge rendering and the reconnect-handle overlay deliberately
// stay imperative (`mountCustomEdge` / `createReconnectHandle`) — see
// #1081 "Stays imperative" section. The reconnect overlay lives in a
// sibling SVG above the nodes layer; modeling it as JSX would require
// a separate JSX-native overlay container that sits outside the edge
// loop, which is out of scope for this step.
//
// **Wiring status:** this component is the canonical JSX form. Production
// edge mounting still goes through `mountSimpleEdge` in `edge-renderer.ts`
// — replacing that call site is the cutover step that lands once every
// renderer has its JSX-native counterpart (final step of #1081).

import { createMemo, useContext } from '@barefootjs/client'
import { FlowContext } from './context'
import { computeEdgePosition, getEdgePath } from './edge-path'
import type { FlowStore } from './types'

export interface SimpleEdgeProps {
  /** Stable id of the edge inside `store.edgeLookup()`. */
  edgeId: string
}

export function SimpleEdge(props: SimpleEdgeProps) {
  // The compiler requires `props.xxx` access (no destructuring) so the
  // reactive read survives. Pulled out as a memo just so downstream
  // memos can read it without each one re-doing the lookup.
  const store = useContext(FlowContext) as FlowStore | undefined

  // Per-field memos. createSignal/createMemo dedupe on Object.is, so
  // a memo over a primitive (boolean) only fires when its value
  // actually changes. This isolates per-edge property updates: toggling
  // another edge's `selected` does not re-run this edge's class memo.
  const selected = createMemo(() => !!store?.edgeLookup().get(props.edgeId)?.selected)
  const animated = createMemo(() => !!store?.edgeLookup().get(props.edgeId)?.animated)

  // Path memo. BOTH `positionEpoch` and `nodes()` reads are required —
  // see edge-renderer.ts for the rAF-batched drag commit explanation.
  const pathD = createMemo(() => {
    if (!store) return ''
    const edge = store.edgeLookup().get(props.edgeId)
    if (!edge) return ''
    store.positionEpoch()
    store.nodes()
    const nodeLookup = store.nodeLookup()
    const sourceNode = nodeLookup.get(edge.source)
    const targetNode = nodeLookup.get(edge.target)
    if (!sourceNode || !targetNode) return ''
    const edgePos = computeEdgePosition(edge, sourceNode, targetNode)
    if (!edgePos) return ''
    const result = getEdgePath(edge, edgePos)
    return result ? result[0] : ''
  })

  // Class string: base + modifier flags. Concatenation is intentional —
  // the compiler can split this into per-class reactive bindings the
  // same way it does for `chart` primitives.
  const visibleClass = createMemo(() => {
    let cls = 'bf-flow__edge'
    if (selected()) cls += ' bf-flow__edge--selected'
    if (animated()) cls += ' bf-flow__edge--animated'
    return cls
  })

  function selectThisEdge(e: MouseEvent) {
    e.stopPropagation()
    if (!store) return
    const container = store.domNode()
    if (container) container.focus()
    store.unselectNodesAndEdges()
    const edgeId = props.edgeId
    store.setEdges((prev) =>
      prev.map((ed) => (ed.id === edgeId ? { ...ed, selected: true } : ed)),
    )
  }

  return (
    <>
      {/* Invisible wide hit area — pointer-events on stroke only so the
          path receives clicks but underlying SVG remains transparent. */}
      <path
        data-hit-id={props.edgeId}
        fill="none"
        stroke="transparent"
        stroke-width="20"
        d={pathD()}
        style="cursor: pointer; pointer-events: stroke;"
        onMouseDown={selectThisEdge}
      />
      {/* Visible edge path. Class string concatenation, not class:foo
          binding, mirrors the chart primitives' single-class pattern. */}
      <path
        className={visibleClass()}
        data-id={props.edgeId}
        fill="none"
        d={pathD()}
      />
    </>
  )
}
