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

  const loc = { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } as const

  function asyncNode(id: string, fallbackText: string): IRAsync {
    return {
      type: 'async',
      id,
      fallback: {
        type: 'element',
        tag: 'p',
        attrs: [],
        events: [],
        ref: null,
        children: [{ type: 'text', value: fallbackText, loc }],
        slotId: null,
        needsScope: false,
        loc,
      } as IRElement,
      children: [
        {
          type: 'component',
          name: 'ProductDetail',
          props: [],
          template: 'ProductDetail',
          slotId: null,
          children: [],
          loc,
        } as IRComponent,
      ],
      loc,
    }
  }

  test('renderAsync generates bf->async_boundary call with fallback', () => {
    const output = adapter.renderAsync(asyncNode('a0', 'Loading...'))

    // Should contain the async_boundary call with the ID
    expect(output).toContain("async_boundary('a0'")
    // Should contain the fallback content
    expect(output).toContain('Loading...')
  })

  // #1298: the previous renderAsync emitted
  //   `<%== bf->async_boundary('a0', begin %>…<% end) %>`
  // which split the call across template-text and `<%== %>` regions —
  // the inner `%>` closed the outer interpolation, leaving the trailing
  // `)` in plain template text and breaking Mojo's lexer. The fix is to
  // capture the fallback into a CODE ref in its own action and pass the
  // variable to async_boundary. These tests pin the structural
  // invariants of the captured-variable shape so a regression to the
  // inlined form (or any shape that re-introduces unbalanced `%>`)
  // fails here, not at template-parse time.
  describe('renderAsync emits balanced Mojo syntax (#1298)', () => {
    test('captures fallback into its own `begin %>…<% end %>` action before calling async_boundary', () => {
      const output = adapter.renderAsync(asyncNode('a0', 'Loading...'))

      // A capture action precedes the call.
      expect(output).toMatch(/<%\s*my\s+\$bf_async_fallback_a0\s*=\s*begin\s*%>/)
      expect(output).toContain('<% end %>')
      // The call site references the variable, not an inlined `begin`.
      expect(output).toMatch(/<%==\s*bf->async_boundary\('a0',\s*\$bf_async_fallback_a0\s*\)\s*%>/)
      // No nested `begin` inside the `<%== ... %>` block — that was the
      // exact malformation #1298 fixed.
      expect(output).not.toMatch(/<%==\s*bf->async_boundary\([^)]*begin/)
    })

    test('every `<%` / `<%==` opener has a matching `%>` closer', () => {
      const output = adapter.renderAsync(asyncNode('a0', 'Loading...'))

      // Count `<%`-prefixed openers (including `<%==`) vs `%>` closers.
      // Unbalanced counts indicate a stray `%>` (the #1298 failure mode)
      // or a stray opener.
      const openers = (output.match(/<%/g) ?? []).length
      const closers = (output.match(/%>/g) ?? []).length
      expect(openers).toBe(closers)
    })

    test('multiple <Async> boundaries get distinct capture variable names', () => {
      const a = adapter.renderAsync(asyncNode('a0', 'first'))
      const b = adapter.renderAsync(asyncNode('a1', 'second'))

      expect(a).toContain('$bf_async_fallback_a0')
      expect(b).toContain('$bf_async_fallback_a1')
      // Cross-contamination would let one boundary's resolve overwrite
      // another's fallback variable on the page.
      expect(a).not.toContain('$bf_async_fallback_a1')
      expect(b).not.toContain('$bf_async_fallback_a0')
    })
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

  test('renderNode dispatches provider type (brackets children with provide/revoke)', () => {
    // SSR context propagation (#1297): the provider is no longer transparent —
    // it pushes its value before the children and pops it after so a
    // descendant `useContext` consumer reads it during the same render.
    const providerNode = {
      type: 'provider' as const,
      contextName: 'ThemeContext',
      valueProp: { name: 'value', value: { kind: 'literal' as const, value: 'dark' } },
      children: [
        { type: 'text' as const, value: 'child content', loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
      ],
      loc: { file: '', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    }

    const output = adapter.renderNode(providerNode)
    expect(output).toBe(
      "<% bf->provide_context('ThemeContext', 'dark'); %>child content<% bf->revoke_context('ThemeContext'); %>",
    )
  })
})
