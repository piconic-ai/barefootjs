"use client"

import type { HTMLBaseAttributes } from '@barefootjs/jsx'

const baseClasses = 'bg-muted animate-pulse rounded-md'

/** Props for the Skeleton component. */
interface SkeletonProps extends HTMLBaseAttributes {}

/**
 * Skeleton Component
 *
 * A placeholder loading indicator that mimics the shape of content
 * with a pulsing animation.
 *
 * @example Basic rectangle
 * ```tsx
 * <Skeleton className="h-4 w-[250px]" />
 * ```
 *
 * @example Circle avatar
 * ```tsx
 * <Skeleton className="h-12 w-12 rounded-full" />
 * ```
 */
function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={`${baseClasses} ${className}`}
      {...props}
    />
  )
}

export { Skeleton }
export type { SkeletonProps }
