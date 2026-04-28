"use client"

// JSX-native Controls component (#1081 step 4).
//
// Translates `initControls(scope, props)` into a `<Controls />` JSX
// component. The four controls (zoom in / zoom out / fit view / lock)
// become a `<div>` with up to four `<button>` children gated by
// per-control booleans. The lock toggle's icon swap is driven by a
// signal-derived ternary so the analyzer keeps both icon paths in
// the IR.
//
// SVG icons are now first-class JSX subtrees instead of raw `innerHTML`
// strings — the `d` data is the same as `initControls`.
//
// **Wiring status:** the imperative `initControls` in `controls.ts` is
// still the production code path. Replacing the call site happens in
// the consolidation step at the end of #1081.

import { createSignal, createMemo, useContext } from '@barefootjs/client'
import { FlowContext } from '../context'
import type { FlowStore } from '../types'

export type ControlsPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface ControlsProps {
  position?: ControlsPosition
  showZoom?: boolean
  showFitView?: boolean
  showInteractive?: boolean
}

const ICON_VIEWBOX = '0 0 32 32'
const ICON_VIEWBOX_LOCK = '0 0 25 32'
const PATH_PLUS = 'M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z'
const PATH_MINUS = 'M0 13.867h32v4.266H0z'
const PATH_FIT_VIEW = 'M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.63zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94a.919.919 0 01-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z'
const PATH_LOCK = 'M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0 8 0 4.571 3.429 4.571 7.619v3.048H3.048A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047zm4.724-13.866H7.467V7.619c0-2.59 2.133-4.724 4.723-4.724 2.591 0 4.724 2.133 4.724 4.724v3.048z'
const PATH_UNLOCK = 'M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0c-4.114 1.828-1.37 2.133.305 2.438 1.676.305 4.42 2.59 4.42 5.181v3.048H3.047A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047z'

const BUTTON_STYLE =
  'display: flex; justify-content: center; align-items: center; height: 26px; width: 26px; padding: 4px; border: none; border-bottom: 1px solid #eee; background: #fefefe; cursor: pointer; user-select: none; color: inherit;'

const ICON_WRAPPER_STYLE = 'display: flex; align-items: center; justify-content: center;'
const ICON_SVG_STYLE = 'width: 100%; max-width: 12px; max-height: 12px; fill: currentColor;'

function positionStyle(position: ControlsPosition): string {
  const [vertical, horizontal] = position.split('-') as [string, string]
  return `${vertical}: 10px; ${horizontal}: 10px;`
}

export function Controls(props: ControlsProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  const position = createMemo<ControlsPosition>(() => props.position ?? 'bottom-left')
  const showZoom = createMemo(() => props.showZoom ?? true)
  const showFitView = createMemo(() => props.showFitView ?? true)
  const showInteractive = createMemo(() => props.showInteractive ?? true)

  const [interactive, setInteractive] = createSignal(true)

  const containerStyle = createMemo(() =>
    `position: absolute; z-index: 5; display: flex; flex-direction: column; box-shadow: 0 0 2px 1px rgba(0,0,0,0.08); ${positionStyle(position())}`
  )

  function zoomIn() {
    store?.panZoom()?.scaleBy(1.2)
  }
  function zoomOut() {
    store?.panZoom()?.scaleBy(1 / 1.2)
  }
  function fitView() {
    store?.fitView()
  }
  function toggleInteractive() {
    const next = !interactive()
    setInteractive(next)
    store?.setNodesDraggable(next)
  }

  return (
    <div className="bf-flow__controls" style={containerStyle()}>
      {showZoom() ? (
        <>
          <button
            type="button"
            className="bf-flow__controls-button nodrag nowheel"
            title="Zoom in"
            style={BUTTON_STYLE}
            onClick={zoomIn}
          >
            <span style={ICON_WRAPPER_STYLE}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEWBOX} style={ICON_SVG_STYLE}>
                <path d={PATH_PLUS} />
              </svg>
            </span>
          </button>
          <button
            type="button"
            className="bf-flow__controls-button nodrag nowheel"
            title="Zoom out"
            style={BUTTON_STYLE}
            onClick={zoomOut}
          >
            <span style={ICON_WRAPPER_STYLE}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEWBOX} style={ICON_SVG_STYLE}>
                <path d={PATH_MINUS} />
              </svg>
            </span>
          </button>
        </>
      ) : null}
      {showFitView() ? (
        <button
          type="button"
          className="bf-flow__controls-button nodrag nowheel"
          title="Fit view"
          style={BUTTON_STYLE}
          onClick={fitView}
        >
          <span style={ICON_WRAPPER_STYLE}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEWBOX} style={ICON_SVG_STYLE}>
              <path d={PATH_FIT_VIEW} />
            </svg>
          </span>
        </button>
      ) : null}
      {showInteractive() ? (
        <button
          type="button"
          className="bf-flow__controls-button nodrag nowheel"
          title="Toggle interactivity"
          style={BUTTON_STYLE}
          onClick={toggleInteractive}
        >
          <span style={ICON_WRAPPER_STYLE}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEWBOX_LOCK} style={ICON_SVG_STYLE}>
              <path d={interactive() ? PATH_UNLOCK : PATH_LOCK} />
            </svg>
          </span>
        </button>
      ) : null}
    </div>
  )
}
