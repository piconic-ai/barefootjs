// Flow imperative subsystems extracted from `flow.ts` (#1081 cutover step C4).
//
// Pointer-paced subsystems that the JSX-native `<Flow>` component
// attaches via a `ref` callback. JSX gives these no leverage — pan/zoom
// is owned by `XYPanZoom` (D3-zoom-derived), `setupKeyboardHandlers`
// listens at document level, the selection rectangle owns global
// pointer capture, and pane-click detection needs a `mousedown`/
// `mouseup` pair to bypass D3's event suppression.
//
// Calling shape:
//
//   <div ref={(el) => attachFlowSubsystems(el, store, props)} class="bf-flow">
//     ...
//   </div>
//
// `injectDefaultStyles` runs idempotently on first call, so multiple
// `<Flow>` instances on the same page share one `<style id="bf-flow-styles">`.

import { createEffect, onCleanup, untrack } from '@barefootjs/client'
import { PanOnScrollMode, XYPanZoom } from '@xyflow/system'
import type { InternalNodeBase, NodeLookup, Transform, Viewport, XYPosition } from '@xyflow/system'
import { INFINITE_EXTENT } from './constants.ts'
import { computeEdgePosition, getEdgePath } from './edge-path.ts'
import { setupKeyboardHandlers, setupSelectionRectangle } from './selection.ts'
import type { FlowProps, InternalFlowStore, NodeBase, EdgeBase } from './types.ts'

/**
 * Clamp a child node's drag position so the node's rect stays inside
 * its parent's rect — implements xyflow's `extent: 'parent'` contract
 * for the pointer-paced single-node drag handler.
 *
 * Operates on the **relative** coordinate the parent-relative model
 * stores in `userNode.position`: the constraint per axis is
 * `0 ≤ pos ≤ parentSize − childSize`. Returns the input unchanged when
 * the node has no `parentId`, isn't `extent: 'parent'`, the parent is
 * missing, or either node is unmeasured.
 *
 * Exposed (non-default-export) so the same primitive can be reused if
 * the C4 XYDrag integration replaces the inline drag handler — the
 * extent contract remains the same.
 */
export function clampDragPositionToParent(
  position: XYPosition,
  nodeId: string,
  lookup: NodeLookup<InternalNodeBase<NodeBase>>,
): XYPosition {
  const internal = lookup.get(nodeId)
  if (!internal) return position
  const userNode = internal.internals.userNode as NodeBase & {
    parentId?: string
    extent?: 'parent' | unknown
  }
  if (!userNode.parentId || userNode.extent !== 'parent') return position
  const parent = lookup.get(userNode.parentId)
  if (!parent) return position
  const myW = internal.measured?.width
  const myH = internal.measured?.height
  const pw = parent.measured?.width
  const ph = parent.measured?.height
  if (myW == null || myH == null || pw == null || ph == null) return position
  const maxX = Math.max(0, pw - myW)
  const maxY = Math.max(0, ph - myH)
  return {
    x: Math.min(Math.max(position.x, 0), maxX),
    y: Math.min(Math.max(position.y, 0), maxY),
  }
}

/**
 * Attach all pointer-paced + ResizeObserver-based subsystems to the
 * outer `<div class="bf-flow">` rendered by the JSX `<Flow>` component.
 *
 * Inside a reactive root (`createRoot`), this also registers
 * `onCleanup` callbacks for the panZoom destroy / ResizeObserver
 * disconnect / keyboard listener removal lifecycle.
 */
export function attachFlowSubsystems<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  el: HTMLElement,
  store: InternalFlowStore<NodeType, EdgeType>,
  props: FlowProps<NodeType, EdgeType>,
): void {
  injectDefaultStyles()

  el.style.position = 'relative'
  el.style.overflow = 'hidden'

  store.setDomNode(el)
  // Expose the store on the host `<div class="bf-flow">` element so
  // descendants that miss `FlowContext` — e.g. children passed through
  // `<Flow renderNode={Fn}>` whose returned JSX is hydrated as a
  // top-level scope outside of Flow's `FlowContext.Provider` — can
  // still locate the store via `el.closest('.bf-flow').__bfFlowStore`.
  // Always-set, even on hot remount, so callers can rely on a single
  // canonical reference.
  ;(el as HTMLElement & { __bfFlowStore?: typeof store }).__bfFlowStore = store
  store.setWidth(el.offsetWidth)
  store.setHeight(el.offsetHeight)

  const resizeObserver = new ResizeObserver(() => {
    store.setWidth(el.offsetWidth)
    store.setHeight(el.offsetHeight)
  })
  resizeObserver.observe(el)
  onCleanup(() => resizeObserver.disconnect())

  const panZoomInstance = XYPanZoom({
    domNode: el,
    minZoom: store.minZoom,
    maxZoom: store.maxZoom,
    viewport: untrack(store.viewport),
    translateExtent: INFINITE_EXTENT,
    onDraggingChange: (isDragging: boolean) => {
      store.setDragging(isDragging)
    },
    onPanZoom: (_event: MouseEvent | TouchEvent | null, vp: Viewport) => {
      store.setViewport(vp)
    },
    onPanZoomStart: undefined,
    onPanZoomEnd: (_event: MouseEvent | TouchEvent | null, vp: Viewport) => {
      if (store.onMoveEnd) {
        store.onMoveEnd(_event, vp)
      }
    },
  })

  store.setPanZoom(panZoomInstance)

  const baseUpdate = (zoomActivationKeyPressed: boolean) => ({
    noWheelClassName: 'nowheel',
    noPanClassName: 'nopan',
    preventScrolling: true,
    panOnScroll: props.panOnScroll ?? false,
    panOnDrag: props.panOnDrag ?? true,
    panOnScrollMode: PanOnScrollMode.Free,
    panOnScrollSpeed: 0.5,
    userSelectionActive: false,
    zoomOnPinch: true,
    zoomOnScroll: props.zoomOnScroll ?? true,
    zoomOnDoubleClick: props.zoomOnDoubleClick ?? true,
    zoomActivationKeyPressed,
    lib: 'bf' as const,
    onTransformChange: (transform: Transform) => {
      store.setViewport({ x: transform[0], y: transform[1], zoom: transform[2] })
    },
    connectionInProgress: false,
    paneClickDistance: 0,
  })

  panZoomInstance.update(baseUpdate(false))

  onCleanup(() => panZoomInstance.destroy())

  // Zoom activation key — held to convert scroll-pan into scroll-zoom.
  const zoomKeyCode = (props as { zoomActivationKeyCode?: string | null }).zoomActivationKeyCode
  if (zoomKeyCode) {
    let zoomKeyPressed = false
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === zoomKeyCode && !zoomKeyPressed) {
        zoomKeyPressed = true
        panZoomInstance.update(baseUpdate(true))
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === zoomKeyCode && zoomKeyPressed) {
        zoomKeyPressed = false
        panZoomInstance.update(baseUpdate(false))
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    })
  }

  // Viewport transform sync — the JSX `<Flow>` component already binds
  // its `.bf-flow__viewport` transform reactively from `store.viewport()`,
  // so no DOM mutation here. The createEffect below is intentionally
  // omitted; the JSX layer owns the transform binding.

  setupKeyboardHandlers(store, el)
  setupSelectionRectangle(store, el, {
    selectionOnDrag: props.selectionOnDrag,
    selectionMode: props.selectionMode,
  })

  // Pane click + mousemove. D3 zoom captures `mousedown` and may
  // suppress click events; use a `mousedown` + `mouseup` pair so a
  // genuine click on empty pane (no node / handle / edge underneath)
  // still fires `onPaneClick`. Drag distance > 5px → not a click.
  let paneMouseDownPos: { x: number; y: number } | null = null
  const onMouseDown = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (
      !target.closest('.bf-flow__node') &&
      !target.closest('.bf-flow__handle') &&
      !target.closest('.bf-flow__edge, [data-hit-id]')
    ) {
      paneMouseDownPos = { x: event.clientX, y: event.clientY }
    } else {
      paneMouseDownPos = null
    }
  }
  const onMouseUp = (event: MouseEvent) => {
    if (!paneMouseDownPos) return
    const dx = event.clientX - paneMouseDownPos.x
    const dy = event.clientY - paneMouseDownPos.y
    paneMouseDownPos = null
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) return
    const target = event.target as HTMLElement
    if (
      target.closest('.bf-flow__node') ||
      target.closest('.bf-flow__handle') ||
      target.closest('.bf-flow__edge, [data-hit-id]')
    )
      return
    store.unselectNodesAndEdges()
    if (store.onPaneClick) {
      store.onPaneClick(event)
    }
  }
  const onMouseMove = (event: MouseEvent) => {
    if (store.onPaneMouseMove) {
      store.onPaneMouseMove(event)
    }
  }
  el.addEventListener('mousedown', onMouseDown, true)
  el.addEventListener('mouseup', onMouseUp, true)
  el.addEventListener('mousemove', onMouseMove)
  onCleanup(() => {
    el.removeEventListener('mousedown', onMouseDown, true)
    el.removeEventListener('mouseup', onMouseUp, true)
    el.removeEventListener('mousemove', onMouseMove)
  })

  // Delegated single-node drag. The cutover-step C4 XYDrag integration
  // will eventually replace this with multi-select / snap / extent
  // support, but a Flow that does not let users move nodes is a poor
  // default — wire a minimal pointer-paced handler so the JSX renderer
  // is interactive out of the box.
  let dragState: {
    nodeId: string
    pointerId: number
    startClientX: number
    startClientY: number
    startNodeX: number
    startNodeY: number
    captureEl: HTMLElement
  } | null = null

  const onNodePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    if (!untrack(store.nodesDraggable)) return
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.closest('.bf-flow__handle')) return
    if (target.closest('.nodrag')) return
    const nodeEl = target.closest<HTMLElement>('.bf-flow__node')
    if (!nodeEl || !el.contains(nodeEl)) return
    const nodeId = nodeEl.dataset.id
    if (!nodeId) return
    const internal = untrack(store.nodeLookup).get(nodeId)
    if (!internal) return

    event.stopPropagation()

    dragState = {
      nodeId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startNodeX: internal.position.x,
      startNodeY: internal.position.y,
      captureEl: nodeEl,
    }
    nodeEl.setPointerCapture?.(event.pointerId)
    store.setDragging(true)
  }
  // Push the new position straight onto the nodes signal so JSX
  // consumers (NodeWrapper's `transform` memo, edge path memos) see a
  // fresh node object each frame. `updateNodePositions` alone only
  // mutates the `internals.positionAbsolute` reference and bumps
  // `positionEpoch`, but barefoot signals dedupe on Object.is — the
  // downstream `transform` memo therefore wouldn't re-render.
  const writeDragPosition = (nodeId: string, x: number, y: number, isDragging: boolean) => {
    const currentNodes = untrack(store.nodes)
    let changed = false
    const next = currentNodes.map((n) => {
      if (n.id !== nodeId) return n
      const prev = n.position
      if (prev.x === x && prev.y === y) return n
      changed = true
      return { ...n, position: { x, y } }
    })
    if (changed) store.setNodes(next)
    store.setDragging(isDragging)
  }

  const onNodePointerMove = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    const zoom = untrack(store.viewport).zoom || 1
    const dx = (event.clientX - dragState.startClientX) / zoom
    const dy = (event.clientY - dragState.startClientY) / zoom
    // Clamp child nodes that opt in via `extent: 'parent'`. Done in the
    // relative coordinate the drag handler already manipulates, so the
    // commit shape (`writeDragPosition` → `setNodes` → `adoptUserNodes`)
    // stays unchanged.
    const clamped = clampDragPositionToParent(
      { x: dragState.startNodeX + dx, y: dragState.startNodeY + dy },
      dragState.nodeId,
      untrack(store.nodeLookup),
    )
    writeDragPosition(dragState.nodeId, clamped.x, clamped.y, true)
  }
  const onNodePointerUp = (event: PointerEvent) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    const captureEl = dragState.captureEl
    captureEl.releasePointerCapture?.(event.pointerId)
    const finalNodeId = dragState.nodeId
    dragState = null
    // Final commit clears the dragging flag without changing the
    // position; reuse writeDragPosition for the same code path.
    const lookup = untrack(store.nodeLookup)
    const internal = lookup.get(finalNodeId)
    if (internal) {
      writeDragPosition(finalNodeId, internal.position.x, internal.position.y, false)
    } else {
      store.setDragging(false)
    }
  }
  el.addEventListener('pointerdown', onNodePointerDown)
  el.addEventListener('pointermove', onNodePointerMove)
  el.addEventListener('pointerup', onNodePointerUp)
  el.addEventListener('pointercancel', onNodePointerUp)
  onCleanup(() => {
    el.removeEventListener('pointerdown', onNodePointerDown)
    el.removeEventListener('pointermove', onNodePointerMove)
    el.removeEventListener('pointerup', onNodePointerUp)
    el.removeEventListener('pointercancel', onNodePointerUp)
  })

  // Edge path keep-in-sync. The SimpleEdge component owns a memo over
  // `pathD()` that should re-run on `positionEpoch()` / `nodes()`
  // changes, but barefoot's signal dedupe (Object.is on the cached
  // string) plus the fact that node measurement and drag mutate
  // `internal.measured` / `internal.positionAbsolute` *in place*
  // (without producing a fresh wrapper object the lookup signal
  // notices) means the edge's `d` attribute can stick at its first
  // computed value. Walk the SVG edges from a top-level effect that
  // tracks `positionEpoch` + `nodes` / `edges` and write `d`
  // directly — this is the load-bearing path for both initial measure
  // and drag.
  createEffect(() => {
    store.positionEpoch()
    const currentEdges = store.edges()
    // `nodeLookup()` now emits a fresh `Map` reference on every
    // setNodes-driven change (see #1270), so the previous
    // `store.nodes()` wake-up call is no longer needed here.
    const lookup = store.nodeLookup()
    const edgesSvg = el.querySelector('.bf-flow__edges')
    if (!edgesSvg) return
    for (const edge of currentEdges) {
      const sourceNode = lookup.get(edge.source)
      const targetNode = lookup.get(edge.target)
      if (!sourceNode || !targetNode) continue
      const pos = computeEdgePosition(edge, sourceNode, targetNode)
      if (!pos) continue
      const result = getEdgePath(edge, pos)
      if (!result) continue
      const d = result[0]
      const paths = edgesSvg.querySelectorAll<SVGPathElement>(
        `path[data-id="${edge.id}"], path[data-hit-id="${edge.id}"]`,
      )
      for (const p of paths) {
        if (p.getAttribute('d') !== d) p.setAttribute('d', d)
      }
    }
  })

  // onInit lifecycle callback fires once the subsystems are wired and
  // the store is ready. Mirrors initFlow's existing semantics.
  if (typeof props.onInit === 'function') {
    props.onInit(store)
  }
}

/**
 * Inject default CSS styles for xyflow components. Idempotent — first
 * call inserts a `<style id="bf-flow-styles">`; subsequent calls
 * (e.g. multiple `<Flow>` instances on one page) early-return.
 */
function injectDefaultStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById('bf-flow-styles')) return

  const style = document.createElement('style')
  style.id = 'bf-flow-styles'
  style.textContent = DEFAULT_STYLES
  document.head.appendChild(style)
}

// Default styles use design-system CSS variables (with hard-coded
// fallbacks for environments that don't define them, e.g. raw <Flow>
// usage outside a themed shell). Handle placement is driven by the
// `data-handlepos` attribute the JSX <Handle> already emits, so the
// `position` prop drives where each handle sits regardless of whether
// the inline style on the element ever lands (the barefoot compiler
// currently strips dynamic-string `style={memo()}` props on JSX
// components, so attribute-driven CSS is the load-bearing path).
const DEFAULT_STYLES = `
.bf-flow__node {
  padding: 10px 24px;
  border: 2px solid var(--foreground, #1a192b);
  border-radius: 6px;
  background-color: var(--card, #fff);
  color: var(--card-foreground, #222);
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  cursor: grab;
  user-select: none;
  box-sizing: border-box;
}
.bf-flow__node--custom { border: none; background: transparent; padding: 0; border-radius: 0; }
.bf-flow__node--custom.bf-flow__node--selected { box-shadow: none; }
.bf-flow__node--selected { box-shadow: 0 0 0 1px var(--ring, #1a192b); }
.bf-flow__handle {
  position: absolute;
  width: 8px; height: 8px;
  border-radius: 50%;
  background-color: var(--primary, #1a192b);
  cursor: crosshair;
  pointer-events: all;
  z-index: 1;
}
/* Negative offset compensates for the node's 2px border:
   .bf-flow__node uses border-box, but absolutely-positioned children
   resolve against the padding box, so top/left:0 lands inside the
   border. Pulling each side by -2px snaps the handle's transform-
   centred dot to the visible outer edge of the node. */
.bf-flow__handle[data-handlepos="top"]    { top: -2px;    left: 50%; transform: translate(-50%, -50%); }
.bf-flow__handle[data-handlepos="bottom"] { bottom: -2px; left: 50%; transform: translate(-50%, 50%); }
.bf-flow__handle[data-handlepos="left"]   { left: -2px;   top: 50%;  transform: translate(-50%, -50%); }
.bf-flow__handle[data-handlepos="right"]  { right: -2px;  top: 50%;  transform: translate(50%, -50%); }
.bf-flow__handle:hover { width: 10px; height: 10px; }
.bf-flow__handle.valid   { background-color: #22c55e; }
.bf-flow__handle.invalid { background-color: #ef4444; }
.bf-flow__edge { fill: none; stroke: var(--muted-foreground, #b1b1b7); stroke-width: 1.5; pointer-events: none; }
.bf-flow__edge--selected { stroke: var(--foreground, #555); stroke-width: 2; }
.bf-flow__edge--animated { stroke-dasharray: 5; animation: bf-dashdraw 0.5s linear infinite; }
@keyframes bf-dashdraw { from { stroke-dashoffset: 10; } }
.bf-flow__edge-reconnect { fill: transparent; stroke: transparent; cursor: move; pointer-events: all; }
path.bf-flow__edge.bf-flow__edge--reconnect-hover { stroke: var(--text-primary, #222); }
.bf-flow__controls-button:hover { background: var(--accent, #f4f4f4) !important; }
.bf-flow__controls-button:last-child { border-bottom: none !important; }
.bf-flow__edge-label {
  position: absolute; top: 0; left: 0; background: #fff;
  padding: 2px 4px; font-size: 11px; color: #222;
  white-space: nowrap; cursor: default;
}
.bf-flow__edge-toolbar {
  position: absolute; top: 0; left: 0;
  display: flex; gap: 4px; z-index: 10;
}
.bf-flow__edge-toolbar-button {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 4px; border: 1px solid #e2e2e2;
  background: #fff; color: #666; font-size: 14px; line-height: 1;
  cursor: pointer; padding: 0;
}
.bf-flow__edge-toolbar-button:hover { background: #fee; color: #c00; border-color: #c00; }
.bf-flow__selection {
  background: rgba(0, 89, 220, 0.08);
  border: 1px dashed rgba(0, 89, 220, 0.5);
  border-radius: 2px;
  pointer-events: none;
}
.bf-flow__node-resizer { position: absolute; inset: 0; pointer-events: none; }
.bf-flow__resize-handle { position: absolute; pointer-events: all; z-index: 10; }
.bf-flow__resize-handle--corner { width: 8px; height: 8px; background: var(--bf-resize-color, #4a90d9); border: none; border-radius: 0; }
.bf-flow__resize-handle--top-left { top: -4px; left: -4px; cursor: nwse-resize; }
.bf-flow__resize-handle--top-right { top: -4px; right: -4px; cursor: nesw-resize; }
.bf-flow__resize-handle--bottom-left { bottom: -4px; left: -4px; cursor: nesw-resize; }
.bf-flow__resize-handle--bottom-right { bottom: -4px; right: -4px; cursor: nwse-resize; }
.bf-flow__resize-handle--line { background: transparent; }
.bf-flow__resize-handle--line.bf-flow__resize-handle--top { top: -2px; left: 0; right: 0; height: 4px; cursor: ns-resize; }
.bf-flow__resize-handle--line.bf-flow__resize-handle--bottom { bottom: -2px; left: 0; right: 0; height: 4px; cursor: ns-resize; }
.bf-flow__resize-handle--line.bf-flow__resize-handle--left { left: -2px; top: 0; bottom: 0; width: 4px; cursor: ew-resize; }
.bf-flow__resize-handle--line.bf-flow__resize-handle--right { right: -2px; top: 0; bottom: 0; width: 4px; cursor: ew-resize; }
.bf-flow__resize-handle--line:hover { background: rgba(26, 25, 43, 0.1); }
.bf-flow__resize-handle--corner:hover { background: var(--bf-resize-color, #3a7bd5); }
.bf-flow__node--group {
  background-color: rgba(240, 240, 240, 0.7);
  border: 1px dashed #999;
  border-radius: 8px;
  padding: 40px 10px 10px 10px;
}
.bf-flow__node--child {
  /* Child nodes render above parents via z-index from @xyflow/system */
}
`

