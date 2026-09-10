// Floor test for adapter-doc-catalog.ts — keeps README.md and
// docs/core/core-concepts/backend-freedom.md from silently going stale
// the way backend-freedom.md did before this file existed (it kept
// listing shipped adapters as "Planned").

import { describe, test, expect } from 'bun:test'
import { ADAPTER_ENTRIES, assertAdapterDocCatalogComplete } from '../adapter-doc-catalog'
import { COMPAT_ADAPTER_PACKAGES } from '../adapter-registry'

describe('adapter-doc-catalog', () => {
  test('covers exactly the packages registered in adapter-registry.ts', () => {
    expect(() => assertAdapterDocCatalogComplete()).not.toThrow()
  })

  test('every row package name is unique', () => {
    const allPackages = ADAPTER_ENTRIES.map(e => e.pkg)
    expect(new Set(allPackages).size).toBe(allPackages.length)
  })

  test('catches a package registered but not catalogued', () => {
    const registered = [...COMPAT_ADAPTER_PACKAGES, '@barefootjs/new-adapter']
    const cataloged = new Set(ADAPTER_ENTRIES.map(e => e.pkg))
    const missing = registered.filter(pkg => !cataloged.has(pkg))
    expect(missing).toEqual(['@barefootjs/new-adapter'])
  })
})
