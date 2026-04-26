"use client"

/**
 * Tooltip Component (site/core local — click-to-toggle variant)
 *
 * A click-only popup that displays contextual content near the trigger
 * element. Unlike the upstream `ui/components/ui/tooltip` (hover/focus
 * triggered), this variant is wired to onClick so it works uniformly
 * across desktop and touch — matching how the Hero uses it to surface
 * compiled-template snippets.
 *
 * Lives under site/core because the build only discovers components
 * under `site/core/components` and `site/core/landing/components` and
 * the click-only behaviour shouldn't affect upstream consumers.
 */

import { createSignal } from '@barefootjs/client'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'

type Child =
  | object // JSX.Element / VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | Child[]

type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left'

const tooltipContainerClasses = 'relative inline-block'
const tooltipContentBaseClasses =
  'z-50 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground whitespace-nowrap'
const tooltipTransitionClasses =
  'absolute transition-[opacity,transform] duration-fast ease-out'
const tooltipContentOpenClasses = 'opacity-100 scale-100'
const tooltipContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

const placementClasses: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
}

const arrowClasses: Record<TooltipPlacement, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-primary border-l-transparent border-r-transparent border-b-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-r-primary border-t-transparent border-b-transparent border-l-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-primary border-l-transparent border-r-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-l-primary border-t-transparent border-b-transparent border-r-transparent',
}

interface TooltipProps extends HTMLBaseAttributes {
  content: string
  children?: Child
  placement?: TooltipPlacement
}

function Tooltip(props: TooltipProps) {
  const [open, setOpen] = createSignal(false)

  // Click-only affordance: hover/focus do not open the tooltip; the
  // user must explicitly click (or Enter on a focused trigger, since
  // that synthesises a click). This keeps the wide code-block tooltip
  // out of the way until requested.
  const handleClick = () => setOpen(!open())

  return (
    <span
      data-slot="tooltip"
      id={props.id}
      className={`${tooltipContainerClasses} ${props.className ?? ''}`}
      onClick={handleClick}
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
