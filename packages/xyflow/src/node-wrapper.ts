import {
  createRoot,
  createEffect,
  onCleanup,
  untrack,
} from '@barefootjs/dom'
import { updateNodeInternals, XYDrag } from '@xyflow/system'
import type {
  NodeBase,
  InternalNodeBase,
  InternalNodeUpdate,
} from '@xyflow/system'
import { setupNodeSelection } from './selection'
import type { FlowStore } from './types'

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
    element.className = 'bf-flow__node'
    element.dataset.id = internalNode.id
    element.style.position = 'absolute'
    element.style.transformOrigin = '0 0'

    // Render content
    renderNodeContent(element, internalNode)

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
      const dragInstance = XYDrag({
        getStoreItems: () => ({
          nodes: untrack(store.nodes),
          nodeLookup: untrack(store.nodeLookup),
          edges: untrack(store.edges),
          nodeExtent: store.nodeExtent,
          snapGrid: store.snapGrid,
          snapToGrid: store.snapToGrid,
          nodeOrigin: store.nodeOrigin,
          multiSelectionActive: untrack(store.multiSelectionActive),
          domNode: untrack(store.domNode) ?? undefined,
          transform: store.getTransform(),
          autoPanOnNodeDrag: true,
          nodesDraggable: true,
          selectNodesOnDrag: true,
          nodeDragThreshold: 1,
          panBy: store.panByDelta,
          unselectNodesAndEdges: store.unselectNodesAndEdges as any,
          updateNodePositions: store.updateNodePositions as any,
        }),
      })

      // Attach drag to this node's DOM element
      dragInstance.update({
        domNode: element,
        nodeId: internalNode.id,
        isSelectable: internalNode.selectable !== false,
        noDragClassName: 'nodrag',
      })

      onCleanup(() => dragInstance.destroy())
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
 * Render default node content (label or id).
 * Custom node types will override this via the nodeTypes mechanism.
 */
function renderNodeContent<NodeType extends NodeBase>(
  el: HTMLElement,
  node: InternalNodeBase<NodeType>,
): void {
  el.style.padding = '10px 20px'
  el.style.border = '1px solid #1a192b'
  el.style.borderRadius = '3px'
  el.style.backgroundColor = '#fff'
  el.style.fontSize = '12px'
  el.style.color = '#222'
  el.style.cursor = 'grab'
  el.style.userSelect = 'none'

  const data = node.internals.userNode.data as Record<string, unknown>
  const label = data?.label ?? node.id
  el.textContent = String(label)
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
