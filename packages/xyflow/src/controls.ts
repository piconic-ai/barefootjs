import { onCleanup, useContext } from '@barefootjs/dom'
import { FlowContext } from './context'
import type { FlowStore } from './types'

export type ControlsProps = {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  showZoom?: boolean
  showFitView?: boolean
  showInteractive?: boolean
}

/**
 * Init function for Controls component.
 * Renders zoom in/out, fit view buttons.
 */
export function initControls(scope: Element, props: Record<string, unknown>): void {
  const store = useContext(FlowContext) as FlowStore
  const el = scope as HTMLElement

  const position = (props.position as string) ?? 'bottom-left'
  const showZoom = (props.showZoom as boolean) ?? true
  const showFitView = (props.showFitView as boolean) ?? true

  // Container
  const container = document.createElement('div')
  container.className = 'bf-flow__controls'
  container.style.position = 'absolute'
  container.style.zIndex = '5'
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.gap = '4px'
  container.style.padding = '4px'
  container.style.backgroundColor = '#fff'
  container.style.borderRadius = '4px'
  container.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)'

  // Position
  const [vertical, horizontal] = position.split('-')
  container.style[vertical as 'top' | 'bottom'] = '10px'
  container.style[horizontal as 'left' | 'right'] = '10px'

  if (showZoom) {
    const zoomIn = createButton('+', () => {
      const pz = store.panZoom()
      pz?.scaleBy(1.2)
    })
    container.appendChild(zoomIn)

    const zoomOut = createButton('−', () => {
      const pz = store.panZoom()
      pz?.scaleBy(1 / 1.2)
    })
    container.appendChild(zoomOut)
  }

  if (showFitView) {
    const fitBtn = createButton('⊡', () => {
      store.fitView()
    })
    container.appendChild(fitBtn)
  }

  el.appendChild(container)

  onCleanup(() => container.remove())
}

function createButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  btn.className = 'bf-flow__controls-button nodrag nowheel'
  btn.style.width = '28px'
  btn.style.height = '28px'
  btn.style.border = '1px solid #eee'
  btn.style.borderRadius = '3px'
  btn.style.backgroundColor = '#fff'
  btn.style.cursor = 'pointer'
  btn.style.fontSize = '16px'
  btn.style.lineHeight = '1'
  btn.style.display = 'flex'
  btn.style.alignItems = 'center'
  btn.style.justifyContent = 'center'
  btn.addEventListener('click', onClick)
  return btn
}
