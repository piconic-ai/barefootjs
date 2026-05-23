"use client"

import type { HTMLBaseAttributes } from '@barefootjs/jsx'

/** The direction the separator is rendered in. */
type SeparatorOrientation = 'horizontal' | 'vertical'

const baseClasses = 'bg-border shrink-0'

const orientationClasses: Record<SeparatorOrientation, string> = {
  horizontal: 'h-px w-full',
  vertical: 'w-px self-stretch',
}

/** Props for the Separator component. */
interface SeparatorProps extends HTMLBaseAttributes {
  /** The separator orientation. */
  orientation?: SeparatorOrientation
  /** Whether the separator is purely decorative. */
  decorative?: boolean
}

/**
 * Separator Component
 *
 * A visual divider that separates content horizontally or vertically.
 * Can be decorative (no semantic meaning) or act as a true separator
 * with appropriate ARIA role and orientation.
 *
 * @example Horizontal separator
 * ```tsx
 * <Separator className="my-4" />
 * ```
 *
 * @example Vertical separator
 * ```tsx
 * <Separator orientation="vertical" />
 * ```
 */
function Separator({
  orientation = 'horizontal',
  decorative = true,
  className = '',
  ...props
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={`${baseClasses} ${orientationClasses[orientation]} ${className}`}
      {...props}
    />
  )
}

export { Separator }
export type { SeparatorOrientation, SeparatorProps }
