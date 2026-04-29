"use client"

// JSX-native Handle component (#1081 step 5).
//
// Translates `initHandle(scope, props)` (and the underlying
// `createHandle`) into a `<Handle />` JSX component. Renders a single
// positioned `<div>` with the data attributes that connection.ts and
// @xyflow/system query against:
//   - className: bf-flow__handle / bf-flow__handle--{type} / {type}
//     (the bare `source` / `target` class is what
//     @xyflow/system.getHandleBounds queries to compute edge endpoints)
//   - data-handle-type, data-handlepos, data-handle-position, data-node-id
//   - data-handleid (only when a stable id is supplied)
// Connection dragging stays imperative — `attachConnectionHandler`
// captures pointer events directly on the DOM element via a `ref`
// callback, which keeps the existing drag implementation in
// connection.ts untouched.
//
// **Wiring status:** the imperative `initHandle` / `createHandle` in
// `handle.ts` is still the production code path. Replacing the call
// site happens in the consolidation step at the end of #1081.

import { createMemo, useContext } from '@barefootjs/client'
import { Position } from '@xyflow/system'
import type { HandleType } from '@xyflow/system'
import { FlowContext } from '../context'
import { attachConnectionHandler } from '../connection'
import type { FlowStore } from '../types'

export interface HandleComponentProps {
  type?: HandleType
  position?: Position
  id?: string | null
  isConnectable?: boolean
  nodeId: string
}

const HANDLE_SIZE = 8

function positionStyle(position: Position): string {
  switch (position) {
    case Position.Top:
      return 'left: 50%; top: 0; transform: translate(-50%, -50%);'
    case Position.Bottom:
      return 'left: 50%; bottom: 0; top: auto; transform: translate(-50%, 50%);'
    case Position.Left:
      return 'left: 0; top: 50%; transform: translate(-50%, -50%);'
    case Position.Right:
      return 'right: 0; left: auto; top: 50%; transform: translate(50%, -50%);'
    default:
      return ''
  }
}

const BASE_STYLE =
  `position: absolute; width: ${HANDLE_SIZE}px; height: ${HANDLE_SIZE}px; border-radius: 50%; background-color: #1a192b; border: 1px solid #fff; cursor: crosshair; pointer-events: all; z-index: 1;`

export function Handle(props: HandleComponentProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  const handleType = createMemo<HandleType>(() => props.type ?? 'source')
  const position = createMemo<Position>(() => props.position ?? Position.Top)

  const className = createMemo(() => {
    const t = handleType()
    return `bf-flow__handle bf-flow__handle--${t} ${t}`
  })

  const style = createMemo(() => `${BASE_STYLE} ${positionStyle(position())}`)

  // Connection dragging is pointer-paced (per #1081 "Stays imperative").
  // We wire `attachConnectionHandler` from a `ref` callback so the
  // imperative drag handler still owns the pointer lifecycle without
  // duplicating its logic in JSX.
  function attachConnection(el: HTMLElement) {
    if (!store) return
    const container = store.domNode()
    const edgesSvg = container?.querySelector('.bf-flow__edges') as SVGSVGElement | null
    if (container && edgesSvg) {
      attachConnectionHandler(el, props.nodeId, handleType(), container, edgesSvg, store)
    }
  }

  return (
    <div
      ref={attachConnection}
      className={className()}
      style={style()}
      data-handle-type={handleType()}
      data-handlepos={position()}
      data-handle-position={position()}
      data-node-id={props.nodeId}
      data-handleid={props.id ?? undefined}
    />
  )
}
