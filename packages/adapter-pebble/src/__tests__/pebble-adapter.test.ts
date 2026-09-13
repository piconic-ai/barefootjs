import { describe, expect, test } from 'bun:test'
import { PebbleAdapter, pebbleAdapter } from '../adapter/index.ts'

/**
 * Phase 1 smoke test (#2101 package skeleton). The conformance suite
 * (`runAdapterConformanceTests`, matching every sibling adapter's
 * `src/__tests__/<name>-adapter.test.ts`) is wired up once `generate()` and
 * `test-render.ts`'s Java harness are implemented in the follow-up PRs.
 */
describe('PebbleAdapter (skeleton)', () => {
  test('declares its name and extension', () => {
    expect(pebbleAdapter.name).toBe('pebble')
    expect(pebbleAdapter.extension).toBe('.peb')
    expect(pebbleAdapter.templatesPerComponent).toBe(true)
  })

  test('generate() is not yet implemented', () => {
    const adapter = new PebbleAdapter()
    expect(() => adapter.renderNode({} as never)).toThrow()
  })
})
