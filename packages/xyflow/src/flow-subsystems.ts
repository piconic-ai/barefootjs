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

import { onCleanup, untrack } from '@barefootjs/client'
import { PanOnScrollMode, XYPanZoom } from '@xyflow/system'
import type { Transform, Viewport } from '@xyflow/system'
import { INFINITE_EXTENT } from './constants'
import { setupKeyboardHandlers, setupSelectionRectangle } from './selection'
import type { FlowProps, InternalFlowStore, NodeBase, EdgeBase } from './types'

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
  injectDefaultStyles(props.disableDefaultNodeStyles)

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
 *
 * Consumers can opt out of the per-node chrome (the `.bf-flow__node`
 * white background / border / padding / cursor / text styling) by
 * passing `disableDefaultNodeStyles: true` on the `<Flow>` props.
 * They still get the layout-critical resize-handle, edge, selection
 * rectangle, and group/child styles. Useful when each node renders
 * its own visuals (custom imperative renderers, JSX bridges, etc.) —
 * the consumer no longer has to:
 *
 *   - reach for `bf-flow__node--custom` (which a reactive className
 *     binding can blow away on re-render), or
 *   - inject a higher-specificity override `<style>` tag, or
 *   - pile on `:has([data-bf-bridge])` workarounds.
 */
function injectDefaultStyles(disableNodeStyles?: boolean) {
  if (typeof document === 'undefined') return
  const existing = document.getElementById('bf-flow-styles') as HTMLStyleElement | null
  if (existing) {
    // If a previous `<Flow>` injected the full chrome and a later one
    // asks to disable node styles, scope the disable to nodes inside
    // the new Flow instead of mutating the global stylesheet.
    return
  }
  const style = document.createElement('style')
  style.id = 'bf-flow-styles'
  style.textContent = disableNodeStyles ? STYLES_WITHOUT_NODE_CHROME : DEFAULT_STYLES
  document.head.appendChild(style)
}

const NODE_CHROME_STYLES = `
.bf-flow__node {
  padding: 10px;
  border: 1px solid #1a192b;
  border-radius: 5px;
  background-color: #fff;
  font-size: 12px;
  color: #222;
  text-align: center;
  cursor: grab;
  user-select: none;
  box-sizing: border-box;
}
.bf-flow__node--custom { border: none; background: transparent; padding: 0; border-radius: 0; }
.bf-flow__node--custom.bf-flow__node--selected { box-shadow: none; }
.bf-flow__node--selected { box-shadow: 0 0 0 0.5px #1a192b; }
`

const NODE_LAYOUT_STYLES = `
.bf-flow__node {
  user-select: none;
  box-sizing: border-box;
}
`

const COMMON_STYLES = `
.bf-flow__handle {
  width: 6px; height: 6px; border-radius: 50%; background-color: #1a192b;
  position: absolute; left: 50%; transform: translateX(-50%);
  cursor: crosshair; pointer-events: all;
}
.bf-flow__handle:hover { width: 10px; height: 10px; transform: translateX(-50%); }
.bf-flow__handle--target { top: -3px; }
.bf-flow__handle--target:hover { top: -5px; }
.bf-flow__handle--source { bottom: -3px; }
.bf-flow__handle--source:hover { bottom: -5px; }
.bf-flow__handle.valid { background-color: #22c55e; border-color: #16a34a; width: 10px; height: 10px; }
.bf-flow__handle.invalid { background-color: #ef4444; border-color: #dc2626; width: 10px; height: 10px; }
.bf-flow__edge { fill: none; stroke: #b1b1b7; stroke-width: 1; pointer-events: none; }
.bf-flow__edge--selected { stroke: #555; stroke-width: 2; }
.bf-flow__edge--animated { stroke-dasharray: 5; animation: bf-dashdraw 0.5s linear infinite; }
@keyframes bf-dashdraw { from { stroke-dashoffset: 10; } }
.bf-flow__edge-reconnect { fill: transparent; stroke: transparent; cursor: move; pointer-events: all; }
path.bf-flow__edge.bf-flow__edge--reconnect-hover { stroke: var(--text-primary, #222); }
.bf-flow__controls-button:hover { background: #f4f4f4 !important; }
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

const DEFAULT_STYLES = NODE_CHROME_STYLES + COMMON_STYLES
const STYLES_WITHOUT_NODE_CHROME = NODE_LAYOUT_STYLES + COMMON_STYLES

