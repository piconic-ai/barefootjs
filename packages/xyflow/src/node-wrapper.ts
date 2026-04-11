import {
  createRoot,
  createEffect,
  onCleanup,
  untrack,
} from '@barefootjs/client'
import { updateNodeInternals } from '@xyflow/system'
import type {
  NodeBase,
  InternalNodeBase,
  InternalNodeUpdate,
} from '@xyflow/system'
import { render } from '@barefootjs/client-runtime'
import type { ComponentDef } from '@barefootjs/client-runtime'
import { setupNodeSelection } from './selection'
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

    // Render content (custom type or default)
    renderNodeContent(element, internalNode, store)

    // Append to container
    nodesContainer.appendChild(element)

    // ResizeObserver for dimension measurement
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width === 0 && height === 0) continue

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
      }
    })
    resizeObserver.observe(element)
    onCleanup(() => resizeObserver.disconnect())

    // --- Click-to-select ---
    setupNodeSelection(element, internalNode.id, store)

    // --- XYDrag integration ---
    const isDraggable = internalNode.draggable !== false

    if (isDraggable) {
      // Native drag implementation — D3 drag's event system doesn't
      // integrate well with our DOM structure (XYDrag's d3Selection.call
      // doesn't fire handlers reliably outside React's synthetic events).
      let dragging = false
      let startMouseX = 0
      let startMouseY = 0
      let startNodeX = 0
      let startNodeY = 0
      let currentX = 0
      let currentY = 0
      let rafId = 0

      const onMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return // left button only
        e.stopPropagation() // prevent D3 zoom pan

        startMouseX = e.clientX
        startMouseY = e.clientY

        const lookup = untrack(store.nodeLookup)
        const node = lookup.get(internalNode.id)
        if (node) {
          startNodeX = node.internals.positionAbsolute.x
          startNodeY = node.internals.positionAbsolute.y
        }

        dragging = true
        element.style.cursor = 'grabbing'

        // Select this node
        store.unselectNodesAndEdges()
        store.setNodes((prev) =>
          prev.map((n) =>
            n.id === internalNode.id ? { ...n, selected: true } : n,
          ),
        )

        const onMouseMove = (e: MouseEvent) => {
          if (!dragging) return

          const [, , scale] = store.getTransform()
          const dx = (e.clientX - startMouseX) / scale
          const dy = (e.clientY - startMouseY) / scale

          const newX = startNodeX + dx
          const newY = startNodeY + dy

          currentX = newX
          currentY = newY

          // Update DOM directly for immediate visual feedback
          element.style.transform = `translate(${newX}px, ${newY}px)`

          // Update internal state
          const lookup = untrack(store.nodeLookup)
          const node = lookup.get(internalNode.id)
          if (node) {
            node.internals.positionAbsolute = { x: newX, y: newY }
            node.internals.userNode.position = { x: newX, y: newY }
          }

          // Trigger edge re-render via rAF-throttled setNodes
          if (!rafId) {
            rafId = requestAnimationFrame(() => {
              rafId = 0
              store.setNodes((prev) =>
                prev.map((n) =>
                  n.id === internalNode.id
                    ? { ...n, position: { x: currentX, y: currentY } }
                    : n,
                ),
              )
            })
          }
        }

        const onMouseUp = (e: MouseEvent) => {
          dragging = false
          element.style.cursor = 'grab'
          if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }

          const [, , scale] = store.getTransform()
          const dx = (e.clientX - startMouseX) / scale
          const dy = (e.clientY - startMouseY) / scale
          const finalX = startNodeX + dx
          const finalY = startNodeY + dy

          // Commit final position to store (triggers edge re-render etc.)
          store.setNodes((prev) =>
            prev.map((n) =>
              n.id === internalNode.id
                ? { ...n, position: { x: finalX, y: finalY }, dragging: false }
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

    // Reactive position update
    createEffect(() => {
      const lookup = store.nodeLookup()
      const current = lookup.get(internalNode.id)
      if (!current) return

      const pos = current.internals.positionAbsolute
      element.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      element.style.zIndex = String(current.internals.z ?? 0)

      // Selection styling
      if (current.selected) {
        element.classList.add('bf-flow__node--selected')
      } else {
        element.classList.remove('bf-flow__node--selected')
      }
    })

    onCleanup(() => {
      element.remove()
    })
  })

  return { element, dispose: disposeRoot }
}

/**
 * Render node content — uses custom type if registered, otherwise default.
 */
function renderNodeContent<NodeType extends NodeBase>(
  el: HTMLElement,
  node: InternalNodeBase<NodeType>,
  store: FlowStore<NodeType>,
): void {
  const nodeType = (node.internals.userNode as any).type as string | undefined
  const customType = nodeType && store.nodeTypes?.[nodeType]

  if (customType) {
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

    if (typeof customType === 'function') {
      // Plain init function
      customType(nodeProps)
    } else {
      // ComponentDef — render via CSR
      const contentEl = document.createElement('div')
      contentEl.className = 'bf-flow__node-content'
      el.appendChild(contentEl)
      render(contentEl, customType as ComponentDef, nodeProps as unknown as Record<string, unknown>)
    }

    el.style.cursor = 'grab'
    el.style.userSelect = 'none'
    return
  }

  // Default rendering — match React Flow's default node style
  el.style.width = '150px'
  el.style.padding = '10px'
  el.style.border = '1px solid #1a192b'
  el.style.borderRadius = '5px'
  el.style.backgroundColor = '#fff'
  el.style.fontSize = '12px'
  el.style.color = '#222'
  el.style.textAlign = 'center'
  el.style.cursor = 'grab'
  el.style.userSelect = 'none'
  el.style.boxSizing = 'border-box'

  const data = node.internals.userNode.data as Record<string, unknown>
  const label = data?.label ?? node.id
  el.textContent = String(label)

  // Add default handles (source=bottom, target=top) to match React Flow
  const handleSize = 6
  const createDefaultHandle = (type: 'source' | 'target') => {
    const h = document.createElement('div')
    h.className = `bf-flow__handle bf-flow__handle--${type}`
    h.style.position = 'absolute'
    h.style.width = `${handleSize}px`
    h.style.height = `${handleSize}px`
    h.style.borderRadius = '50%'
    h.style.backgroundColor = '#1a192b'
    h.style.left = '50%'
    h.style.transform = 'translateX(-50%)'
    if (type === 'target') {
      h.style.top = `-${handleSize / 2}px`
    } else {
      h.style.bottom = `-${handleSize / 2}px`
    }
    el.appendChild(h)
  }
  createDefaultHandle('target')
  createDefaultHandle('source')
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
