import { describe, test, expect } from 'bun:test'
import { CSRAdapter } from '../src/csr-adapter'

describe('CSRAdapter', () => {
  test("defaults to name 'csr'", () => {
    const adapter = new CSRAdapter()
    expect(adapter.name).toBe('csr')
  })

  test('caller-supplied name wins over the default', () => {
    const adapter = new CSRAdapter({ name: 'custom-thing' })
    expect(adapter.name).toBe('custom-thing')
  })

  test('exposes the broad `acceptsTemplateCall` predicate', () => {
    const adapter = new CSRAdapter()
    expect(adapter.acceptsTemplateCall?.('JSON.stringify')).toBe(true)
    expect(adapter.acceptsTemplateCall?.('Math.random')).toBe(true)
    expect(adapter.acceptsTemplateCall?.('anyArbitraryName')).toBe(true)
  })

  test('generate() returns an empty AdapterOutput', () => {
    const adapter = new CSRAdapter()
    const out = adapter.generate()
    expect(out.template).toBe('')
    expect(out.sections.imports).toBe('')
    expect(out.sections.types).toBe('')
    expect(out.sections.component).toBe('')
    expect(out.sections.defaultExport).toBe('')
  })

  test('generate() returns a frozen sentinel — accidental mutation cannot bleed state across compilations', () => {
    const adapter = new CSRAdapter()
    const a = adapter.generate()
    const b = adapter.generate()
    // Same object identity — sentinel, not a fresh allocation.
    expect(a).toBe(b)
    // Outer object frozen.
    expect(Object.isFrozen(a)).toBe(true)
    // Nested `sections` object also frozen (Object.freeze is shallow).
    expect(Object.isFrozen(a.sections)).toBe(true)
    // Strict-mode write throws; downstream code accidentally mutating
    // the sentinel would surface loudly here instead of silently
    // leaking state into the next compilation.
    expect(() => {
      ;(a as { template: string }).template = 'mutated'
    }).toThrow(TypeError)
    expect(() => {
      ;(a.sections as { imports: string }).imports = 'mutated'
    }).toThrow(TypeError)
  })
})
