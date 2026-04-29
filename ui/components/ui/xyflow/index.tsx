"use client"

/**
 * xyflow JSX Components
 *
 * JSX-native renderer components for `@barefootjs/xyflow`. The package
 * itself ships utility helpers (signal hooks, store, types, edge-path
 * geometry, imperative pointer-paced subsystems for `ref` attach), and
 * these components compose them into a `<Flow>` graph editor.
 *
 * Mirrors the chart pattern — utility helpers live in `@barefootjs/chart`,
 * JSX components in `ui/components/ui/chart/`. See the package README at
 * `packages/xyflow/README.md` for the full architecture rationale and
 * the issue at piconic-ai/barefootjs#1081 for the migration history.
 *
 * Components exported:
 *   - `<Flow>`         — top-level container, owns the store + viewport
 *   - `<Background>`   — SVG pattern background that moves with viewport
 *   - `<Controls>`     — zoom in / zoom out / fit view / lock buttons
 *   - `<MiniMap>`      — overview map with viewport mask
 *   - `<Handle>`       — per-node connection handle (source / target)
 *   - `<NodeWrapper>`  — per-node `<div>` with reactive class / transform
 *   - `<SimpleEdge>`   — per-edge `<path>` (hit area + visible)
 *
 * Pointer-paced subsystems (selection rectangle, connection drag,
 * node-resize, pan-zoom, keyboard handlers) stay imperative inside
 * `@barefootjs/xyflow` and attach via `ref` callbacks.
 */

import {
  createSignal,
  createMemo,
  useContext,
} from '@barefootjs/client'
import type { JSX } from '@barefootjs/jsx/jsx-runtime'
// All upstream `@xyflow/system` symbols are re-exported through
// `@barefootjs/xyflow`, so consumers who `barefoot add xyflow` only
// need to depend on `@barefootjs/xyflow` (no separate
// `@xyflow/system` install).
import {
  attachConnectionHandler,
  BF_FLOW,
  BF_FLOW_CONTROLS,
  BF_FLOW_CONTROLS_BUTTON,
  BF_FLOW_EDGE,
  BF_FLOW_EDGE_ANIMATED,
  BF_FLOW_EDGE_SELECTED,
  BF_FLOW_EDGES,
  BF_FLOW_HANDLE,
  BF_FLOW_HANDLE_SOURCE,
  BF_FLOW_HANDLE_TARGET,
  BF_FLOW_MINIMAP,
  BF_FLOW_MINIMAP_MASK,
  BF_FLOW_NODE,
  BF_FLOW_NODE_CHILD,
  BF_FLOW_NODE_GROUP,
  BF_FLOW_NODE_SELECTED,
  BF_FLOW_NODES,
  BF_FLOW_VIEWPORT,
  computeEdgePosition,
  createFlowStore,
  FlowContext,
  getEdgePath,
  Position,
  XYFLOW_VIEWPORT,
} from '@barefootjs/xyflow'
import type { FlowStore, FlowProps, HandleType, NodeBase, EdgeBase } from '@barefootjs/xyflow'

type Child = JSX.Element | string | number | boolean | null | undefined | Child[]

// ============================================================================
// SimpleEdge — per-edge `<path>` (hit area + visible).
// ============================================================================

export interface SimpleEdgeProps {
  /** Stable id of the edge inside `store.edgeLookup()`. */
  edgeId: string
}

export function SimpleEdge(props: SimpleEdgeProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  // Per-field memos. createSignal/createMemo dedupe on Object.is, so a memo
  // over a primitive (boolean) only fires when its value actually changes.
  // This isolates per-edge property updates: toggling another edge's
  // `selected` does not re-run this edge's class memo.
  const selected = createMemo(() => !!store?.edgeLookup().get(props.edgeId)?.selected)
  const animated = createMemo(() => !!store?.edgeLookup().get(props.edgeId)?.animated)

  // Path memo. BOTH `positionEpoch` and `nodes()` reads are required —
  // positionEpoch covers in-flight drag updates, nodes() covers the
  // post-drag commit where setNodes mutates nodeLookup in place.
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

  const visibleClass = createMemo(() => {
    let cls = BF_FLOW_EDGE
    if (selected()) cls += ` ${BF_FLOW_EDGE_SELECTED}`
    if (animated()) cls += ` ${BF_FLOW_EDGE_ANIMATED}`
    return cls
  })

  function selectThisEdge(e: MouseEvent) {
    e.stopPropagation()
    if (!store) return
    const container = store.domNode()
    if (container) container.focus()
    store.unselectNodesAndEdges()
    const edgeId = props.edgeId
    store.setEdges((prev: EdgeBase[]) =>
      prev.map((ed: EdgeBase) => (ed.id === edgeId ? { ...ed, selected: true } : ed)),
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
      {/* Visible edge path. */}
      <path
        className={visibleClass()}
        data-id={props.edgeId}
        fill="none"
        d={pathD()}
      />
    </>
  )
}

// ============================================================================
// NodeWrapper — per-node `<div>` with reactive class / transform / z-index.
// ============================================================================

export interface NodeWrapperProps {
  /** Stable id of the node inside `store.nodeLookup()`. */
  nodeId: string
  /** Slot for node content (default rendering or custom component output). */
  children?: Child
  /**
   * Optional ref callback. The cutover step that retires `createNodeWrapper`
   * passes the imperative drag/measure/handle-bounds machinery here.
   */
  ref?: (element: HTMLElement) => void
}

export function NodeWrapper(props: NodeWrapperProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  const node = createMemo(() => {
    if (!store) return null
    // Reading `nodes()` AND `nodeLookup()` mirrors the imperative wrapper
    // effect — `positionEpoch` covers in-flight drag updates, `nodes()`
    // covers structural commits.
    store.positionEpoch()
    store.nodes()
    return store.nodeLookup().get(props.nodeId) ?? null
  })

  const transform = createMemo(() => {
    const n = node()
    if (!n) return ''
    const pos = n.internals.positionAbsolute
    return `translate(${pos.x}px, ${pos.y}px)`
  })

  const zIndex = createMemo(() => String(node()?.internals.z ?? 0))

  const className = createMemo(() => {
    const n = node()
    const base = `${BF_FLOW_NODE} nopan`
    if (!store || !n) return base
    const isParent = store.parentLookup().has(props.nodeId)
    const isChild = !!n.internals.userNode.parentId
    const selected = !!n.selected
    let cls = base
    if (isParent) cls += ` ${BF_FLOW_NODE_GROUP}`
    if (isChild) cls += ` ${BF_FLOW_NODE_CHILD}`
    if (selected) cls += ` ${BF_FLOW_NODE_SELECTED}`
    return cls
  })

  const style = createMemo(
    () =>
      `position: absolute; transform-origin: 0 0; pointer-events: all; transform: ${transform()}; z-index: ${zIndex()};`,
  )

  return (
    <div
      ref={props.ref}
      className={className()}
      style={style()}
      data-id={props.nodeId}
    >
      {props.children}
    </div>
  )
}

// ============================================================================
// Handle — per-node connection handle (source / target).
// ============================================================================

export interface HandleProps {
  type?: HandleType
  position?: Position
  id?: string | null
  isConnectable?: boolean
  nodeId: string
}

const HANDLE_SIZE = 8

function handlePositionStyle(position: Position): string {
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

const HANDLE_BASE_STYLE =
  `position: absolute; width: ${HANDLE_SIZE}px; height: ${HANDLE_SIZE}px; border-radius: 50%; background-color: #1a192b; border: 1px solid #fff; cursor: crosshair; pointer-events: all; z-index: 1;`

export function Handle(props: HandleProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  const handleType = createMemo<HandleType>(() => props.type ?? 'source')
  const position = createMemo<Position>(() => props.position ?? Position.Top)

  const className = createMemo(() => {
    const t = handleType()
    const modifier = t === 'source' ? BF_FLOW_HANDLE_SOURCE : BF_FLOW_HANDLE_TARGET
    // The bare `source` / `target` class is what @xyflow/system queries
    // to compute edge endpoints — keep it on the element verbatim.
    return `${BF_FLOW_HANDLE} ${modifier} ${t}`
  })

  const style = createMemo(() => `${HANDLE_BASE_STYLE} ${handlePositionStyle(position())}`)

  // Connection dragging is pointer-paced. Wired via ref so the imperative
  // drag handler in `@barefootjs/xyflow/connection` owns the pointer
  // lifecycle.
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

// ============================================================================
// Background — SVG pattern background that moves with the viewport.
// ============================================================================

export type BackgroundVariant = 'dots' | 'lines' | 'cross'

export interface BackgroundProps {
  variant?: BackgroundVariant
  gap?: number
  size?: number
  color?: string
  lineWidth?: number
  /**
   * Shifts the pattern as a fraction of the gap.
   * 0 (default): lines pass through tile centers (same as @xyflow/react).
   * 0.5: shifts by half a gap so lines align to tile edges.
   */
  offset?: number
  /** Stable id for the `<pattern>`. Falls back to a random id. */
  patternId?: string
}

export function Background(props: BackgroundProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  const patternId = props.patternId ?? `bf-bg-${Math.random().toString(36).slice(2, 8)}`

  const variant = createMemo(() => props.variant ?? 'dots')
  const gap = createMemo(() => props.gap ?? 20)
  const size = createMemo(() => props.size ?? 1)
  const color = createMemo(() => props.color ?? '#ddd')
  const lineWidth = createMemo(() => props.lineWidth ?? 1)
  const offset = createMemo(() => props.offset ?? 0)

  // Pattern geometry — re-runs when viewport zoom/translate changes.
  // Returns null when scaledGap is non-finite so `<pattern>` keeps the
  // last valid attributes.
  const patternBox = createMemo(() => {
    if (!store) return null
    const vp = store.viewport()
    const scaledGap = gap() * vp.zoom
    if (!scaledGap || !Number.isFinite(scaledGap)) return null
    return {
      width: scaledGap,
      height: scaledGap,
      x: (vp.x % scaledGap) - scaledGap * offset(),
      y: (vp.y % scaledGap) - scaledGap * offset(),
      scaledGap,
      zoom: vp.zoom,
    }
  })

  const dotR = createMemo(() => {
    const box = patternBox()
    if (!box) return 0
    return size() * Math.max(box.zoom, 0.5)
  })
  const dotCx = createMemo(() => {
    const box = patternBox()
    return box ? box.scaledGap / 2 : 0
  })
  const dotCy = createMemo(() => {
    const box = patternBox()
    return box ? box.scaledGap / 2 : 0
  })
  const linePathD = createMemo(() => {
    const box = patternBox()
    if (!box) return ''
    return `M${box.scaledGap / 2} 0 V${box.scaledGap}`
  })
  const crossPathD = createMemo(() => {
    const box = patternBox()
    if (!box) return ''
    const half = box.scaledGap / 2
    return `M${half} 0 V${box.scaledGap} M0 ${half} H${box.scaledGap}`
  })

  const patternWidth = createMemo(() => String(patternBox()?.width ?? 0))
  const patternHeight = createMemo(() => String(patternBox()?.height ?? 0))
  const patternX = createMemo(() => String(patternBox()?.x ?? 0))
  const patternY = createMemo(() => String(patternBox()?.y ?? 0))

  return (
    <svg
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;"
    >
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={patternWidth()}
          height={patternHeight()}
          x={patternX()}
          y={patternY()}
        >
          {variant() === 'dots' ? (
            <circle
              r={String(dotR())}
              cx={String(dotCx())}
              cy={String(dotCy())}
              fill={color()}
            />
          ) : variant() === 'lines' ? (
            <path
              d={linePathD()}
              stroke={color()}
              stroke-width={String(lineWidth())}
              fill="none"
            />
          ) : (
            <path
              d={crossPathD()}
              stroke={color()}
              stroke-width={String(lineWidth())}
              fill="none"
            />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}

// ============================================================================
// Controls — zoom in / zoom out / fit view / lock toggle.
// ============================================================================

export type ControlsPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface ControlsProps {
  position?: ControlsPosition
  showZoom?: boolean
  showFitView?: boolean
  showInteractive?: boolean
}

const ICON_VIEWBOX = '0 0 32 32'
const ICON_VIEWBOX_LOCK = '0 0 25 32'
const PATH_PLUS = 'M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z'
const PATH_MINUS = 'M0 13.867h32v4.266H0z'
const PATH_FIT_VIEW = 'M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.63zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94a.919.919 0 01-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z'
const PATH_LOCK = 'M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0 8 0 4.571 3.429 4.571 7.619v3.048H3.048A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047zm4.724-13.866H7.467V7.619c0-2.59 2.133-4.724 4.723-4.724 2.591 0 4.724 2.133 4.724 4.724v3.048z'
const PATH_UNLOCK = 'M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0c-4.114 1.828-1.37 2.133.305 2.438 1.676.305 4.42 2.59 4.42 5.181v3.048H3.047A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047z'

const BUTTON_STYLE =
  'display: flex; justify-content: center; align-items: center; height: 26px; width: 26px; padding: 4px; border: none; border-bottom: 1px solid #eee; background: #fefefe; cursor: pointer; user-select: none; color: inherit;'
const ICON_WRAPPER_STYLE = 'display: flex; align-items: center; justify-content: center;'
const ICON_SVG_STYLE = 'width: 100%; max-width: 12px; max-height: 12px; fill: currentColor;'

function controlsPositionStyle(position: ControlsPosition): string {
  const [vertical, horizontal] = position.split('-') as [string, string]
  return `${vertical}: 10px; ${horizontal}: 10px;`
}

export function Controls(props: ControlsProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  const position = createMemo<ControlsPosition>(() => props.position ?? 'bottom-left')
  const showZoom = createMemo(() => props.showZoom ?? true)
  const showFitView = createMemo(() => props.showFitView ?? true)
  const showInteractive = createMemo(() => props.showInteractive ?? true)

  const [interactive, setInteractive] = createSignal(true)

  const containerStyle = createMemo(() =>
    `position: absolute; z-index: 5; display: flex; flex-direction: column; box-shadow: 0 0 2px 1px rgba(0,0,0,0.08); ${controlsPositionStyle(position())}`,
  )

  function zoomIn() {
    store?.panZoom()?.scaleBy(1.2)
  }
  function zoomOut() {
    store?.panZoom()?.scaleBy(1 / 1.2)
  }
  function fitView() {
    store?.fitView()
  }
  function toggleInteractive() {
    const next = !interactive()
    setInteractive(next)
    store?.setNodesDraggable(next)
  }

  return (
    <div className={BF_FLOW_CONTROLS} style={containerStyle()}>
      {showZoom() ? (
        <>
          <button
            type="button"
            className={`${BF_FLOW_CONTROLS_BUTTON} nodrag nowheel`}
            title="Zoom in"
            style={BUTTON_STYLE}
            onClick={zoomIn}
          >
            <span style={ICON_WRAPPER_STYLE}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEWBOX} style={ICON_SVG_STYLE}>
                <path d={PATH_PLUS} />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className={`${BF_FLOW_CONTROLS_BUTTON} nodrag nowheel`}
            title="Zoom out"
            style={BUTTON_STYLE}
            onClick={zoomOut}
          >
            <span style={ICON_WRAPPER_STYLE}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEWBOX} style={ICON_SVG_STYLE}>
                <path d={PATH_MINUS} />
              </svg>
            </span>
          </button>
        </>
      ) : null}
      {showFitView() ? (
        <button
          type="button"
          className={`${BF_FLOW_CONTROLS_BUTTON} nodrag nowheel`}
          title="Fit view"
          style={BUTTON_STYLE}
          onClick={fitView}
        >
          <span style={ICON_WRAPPER_STYLE}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEWBOX} style={ICON_SVG_STYLE}>
              <path d={PATH_FIT_VIEW} />
            </svg>
          </span>
        </button>
      ) : null}
      {showInteractive() ? (
        <button
          type="button"
          className={`${BF_FLOW_CONTROLS_BUTTON} nodrag nowheel`}
          title="Toggle interactivity"
          style={BUTTON_STYLE}
          onClick={toggleInteractive}
        >
          <span style={ICON_WRAPPER_STYLE}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEWBOX_LOCK} style={ICON_SVG_STYLE}>
              <path d={interactive() ? PATH_UNLOCK : PATH_LOCK} />
            </svg>
          </span>
        </button>
      ) : null}
    </div>
  )
}

// ============================================================================
// MiniMap — overview map with viewport mask.
// ============================================================================

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

function miniMapPositionStyle(position: MiniMapPosition): string {
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
      `position: absolute; z-index: 5; overflow: hidden; border-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,0.15); background-color: #fff; ${miniMapPositionStyle(position())}`,
  )

  // Geometry memo. Re-runs when nodeLookup, viewport, dimensions, or
  // positionEpoch change.
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
      const fill = typeof colorProp === 'function' ? colorProp(node) : colorProp
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
    <div className={`${BF_FLOW_MINIMAP} nopan nowheel nodrag`} style={containerStyle()}>
      <svg
        width={String(mapWidth())}
        height={String(mapHeight())}
        viewBox={viewBox()}
        style={svgStyle()}
      >
        <g>
          {nodeRects().map((rect) => (
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
          className={BF_FLOW_MINIMAP_MASK}
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

// ============================================================================
// Flow — top-level container.
// ============================================================================

export interface FlowComponentProps<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
> extends FlowProps<NodeType, EdgeType> {
  /** Slot for `<Background>` / `<Controls>` / `<MiniMap>` overlays. */
  children?: Child
  /**
   * Optional render function for the body of each node. Called inside
   * the per-node `<NodeWrapper>` produced by the default node loop.
   * Defaults to `String(node.data?.label ?? node.id)`.
   *
   * Use this instead of mounting `<NodeWrapper>` instances yourself —
   * doing both would double-mount each node.
   */
  renderNode?: (node: NodeType) => Child
}

export function Flow<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(props: FlowComponentProps<NodeType, EdgeType>) {
  // Store creation happens once on first render. The store is shared
  // with descendant `<NodeWrapper>` / `<SimpleEdge>` / `<Background>` /
  // `<Controls>` / `<MiniMap>` instances via `<FlowContext.Provider>`.
  // We use the JSX wrapper form (not the imperative `provideContext`
  // call) so SSR — where children render top-down before any
  // imperative effect runs — sees the provider in scope. Mirrors the
  // chart pattern (`<BarChartContext.Provider value={...}>...`).
  const store = createFlowStore<NodeType, EdgeType>(props)

  // Pan/zoom transform memo. Re-runs only when viewport changes.
  const viewportTransform = createMemo(() => {
    const vp = store.viewport()
    return `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`
  })

  // Edge / node list memos. Per-item children mount with stable keys so
  // BF023 is satisfied and the runtime can reconcile via `mapArray`
  // instead of unmount+remount.
  const visibleEdges = createMemo(() => store.edges().filter((e: EdgeType) => !e.hidden))
  const visibleNodes = createMemo(() => store.nodes())

  // Pointer-paced subsystem attach point (panZoom, ResizeObserver,
  // keyboard handlers, selection rectangle, pane click detection). The
  // cutover step that retires `flow.ts` will replace this no-op with a
  // call into `attachFlowSubsystems(el, store, props)` from
  // `@barefootjs/xyflow`.
  function attachPane(el: HTMLElement) {
    void el
  }

  return (
    <FlowContext.Provider value={store as never}>
      <div
        ref={attachPane}
        className={BF_FLOW}
        style="position: relative; overflow: hidden; width: 100%; height: 100%;"
      >
        <div
          className={`${BF_FLOW_VIEWPORT} ${XYFLOW_VIEWPORT}`}
          style={`position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform-origin: 0 0; transform: ${viewportTransform()};`}
        >
          <svg
            className={BF_FLOW_EDGES}
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none;"
          >
            {visibleEdges().map((edge: EdgeType) => (
              <SimpleEdge key={edge.id} edgeId={edge.id} />
            ))}
          </svg>
          <div className={BF_FLOW_NODES} style="position: absolute; top: 0; left: 0;">
            {visibleNodes().map((node: NodeType) => (
              <NodeWrapper key={node.id} nodeId={node.id}>
                {/* Default node body: render `data.label` (or the node id
                    as a fallback) so a stock `<Flow nodes={...} />` shows
                    something visible without forcing every consumer to
                    build a custom node. Pass `renderNode` to override. */}
                {props.renderNode
                  ? props.renderNode(node)
                  : String((node.data as { label?: unknown })?.label ?? node.id)}
              </NodeWrapper>
            ))}
          </div>
        </div>
        {props.children}
      </div>
    </FlowContext.Provider>
  )
}
