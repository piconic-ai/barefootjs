"use client"

/**
 * Button Component
 *
 * A button with variants and sizes. The visual styling lives in CSS
 * `@layer components`, addressed via `data-variant` / `data-size`
 * attribute selectors. Consumers override per-variant styling by
 * declaring rules in a higher-priority layer — no JS-side class
 * derivation required, and the same JSX renders correctly across
 * adapters that don't run JS at SSR time (Go templates, Mojolicious
 * EP, etc.).
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

// Variant / size keep their public API — they just route through data
// attributes instead of class lookup tables.
type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'

/**
 * Props for the Button component.
 */
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

/**
 * Button component with variants and sizes.
 *
 * @param props.variant - Visual style of the button
 *   - `'default'` - Primary action, solid background
 *   - `'destructive'` - Dangerous action (red)
 *   - `'outline'` - Bordered with transparent background
 *   - `'secondary'` - Muted styling for secondary actions
 *   - `'ghost'` - Minimal, visible only on hover
 *   - `'link'` - Text link appearance with underline on hover
 * @param props.size - Size of the button
 *   - `'default'` - Standard size
 *   - `'sm'` - Small size
 *   - `'lg'` - Large size
 *   - `'icon'` - Square icon button
 *   - `'icon-sm'` - Small icon button
 *   - `'icon-lg'` - Large icon button
 * @param props.asChild - Render child element instead of button
 */
function Button({
  variant = 'default',
  size = 'default',
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return <Slot className="bf-button" data-variant={variant} data-size={size} {...props}>{children}</Slot>
  }
  return <button className="bf-button" data-variant={variant} data-size={size} {...props}>{children}</button>
}

export { Button }
export type { ButtonVariant, ButtonSize, ButtonProps }
