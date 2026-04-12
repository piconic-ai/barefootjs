import { onCleanup, untrack } from '@barefootjs/client'
import type { NodeBase, EdgeBase } from '@xyflow/system'
import type { FlowStore } from './types'

/**
 * Set up keyboard handlers for the flow container.
 * - Delete/Backspace: remove selected nodes and edges
 * - Escape: deselect all
 * - Shift: enable multi-selection
 */
export function setupKeyboardHandlers<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  store: FlowStore<NodeType, EdgeType>,
  container: HTMLElement,
): void {
  const storeAny = store as any

  function handleKeyDown(event: KeyboardEvent) {
    // Skip if target is an input/textarea
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!untrack(store.nodesDraggable)) return // locked
      const selectedNodes = untrack(store.nodes).filter((n) => n.selected)
      const selectedEdges = untrack(store.edges).filter((e) => e.selected)

      if (selectedNodes.length > 0 || selectedEdges.length > 0) {
        store.deleteElements({
          nodes: selectedNodes,
          edges: selectedEdges,
        })
        event.preventDefault()
      }
    }

    if (event.key === 'Escape') {
      store.unselectNodesAndEdges()
    }

    if (event.key === 'Shift') {
      storeAny.setMultiSelectionActive(true)
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      storeAny.setMultiSelectionActive(false)
    }
  }

  container.setAttribute('tabindex', '0')
  container.style.outline = 'none'
  container.addEventListener('keydown', handleKeyDown)
  container.addEventListener('keyup', handleKeyUp)

  onCleanup(() => {
    container.removeEventListener('keydown', handleKeyDown)
    container.removeEventListener('keyup', handleKeyUp)
  })
}

/**
 * Set up click-to-select on node elements.
 * Called from node-wrapper when creating each node.
 */
export function setupNodeSelection<NodeType extends NodeBase>(
  nodeElement: HTMLElement,
  nodeId: string,
  store: FlowStore<NodeType>,
): void {
  // Use mousedown instead of click — D3 zoom's mousedown handler on the
  // container calls stopImmediatePropagation, which prevents the native
  // click event from reaching the node element.
  nodeElement.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return

    const multiSelect = untrack(store.multiSelectionActive) || event.shiftKey

    if (!multiSelect) {
      // Deselect all, then select this one
      store.unselectNodesAndEdges()
    }

    // Focus the container so keyboard events (Delete) work
    const container = untrack(store.domNode)
    if (container) container.focus()

    // Toggle this node's selection
    store.setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? { ...n, selected: multiSelect ? !n.selected : true }
          : n,
      ),
    )
  })
}

/**
 * Set up click-to-select on edge SVG elements.
 */
export function setupEdgeSelection<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  edgeElement: SVGElement,
  edgeId: string,
  store: FlowStore<NodeType, EdgeType>,
): void {
  // Make edge clickable with a wider hit area
  edgeElement.style.pointerEvents = 'stroke'
  edgeElement.style.cursor = 'pointer'
  edgeElement.setAttribute('stroke-width', '10')
  edgeElement.setAttribute('stroke', 'transparent')

  edgeElement.addEventListener('click', (event) => {
    event.stopPropagation()

    const multiSelect = untrack(store.multiSelectionActive) || event.shiftKey

    if (!multiSelect) {
      store.unselectNodesAndEdges()
    }

    store.setEdges((prev) =>
      prev.map((e) =>
        e.id === edgeId
          ? { ...e, selected: multiSelect ? !e.selected : true }
          : e,
      ),
    )
  })
}
