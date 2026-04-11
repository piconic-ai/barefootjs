import { createSignal, onCleanup } from '@barefootjs/client'
import { useContext } from '@barefootjs/client-runtime'
import { FlowContext } from './context'
import type { FlowStore } from './types'

export type ControlsProps = {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  showZoom?: boolean
  showFitView?: boolean
  showInteractive?: boolean
}

// SVG icon paths matching React Flow's controls
const ICONS = {
  plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z"/></svg>',
  minus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 13.867h32v4.266H0z"/></svg>',
  fitView: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.63zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94a.919.919 0 01-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z"/></svg>',
  lock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 32"><path d="M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0 8 0 4.571 3.429 4.571 7.619v3.048H3.048A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047zm4.724-13.866H7.467V7.619c0-2.59 2.133-4.724 4.723-4.724 2.591 0 4.724 2.133 4.724 4.724v3.048z"/></svg>',
  unlock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 32"><path d="M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0c-4.114 1.828-1.37 2.133.305 2.438 1.676.305 4.42 2.59 4.42 5.181v3.048H3.047A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047z"/></svg>',
}

export function initControls(scope: Element, props: Record<string, unknown>): void {
  const store = useContext(FlowContext) as FlowStore
  const el = scope as HTMLElement

  const position = (props.position as string) ?? 'bottom-left'
  const showZoom = (props.showZoom as boolean) ?? true
  const showFitView = (props.showFitView as boolean) ?? true
  const showInteractive = (props.showInteractive as boolean) ?? true

  const [interactive, setInteractive] = createSignal(true)

  const container = document.createElement('div')
  container.className = 'bf-flow__controls'
  container.style.position = 'absolute'
  container.style.zIndex = '5'
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  container.style.backgroundColor = '#fff'
  container.style.borderRadius = '2px'
  container.style.boxShadow = '0 0 2px 1px rgba(0,0,0,0.08)'

  const [vertical, horizontal] = position.split('-')
  container.style[vertical as 'top' | 'bottom'] = '10px'
  container.style[horizontal as 'left' | 'right'] = '10px'

  if (showZoom) {
    container.appendChild(createButton(ICONS.plus, 'Zoom in', () => {
      store.panZoom()?.scaleBy(1.2)
    }))
    container.appendChild(createButton(ICONS.minus, 'Zoom out', () => {
      store.panZoom()?.scaleBy(1 / 1.2)
    }))
  }

  if (showFitView) {
    container.appendChild(createButton(ICONS.fitView, 'Fit view', () => {
      store.fitView()
    }))
  }

  if (showInteractive) {
    const lockBtn = createButton(ICONS.lock, 'Toggle interactivity', () => {
      setInteractive(!interactive())
      lockBtn.innerHTML = ''
      const icon = document.createElement('span')
      icon.innerHTML = interactive() ? ICONS.lock : ICONS.unlock
      icon.querySelector('svg')!.style.width = '100%'
      icon.querySelector('svg')!.style.height = '100%'
      lockBtn.appendChild(icon)
    })
    container.appendChild(lockBtn)
  }

  el.appendChild(container)
  onCleanup(() => container.remove())
}

function createButton(iconSvg: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'bf-flow__controls-button nodrag nowheel'
  btn.title = title
  btn.style.width = '26px'
  btn.style.height = '26px'
  btn.style.padding = '4px'
  btn.style.border = 'none'
  btn.style.borderBottom = '1px solid #eee'
  btn.style.backgroundColor = '#fff'
  btn.style.cursor = 'pointer'
  btn.style.display = 'flex'
  btn.style.alignItems = 'center'
  btn.style.justifyContent = 'center'

  const icon = document.createElement('span')
  icon.innerHTML = iconSvg
  icon.querySelector('svg')!.style.width = '100%'
  icon.querySelector('svg')!.style.height = '100%'
  icon.querySelector('svg')!.style.fill = 'currentColor'
  btn.appendChild(icon)

  btn.addEventListener('click', onClick)
  return btn
}
