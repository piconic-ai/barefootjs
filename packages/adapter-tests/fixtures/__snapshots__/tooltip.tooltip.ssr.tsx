/** @jsxImportSource hono/jsx */
import { bfText, bfTextEnd } from '@barefootjs/hono/utils'
import { createSignal } from '@barefootjs/hono/client-shim'
import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left'
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

export type { TooltipPlacement, TooltipProps }

export function Tooltip(__allProps: TooltipProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Tooltip_${Math.random().toString(36).slice(2, 8)}`
  const open = () => false
  const tooltipContainerClasses = 'relative inline-block'
  const tooltipContentOpenClasses = 'opacity-100 scale-100'
  const tooltipContentClosedClasses = 'opacity-0 scale-95 pointer-events-none'

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.content !== 'function' && !(typeof props.content === 'object' && props.content !== null && 'isEscaped' in props.content)) __hydrateProps['content'] = props.content
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  if (typeof props.placement !== 'function' && !(typeof props.placement === 'object' && props.placement !== null && 'isEscaped' in props.placement)) __hydrateProps['placement'] = props.placement
  if (typeof props.delayDuration !== 'function' && !(typeof props.delayDuration === 'object' && props.delayDuration !== null && 'isEscaped' in props.delayDuration)) __hydrateProps['delayDuration'] = props.delayDuration
  if (typeof props.closeDelay !== 'function' && !(typeof props.closeDelay === 'object' && props.closeDelay !== null && 'isEscaped' in props.closeDelay)) __hydrateProps['closeDelay'] = props.closeDelay
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <span data-slot="tooltip" id={props.id} className={`${tooltipContainerClasses} ${props.className ?? ''}`} aria-describedby={props.id} onMouseEnter={() => {}} onMouseLeave={() => {}} onFocus={() => {}} onBlur={() => {}} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3"><span>{props.children}</span><div data-slot="tooltip-content" data-state={`${open() ? 'open' : 'closed'}`} className={`absolute transition-[opacity,transform] duration-fast ease-out ${({"top": "bottom-full left-1/2 -translate-x-1/2 mb-2", "right": "left-full top-1/2 -translate-y-1/2 ml-2", "bottom": "top-full left-1/2 -translate-x-1/2 mt-2", "left": "right-full top-1/2 -translate-y-1/2 mr-2"})[props.placement ?? 'top']} z-50 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground whitespace-nowrap ${open() ? tooltipContentOpenClasses : tooltipContentClosedClasses}`} role="tooltip" id={props.id} bf="s2">{bfText("s0")}{props.content}{bfTextEnd()}<span className={`absolute w-0 h-0 border-4 ${({"top": "top-full left-1/2 -translate-x-1/2 border-t-primary border-l-transparent border-r-transparent border-b-transparent", "right": "right-full top-1/2 -translate-y-1/2 border-r-primary border-t-transparent border-b-transparent border-l-transparent", "bottom": "bottom-full left-1/2 -translate-x-1/2 border-b-primary border-l-transparent border-r-transparent border-t-transparent", "left": "left-full top-1/2 -translate-y-1/2 border-l-primary border-t-transparent border-b-transparent border-r-transparent"})[props.placement ?? 'top']}`} aria-hidden="true" bf="s1" /></div></span>
  )
}
