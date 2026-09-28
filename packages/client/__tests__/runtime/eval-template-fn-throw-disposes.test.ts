/**
 * Regression test for #3235's own exception path: `evalTemplateFn()` gives a
 * `template()` call a throwaway reactive root so anything it registers
 * (a signal, `onMount`/`onCleanup`) is torn down before the call returns
 * (see `template.ts`). Disposing only after a normal return would reproduce
 * the exact owner-less leak that fix closes whenever the wrapped call
 * throws instead — a documented, expected shape at some call sites (e.g.
 * `insert.ts`'s `evalBranchTemplate()` callers catch a nullable-access
 * `TypeError` thrown by the compiled template).
 */
import { describe, test, expect } from 'bun:test'
import { onMount, onCleanup } from '../../src/reactive'
import { evalTemplateFn } from '../../src/runtime/template'

describe('evalTemplateFn disposes even when the wrapped call throws', () => {
  test('onCleanup still runs exactly once when fn() throws before returning', () => {
    let cleaned = 0

    expect(() =>
      evalTemplateFn(() => {
        onMount(() => onCleanup(() => { cleaned++ }))
        throw new Error('boom')
      }),
    ).toThrow('boom')

    expect(cleaned).toBe(1)
  })

  test('a normal return still disposes exactly once', () => {
    let cleaned = 0

    const result = evalTemplateFn(() => {
      onMount(() => onCleanup(() => { cleaned++ }))
      return 'html'
    })

    expect(result).toBe('html')
    expect(cleaned).toBe(1)
  })
})
