// @jsxRuntime automatic
// @jsxImportSource hono/jsx
//
// Pragmas must be line-comments at the very top of the file (above
// any JSDoc) so esbuild honours them when this module is bundled into
// a downstream project. See packages/adapter-hono/src/scripts.tsx for
// the full rationale.

/**
 * BfAsync - Streaming async boundary for Hono
 *
 * Wraps Hono's Suspense for streaming SSR with BarefootJS integration.
 * When the renderer uses `{ stream: true }`, this leverages Hono's native
 * Suspense/streaming. The BarefootJS hydration runtime automatically picks
 * up components rendered inside async boundaries via requestAnimationFrame.
 *
 * The body is additionally wrapped in Hono's `ErrorBoundary` so that a
 * failure during render — a synchronous `throw` in a child, or a rejected
 * Promise during async resolution — surfaces the same `fallback` instead
 * of producing empty output (sync case) or leaking an unhandled rejection
 * (async case). Without the boundary a bare `<Suspense>` does neither:
 * a synchronous throw aborts the stream with no fallback, and a rejection
 * during streaming escapes as an unhandled rejection while the loading
 * fallback is left stranded. See `__tests__/async.test.tsx` error-path
 * cases (#1375).
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

import { Suspense } from 'hono/jsx/streaming'
import { ErrorBoundary } from 'hono/jsx'
import type { Child } from 'hono/jsx'

export interface BfAsyncProps {
  /** Content to display while the async children are loading. */
  fallback: Child
  /** Async children that will be streamed when resolved. */
  children: Child
  /**
   * Optional observer invoked when the body throws synchronously or its
   * async resolution rejects. The `fallback` is rendered either way; this
   * hook only exists so the error isn't swallowed silently (logging,
   * metrics). It does not change what is rendered.
   */
  onError?: (error: Error) => void
}

/**
 * Async streaming boundary component.
 *
 * Renders fallback content immediately (sent in the initial HTTP response
 * for fast TTFB), then streams the resolved children when ready. If the
 * body throws (sync) or rejects (async), the same fallback is rendered via
 * the surrounding `ErrorBoundary`.
 */
export function BfAsync(props: BfAsyncProps) {
  return (
    <ErrorBoundary fallback={props.fallback} onError={props.onError}>
      <Suspense fallback={props.fallback}>
        {props.children}
      </Suspense>
    </ErrorBoundary>
  )
}
