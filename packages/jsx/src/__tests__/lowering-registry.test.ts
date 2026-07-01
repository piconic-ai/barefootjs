/**
 * Lowering-plugin registry (#2057) — the extension seam for lowerings the
 * compiler core doesn't know. These tests guarantee the mechanism works: a
 * registered plugin's matcher is bound per-component and produces a
 * backend-neutral node, and the registry gates on the plugin's own import
 * recognition. (queryHref itself is NOT a plugin — it's a built-in core API
 * lowered directly by the adapters — so this uses a standalone SAMPLE plugin.)
 */

import { describe, test, expect, afterEach } from 'bun:test'
import {
  registerLoweringPlugin,
  getLoweringPlugins,
  prepareLoweringMatchers,
  matchLoweringCall,
  __resetLoweringPluginsForTest,
  type LoweringPlugin,
  type IRMetadata,
  type ParsedExpr,
} from '../index'

// A minimal sample plugin: active only when the component imports anything from
// `@sample/pkg`, and lowers a `demo(...)` call to a neutral `helper-call` node.
// This is exactly the shape a first-party / userland package would register.
const samplePlugin: LoweringPlugin = {
  name: 'sample-demo',
  prepare(metadata) {
    const active = metadata.imports.some(i => i.source === '@sample/pkg' && !i.isTypeOnly)
    if (!active) return null
    return (callee, args) =>
      callee.kind === 'identifier' && callee.name === 'demo'
        ? { kind: 'helper-call', helper: 'demo', args }
        : null
  },
}

function metadataImporting(source: string): IRMetadata {
  return {
    imports: [{ source, isTypeOnly: false, specifiers: [] }],
  } as unknown as IRMetadata
}

const demoCall = { kind: 'identifier', name: 'demo' } as ParsedExpr
const otherCall = { kind: 'identifier', name: 'other' } as ParsedExpr
const arg = { kind: 'literal', value: 'x', literalType: 'string' } as ParsedExpr

// Keep the global registry clean between tests (the sample must not leak into
// other suites that assert on the registered set).
afterEach(() => {
  const remaining = getLoweringPlugins().filter(p => p.name !== 'sample-demo')
  __resetLoweringPluginsForTest(remaining)
})

describe('lowering-plugin registry', () => {
  test('registerLoweringPlugin adds the plugin; getLoweringPlugins returns a copy', () => {
    registerLoweringPlugin(samplePlugin)
    const plugins = getLoweringPlugins()
    expect(plugins.some(p => p.name === 'sample-demo')).toBe(true)
    // Mutating the returned array can't corrupt the registry.
    ;(plugins as LoweringPlugin[]).length = 0
    expect(getLoweringPlugins().some(p => p.name === 'sample-demo')).toBe(true)
  })

  test('re-registering the same name replaces, not duplicates (idempotent)', () => {
    registerLoweringPlugin(samplePlugin)
    registerLoweringPlugin(samplePlugin)
    expect(getLoweringPlugins().filter(p => p.name === 'sample-demo')).toHaveLength(1)
  })

  test('prepare gates on the plugin recognising its own import', () => {
    registerLoweringPlugin(samplePlugin)
    // Active: component imports from @sample/pkg.
    expect(prepareLoweringMatchers(metadataImporting('@sample/pkg'))).toHaveLength(1)
    // Inactive: unrelated import → no matcher, so the adapter skips it entirely.
    expect(prepareLoweringMatchers(metadataImporting('react'))).toHaveLength(0)
  })

  test('a bound matcher lowers a recognised call to its neutral node', () => {
    registerLoweringPlugin(samplePlugin)
    const [matcher] = prepareLoweringMatchers(metadataImporting('@sample/pkg'))
    expect(matcher(demoCall, [arg])).toEqual({ kind: 'helper-call', helper: 'demo', args: [arg] })
    // A call the plugin doesn't recognise is declined (→ generic lowering).
    expect(matcher(otherCall, [arg])).toBeNull()
  })

  test('matchLoweringCall tries all registered plugins for the metadata', () => {
    registerLoweringPlugin(samplePlugin)
    expect(matchLoweringCall(demoCall, [arg], metadataImporting('@sample/pkg'))).toEqual({
      kind: 'helper-call',
      helper: 'demo',
      args: [arg],
    })
    // No matching import → null (core carries no built-in plugins).
    expect(matchLoweringCall(demoCall, [arg], metadataImporting('react'))).toBeNull()
  })
})
