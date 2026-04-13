import { onCleanup, untrack } from '@barefootjs/client'
import type { NodeBase, EdgeBase, InternalNodeBase, Transform } from '@xyflow/system'
import type { FlowStore, InternalFlowStore, SelectionMode } from './types'

/**
 * Set up keyboard handlers for the flow container.
 * Needs InternalFlowStore for setMultiSelectionActive (Shift key).
 */
export function setupKeyboardHandlers<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  store: InternalFlowStore<NodeType, EdgeType>,
  container: HTMLElement,
): void {
  function handleKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!untrack(store.nodesDraggable)) return
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
      store.setMultiSelectionActive(true)
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.key === 'Shift') {
      store.setMultiSelectionActive(false)
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
 * Simple rect type for selection calculations.
 */
type SelectionRect = { x: number; y: number; width: number; height: number }

/**
 * Find nodes whose absolute positions overlap a screen-space rectangle.
 *
 * Unlike @xyflow/system's getNodesInside, this does NOT require handleBounds
 * to be set — it works directly with positionAbsolute and measured dimensions.
 * This avoids the forceInitialRender fallback that returns ALL nodes.
 */
function findNodesInRect<NodeType extends NodeBase>(
  nodeLookup: Map<string, InternalNodeBase<NodeType>>,
  rect: SelectionRect,
  [tx, ty, tScale]: Transform,
  partially: boolean,
): InternalNodeBase<NodeType>[] {
  // Convert the screen-space rect to flow-space (undo viewport transform)
  const flowRect = {
    x: (rect.x - tx) / tScale,
    y: (rect.y - ty) / tScale,
    width: rect.width / tScale,
    height: rect.height / tScale,
  }

  const result: InternalNodeBase<NodeType>[] = []

  for (const node of nodeLookup.values()) {
    if (node.hidden) continue

    const nodeW = node.measured.width ?? 0
    const nodeH = node.measured.height ?? 0
    if (nodeW === 0 && nodeH === 0) continue

    const pos = node.internals.positionAbsolute

    // Calculate overlap between the flow-space selection rect and node rect
    const overlapX = Math.max(0,
      Math.min(flowRect.x + flowRect.width, pos.x + nodeW) -
      Math.max(flowRect.x, pos.x),
    )
    const overlapY = Math.max(0,
      Math.min(flowRect.y + flowRect.height, pos.y + nodeH) -
      Math.max(flowRect.y, pos.y),
    )
    const overlapArea = overlapX * overlapY
    const nodeArea = nodeW * nodeH

    if (partially) {
      // Partial mode: any overlap counts
      if (overlapArea > 0) result.push(node)
    } else {
      // Full mode: node must be fully contained
      if (overlapArea >= nodeArea) result.push(node)
    }
  }

  return result
}

/**
 * Compute screen-space bounding box around the given internal nodes.
 */
function getSelectedNodesBBox<NodeType extends NodeBase>(
  nodes: InternalNodeBase<NodeType>[],
  [tx, ty, tScale]: Transform,
): SelectionRect | null {
  if (nodes.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const node of nodes) {
    const pos = node.internals.positionAbsolute
    const nw = node.measured.width ?? 0
    const nh = node.measured.height ?? 0
    // Convert flow-space to screen-space
    const sx = pos.x * tScale + tx
    const sy = pos.y * tScale + ty
    const sw = nw * tScale
    const sh = nh * tScale
    minX = Math.min(minX, sx)
    minY = Math.min(minY, sy)
    maxX = Math.max(maxX, sx + sw)
    maxY = Math.max(maxY, sy + sh)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Options for the selection rectangle behavior.
 */
export type SelectionRectOptions = {
  /** When true, drag on pane starts selection without Shift key */
  selectionOnDrag?: boolean
  /** 'partial' selects overlapping nodes; 'full' requires full containment */
  selectionMode?: SelectionMode
}

/**
 * Set up selection rectangle (rubber-band / lasso) on the flow container.
 *
 * The rectangle is drawn when:
 * - Shift+drag on empty pane, OR
 * - Drag on empty pane when `selectionOnDrag` is true
 *
 * Nodes inside the rectangle are selected on mouse up.
 */
export function setupSelectionRectangle<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(
  store: InternalFlowStore<NodeType, EdgeType>,
  container: HTMLElement,
  options: SelectionRectOptions = {},
): void {
  const selectionOnDrag = options.selectionOnDrag ?? false
  const selectionMode: SelectionMode = options.selectionMode ?? 'partial'

  let selectionRect: HTMLDivElement | null = null
  let isSelecting = false
  let startX = 0
  let startY = 0

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return

    // Remove any lingering selection bounding box from previous selection
    if (selectionRect) {
      selectionRect.remove()
      selectionRect = null
    }

    // Only start selection on the container or viewport (empty pane),
    // not on nodes, handles, controls, etc.
    const target = event.target as HTMLElement
    const isPane =
      target === container ||
      target.classList.contains('bf-flow__viewport') ||
      target.classList.contains('bf-flow__nodes') ||
      target.classList.contains('bf-flow__edges')

    if (!isPane) return

    // Determine if selection should activate:
    // - Shift+drag always triggers selection
    // - Plain drag triggers selection only if selectionOnDrag is true
    const shiftHeld = event.shiftKey
    if (!shiftHeld && !selectionOnDrag) return

    // Stop propagation so D3 pan/zoom doesn't compete with selection drag
    event.stopPropagation()
    event.preventDefault()

    isSelecting = true
    startX = event.clientX
    startY = event.clientY

    // Create the selection rectangle element
    selectionRect = document.createElement('div')
    selectionRect.className = 'bf-flow__selection'
    selectionRect.style.position = 'absolute'
    selectionRect.style.pointerEvents = 'none'
    selectionRect.style.left = '0'
    selectionRect.style.top = '0'
    selectionRect.style.width = '0'
    selectionRect.style.height = '0'
    selectionRect.style.zIndex = '5'
    container.appendChild(selectionRect)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isSelecting || !selectionRect) return

    const containerRect = container.getBoundingClientRect()
    const currentX = event.clientX
    const currentY = event.clientY

    // Calculate rectangle bounds relative to the container
    const left = Math.min(startX, currentX) - containerRect.left
    const top = Math.min(startY, currentY) - containerRect.top
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)

    selectionRect.style.left = `${left}px`
    selectionRect.style.top = `${top}px`
    selectionRect.style.width = `${width}px`
    selectionRect.style.height = `${height}px`
  }

  function handleMouseUp(event: MouseEvent) {
    if (!isSelecting) return

    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)

    // Determine which nodes are inside the selection rectangle
    const containerRect = container.getBoundingClientRect()
    const currentX = event.clientX
    const currentY = event.clientY

    const left = Math.min(startX, currentX) - containerRect.left
    const top = Math.min(startY, currentY) - containerRect.top
    const width = Math.abs(currentX - startX)
    const height = Math.abs(currentY - startY)

    // Only process selection if the rectangle has meaningful size
    // (avoid accidental clicks registering as selection)
    if (width > 5 || height > 5) {
      const transform = store.getTransform()
      const nodeLookup = untrack(store.nodeLookup)
      const partially = selectionMode === 'partial'

      const nodesInside = findNodesInRect(
        nodeLookup,
        { x: left, y: top, width, height },
        transform,
        partially,
      )

      const selectedIds = new Set(nodesInside.map((n) => n.id))

      if (selectedIds.size > 0) {
        store.setNodes((prev) =>
          prev.map((n) =>
            selectedIds.has(n.id) ? { ...n, selected: true } : { ...n, selected: false },
          ),
        )

        // Reposition selection rect as bounding box around selected nodes
        if (selectionRect) {
          const transform = store.getTransform()
          const bbox = getSelectedNodesBBox(nodesInside, transform)
          if (bbox) {
            selectionRect.style.left = `${bbox.x}px`
            selectionRect.style.top = `${bbox.y}px`
            selectionRect.style.width = `${bbox.width}px`
            selectionRect.style.height = `${bbox.height}px`
            selectionRect.classList.add('bf-flow__selection--active')
            // Focus container so keyboard Delete/Escape works immediately
            container.focus()
          } else {
            selectionRect.remove()
            selectionRect = null
          }
        }
      } else {
        store.unselectNodesAndEdges()
        if (selectionRect) { selectionRect.remove(); selectionRect = null }
      }
    } else {
      // Small drag = click on empty pane, deselect all
      store.unselectNodesAndEdges()
      if (selectionRect) { selectionRect.remove(); selectionRect = null }
    }

    isSelecting = false
  }

  // Clean up selection rect when selected nodes are deleted
  function handleSelectionKeyDown(event: KeyboardEvent) {
    if (!selectionRect) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      selectionRect.remove()
      selectionRect = null
    }
  }

  // Use capture phase so we can intercept before D3 zoom when needed
  container.addEventListener('mousedown', handleMouseDown, true)
  container.addEventListener('keydown', handleSelectionKeyDown)

  onCleanup(() => {
    container.removeEventListener('mousedown', handleMouseDown, true)
    container.removeEventListener('keydown', handleSelectionKeyDown)
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    if (selectionRect) {
      selectionRect.remove()
      selectionRect = null
    }
  })
}
