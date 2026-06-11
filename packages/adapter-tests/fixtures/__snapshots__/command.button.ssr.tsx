/** @jsxImportSource hono/jsx */
import type { ButtonHTMLAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Slot } from '../slot'

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'
interface ButtonProps extends ButtonHTMLAttributes {
  /**
   * Visual style of the button.
   * @default 'default'
   */
  variant?: ButtonVariant
  /**
   * Size of the button.
   * @default 'default'
   */
  size?: ButtonSize
  /**
   * When true, renders child element with button styling instead of `<button>`.
   * Useful for creating button-styled links or custom elements.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the button.
   */
  children?: Child
}

type ButtonPropsWithHydration = ButtonProps & {
  __instanceId?: string
  __bfScope?: string
  __bfChild?: boolean
  __bfParentProps?: string
  __bfParent?: string
  __bfMount?: string
  "data-key"?: string | number
}

export type { ButtonVariant, ButtonSize, ButtonProps }

export function Button({ className = '', variant = 'default', size = 'default', asChild = false, children, __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props }: ButtonPropsWithHydration) {
  const __scopeId = __instanceId || `Button_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof className !== 'function' && !(typeof className === 'object' && className !== null && 'isEscaped' in className)) __hydrateProps['className'] = className
  if (typeof variant !== 'function' && !(typeof variant === 'object' && variant !== null && 'isEscaped' in variant)) __hydrateProps['variant'] = variant
  if (typeof size !== 'function' && !(typeof size === 'object' && size !== null && 'isEscaped' in size)) __hydrateProps['size'] = size
  if (typeof asChild !== 'function' && !(typeof asChild === 'object' && asChild !== null && 'isEscaped' in asChild)) __hydrateProps['asChild'] = asChild
  if (typeof children !== 'function' && !(typeof children === 'object' && children !== null && 'isEscaped' in children)) __hydrateProps['children'] = children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  if (asChild) {
    return (
      <Slot className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation ${({"default": "bg-primary text-primary-foreground hover:bg-primary/90", "destructive": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50", "secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80", "ghost": "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50", "link": "text-foreground underline-offset-4 hover:underline hover:text-primary"})[variant]} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", "lg": "h-10 rounded-md px-6 has-[>svg]:px-4", "icon": "size-9", "icon-sm": "size-8", "icon-lg": "size-10"})[size]} ${className}`} {...props} __instanceId={`${__scopeId}_s1`} __bfParentProps={__bfPropsJson} __bfParent={__scopeId} __bfMount={'s1'} bf-s={__scopeId}>{children}</Slot>
    )
  }
  return (
    <button className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-[invalid]:ring-destructive/20 dark:aria-[invalid]:ring-destructive/40 aria-[invalid]:border-destructive touch-action-manipulation ${({"default": "bg-primary text-primary-foreground hover:bg-primary/90", "destructive": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60", "outline": "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50", "secondary": "bg-secondary text-secondary-foreground hover:bg-secondary/80", "ghost": "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50", "link": "text-foreground underline-offset-4 hover:underline hover:text-primary"})[variant]} ${({"default": "h-9 px-4 py-2 has-[>svg]:px-3", "sm": "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5", "lg": "h-10 rounded-md px-6 has-[>svg]:px-4", "icon": "size-9", "icon-sm": "size-8", "icon-lg": "size-10"})[size]} ${className}`} {...props} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{children}</button>
  )
}
