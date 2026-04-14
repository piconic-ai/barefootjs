import {
  createRoot,
  createEffect,
  onCleanup,
  untrack,
} from '@barefootjs/client'
import { updateNodeInternals, updateAbsolutePositions, calcAutoPan, clampPositionToParent } from '@xyflow/system'
import type {
  NodeBase,
  InternalNodeBase,
  InternalNodeUpdate,
} from '@xyflow/system'
import { render } from '@barefootjs/client-runtime'
import type { ComponentDef } from '@barefootjs/client-runtime'
import { setupNodeSelection } from './selection'
import { attachConnectionHandler } from './connection'
import type { FlowStore, NodeComponentProps } from './types'

/**
 * Per-node reactive scope: manages a single node's DOM element,
 * position updates, dimension measurement, drag, and cleanup.
 */
export type NodeInstance = {
  element: HTMLElement
  dispose: () => void
}

/**
 * Create a node DOM element within its own reactive scope.
 * Returns the element and a dispose function.
 */
export function createNodeWrapper<NodeType extends NodeBase>(
  internalNode: InternalNodeBase<NodeType>,
  store: FlowStore<NodeType>,
  nodesContainer: HTMLElement,
): NodeInstance {
  let element!: HTMLElement
  let disposeRoot!: () => void

  createRoot((dispose) => {
    disposeRoot = dispose

    // Create node element
    element = document.createElement('div')
    // nopan prevents D3 zoom from panning when dragging on nodes
    // (nodrag is for child elements like inputs that shouldn't trigger drag)
    element.className = 'bf-flow__node nopan'
    element.dataset.id = internalNode.id
    element.style.position = 'absolute'
    element.style.transformOrigin = '0 0'
    element.style.pointerEvents = 'all'

    // Sub-flow classes: parent (group) nodes and child nodes
    const userNode = internalNode.internals.userNode
    const isParentNode = store.parentLookup().has(internalNode.id)
    const isChildNode = !!userNode.parentId
    if (isParentNode) {
      element.classList.add('bf-flow__node--group')
    }
    if (isChildNode) {
      element.classList.add('bf-flow__node--child')
    }

    // Toggle nopan class based on interactivity and draggability:
    // - nopan ON: D3 zoom won't pan when dragging on this node (node drag works)
    // - nopan OFF: D3 zoom pans (locked state, or non-draggable node)
    const isDraggable = internalNode.draggable !== false
    createEffect(() => {
      if (isDraggable && store.nodesDraggable()) {
        element.classList.add('nopan')
      } else {
        element.classList.remove('nopan')
      }
    })

    renderNodeContent(element, internalNode, store)
    nodesContainer.appendChild(element)

    // Set initial dimensions synchronously (ResizeObserver is async)
    internalNode.measured.width = element.offsetWidth
    internalNode.measured.height = element.offsetHeight

    // ResizeObserver for subsequent dimension changes
    const resizeObserver = new ResizeObserver(() => {
      // Use offsetWidth/offsetHeight (border-box) instead of contentRect
      // (content-box) for correct bounds calculation in fitViewport
      const width = element.offsetWidth
      const height = element.offsetHeight
      if (width === 0 && height === 0) return

      internalNode.measured.width = width
      internalNode.measured.height = height

      const updates = new Map<string, InternalNodeUpdate>()
      updates.set(internalNode.id, {
        id: internalNode.id,
        nodeElement: element as HTMLDivElement,
        force: false,
      })

      const lookup = store.nodeLookup()
      const parentLookup = store.parentLookup()

      updateNodeInternals(
        updates,
        lookup,
        parentLookup,
        store.domNode(),
        store.nodeOrigin,
        store.nodeExtent,
      )
    })
    resizeObserver.observe(element)
    onCleanup(() => resizeObserver.disconnect())

    setupNodeSelection(element, internalNode.id, store)

    if (isDraggable) {
      // Native drag implementation — D3 drag's event system doesn't
      // integrate well with our DOM structure (XYDrag's d3Selection.call
      // doesn't fire handlers reliably outside React's synthetic events).
      let dragging = false
      let startNodeX = 0
      let startNodeY = 0
      let rafId = 0
      let currentAbsX = 0
      let currentAbsY = 0
      let prevMouseX = 0
      let prevMouseY = 0

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return // left button only
        const draggable = untrack(store.nodesDraggable)
        if (!draggable) return // locked — let event bubble to D3 zoom for pan
        e.stopPropagation() // prevent D3 zoom pan (only when dragging nodes)

        prevMouseX = e.clientX
        prevMouseY = e.clientY

        const lookup = untrack(store.nodeLookup)
        const node = lookup.get(internalNode.id)
        if (node) {
          startNodeX = node.internals.positionAbsolute.x
          startNodeY = node.internals.positionAbsolute.y
          currentAbsX = startNodeX
          currentAbsY = startNodeY
        }

        dragging = true
        element.style.cursor = 'grabbing'
        const mw = internalNode.measured.width
        const mh = internalNode.measured.height

        // Select this node and focus container for keyboard events
        const container = untrack(store.domNode)
        if (container) container.focus()
        store.unselectNodesAndEdges()
        store.setNodes((prev) =>
          prev.map((n) =>
            n.id === internalNode.id ? { ...n, selected: true } : n,
          ),
        )

        // Auto-pan state: pan viewport when dragging near container edges
        let autoPanId = 0
        let lastMouseX = 0
        let lastMouseY = 0

        function updateNodePosition(newX: number, newY: number) {
          const lookup = untrack(store.nodeLookup)
          const node = lookup.get(internalNode.id)
          if (!node) return

          let absX = newX
          let absY = newY

          // Clamp child nodes within parent bounds when extent: 'parent'
          const userNode = node.internals.userNode
          if (userNode.parentId && userNode.extent === 'parent') {
            const parentNode = lookup.get(userNode.parentId)
            if (parentNode) {
              const clamped = clampPositionToParent(
                { x: absX, y: absY },
                { width: node.measured.width ?? 150, height: node.measured.height ?? 40 },
                parentNode,
              )
              absX = clamped.x
              absY = clamped.y
            }
          }

          element.style.transform = `translate(${absX}px, ${absY}px)`
          node.internals.positionAbsolute = { x: absX, y: absY }
          currentAbsX = absX
          currentAbsY = absY

          // Update relative position for child nodes
          if (userNode.parentId) {
            const parentNode = lookup.get(userNode.parentId)
            if (parentNode) {
              userNode.position = {
                x: absX - parentNode.internals.positionAbsolute.x,
                y: absY - parentNode.internals.positionAbsolute.y,
              }
            } else {
              userNode.position = { x: absX, y: absY }
            }
          } else {
            userNode.position = { x: absX, y: absY }
          }

          const parents = untrack(store.parentLookup)
          if (parents.has(internalNode.id)) {
            updateAbsolutePositions(lookup, parents, {
              nodeOrigin: store.nodeOrigin,
              nodeExtent: store.nodeExtent,
            })
          }

          if (!rafId) {
            rafId = requestAnimationFrame(() => {
              rafId = 0
              store.triggerPositionUpdate()
            })
          }
        }

        function autoPanTick() {
          if (!dragging) return
          const container = untrack(store.domNode)
          if (!container) return

          const containerBounds = container.getBoundingClientRect()
          const mousePos = { x: lastMouseX - containerBounds.left, y: lastMouseY - containerBounds.top }
          const [xMovement, yMovement] = calcAutoPan(mousePos, containerBounds)

          if (xMovement !== 0 || yMovement !== 0) {
            const [, , scale] = store.getTransform()

            store.panByDelta({ x: xMovement, y: yMovement })

            // Move node by the auto-pan delta (in flow space)
            updateNodePosition(currentAbsX - xMovement / scale, currentAbsY - yMovement / scale)
          }

          autoPanId = requestAnimationFrame(autoPanTick)
        }

        const onMouseMove = (e: MouseEvent) => {
          if (!dragging) return

          lastMouseX = e.clientX
          lastMouseY = e.clientY

          // Incremental delta from previous mouse position
          const [, , scale] = store.getTransform()
          const dx = (e.clientX - prevMouseX) / scale
          const dy = (e.clientY - prevMouseY) / scale
          prevMouseX = e.clientX
          prevMouseY = e.clientY

          updateNodePosition(currentAbsX + dx, currentAbsY + dy)

          // Start auto-pan loop if not already running
          if (!autoPanId) {
            autoPanId = requestAnimationFrame(autoPanTick)
          }
        }

        const onMouseUp = (e: MouseEvent) => {
          dragging = false
          element.style.cursor = 'grab'
          if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
          if (autoPanId) { cancelAnimationFrame(autoPanId); autoPanId = 0 }

          // Commit final position: use the clamped position from the last
          // updateNodePosition call (stored in internals.userNode.position).
          const lookup = untrack(store.nodeLookup)
          const finalNode = lookup.get(internalNode.id)
          const committedPos = finalNode?.internals.userNode.position ?? { x: currentAbsX, y: currentAbsY }

          store.setNodes((prev) =>
            prev.map((n) =>
              n.id === internalNode.id
                ? { ...n, position: committedPos, dragging: false, measured: { width: mw, height: mh } }
                : n,
            ),
          )

          document.removeEventListener('mousemove', onMouseMove)
          document.removeEventListener('mouseup', onMouseUp)
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
      }

      element.addEventListener('mousedown', onMouseDown)
      onCleanup(() => element.removeEventListener('mousedown', onMouseDown))
    }

    // Reactive position update — reads positionEpoch (bumped during drag)
    // and nodes() (bumped on structural changes like add/remove/select).
    // During drag only positionEpoch changes, so only this effect re-runs
    // — not the N other node effects that would fire from nodes().
    createEffect(() => {
      store.positionEpoch()
      store.nodes()
      const lookup = store.nodeLookup()
      const current = lookup.get(internalNode.id)
      if (!current) return

      const pos = current.internals.positionAbsolute
      element.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      element.style.zIndex = String(current.internals.z ?? 0)

      // Selection styling — toggle CSS class (styled via injected stylesheet)
      element.classList.toggle('bf-flow__node--selected', !!current.selected)

      // Sub-flow classes — update dynamically as parentLookup may change
      const parents = store.parentLookup()
      element.classList.toggle('bf-flow__node--group', parents.has(internalNode.id))
      element.classList.toggle('bf-flow__node--child', !!current.internals.userNode.parentId)
    })

    onCleanup(() => {
      element.remove()
    })
  })

  return { element, dispose: disposeRoot }
}

/**
 * Create a default handle element and attach connection handler.
 */
function createDefaultHandle<NodeType extends NodeBase>(
  parentEl: HTMLElement,
  nodeId: string,
  type: 'source' | 'target',
  store: FlowStore<NodeType>,
): HTMLElement {
  const h = document.createElement('div')
  h.className = `bf-flow__handle bf-flow__handle--${type}`
  h.dataset.handleType = type
  h.dataset.nodeId = nodeId
  parentEl.appendChild(h)

  // Attach connection drag handler
  const container = store.domNode()
  const edgesSvg = container?.querySelector('.bf-flow__edges') as SVGSVGElement | null
  if (container && edgesSvg) {
    attachConnectionHandler(h, nodeId, type, container, edgesSvg, store)
  }
  return h
}

/**
 * Render node content — uses custom type if registered, otherwise default.
 */
function renderNodeContent<NodeType extends NodeBase>(
  el: HTMLElement,
  node: InternalNodeBase<NodeType>,
  store: FlowStore<NodeType>,
): void {
  const nodeType = node.internals.userNode.type
  const customType = nodeType && store.nodeTypes?.[nodeType]

  if (customType) {
    // Reset default node styling for custom types
    el.classList.add('bf-flow__node--custom')

    // Build node component props
    const nodeProps: NodeComponentProps<NodeType> = {
      id: node.id,
      data: node.internals.userNode.data,
      type: nodeType,
      selected: node.selected ?? false,
      dragging: node.dragging ?? false,
      positionAbsoluteX: node.internals.positionAbsolute.x,
      positionAbsoluteY: node.internals.positionAbsolute.y,
      width: node.measured.width,
      height: node.measured.height,
      isConnectable: node.connectable !== false,
    }

    const isConnectable = node.connectable !== false

    // Render custom content
    const contentEl = document.createElement('div')
    contentEl.className = 'bf-flow__node-content'
    el.appendChild(contentEl)

    if (typeof customType === 'function') {
      // Plain init function — receives container element and props
      customType.call(contentEl, nodeProps)
    } else {
      // ComponentDef — render via CSR
      render(contentEl, customType as ComponentDef, nodeProps as unknown as Record<string, unknown>)
    }

    // Only add default handles if the custom component didn't create its own.
    // Custom nodes that call createHandle() are responsible for their own handles
    // (same behavior as React Flow custom nodes).
    const hasCustomHandles = el.querySelector('.bf-flow__handle') !== null
    if (isConnectable && !hasCustomHandles) {
      createDefaultHandle(el, node.id, 'target', store)
      createDefaultHandle(el, node.id, 'source', store)
    }

    el.style.cursor = 'grab'
    el.style.userSelect = 'none'
    return
  }

  // Default rendering — styled via injected CSS (.bf-flow__node class)
  // Group (parent) nodes get larger default size to contain children.
  // Use width/height from the node definition if provided, otherwise defaults.
  const parentLookup = store.parentLookup()
  const isGroup = parentLookup.has(node.id)
  const userNode = node.internals.userNode
  if (isGroup) {
    el.style.width = userNode.width ? `${userNode.width}px` : '300px'
    el.style.height = userNode.height ? `${userNode.height}px` : '200px'
  } else {
    el.style.width = userNode.width ? `${userNode.width}px` : '150px'
    if (userNode.height) el.style.height = `${userNode.height}px`
  }

  const data = node.internals.userNode.data as Record<string, unknown>
  const label = data?.label ?? node.id
  el.textContent = String(label)

  // Add default handles (source=bottom, target=top)
  // Styled via injected CSS (.bf-flow__handle class)
  createDefaultHandle(el, node.id, 'target', store)
  createDefaultHandle(el, node.id, 'source', store)
}

/**
 * Manages the set of node instances, creating/removing as the nodeLookup changes.
 */
export function createNodeRenderer<NodeType extends NodeBase>(
  store: FlowStore<NodeType>,
  nodesContainer: HTMLElement,
): void {
  const nodeInstances = new Map<string, NodeInstance>()

  createEffect(() => {
    // Read nodes() directly — nodesInitialized memo may return the same
    // boolean and skip notifying subscribers even when nodes changed
    store.nodes()
    store.nodesInitialized()

    const lookup = store.nodeLookup()
    const existingIds = new Set(nodeInstances.keys())

    for (const [id, internalNode] of lookup) {
      existingIds.delete(id)

      if (!nodeInstances.has(id)) {
        const instance = createNodeWrapper(
          internalNode as InternalNodeBase<NodeType>,
          store,
          nodesContainer,
        )
        nodeInstances.set(id, instance)
      }
    }

    for (const removedId of existingIds) {
      const instance = nodeInstances.get(removedId)
      if (instance) {
        instance.dispose()
        nodeInstances.delete(removedId)
      }
    }
  })

  onCleanup(() => {
    for (const instance of nodeInstances.values()) {
      instance.dispose()
    }
    nodeInstances.clear()
  })
}
