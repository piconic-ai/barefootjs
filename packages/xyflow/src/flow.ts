import {
  createEffect,
  onCleanup,
  untrack,
} from '@barefootjs/client'
import { provideContext } from '@barefootjs/client-runtime'
import { XYPanZoom, PanOnScrollMode } from '@xyflow/system'
import type {
  Viewport,
  Transform,
} from '@xyflow/system'

import { createFlowStore } from './store'
import { FlowContext } from './context'
import { createNodeRenderer } from './node-wrapper'
import { createEdgeRenderer, createEdgeLabelRenderer } from './edge-renderer'
import { setupKeyboardHandlers, setupSelectionRectangle } from './selection'
import { INFINITE_EXTENT, SVG_NS } from './constants'
import type { FlowProps } from './types'

/**
 * Initialize a xyflow instance on the given scope element.
 *
 * Creates the DOM structure, sets up pan/zoom via @xyflow/system,
 * and reactively renders nodes.
 */
export function initFlow(scope: Element, props: Record<string, unknown>): void {
  const el = scope as HTMLElement
  const flowProps = props as unknown as FlowProps

  const store = createFlowStore(flowProps)

  provideContext(FlowContext, store)
  injectDefaultStyles()

  el.style.position = 'relative'
  el.style.overflow = 'hidden'

  // Viewport wrapper — transformed by pan/zoom
  const viewportEl = document.createElement('div')
  viewportEl.className = 'bf-flow__viewport'
  viewportEl.style.position = 'absolute'
  viewportEl.style.top = '0'
  viewportEl.style.left = '0'
  viewportEl.style.width = '100%'
  viewportEl.style.height = '100%'
  viewportEl.style.transformOrigin = '0 0'

  // Edges layer (SVG, rendered below nodes)
  const edgesSvg = document.createElementNS(SVG_NS, 'svg')
  edgesSvg.setAttribute('class', 'bf-flow__edges')
  edgesSvg.style.position = 'absolute'
  edgesSvg.style.top = '0'
  edgesSvg.style.left = '0'
  edgesSvg.style.width = '100%'
  edgesSvg.style.height = '100%'
  edgesSvg.style.overflow = 'visible'
  // SVG container allows pointer events — hit areas on edges need them.
  // Visible edge paths have pointer-events: none; only hit areas respond.
  viewportEl.appendChild(edgesSvg)

  // Nodes container
  const nodesEl = document.createElement('div')
  nodesEl.className = 'bf-flow__nodes'
  nodesEl.style.position = 'absolute'
  nodesEl.style.top = '0'
  nodesEl.style.left = '0'
  viewportEl.appendChild(nodesEl)

  el.appendChild(viewportEl)

  store.setDomNode(el)

  // Set initial dimensions immediately (ResizeObserver callback is async)
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

  panZoomInstance.update({
    noWheelClassName: 'nowheel',
    noPanClassName: 'nopan',
    preventScrolling: true,
    panOnScroll: flowProps.panOnScroll ?? false,
    panOnDrag: flowProps.panOnDrag ?? true,
    panOnScrollMode: PanOnScrollMode.Free,
    panOnScrollSpeed: 0.5,
    userSelectionActive: false,
    zoomOnPinch: true,
    zoomOnScroll: flowProps.zoomOnScroll ?? true,
    zoomOnDoubleClick: flowProps.zoomOnDoubleClick ?? true,
    zoomActivationKeyPressed: false,
    lib: 'bf',
    onTransformChange: (transform: Transform) => {
      store.setViewport({ x: transform[0], y: transform[1], zoom: transform[2] })
    },
    connectionInProgress: false,
    paneClickDistance: 0,
  })

  onCleanup(() => panZoomInstance.destroy())

  // Zoom activation key: when held, scroll zooms instead of panning
  const zoomKeyCode = flowProps.zoomActivationKeyCode as string | null | undefined
  if (zoomKeyCode) {
    let zoomKeyPressed = false
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === zoomKeyCode && !zoomKeyPressed) {
        zoomKeyPressed = true
        panZoomInstance.update({
          noWheelClassName: 'nowheel',
          noPanClassName: 'nopan',
          preventScrolling: true,
          panOnScroll: flowProps.panOnScroll ?? false,
          panOnDrag: flowProps.panOnDrag ?? true,
          panOnScrollMode: PanOnScrollMode.Free,
          panOnScrollSpeed: 0.5,
          userSelectionActive: false,
          zoomOnPinch: true,
          zoomOnScroll: flowProps.zoomOnScroll ?? true,
          zoomOnDoubleClick: flowProps.zoomOnDoubleClick ?? true,
          zoomActivationKeyPressed: true,
          lib: 'bf',
          onTransformChange: (transform: Transform) => {
            store.setViewport({ x: transform[0], y: transform[1], zoom: transform[2] })
          },
          connectionInProgress: false,
          paneClickDistance: 0,
        })
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === zoomKeyCode && zoomKeyPressed) {
        zoomKeyPressed = false
        panZoomInstance.update({
          noWheelClassName: 'nowheel',
          noPanClassName: 'nopan',
          preventScrolling: true,
          panOnScroll: flowProps.panOnScroll ?? false,
          panOnDrag: flowProps.panOnDrag ?? true,
          panOnScrollMode: PanOnScrollMode.Free,
          panOnScrollSpeed: 0.5,
          userSelectionActive: false,
          zoomOnPinch: true,
          zoomOnScroll: flowProps.zoomOnScroll ?? true,
          zoomOnDoubleClick: flowProps.zoomOnDoubleClick ?? true,
          zoomActivationKeyPressed: false,
          lib: 'bf',
          onTransformChange: (transform: Transform) => {
            store.setViewport({ x: transform[0], y: transform[1], zoom: transform[2] })
          },
          connectionInProgress: false,
          paneClickDistance: 0,
        })
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    })
  }

  createEffect(() => {
    const vp = store.viewport()
    viewportEl.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`
  })

  createNodeRenderer(store, nodesEl)
  createEdgeRenderer(store, edgesSvg)
  createEdgeLabelRenderer(store, viewportEl)
  setupKeyboardHandlers(store, el)
  setupSelectionRectangle(store, el, {
    selectionOnDrag: flowProps.selectionOnDrag,
    selectionMode: flowProps.selectionMode,
  })

  el.addEventListener('click', (event) => {
    if (event.target === el || event.target === viewportEl) {
      store.unselectNodesAndEdges()
    }
  })

  // Call onInit callback immediately after flow is set up
  if (typeof flowProps.onInit === 'function') {
    flowProps.onInit(store)
  }

  // fitView is handled by the caller (DeskCanvas) after nodes are loaded
  // via queueMicrotask to avoid effect depth issues
}

/**
 * Inject default CSS styles for xyflow components.
 * Uses CSS classes so users can override with their own styles.
 * Called once per page (idempotent via ID check).
 */
function injectDefaultStyles() {
  if (document.getElementById('bf-flow-styles')) return

  const style = document.createElement('style')
  style.id = 'bf-flow-styles'
  style.textContent = `
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
    .bf-flow__node--custom {
      border: none;
      background: transparent;
      padding: 0;
      border-radius: 0;
    }
    .bf-flow__node--custom.bf-flow__node--selected {
      box-shadow: none;
    }
    .bf-flow__node--selected {
      box-shadow: 0 0 0 0.5px #1a192b;
    }
    .bf-flow__handle {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: #1a192b;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      cursor: crosshair;
      pointer-events: all;
    }
    .bf-flow__handle:hover { width: 10px; height: 10px; transform: translateX(-50%); }
    .bf-flow__handle--target { top: -3px; }
    .bf-flow__handle--target:hover { top: -5px; }
    .bf-flow__handle--source { bottom: -3px; }
    .bf-flow__handle--source:hover { bottom: -5px; }
    .bf-flow__handle.valid { background-color: #22c55e; border-color: #16a34a; width: 10px; height: 10px; }
    .bf-flow__handle.invalid { background-color: #ef4444; border-color: #dc2626; width: 10px; height: 10px; }
    .bf-flow__edge { fill: none; stroke: var(--edge-user, #d29922); stroke-width: 2; pointer-events: none; }
    .bf-flow__edge--selected { stroke: var(--edge-user, #d29922); stroke-width: 3; }
    .bf-flow__edge--animated { stroke-dasharray: 5; animation: bf-dashdraw 0.5s linear infinite; }
    @keyframes bf-dashdraw { from { stroke-dashoffset: 10; } }
    .bf-flow__edge-reconnect { fill: transparent; stroke: transparent; cursor: move; pointer-events: all; }
    path.bf-flow__edge.bf-flow__edge--reconnect-hover { stroke: var(--text-primary, #222); }
    .bf-flow__controls-button:hover { background: #f4f4f4 !important; }
    .bf-flow__controls-button:last-child { border-bottom: none !important; }
    .bf-flow__edge-label {
      position: absolute;
      top: 0;
      left: 0;
      background: #fff;
      padding: 2px 4px;
      font-size: 11px;
      color: #222;
      white-space: nowrap;
      cursor: default;
    }
    .bf-flow__edge-toolbar {
      position: absolute;
      top: 0;
      left: 0;
      display: flex;
      gap: 4px;
      z-index: 10;
    }
    .bf-flow__edge-toolbar-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      border: 1px solid #e2e2e2;
      background: #fff;
      color: #666;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
    }
    .bf-flow__edge-toolbar-button:hover {
      background: #fee;
      color: #c00;
      border-color: #c00;
    }
    .bf-flow__selection {
      background: rgba(0, 89, 220, 0.08);
      border: 1px dashed rgba(0, 89, 220, 0.5);
      border-radius: 2px;
      pointer-events: none;
    }
    .bf-flow__node-resizer {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .bf-flow__resize-handle {
      position: absolute;
      pointer-events: all;
      z-index: 10;
    }
    .bf-flow__resize-handle--corner {
      width: 8px;
      height: 8px;
      background: var(--bf-resize-color, #4a90d9);
      border: none;
      border-radius: 0;
    }
    .bf-flow__resize-handle--top-left {
      top: -4px;
      left: -4px;
      cursor: nwse-resize;
    }
    .bf-flow__resize-handle--top-right {
      top: -4px;
      right: -4px;
      cursor: nesw-resize;
    }
    .bf-flow__resize-handle--bottom-left {
      bottom: -4px;
      left: -4px;
      cursor: nesw-resize;
    }
    .bf-flow__resize-handle--bottom-right {
      bottom: -4px;
      right: -4px;
      cursor: nwse-resize;
    }
    .bf-flow__resize-handle--line {
      background: transparent;
    }
    .bf-flow__resize-handle--line.bf-flow__resize-handle--top {
      top: -2px;
      left: 0;
      right: 0;
      height: 4px;
      cursor: ns-resize;
    }
    .bf-flow__resize-handle--line.bf-flow__resize-handle--bottom {
      bottom: -2px;
      left: 0;
      right: 0;
      height: 4px;
      cursor: ns-resize;
    }
    .bf-flow__resize-handle--line.bf-flow__resize-handle--left {
      left: -2px;
      top: 0;
      bottom: 0;
      width: 4px;
      cursor: ew-resize;
    }
    .bf-flow__resize-handle--line.bf-flow__resize-handle--right {
      right: -2px;
      top: 0;
      bottom: 0;
      width: 4px;
      cursor: ew-resize;
    }
    .bf-flow__resize-handle--line:hover {
      background: rgba(26, 25, 43, 0.1);
    }
    .bf-flow__resize-handle--corner:hover {
      background: var(--bf-resize-color, #3a7bd5);
    }
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
  document.head.appendChild(style)
}
