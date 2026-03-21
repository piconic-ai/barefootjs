"use client"

/**
 * Kbd Component
 *
 * Displays a keyboard key or shortcut indicator.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Basic usage
 * ```tsx
 * <Kbd>K</Kbd>
 * ```
 *
 * @example Keyboard shortcut
 * ```tsx
 * <Kbd>⌘</Kbd><Kbd>K</Kbd>
 * ```
 *
 * @example Grouped keys
 * ```tsx
 * <KbdGroup>
 *   <Kbd>Ctrl</Kbd>
 *   <Kbd>C</Kbd>
 * </KbdGroup>
 * ```
 */

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { Slot } from '../slot'

// Base classes for individual keyboard key display
const kbdBaseClasses = 'pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border border-border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*=size-])]:size-3'

// Base classes for grouping multiple keys
const kbdGroupBaseClasses = 'inline-flex items-center gap-1'

/**
 * Props for the Kbd component.
 */
interface KbdProps extends HTMLBaseAttributes {
  /**
   * When true, renders child element with kbd styling instead of `<kbd>`.
   * Useful for custom elements with keyboard key appearance.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the kbd element.
   */
  children?: Child
}

/**
 * Props for the KbdGroup component.
 */
interface KbdGroupProps extends HTMLBaseAttributes {
  /**
   * When true, renders child element with group styling instead of `<kbd>`.
   * @default false
   */
  asChild?: boolean
  /**
   * Children to render inside the group.
   */
  children?: Child
}

/**
 * Kbd component — displays a single keyboard key.
 *
 * @param props.asChild - Render child element instead of kbd
 */
function Kbd({
  className = '',
  asChild = false,
  children,
  ...props
}: KbdProps) {
  const classes = `${kbdBaseClasses} ${className}`

  if (asChild) {
    return <Slot className={classes} {...props}>{children}</Slot>
  }
  return <kbd data-slot="kbd" className={classes} {...props}>{children}</kbd>
}

/**
 * KbdGroup component — groups multiple Kbd elements together.
 *
 * @param props.asChild - Render child element instead of kbd
 */
function KbdGroup({
  className = '',
  asChild = false,
  children,
  ...props
}: KbdGroupProps) {
  const classes = `${kbdGroupBaseClasses} ${className}`

  if (asChild) {
    return <Slot className={classes} {...props}>{children}</Slot>
  }
  return <kbd data-slot="kbd-group" className={classes} {...props}>{children}</kbd>
}

export { Kbd, KbdGroup }
export type { KbdProps, KbdGroupProps }
