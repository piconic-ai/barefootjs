import { onCleanup, untrack } from '@barefootjs/client/runtime'
import {
  XYResizer,
  XY_RESIZER_HANDLE_POSITIONS,
  XY_RESIZER_LINE_POSITIONS,
  ResizeControlVariant,
  updateNodeInternals,
} from '@xyflow/system'
import type {
  NodeBase,
  InternalNodeUpdate,
  ControlPosition,
  ControlLinePosition,
  OnResize,
  OnResizeStart,
  OnResizeEnd,
  ShouldResize,
  ResizeControlDirection,
} from '@xyflow/system'
import type { XYResizerChange, XYResizerChildChange, XYResizerInstance } from '@xyflow/system'
import type { FlowStore } from './types'

/**
 * Options for initNodeResizer.
 */
export type NodeResizerOptions = {
  /** Minimum width the node can be resized to (default: 10) */
  minWidth?: number
  /** Minimum height the node can be resized to (default: 10) */
  minHeight?: number
  /** Maximum width the node can be resized to (default: Infinity) */
  maxWidth?: number
  /** Maximum height the node can be resized to (default: Infinity) */
  maxHeight?: number
  /** Whether to keep the aspect ratio during resize (default: false) */
  keepAspectRatio?: boolean
  /** Which variant of resize controls to use: 'handle' (corners) or 'line' (edges) */
  variant?: ResizeControlVariant | 'handle' | 'line'
  /** Callback fired when resize starts */
  onResizeStart?: OnResizeStart
  /** Callback fired during resize with new dimensions */
  onResize?: OnResize
  /** Callback fired when resize ends */
  onResizeEnd?: OnResizeEnd
  /** Callback to determine if resize should proceed */
  shouldResize?: ShouldResize
  /** Whether the node is resizable (default: true) */
  isVisible?: boolean
  /** CSS color for the resize handle lines/corners */
  color?: string
}

/**
 * Initialize resize handles on a node element.
 *
 * Creates resize handle elements (corners and/or lines) and attaches
 * XYResizer from @xyflow/system for the resize logic.
 *
 * Usage:
 *   // Inside a custom node type function:
 *   initNodeResizer(this.parentElement, {
 *     nodeId: props.id,
 *     store,
 *     minWidth: 100,
 *     minHeight: 50,
 *     onResize: (event, params) => console.log('Resized:', params),
 *   })
 */
export function initNodeResizer<NodeType extends NodeBase>(
  nodeEl: HTMLElement,
  nodeId: string,
  store: FlowStore<NodeType>,
  options: NodeResizerOptions = {},
): () => void {
  const {
    minWidth = 10,
    minHeight = 10,
    maxWidth = Number.MAX_SAFE_INTEGER,
    maxHeight = Number.MAX_SAFE_INTEGER,
    keepAspectRatio = false,
    variant = ResizeControlVariant.Handle,
    onResizeStart,
    onResize,
    onResizeEnd,
    shouldResize,
    isVisible = true,
    color,
  } = options

  if (!isVisible) return () => {}

  const resolvedVariant =
    typeof variant === 'string'
      ? variant === 'line'
        ? ResizeControlVariant.Line
        : ResizeControlVariant.Handle
      : variant

  // Determine which positions to use based on variant
  const positions: ControlPosition[] =
    resolvedVariant === ResizeControlVariant.Line
      ? (XY_RESIZER_LINE_POSITIONS as ControlPosition[])
      : XY_RESIZER_HANDLE_POSITIONS

  // Mark node as resizable for CSS
  nodeEl.classList.add('bf-flow__node--resizable')

  // Container for resize handles
  const container = document.createElement('div')
  container.className = 'bf-flow__node-resizer'
  nodeEl.appendChild(container)

  const resizerInstances: XYResizerInstance[] = []

  for (const position of positions) {
    const handleEl = document.createElement('div')
    handleEl.className = `bf-flow__resize-handle bf-flow__resize-handle--${position}`

    if (resolvedVariant === ResizeControlVariant.Line) {
      handleEl.classList.add('bf-flow__resize-handle--line')
    } else {
      handleEl.classList.add('bf-flow__resize-handle--corner')
    }

    handleEl.dataset.position = position

    if (color) {
      handleEl.style.setProperty('--bf-resize-color', color)
    }

    container.appendChild(handleEl)

    // Create XYResizer instance for this handle
    const resizerInstance = XYResizer({
      domNode: handleEl as HTMLDivElement,
      nodeId,
      getStoreItems: () => {
        const nodeLookup = untrack(store.nodeLookup)
        const transform = store.getTransform()
        return {
          nodeLookup,
          transform,
          snapGrid: store.snapToGrid ? store.snapGrid : undefined,
          snapToGrid: store.snapToGrid,
          nodeOrigin: store.nodeOrigin,
          paneDomNode: untrack(store.domNode) as HTMLDivElement | null,
        }
      },
      onChange: (changes: XYResizerChange, childChanges: XYResizerChildChange[]) => {
        // Apply dimension and position changes to the node
        const lookup = untrack(store.nodeLookup)
        const node = lookup.get(nodeId)
        if (!node) return

        // Update measured dimensions
        if (changes.width != null) {
          node.measured.width = changes.width
          nodeEl.style.width = `${changes.width}px`
        }
        if (changes.height != null) {
          node.measured.height = changes.height
          nodeEl.style.height = `${changes.height}px`
        }

        // Update position if changed (e.g., resizing from top-left)
        if (changes.x != null || changes.y != null) {
          const newX = changes.x ?? node.internals.positionAbsolute.x
          const newY = changes.y ?? node.internals.positionAbsolute.y

          node.internals.positionAbsolute = { x: newX, y: newY }
          node.internals.userNode.position = { x: newX, y: newY }
          nodeEl.style.transform = `translate(${newX}px, ${newY}px)`
        }

        // Apply child position changes
        for (const childChange of childChanges) {
          const childNode = lookup.get(childChange.id)
          if (childNode) {
            childNode.internals.positionAbsolute = childChange.position
            childNode.internals.userNode.position = childChange.position
          }
        }

        // Update node internals for edge recalculation
        const updates = new Map<string, InternalNodeUpdate>()
        updates.set(nodeId, {
          id: nodeId,
          nodeElement: nodeEl as HTMLDivElement,
          force: true,
        })

        const parentLookup = untrack(store.parentLookup)
        updateNodeInternals(
          updates,
          lookup,
          parentLookup,
          untrack(store.domNode),
          store.nodeOrigin,
          store.nodeExtent,
        )

        // Notify position-dependent subscribers (edges etc.)
        store.triggerPositionUpdate()
      },
      onEnd: (change) => {
        // Commit final dimensions to the nodes array
        store.setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  position: { x: change.x, y: change.y },
                  measured: { width: change.width, height: change.height },
                  style: {
                    ...(n as any).style,
                    width: change.width,
                    height: change.height,
                  },
                }
              : n,
          ),
        )
      },
    })

    // Determine resize direction for line handles
    const isLineHandle = resolvedVariant === ResizeControlVariant.Line
    let resizeDirection: ResizeControlDirection | undefined
    if (isLineHandle) {
      if (position === 'left' || position === 'right') {
        resizeDirection = 'horizontal'
      } else if (position === 'top' || position === 'bottom') {
        resizeDirection = 'vertical'
      }
    }

    // Configure the resizer instance
    resizerInstance.update({
      controlPosition: position,
      boundaries: { minWidth, minHeight, maxWidth, maxHeight },
      keepAspectRatio,
      resizeDirection,
      onResizeStart,
      onResize,
      onResizeEnd,
      shouldResize,
    })

    resizerInstances.push(resizerInstance)
  }

  // Cleanup function
  const cleanup = () => {
    for (const instance of resizerInstances) {
      instance.destroy()
    }
    container.remove()
    nodeEl.classList.remove('bf-flow__node--resizable')
  }

  onCleanup(cleanup)

  return cleanup
}

// Re-export types that consumers might need
export { ResizeControlVariant }
export type {
  ControlPosition,
  ControlLinePosition,
  OnResize,
  OnResizeStart,
  OnResizeEnd,
  ShouldResize,
  ResizeControlDirection,
}
