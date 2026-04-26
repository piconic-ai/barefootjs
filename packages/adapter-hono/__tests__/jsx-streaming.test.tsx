/** @jsxImportSource @barefootjs/hono/jsx */
/**
 * JSX Streaming Tests for @barefootjs/hono/jsx
 *
 * These tests verify that @barefootjs/hono/jsx properly supports
 * Hono's Suspense and streaming functionality.
 */
import { describe, it, expect } from 'bun:test'
import { Suspense, renderToReadableStream } from 'hono/jsx/streaming'
import type { HtmlEscapedString } from 'hono/utils/html'

describe('@barefootjs/hono/jsx Streaming', () => {
  it('Suspense / renderToReadableStream basic', async () => {
    let contentEvaluatedCount = 0
    const Content = () => {
      contentEvaluatedCount++
      const content = new Promise<HtmlEscapedString>((resolve) =>
        setTimeout(() => resolve(<h1>Hello</h1>), 10)
      )
      return content
    }

    const stream = renderToReadableStream(
      <Suspense fallback={<p>Loading...</p>}>
        <Content />
      </Suspense>
    )

    const chunks: string[] = []
    const textDecoder = new TextDecoder()
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(textDecoder.decode(chunk))
    }

    // First chunk should contain the fallback
    expect(chunks[0]).toContain('Loading...')
    // Second chunk should contain the resolved content with template and script
    expect(chunks[1]).toContain('Hello')
    expect(chunks[1]).toContain('template')

    expect(contentEvaluatedCount).toEqual(1)
  })

  it('Suspense with nested elements', async () => {
    const AsyncContent = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return (
        <div>
          <h1>Title</h1>
          <p>Content</p>
        </div>
      )
    }

    const stream = renderToReadableStream(
      <Suspense fallback={<span>Loading...</span>}>
        <AsyncContent />
      </Suspense>
    )

    const chunks: string[] = []
    const textDecoder = new TextDecoder()
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(textDecoder.decode(chunk))
    }

    // Verify streaming output contains fallback and resolved content
    expect(chunks[0]).toContain('Loading...')
    expect(chunks[1]).toContain('Title')
    expect(chunks[1]).toContain('Content')
  })

  it('Multiple Suspense boundaries', async () => {
    const SlowContent = async ({ id }: { id: number }) => {
      await new Promise((resolve) => setTimeout(resolve, 10 * id))
      return <span>Content {id}</span>
    }

    const stream = renderToReadableStream(
      <div>
        <Suspense fallback={<p>Loading 1...</p>}>
          <SlowContent id={1} />
        </Suspense>
        <Suspense fallback={<p>Loading 2...</p>}>
          <SlowContent id={2} />
        </Suspense>
      </div>
    )

    const chunks: string[] = []
    const textDecoder = new TextDecoder()
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(textDecoder.decode(chunk))
    }

    // Verify all chunks contain expected content
    const fullOutput = chunks.join('')
    expect(fullOutput).toContain('Content 1')
    expect(fullOutput).toContain('Content 2')
  })
})
