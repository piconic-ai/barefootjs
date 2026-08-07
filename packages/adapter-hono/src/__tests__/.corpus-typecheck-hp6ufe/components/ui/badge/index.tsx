import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Slot } from '../slot'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'
const baseClasses = 'inline-flex items-center justify-center rounded-xl border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive transition-[color,box-shadow] overflow-hidden'
const variantClasses = {
  default: 'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
  secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
  destructive: 'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
  outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
}
interface BadgeProps extends HTMLBaseAttributes {
  /**
   * Visual style of the badge.
   * @default 'default'
   */
  variant?: BadgeVariant
  /**
   * When true, renders child element with badge styling instead of `<span>`.
   * Useful for creating badge-styled links or custom elements.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the badge.
   */
  children?: Child
}

type BadgePropsWithHydration = BadgeProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { BadgeVariant, BadgeProps }

export function Badge({ className = '', variant = 'default', asChild = false, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: BadgePropsWithHydration = {} as BadgePropsWithHydration) {
  const __scopeId = __instanceId || `Badge_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof variant !== 'function' && !(typeof variant === 'object' && variant !== null && 'isEscaped' in variant)) __hydrateProps['variant'] = variant
  if (typeof asChild !== 'function' && !(typeof asChild === 'object' && asChild !== null && 'isEscaped' in asChild)) __hydrateProps['asChild'] = asChild
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (asChild) {
    return (
      <Slot className={`inline-flex items-center justify-center rounded-xl border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive transition-[color,box-shadow] overflow-hidden ${({"default": "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90", "secondary": "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90", "destructive": "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground"} as Record<string, string>)[variant]} ${className}`} {...props} __instanceId={`${__scopeId}_s1`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s1'} bf-s={__scopeId}>{children}</Slot>
    )
  }
  return (
    <span data-slot="badge" className={`inline-flex items-center justify-center rounded-xl border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive transition-[color,box-shadow] overflow-hidden ${({"default": "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90", "secondary": "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90", "destructive": "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground"} as Record<string, string>)[variant]} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</span>
  )
}