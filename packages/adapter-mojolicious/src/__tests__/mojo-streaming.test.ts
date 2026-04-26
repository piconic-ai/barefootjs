/**
 * MojoAdapter - Streaming SSR Tests
 *
 * Tests the renderAsync method and streaming-related output.
 */

import { describe, test, expect } from 'bun:test'
import { MojoAdapter } from '../adapter/mojo-adapter'
import type { IRAsync, IRElement, IRComponent } from '@barefootjs/jsx'

describe('MojoAdapter - Streaming SSR', () => {
  const adapter = new MojoAdapter()

  test('renderAsync generates bf->async_boundary call with fallback', () => {
    const asyncNode: IRAsync = {
      type: 'async',
      id: 'a0',
      fallback: {
        type: 'element',
        tag: 'p',
        attrs: [],
        events: [],
        ref: null,
        children: [{ type: 'text', value: 'Loading...', loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } }],
        slotId: null,
        needsScope: false,
        loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      } as IRElement,
      children: [
        {
          type: 'component',
          name: 'ProductDetail',
          props: [],
          template: 'ProductDetail',
          slotId: null,
          children: [],
          loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        } as IRComponent,
      ],
      loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    }

    const output = adapter.renderAsync(asyncNode)

    // Should contain the async_boundary call with the ID
    expect(output).toContain("async_boundary('a0'")
    // Should contain the fallback content
    expect(output).toContain('Loading...')
  })

  test('renderNode dispatches async type correctly', () => {
    const asyncNode: IRAsync = {
      type: 'async',
      id: 'a1',
      fallback: {
        type: 'text',
        value: 'Please wait...',
        loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      },
      children: [],
      loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    }

    const output = adapter.renderNode(asyncNode)

    expect(output).toContain("'a1'")
    expect(output).toContain('Please wait...')
  })

  test('renderNode dispatches provider type (transparent)', () => {
    const providerNode = {
      type: 'provider' as const,
      contextName: 'ThemeContext',
      valueProp: { name: 'value', value: 'dark', dynamic: false },
      children: [
        { type: 'text' as const, value: 'child content', loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
      ],
      loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    }

    const output = adapter.renderNode(providerNode)
    expect(output).toBe('child content')
  })
})
