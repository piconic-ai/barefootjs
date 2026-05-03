"use client"

/**
 * Button Component
 *
 * Variant / size styling is expressed entirely through UnoCSS utility
 * classes — `data-[variant=...]:bg-primary`, `data-[size=lg]:h-10`,
 * etc. — so the visual switching happens at the browser level via
 * attribute selectors. The `className` value is a single static
 * string literal (no JS-side derivation) so:
 *
 *   - UnoCSS's static scanner picks up every utility token at build
 *     time.
 *   - SSR adapters that don't execute JS (Go templates, Mojolicious
 *     EP) emit it verbatim into the rendered HTML.
 *
 * @example Basic usage
 * ```tsx
 * <Button>Click me</Button>
 * ```
 *
 * @example With variant and size
 * ```tsx
 * <Button variant="destructive" size="lg">Delete</Button>
 * ```
 *
 * @example As a link (polymorphic rendering)
 * ```tsx
 * <Button asChild>
 *   <a href="/home">Go Home</a>
 * </Button>
 * ```
 */

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

function Button({
  variant = 'default',
  size = 'default',
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 data-[size=default]:h-9 data-[size=default]:px-4 data-[size=default]:py-2 data-[size=sm]:h-8 data-[size=sm]:px-3 data-[size=sm]:text-xs data-[size=lg]:h-10 data-[size=lg]:px-6 data-[size=icon]:size-9 data-[size=icon-sm]:size-8 data-[size=icon-lg]:size-10 data-[variant=default]:bg-primary data-[variant=default]:text-primary-foreground data-[variant=default]:hover:bg-primary/90 data-[variant=secondary]:bg-secondary data-[variant=secondary]:text-secondary-foreground data-[variant=secondary]:hover:bg-secondary/80 data-[variant=destructive]:bg-destructive data-[variant=destructive]:text-destructive-foreground data-[variant=destructive]:hover:bg-destructive/90 data-[variant=outline]:border data-[variant=outline]:border-input data-[variant=outline]:bg-background data-[variant=outline]:text-foreground data-[variant=outline]:hover:bg-accent data-[variant=outline]:hover:text-accent-foreground data-[variant=ghost]:text-foreground data-[variant=ghost]:hover:bg-accent data-[variant=ghost]:hover:text-accent-foreground data-[variant=link]:text-primary data-[variant=link]:underline-offset-4 data-[variant=link]:hover:underline"
        data-variant={variant}
        data-size={size}
        {...props}
      >
        {children}
      </Slot>
    )
  }
  return (
    <button
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 data-[size=default]:h-9 data-[size=default]:px-4 data-[size=default]:py-2 data-[size=sm]:h-8 data-[size=sm]:px-3 data-[size=sm]:text-xs data-[size=lg]:h-10 data-[size=lg]:px-6 data-[size=icon]:size-9 data-[size=icon-sm]:size-8 data-[size=icon-lg]:size-10 data-[variant=default]:bg-primary data-[variant=default]:text-primary-foreground data-[variant=default]:hover:bg-primary/90 data-[variant=secondary]:bg-secondary data-[variant=secondary]:text-secondary-foreground data-[variant=secondary]:hover:bg-secondary/80 data-[variant=destructive]:bg-destructive data-[variant=destructive]:text-destructive-foreground data-[variant=destructive]:hover:bg-destructive/90 data-[variant=outline]:border data-[variant=outline]:border-input data-[variant=outline]:bg-background data-[variant=outline]:text-foreground data-[variant=outline]:hover:bg-accent data-[variant=outline]:hover:text-accent-foreground data-[variant=ghost]:text-foreground data-[variant=ghost]:hover:bg-accent data-[variant=ghost]:hover:text-accent-foreground data-[variant=link]:text-primary data-[variant=link]:underline-offset-4 data-[variant=link]:hover:underline"
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  )
}

export { Button }
export type { ButtonVariant, ButtonSize, ButtonProps }
