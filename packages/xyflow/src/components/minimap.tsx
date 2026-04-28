"use client"

// JSX-native MiniMap component (#1081 step 7).
//
// Translates `initMiniMap(scope, props)` into a `<MiniMap />` JSX
// component. The minimap geometry (viewBox, per-node `<rect>` list,
// outer-rect-with-viewport-cutout `<path>` mask) is now expressed
// declaratively. Pan/zoom interaction stays imperative — pointer
// capture + wheel handling is pointer-paced (per #1081 "Stays
// imperative") and the existing `attachMinimapInteraction` ref hook
// keeps that logic in one place.
//
// **Wiring status:** the imperative `initMiniMap` in `minimap.ts` is
// still the production code path. Replacing the call site happens in
// the consolidation step at the end of #1081.

import { createMemo, useContext } from '@barefootjs/client'
import { FlowContext } from '../context'
import type { FlowStore } from '../types'

export type MiniMapPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface MiniMapComponentProps {
  position?: MiniMapPosition
  width?: number
  height?: number
  nodeColor?: string | ((node: unknown) => string)
  maskColor?: string
  maskStrokeColor?: string
  maskStrokeWidth?: number
  pannable?: boolean
  zoomable?: boolean
  zoomStep?: number
  inversePan?: boolean
  offsetScale?: number
}

interface NodeRect {
  id: string
  x: number
  y: number
  width: number
  height: number
  fill: string
}

function positionStyle(position: MiniMapPosition): string {
  const [vertical, horizontal] = position.split('-') as [string, string]
  return `${vertical}: 10px; ${horizontal}: 10px;`
}

function getNodeBoundingRect(
  nodeLookup: Map<string, { internals: { positionAbsolute: { x: number; y: number } }; measured: { width?: number; height?: number } }>,
): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [, node] of nodeLookup) {
    const pos = node.internals.positionAbsolute
    const nw = node.measured.width ?? 150
    const nh = node.measured.height ?? 40
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + nw)
    maxY = Math.max(maxY, pos.y + nh)
  }
  if (!isFinite(minX)) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function MiniMap(props: MiniMapComponentProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  const position = createMemo<MiniMapPosition>(() => props.position ?? 'bottom-right')
  const mapWidth = createMemo(() => props.width ?? 200)
  const mapHeight = createMemo(() => props.height ?? 150)
  const nodeColor = createMemo(() => props.nodeColor ?? '#e2e8f0')
  const maskColor = createMemo(() => props.maskColor ?? 'rgba(240, 240, 240, 0.6)')
  const maskStrokeColor = createMemo(() => props.maskStrokeColor ?? 'none')
  const maskStrokeWidth = createMemo(() => props.maskStrokeWidth ?? 0)
  const pannable = createMemo(() => props.pannable ?? true)
  const offsetScale = createMemo(() => props.offsetScale ?? 5)

  const containerStyle = createMemo(
    () =>
      `position: absolute; z-index: 5; overflow: hidden; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.15); background-color: #fff; ${positionStyle(position())}`,
  )

  // Geometry memo. Re-runs when nodeLookup, viewport, dimensions, or
  // positionEpoch change — same dependency set as the imperative
  // effect.
  const geometry = createMemo(() => {
    if (!store) return null
    const nodeLookup = store.nodeLookup()
    const vp = store.viewport()
    const flowW = store.width()
    const flowH = store.height()
    store.positionEpoch()

    const nodeBounds = getNodeBoundingRect(nodeLookup)
    if (!nodeBounds) return null

    const vpX = -vp.x / vp.zoom
    const vpY = -vp.y / vp.zoom
    const vpW = flowW / vp.zoom
    const vpH = flowH / vp.zoom

    const unionX = Math.min(nodeBounds.x, vpX)
    const unionY = Math.min(nodeBounds.y, vpY)
    const unionR = Math.max(nodeBounds.x + nodeBounds.width, vpX + vpW)
    const unionB = Math.max(nodeBounds.y + nodeBounds.height, vpY + vpH)
    const unionW = unionR - unionX
    const unionH = unionB - unionY

    const mw = mapWidth()
    const mh = mapHeight()
    const scaledWidth = unionW / mw
    const scaledHeight = unionH / mh
    const viewScale = Math.max(scaledWidth, scaledHeight)

    const viewWidth = viewScale * mw
    const viewHeight = viewScale * mh
    const off = offsetScale() * viewScale

    const vbX = unionX - (viewWidth - unionW) / 2 - off
    const vbY = unionY - (viewHeight - unionH) / 2 - off
    const vbW = viewWidth + off * 2
    const vbH = viewHeight + off * 2

    return { vbX, vbY, vbW, vbH, vpX, vpY, vpW, vpH, off, viewScale }
  })

  const viewBox = createMemo(() => {
    const g = geometry()
    if (!g) return '0 0 200 150'
    return `${g.vbX} ${g.vbY} ${g.vbW} ${g.vbH}`
  })

  const nodeRects = createMemo<NodeRect[]>(() => {
    if (!store) return []
    store.nodes()
    store.positionEpoch()
    const nodeLookup = store.nodeLookup()
    const colorProp = nodeColor()
    const rects: NodeRect[] = []
    for (const [id, node] of nodeLookup) {
      const pos = node.internals.positionAbsolute
      const fill = typeof colorProp === 'function'
        ? colorProp(node)
        : colorProp
      rects.push({
        id,
        x: pos.x,
        y: pos.y,
        width: node.measured.width ?? 150,
        height: node.measured.height ?? 40,
        fill,
      })
    }
    return rects
  })

  const maskPathD = createMemo(() => {
    const g = geometry()
    if (!g) return ''
    const outerX = g.vbX - g.off
    const outerY = g.vbY - g.off
    const outerW = g.vbW + g.off * 2
    const outerH = g.vbH + g.off * 2
    return (
      `M${outerX},${outerY}h${outerW}v${outerH}h${-outerW}z` +
      `M${g.vpX},${g.vpY}h${g.vpW}v${g.vpH}h${-g.vpW}z`
    )
  })

  const svgStyle = createMemo(() => `display: block; cursor: ${pannable() ? 'grab' : 'default'};`)

  return (
    <div
      className="bf-flow__minimap nopan nowheel nodrag"
      style={containerStyle()}
    >
      <svg
        width={String(mapWidth())}
        height={String(mapHeight())}
        viewBox={viewBox()}
        style={svgStyle()}
      >
        <g>
          {nodeRects().map(rect => (
            <rect
              key={rect.id}
              x={String(rect.x)}
              y={String(rect.y)}
              width={String(rect.width)}
              height={String(rect.height)}
              fill={rect.fill}
              rx="5"
              ry="5"
            />
          ))}
        </g>
        <path
          className="bf-flow__minimap-mask"
          d={maskPathD()}
          fill={maskColor()}
          fill-rule="evenodd"
          stroke={maskStrokeColor()}
          stroke-width={String(maskStrokeWidth())}
          pointer-events="none"
        />
      </svg>
    </div>
  )
}
