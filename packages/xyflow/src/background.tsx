"use client"

// JSX-native Background component (#1081 step 3).
//
// Translates `initBackground(scope, props)` into a `<Background />` JSX
// component. The pattern + rect tree is now expressed declaratively, with
// pattern attributes (width / height / x / y) and per-variant child
// attributes (circle.r/cx/cy or path.d) bound to memos that depend on
// `store.viewport()`. Same exact rendering — moves the side-effects from
// imperative `setAttribute` calls to JSX attribute bindings.
//
// **Wiring status:** the imperative `initBackground` in `background.ts`
// is still the production code path. Replacing the call site happens in
// the consolidation step at the end of #1081.

import { createMemo, useContext } from '@barefootjs/client'
import { FlowContext } from './context'
import type { FlowStore } from './types'

export type BackgroundVariant = 'dots' | 'lines' | 'cross'

export interface BackgroundProps {
  variant?: BackgroundVariant
  gap?: number
  size?: number
  color?: string
  lineWidth?: number
  /**
   * Shifts the pattern as a fraction of the gap.
   * 0 (default): lines pass through tile centers (same as @xyflow/react default).
   * 0.5: shifts by half a gap so lines align to tile edges.
   */
  offset?: number
  /** Stable id for the `<pattern>`. Falls back to a random id. */
  patternId?: string
}

export function Background(props: BackgroundProps) {
  const store = useContext(FlowContext) as FlowStore | undefined

  // Per-instance pattern id. Random fallback matches initBackground; an
  // explicit prop is honored so demos can opt into a stable id.
  const patternId = props.patternId ?? `bf-bg-${Math.random().toString(36).slice(2, 8)}`

  // Defaults are inlined as memos so they stay reactive if the consumer
  // ever passes signal-backed props.
  const variant = createMemo(() => props.variant ?? 'dots')
  const gap = createMemo(() => props.gap ?? 20)
  const size = createMemo(() => props.size ?? 1)
  const color = createMemo(() => props.color ?? '#ddd')
  const lineWidth = createMemo(() => props.lineWidth ?? 1)
  const offset = createMemo(() => props.offset ?? 0)

  // Pattern geometry — re-runs when viewport zoom/translate changes.
  // Returns null when scaledGap is non-finite so `<pattern>` keeps the
  // last valid attributes (matches imperative early-return behavior).
  const patternBox = createMemo(() => {
    if (!store) return null
    const vp = store.viewport()
    const scaledGap = gap() * vp.zoom
    if (!scaledGap || !Number.isFinite(scaledGap)) return null
    return {
      width: scaledGap,
      height: scaledGap,
      x: (vp.x % scaledGap) - scaledGap * offset(),
      y: (vp.y % scaledGap) - scaledGap * offset(),
      scaledGap,
      zoom: vp.zoom,
    }
  })

  // Variant-specific child attribute memos. Each memo is independent so a
  // variant switch only re-runs the affected child binding.
  const dotR = createMemo(() => {
    const box = patternBox()
    if (!box) return 0
    return size() * Math.max(box.zoom, 0.5)
  })
  const dotCx = createMemo(() => {
    const box = patternBox()
    return box ? box.scaledGap / 2 : 0
  })
  const dotCy = createMemo(() => {
    const box = patternBox()
    return box ? box.scaledGap / 2 : 0
  })
  const linePathD = createMemo(() => {
    const box = patternBox()
    if (!box) return ''
    return `M${box.scaledGap / 2} 0 V${box.scaledGap}`
  })
  const crossPathD = createMemo(() => {
    const box = patternBox()
    if (!box) return ''
    const half = box.scaledGap / 2
    return `M${half} 0 V${box.scaledGap} M0 ${half} H${box.scaledGap}`
  })

  const patternWidth = createMemo(() => String(patternBox()?.width ?? 0))
  const patternHeight = createMemo(() => String(patternBox()?.height ?? 0))
  const patternX = createMemo(() => String(patternBox()?.x ?? 0))
  const patternY = createMemo(() => String(patternBox()?.y ?? 0))

  return (
    <svg
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;"
    >
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width={patternWidth()}
          height={patternHeight()}
          x={patternX()}
          y={patternY()}
        >
          {variant() === 'dots' ? (
            <circle
              r={String(dotR())}
              cx={String(dotCx())}
              cy={String(dotCy())}
              fill={color()}
            />
          ) : variant() === 'lines' ? (
            <path
              d={linePathD()}
              stroke={color()}
              stroke-width={String(lineWidth())}
              fill="none"
            />
          ) : (
            <path
              d={crossPathD()}
              stroke={color()}
              stroke-width={String(lineWidth())}
              fill="none"
            />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
