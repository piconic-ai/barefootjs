"use client"

/**
 * Spinner Component
 *
 * An animated loading indicator using the LoaderCircle SVG icon.
 * Provides visual feedback during async operations with proper
 * ARIA accessibility attributes.
 *
 * Uses the same SVG path as LoaderCircleIcon from '../icon',
 * rendered inline for compiler compatibility with conditional rendering.
 *
 * @example Basic usage
 * ```tsx
 * <Spinner />
 * ```
 *
 * @example Custom size
 * ```tsx
 * <Spinner className="size-6" />
 * ```
 */

import type { SVGSVGAttributes } from '@barefootjs/jsx'

interface SpinnerProps extends SVGSVGAttributes {
  /** Additional CSS classes to apply. */
  className?: string
}

// LoaderCircle icon path (same as LoaderCircleIcon in '../icon')
const loaderCirclePath = 'M21 12a9 9 0 1 1-6.219-8.56'

/**
 * Spinner component — animated loading indicator.
 *
 * Renders a spinning SVG arc (LoaderCircle icon from Lucide).
 * Uses `animate-spin` CSS animation for rotation.
 *
 * @param props.className - Additional CSS classes (e.g., `"size-6"` for custom sizing)
 */
function Spinner({ className = '', ...props }: SpinnerProps) {
  return (
    <svg
      data-slot="spinner"
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      role="status"
      aria-label="Loading"
      className={`animate-spin ${className}`}
      {...props}
    >
      <path d={loaderCirclePath} />
    </svg>
  )
}

export { Spinner }
export type { SpinnerProps }
