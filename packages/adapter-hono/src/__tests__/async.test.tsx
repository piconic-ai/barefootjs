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

    const chunks = await collectStream(stream)

    // First chunk has fallback
    expect(chunks[0]).toContain('Loading...')
    // Later chunk has resolved content
    const fullOutput = chunks.join('')
    expect(fullOutput).toContain('Loaded!')
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

  it('renders synchronous children without streaming', async () => {
    const SyncContent = () => <div>Already here</div>

    const stream = renderToReadableStream(
      <BfAsync fallback={<p>Loading...</p>}>
        <SyncContent />
      </BfAsync>
    )

    const chunks = await collectStream(stream)

    // Synchronous content should be in the first chunk (no fallback needed)
    expect(chunks[0]).toContain('Already here')
  })
})
