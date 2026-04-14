import { Position } from '@xyflow/system'
import type { HandleType, HandleProps } from '@xyflow/system'
import { useFlow } from './hooks'
import { attachConnectionHandler } from './connection'
import type { FlowStore } from './types'

export type { HandleType, HandleProps }

const HANDLE_POSITION_STYLES: Record<string, Partial<CSSStyleDeclaration>> = {
  [Position.Top]: { left: '50%', top: '0', transform: 'translate(-50%, -50%)' },
  [Position.Bottom]: { left: '50%', bottom: '0', top: 'auto', transform: 'translate(-50%, 50%)' },
  [Position.Left]: { left: '0', top: '50%', transform: 'translate(-50%, -50%)' },
  [Position.Right]: { right: '0', left: 'auto', top: '50%', transform: 'translate(50%, -50%)' },
}

const HANDLE_SIZE = 8

/**
 * Create a handle DOM element and attach it to a node element.
 * Connection dragging is handled by attachConnectionHandler (native implementation).
 */
export function createHandle(
  nodeElement: HTMLElement,
  props: HandleProps & { nodeId: string },
  store?: FlowStore,
): HTMLElement {
  const handleType = props.type ?? 'source'
  const position = props.position ?? Position.Top

  const el = document.createElement('div')
  // Include bare 'source'/'target' class — @xyflow/system's getHandleBounds
  // queries by `.source` / `.target` to compute handle positions for edges.
  el.className = `bf-flow__handle bf-flow__handle--${handleType} ${handleType}`
  el.dataset.handleType = handleType
  el.dataset.handlepos = position  // data-handlepos (lowercase) for @xyflow/system
  el.dataset.handlePosition = position
  el.dataset.nodeId = props.nodeId
  if (props.id) {
    el.setAttribute('data-handleid', props.id)
  }

  el.style.position = 'absolute'
  el.style.width = `${HANDLE_SIZE}px`
  el.style.height = `${HANDLE_SIZE}px`
  el.style.borderRadius = '50%'
  el.style.backgroundColor = '#1a192b'
  el.style.border = '1px solid #fff'
  el.style.cursor = 'crosshair'
  el.style.pointerEvents = 'all'
  el.style.zIndex = '1'

  const posStyles = HANDLE_POSITION_STYLES[position]
  if (posStyles) {
    Object.assign(el.style, posStyles)
  }

  if (!nodeElement.style.position || nodeElement.style.position === 'static') {
    nodeElement.style.position = 'relative'
  }

  nodeElement.appendChild(el)

  // Wire up native connection dragging via attachConnectionHandler
  if (store) {
    const container = store.domNode()
    const edgesSvg = container?.querySelector('.bf-flow__edges') as SVGSVGElement | null
    if (container && edgesSvg) {
      attachConnectionHandler(el, props.nodeId, handleType, container, edgesSvg, store)
    }
  }

  return el
}

/**
 * Init function for Handle component within a node.
 * Reads handle configuration from props and creates the DOM element.
 */
export function initHandle(scope: Element, props: Record<string, unknown>): void {
  const nodeElement = scope as HTMLElement
  let store: FlowStore | undefined
  try {
    store = useFlow()
  } catch {
    // No flow context available — standalone handle without connection
  }

  const handleProps = {
    type: (props.type as HandleType) ?? 'source',
    position: (props.position as Position) ?? Position.Top,
    id: (props.id as string) ?? null,
    isConnectable: (props.isConnectable as boolean) ?? true,
    nodeId: (props.nodeId as string) ?? '',
  }

  createHandle(nodeElement, handleProps, store)
}
