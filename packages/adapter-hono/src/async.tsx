/**
 * BfAsync - Streaming async boundary for Hono
 *
 * Wraps Hono's Suspense for streaming SSR with BarefootJS integration.
 * When the renderer uses `{ stream: true }`, this leverages Hono's native
 * Suspense/streaming. The BarefootJS hydration runtime automatically picks
 * up components rendered inside async boundaries via requestAnimationFrame.
 *
 * Usage:
 * ```tsx
 * import { BfAsync } from '@barefootjs/hono/async'
 *
 * app.get('/products/:id', (c) => {
 *   return c.render(
 *     <BfAsync fallback={<ProductSkeleton />}>
 *       <ProductDetail id={c.req.param('id')} />
 *     </BfAsync>
 *   )
 * })
 * ```
 *
 * Requires the renderer to be configured with `{ stream: true }`.
 */

/** @jsxImportSource hono/jsx */

import { Suspense } from 'hono/jsx/streaming'
import type { Child } from 'hono/jsx'

export interface BfAsyncProps {
  /** Content to display while the async children are loading. */
  fallback: Child
  /** Async children that will be streamed when resolved. */
  children: Child
}

/**
 * Async streaming boundary component.
 *
 * Renders fallback content immediately (sent in the initial HTTP response
 * for fast TTFB), then streams the resolved children when ready.
 */
export function BfAsync(props: BfAsyncProps) {
  return (
    <Suspense fallback={props.fallback}>
      {props.children}
    </Suspense>
  )
}
