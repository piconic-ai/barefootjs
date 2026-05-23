"use client"

/**
 * Direction Component
 *
 * A provider that sets the text direction (LTR/RTL) for its children.
 * Uses the native HTML `dir` attribute for proper bidirectional text support.
 *
 * @example Basic usage
 * ```tsx
 * <DirectionProvider dir="rtl">
 *   <p>This text will be right-to-left</p>
 * </DirectionProvider>
 * ```
 *
 * @example Nested directions
 * ```tsx
 * <DirectionProvider dir="rtl">
 *   <p>RTL content</p>
 *   <DirectionProvider dir="ltr">
 *     <p>LTR content inside RTL</p>
 *   </DirectionProvider>
 * </DirectionProvider>
 * ```
 */

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'

type Direction = 'ltr' | 'rtl'

/**
 * Props for the DirectionProvider component.
 */
interface DirectionProviderProps extends HTMLBaseAttributes {
  /**
   * The text direction for child content.
   * @default 'ltr'
   */
  dir?: Direction
  /**
   * Additional CSS class names.
   */
  className?: string
  /**
   * Content to render within the direction context.
   */
  children?: Child
}

/**
 * Provides text direction context to child elements via the HTML `dir` attribute.
 * Wraps children in a `<div>` with the specified direction.
 */
function DirectionProvider({
  dir = 'ltr',
  className = '',
  children,
  ...props
}: DirectionProviderProps) {
  return (
    <div
      data-slot="direction-provider"
      dir={dir}
      className={className}
      {...props}
    >
      {children}
    </div>
  )
}

export { DirectionProvider }
export type { DirectionProviderProps, Direction }
