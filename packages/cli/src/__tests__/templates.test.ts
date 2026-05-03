import { describe, test, expect } from 'bun:test'
import { ADAPTERS, DEFAULT_ADAPTER, CSS_LIBRARIES, DEFAULT_CSS_LIBRARY } from '../lib/templates'

describe('adapter registry', () => {
  test('default adapter is registered', () => {
    expect(ADAPTERS[DEFAULT_ADAPTER]).toBeDefined()
  })

  test('default adapter is hono', () => {
    expect(DEFAULT_ADAPTER).toBe('hono')
  })

  test.each(['hono', 'echo', 'mojo'])('%s adapter is registered', id => {
    expect(ADAPTERS[id]).toBeDefined()
  })

  test('every adapter has a label, port, and barefoot.config.ts file', () => {
    for (const [id, adapter] of Object.entries(ADAPTERS)) {
      expect(adapter.label, `${id} missing label`).toBeTruthy()
      expect(adapter.port, `${id} missing port`).toBeGreaterThan(0)
      expect(adapter.files['barefoot.config.ts'], `${id} missing barefoot.config.ts`).toBeTruthy()
    }
  })

  test('every adapter contributes a Counter component', () => {
    for (const [id, adapter] of Object.entries(ADAPTERS)) {
      expect(
        adapter.files['components/Counter.tsx'],
        `${id} missing components/Counter.tsx`,
      ).toBeTruthy()
    }
  })

  test('echo bundles the vendored Go runtime', () => {
    const echo = ADAPTERS.echo
    expect(echo.files['bf-runtime/bf.go']).toMatch(/package bf/)
    expect(echo.files['bf-runtime/streaming.go']).toBeTruthy()
    expect(echo.files['bf-runtime/go.mod']).toMatch(/^module github\.com\/barefootjs\/runtime\/bf/m)
    expect(echo.files['go.mod']).toMatch(/replace github\.com\/barefootjs\/runtime\/bf => \.\/bf-runtime/)
  })

  test('mojo bundles the vendored Perl plugin', () => {
    const mojo = ADAPTERS.mojo
    expect(mojo.files['lib/BarefootJS.pm']).toMatch(/^package BarefootJS;/m)
    expect(mojo.files['lib/Mojolicious/Plugin/BarefootJS.pm']).toMatch(/^package Mojolicious::Plugin::BarefootJS;/m)
    expect(mojo.files['cpanfile']).toMatch(/^requires 'Mojolicious'/m)
  })
})

describe('CSS library registry', () => {
  test('default CSS library is registered', () => {
    expect(CSS_LIBRARIES[DEFAULT_CSS_LIBRARY]).toBeDefined()
  })

  test('default CSS library is unocss', () => {
    expect(DEFAULT_CSS_LIBRARY).toBe('unocss')
  })

  test('every CSS library entry has a label', () => {
    for (const [id, lib] of Object.entries(CSS_LIBRARIES)) {
      expect(lib.label, `CSS library ${id} missing label`).toBeTruthy()
    }
  })
})
