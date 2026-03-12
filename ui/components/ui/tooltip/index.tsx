"use client"

/**
 * Tooltip Component
 *
 * A popup that displays contextual information on hover or focus.
 * Adapted from shadcn/ui v4 with CSS variable theming support.
 *
 * @example Basic tooltip
 * ```tsx
 * <Tooltip content="This is helpful information">
 *   <Button>Hover me</Button>
 * </Tooltip>
 * ```
 *
 * @example With placement
 * ```tsx
 * <Tooltip content="Tooltip on the right" placement="right">
 *   <span>Hover me</span>
 * </Tooltip>
 * ```
 *
 * @example With delay
 * ```tsx
 * <Tooltip content="Delayed tooltip" delayDuration={500} closeDelay={200}>
 *   <Button>Hover me</Button>
 * </Tooltip>
 * ```
 */

import { createSignal } from '@barefootjs/dom'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left'

// Tooltip container classes
const tooltipContainerClasses = 'relative inline-block'

// Tooltip content classes (shadcn/ui v4 adapted: whitespace-nowrap instead of w-fit text-balance
// because our tooltip is absolute-positioned inside an inline-block container, not portaled)
const tooltipContentBaseClasses = 'z-50 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground whitespace-nowrap'

// Transition classes (same pattern as Dialog/DropdownMenu)
const tooltipTransitionClasses = 'absolute transition-[opacity,transform] duration-fast ease-out'

// Open/closed state classes
const tooltipContentOpenClasses = 'opacity-100 scale-100'
const tooltipContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

// Placement classes
const placementClasses: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
}

// Arrow classes (CSS border triangle pointing toward trigger)
const arrowClasses: Record<TooltipPlacement, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-primary border-l-transparent border-r-transparent border-b-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-r-primary border-t-transparent border-b-transparent border-l-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-primary border-l-transparent border-r-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-l-primary border-t-transparent border-b-transparent border-r-transparent',
}

/**
 * Props for Tooltip component.
 */
interface TooltipProps extends HTMLBaseAttributes {
  /** Tooltip content text */
  content: string
  /** Trigger element */
  children?: Child
  /**
   * Placement of tooltip relative to trigger.
   * @default 'top'
   */
  placement?: TooltipPlacement
  /**
   * Delay in ms before showing tooltip on hover.
   * @default 0
   */
  delayDuration?: number
  /**
   * Delay in ms before hiding tooltip after mouse leave.
   * @default 0
   */
  closeDelay?: number
}

/**
 * Tooltip component that displays on hover/focus.
 * Uses props.xxx pattern (BF043) for reactivity.
 *
 * Timer IDs are stored on the DOM element (dataset) to ensure
 * they are shared across event handler closures after hydration.
 */
function Tooltip(props: TooltipProps) {
  const [open, setOpen] = createSignal(false)

  // Helper to get/set timer IDs on the DOM element
  const getTimer = (el: HTMLElement, key: string): number | undefined => {
    const val = el.dataset[key]
    return val ? Number(val) : undefined
  }
  const setTimer = (el: HTMLElement, key: string, id: number | undefined) => {
    el.dataset[key] = id !== undefined ? String(id) : ''
  }

  const handleMouseEnter = (e: MouseEvent) => {
    const el = (e.currentTarget ?? e.target) as HTMLElement
    const closeTimer = getTimer(el, 'closeTimer')
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer)
      setTimer(el, 'closeTimer', undefined)
    }

    if ((props.delayDuration ?? 0) > 0) {
      const timerId = setTimeout(() => {
        setOpen(true)
        setTimer(el, 'openTimer', undefined)
      }, props.delayDuration!) as unknown as number
      setTimer(el, 'openTimer', timerId)
    } else {
      setOpen(true)
    }
  }

  const handleMouseLeave = (e: MouseEvent) => {
    const el = (e.currentTarget ?? e.target) as HTMLElement
    const openTimer = getTimer(el, 'openTimer')
    if (openTimer !== undefined) {
      clearTimeout(openTimer)
      setTimer(el, 'openTimer', undefined)
    }

    if ((props.closeDelay ?? 0) > 0) {
      const timerId = setTimeout(() => {
        setOpen(false)
        setTimer(el, 'closeTimer', undefined)
      }, props.closeDelay!) as unknown as number
      setTimer(el, 'closeTimer', timerId)
    } else {
      setOpen(false)
    }
  }

  const handleFocus = () => setOpen(true)
  const handleBlur = () => setOpen(false)

  return (
    <span
      data-slot="tooltip"
      id={props.id}
      className={`${tooltipContainerClasses} ${props.className ?? ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-describedby={props.id}
    >
      <span>{props.children}</span>
      <div
        data-slot="tooltip-content"
        data-state={open() ? 'open' : 'closed'}
        className={`${tooltipTransitionClasses} ${placementClasses[props.placement ?? 'top']} ${tooltipContentBaseClasses} ${open() ? tooltipContentOpenClasses : tooltipContentClosedClasses}`}
        role="tooltip"
        id={props.id}
      >
        {props.content}
        <span
          className={`absolute w-0 h-0 border-4 ${arrowClasses[props.placement ?? 'top']}`}
          aria-hidden="true"
        />
      </div>
    </span>
  )
}

export { Tooltip }
export type { TooltipPlacement, TooltipProps }
