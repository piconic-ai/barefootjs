/** @jsxImportSource hono/jsx */
/**
 * BfAsync Component Tests
 *
 * Verifies that BfAsync properly wraps Hono's Suspense
 * for streaming SSR with BarefootJS components.
 */
import { describe, it, expect } from 'bun:test'
import { renderToReadableStream } from 'hono/jsx/streaming'
import type { HtmlEscapedString } from 'hono/utils/html'
import { BfAsync } from '../async'

async function collectStream(stream: ReadableStream): Promise<string[]> {
  const chunks: string[] = []
  const decoder = new TextDecoder()
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(decoder.decode(chunk))
  }
  return chunks
}

describe('BfAsync', () => {
  it('streams fallback then resolved content', async () => {
    const AsyncContent = () => {
      return new Promise<HtmlEscapedString>((resolve) =>
        setTimeout(() => resolve(<div>Loaded!</div>), 10)
      )
    }

    const stream = renderToReadableStream(
      <BfAsync fallback={<p>Loading...</p>}>
        <AsyncContent />
      </BfAsync>
    )

    const fullOutput = (await collectStream(stream)).join('')

    // Fallback streams first, resolved content swaps in afterwards. The
    // body is wrapped in an ErrorBoundary (#1375) whose template/swap
    // markers now lead the stream, so assert ordering across the full
    // output rather than pinning the fallback to a literal `chunks[0]`.
    expect(fullOutput).toContain('Loading...')
    expect(fullOutput).toContain('Loaded!')
    expect(fullOutput.indexOf('Loading...')).toBeLessThan(fullOutput.indexOf('Loaded!'))
  })

  it('renders multiple async boundaries independently', async () => {
    const SlowContent = ({ id }: { id: number }) => {
      return new Promise<HtmlEscapedString>((resolve) =>
        setTimeout(() => resolve(<span>Content {id}</span>), 10 * id)
      )
    }

    const stream = renderToReadableStream(
      <div>
        <BfAsync fallback={<p>Loading 1...</p>}>
          <SlowContent id={1} />
        </BfAsync>
        <BfAsync fallback={<p>Loading 2...</p>}>
          <SlowContent id={2} />
        </BfAsync>
      </div>
    )

    const chunks = await collectStream(stream)
    const fullOutput = chunks.join('')

    expect(fullOutput).toContain('Content 1')
    expect(fullOutput).toContain('Content 2')
  })

  it('preserves BarefootJS hydration markers in async content', async () => {
    const AsyncComponent = () => {
      return new Promise<HtmlEscapedString>((resolve) =>
        setTimeout(() => resolve(
          <div bf-s="Counter_abc" bf-p='{"count":0}'>0</div>
        ), 10)
      )
    }

    const stream = renderToReadableStream(
      <BfAsync fallback={<p>Loading...</p>}>
        <AsyncComponent />
      </BfAsync>
    )

    const chunks = await collectStream(stream)
    const fullOutput = chunks.join('')

    expect(fullOutput).toContain('bf-s="Counter_abc"')
    expect(fullOutput).toContain('bf-p=')
  })

  it('renders synchronous children without a fallback flash', async () => {
    const SyncContent = () => <div>Already here</div>

    const stream = renderToReadableStream(
      <BfAsync fallback={<p>Loading...</p>}>
        <SyncContent />
      </BfAsync>
    )

    const fullOutput = (await collectStream(stream)).join('')

    // Synchronous content needs no fallback round-trip: it resolves in the
    // initial flush and the loading fallback never appears. The
    // ErrorBoundary wrapper (#1375) routes the content through a
    // template/swap chunk, so it is no longer literally `chunks[0]`, but
    // there is still no `Loading...` flash.
    expect(fullOutput).toContain('Already here')
    expect(fullOutput).not.toContain('Loading...')
  })
})

// ---------------------------------------------------------------------------
// Error paths (#1375): a body that throws — synchronously or asynchronously.
//
// A bare `<Suspense>` mishandles both: a synchronous throw aborts the stream
// with empty output (no fallback), and a rejection during async resolution
// escapes as an unhandled rejection while the loading fallback is stranded.
// `BfAsync` wraps the body in Hono's `ErrorBoundary` so the same `fallback`
// is rendered on either failure and the error never leaks.
//
// These are the two cases the Layer 1 / streaming layer can observe directly
// (a single SSR render). The remaining catalog cases — reset-signal re-mount
// and throw-during-cleanup — are client-lifecycle behaviours covered by the
// Layer 6 fixme stubs in `site/ui/e2e/stress-1244.spec.ts`.
// ---------------------------------------------------------------------------

describe('BfAsync — error paths (#1375)', () => {
  // A render that errors must not surface a stray unhandled rejection on the
  // process: install a guard for the duration of each test and assert it
  // stayed quiet. `BfAsync`'s ErrorBoundary is what keeps it quiet.
  function trackUnhandledRejections(): { count: () => number; restore: () => void } {
    let n = 0
    const onRejection = () => {
      n++
    }
    process.on('unhandledRejection', onRejection)
    return {
      count: () => n,
      restore: () => process.off('unhandledRejection', onRejection),
    }
  }

  it('synchronous throw in the body renders the fallback (not empty output)', async () => {
    const Boom = (): HtmlEscapedString => {
      throw new Error('sync-boom')
    }

    const guard = trackUnhandledRejections()
    let onErrorMessage: string | undefined
    try {
      const stream = renderToReadableStream(
        <BfAsync
          fallback={<p>Fallback shown</p>}
          onError={(e) => {
            onErrorMessage = e.message
          }}
        >
          <Boom />
        </BfAsync>
      )
      const fullOutput = (await collectStream(stream)).join('')

      // The fallback is rendered (a bare <Suspense> would yield empty output).
      expect(fullOutput).toContain('Fallback shown')
      // onError observed the failure so it isn't swallowed silently.
      expect(onErrorMessage).toBe('sync-boom')
    } finally {
      guard.restore()
    }
  })

  it('async rejection during resolution renders the fallback and leaks no rejection', async () => {
    const Rejects = (): Promise<HtmlEscapedString> =>
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('async-boom')), 10)
      )

    const guard = trackUnhandledRejections()
    let onErrorMessage: string | undefined
    try {
      const stream = renderToReadableStream(
        <BfAsync
          fallback={<p>Fallback shown</p>}
          onError={(e) => {
            onErrorMessage = e.message
          }}
        >
          <Rejects />
        </BfAsync>
      )
      const fullOutput = (await collectStream(stream)).join('')

      // Fallback is the final rendered state; the rejected content never
      // mutates into the DOM late.
      expect(fullOutput).toContain('Fallback shown')
      expect(onErrorMessage).toBe('async-boom')

      // Give any stray rejection a tick to surface, then assert none did.
      await new Promise((r) => setTimeout(r, 0))
      expect(guard.count()).toBe(0)
    } finally {
      guard.restore()
    }
  })

  it('the happy path still streams resolved content past the error boundary', async () => {
    // Wrapping the body in ErrorBoundary must not regress normal streaming.
    const AsyncContent = () =>
      new Promise<HtmlEscapedString>((resolve) =>
        setTimeout(() => resolve(<div>Loaded past boundary</div>), 10)
      )

    const stream = renderToReadableStream(
      <BfAsync fallback={<p>Loading...</p>}>
        <AsyncContent />
      </BfAsync>
    )

    const fullOutput = (await collectStream(stream)).join('')
    expect(fullOutput).toContain('Loaded past boundary')
  })
})
