import {
  createEffect,
  onCleanup,
  onMount,
  provideContext,
  untrack,
} from '@barefootjs/client-runtime'
import { XYPanZoom } from '@xyflow/system'
import type {
  Viewport,
  Transform,
} from '@xyflow/system'

import { createFlowStore } from './store'
import { FlowContext } from './context'
import { createNodeRenderer } from './node-wrapper'
import { createEdgeRenderer } from './edge-renderer'
import { setupKeyboardHandlers } from './selection'
import type { FlowProps, FlowStore } from './types'

/**
 * Initialize a xyflow instance on the given scope element.
 *
 * Creates the DOM structure, sets up pan/zoom via @xyflow/system,
 * and reactively renders nodes.
 */
export function initFlow(scope: Element, props: Record<string, unknown>): void {
  const el = scope as HTMLElement
  const flowProps = props as unknown as FlowProps

  // Create store with initial data
  const store = createFlowStore({
    nodes: flowProps.nodes,
    edges: flowProps.edges,
    defaultViewport: flowProps.defaultViewport,
    minZoom: flowProps.minZoom,
    maxZoom: flowProps.maxZoom,
    nodeOrigin: flowProps.nodeOrigin,
    nodeExtent: flowProps.nodeExtent,
    snapToGrid: flowProps.snapToGrid,
    snapGrid: flowProps.snapGrid,
    onConnect: flowProps.onConnect,
  })

  // Provide store via context for child components
  provideContext(FlowContext, store as FlowStore)

  // --- Inject default styles once ---
  injectDefaultStyles()

  // --- Build DOM structure ---
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
  const edgesSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
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

  // Store DOM reference
  ;(store as any).setDomNode(el)

  // --- Container dimensions ---
  // Set initial dimensions immediately (ResizeObserver callback is async)
  ;(store as any).setWidth(el.offsetWidth)
  ;(store as any).setHeight(el.offsetHeight)

  // Update on resize
  const resizeObserver = new ResizeObserver(() => {
    ;(store as any).setWidth(el.offsetWidth)
    ;(store as any).setHeight(el.offsetHeight)
  })
  resizeObserver.observe(el)
  onCleanup(() => resizeObserver.disconnect())

  // --- Initialize XYPanZoom ---
  const infiniteExtent: [[number, number], [number, number]] = [
    [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  ]

  const panZoomInstance = XYPanZoom({
    domNode: el,
    minZoom: store.minZoom,
    maxZoom: store.maxZoom,
    viewport: untrack(store.viewport),
    translateExtent: infiniteExtent,
    onDraggingChange: (isDragging: boolean) => {
      ;(store as any).setDragging(isDragging)
    },
    onPanZoom: (_event: MouseEvent | TouchEvent | null, vp: Viewport) => {
      store.setViewport(vp)
    },
    onPanZoomStart: undefined,
    onPanZoomEnd: undefined,
  })

  ;(store as any).setPanZoom(panZoomInstance)

  // Configure pan/zoom behavior
  panZoomInstance.update({
    noWheelClassName: 'nowheel',
    noPanClassName: 'nopan',
    preventScrolling: true,
    panOnScroll: false,
    panOnDrag: true,
    panOnScrollMode: 0 as any, // PanOnScrollMode.Free
    panOnScrollSpeed: 0.5,
    userSelectionActive: false,
    zoomOnPinch: true,
    zoomOnScroll: true,
    zoomOnDoubleClick: true,
    zoomActivationKeyPressed: false,
    lib: 'bf',
    onTransformChange: (transform: Transform) => {
      store.setViewport({ x: transform[0], y: transform[1], zoom: transform[2] })
    },
    connectionInProgress: false,
    paneClickDistance: 0,
  })

  onCleanup(() => panZoomInstance.destroy())

  // --- Reactive viewport transform ---
  createEffect(() => {
    const vp = store.viewport()
    viewportEl.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`
  })

  // --- Reactive node rendering (delegated to node-wrapper.ts) ---
  createNodeRenderer(store as FlowStore, nodesEl)

  // --- Reactive edge rendering (delegated to edge-renderer.ts) ---
  createEdgeRenderer(store as FlowStore, edgesSvg)

  // --- Keyboard handlers (delete, escape, shift for multi-select) ---
  setupKeyboardHandlers(store as FlowStore, el)

  // --- Click on pane to deselect ---
  el.addEventListener('click', (event) => {
    if (event.target === el || event.target === viewportEl) {
      store.unselectNodesAndEdges()
    }
  })

  // --- Fit view on mount if requested ---
  if (flowProps.fitView) {
    onMount(() => {
      // Wait for ResizeObserver to measure all nodes (needs 2+ frames)
      const tryFitView = (attempts = 0) => {
        requestAnimationFrame(() => {
          const lookup = store.nodeLookup()
          const allMeasured = [...lookup.values()].every(
            (n) => n.measured.width && n.measured.height,
          )
          if (allMeasured || attempts > 10) {
            store.fitView(flowProps.fitViewOptions)
          } else {
            tryFitView(attempts + 1)
          }
        })
      }
      tryFitView()
    })
  }
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
    }
    .bf-flow__handle--target { top: -3px; }
    .bf-flow__handle--source { bottom: -3px; }
    .bf-flow__edge { fill: none; stroke: #b1b1b7; stroke-width: 1; }
    .bf-flow__edge--animated { stroke-dasharray: 5; }
    .bf-flow__controls-button:hover { background: #f4f4f4 !important; }
    .bf-flow__controls-button:last-child { border-bottom: none !important; }
  `
  document.head.appendChild(style)
}
