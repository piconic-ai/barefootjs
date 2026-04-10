import {
  createEffect,
  onCleanup,
  onMount,
  provideContext,
  untrack,
} from '@barefootjs/dom'
import { XYPanZoom } from '@xyflow/system'
import type {
  Viewport,
  InternalNodeBase,
  NodeBase,
  Transform,
} from '@xyflow/system'

import { createFlowStore } from './store'
import { FlowContext } from './context'
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

  // --- Build DOM structure ---
  el.style.position = 'relative'
  el.style.overflow = 'hidden'
  // Ensure the container has dimensions
  if (!el.style.width) el.style.width = '100%'
  if (!el.style.height) el.style.height = '100%'

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
  edgesSvg.style.pointerEvents = 'none'
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

  // --- ResizeObserver for container dimensions ---
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      ;(store as any).setWidth(width)
      ;(store as any).setHeight(height)
    }
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
    noPanClassName: 'nodrag',
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

  // --- Reactive node rendering ---
  // Track which node DOM elements exist
  const nodeElements = new Map<string, HTMLElement>()

  createEffect(() => {
    // Read nodesInitialized to ensure nodes are processed
    store.nodesInitialized()

    const lookup = store.nodeLookup()
    const existingIds = new Set(nodeElements.keys())

    // Create or update nodes
    for (const [id, internalNode] of lookup) {
      existingIds.delete(id)

      let nodeEl = nodeElements.get(id)
      if (!nodeEl) {
        // Create new node element
        nodeEl = document.createElement('div')
        nodeEl.className = 'bf-flow__node'
        nodeEl.dataset.id = id
        nodeEl.style.position = 'absolute'
        nodeEl.style.transformOrigin = '0 0'
        nodesEl.appendChild(nodeEl)
        nodeElements.set(id, nodeEl)

        // Render default node content
        renderDefaultNode(nodeEl, internalNode)
      }

      // Update position
      const pos = internalNode.internals.positionAbsolute
      nodeEl.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      nodeEl.style.zIndex = String(internalNode.internals.z ?? 0)
    }

    // Remove nodes that no longer exist
    for (const removedId of existingIds) {
      const el = nodeElements.get(removedId)
      if (el) {
        el.remove()
        nodeElements.delete(removedId)
      }
    }
  })

  // --- Fit view on mount if requested ---
  if (flowProps.fitView) {
    onMount(() => {
      // Wait for dimensions to be measured
      requestAnimationFrame(() => {
        store.fitView(flowProps.fitViewOptions)
      })
    })
  }
}

/**
 * Render default node content (simple box with label).
 */
function renderDefaultNode(el: HTMLElement, node: InternalNodeBase<NodeBase>): void {
  el.style.padding = '10px 20px'
  el.style.border = '1px solid #1a192b'
  el.style.borderRadius = '3px'
  el.style.backgroundColor = '#fff'
  el.style.fontSize = '12px'
  el.style.color = '#222'
  el.style.cursor = 'default'
  el.style.userSelect = 'none'

  const data = node.internals.userNode.data as Record<string, unknown>
  const label = data?.label ?? node.internals.userNode.id
  el.textContent = String(label)

  // Set measured dimensions
  if (!node.measured.width) {
    node.measured.width = el.offsetWidth || 150
    node.measured.height = el.offsetHeight || 40
  }
}
