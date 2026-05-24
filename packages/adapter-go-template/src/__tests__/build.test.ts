import { describe, expect, test } from 'bun:test'
import { deduplicateGoTypes } from '../build'

describe('deduplicateGoTypes', () => {
  test('deduplicates NewXxxProps with single-line doc comment', () => {
    const input = [
      '// NewFooProps creates FooProps from FooInput.',
      'func NewFooProps(in FooInput) FooProps {',
      '\treturn FooProps{}',
      '}',
      '',
      '// NewFooProps creates FooProps from FooInput.',
      'func NewFooProps(in FooInput) FooProps {',
      '\tscopeID := in.ScopeID',
      '\treturn FooProps{ScopeID: scopeID}',
      '}',
    ].join('\n')

    const result = deduplicateGoTypes(input)
    const matches = result.match(/func NewFooProps/g)
    expect(matches).toHaveLength(1)
    expect(result).toContain('ScopeID')
  })

  test('deduplicates NewXxxProps with multi-line doc comment', () => {
    const input = [
      '// NewBarProps creates BarProps from BarInput.',
      '//',
      '// NOTE: `Items` is populated by the route handler.',
      'func NewBarProps(in BarInput) BarProps {',
      '\treturn BarProps{}',
      '}',
      '',
      '// NewBarProps creates BarProps from BarInput.',
      '//',
      '// NOTE: `Items` is populated by the route handler.',
      'func NewBarProps(in BarInput) BarProps {',
      '\tscopeID := in.ScopeID',
      '\treturn BarProps{ScopeID: scopeID}',
      '}',
    ].join('\n')

    const result = deduplicateGoTypes(input)
    const matches = result.match(/func NewBarProps/g)
    expect(matches).toHaveLength(1)
    expect(result).toContain('ScopeID')
  })

  test('preserves multi-line doc comment in output', () => {
    const input = [
      '// NewBazProps creates BazProps from BazInput.',
      '//',
      '// NOTE: `Children` is populated by the route handler, not by',
      '// NewBazProps — the SSR template iterates over it.',
      'func NewBazProps(in BazInput) BazProps {',
      '\tscopeID := in.ScopeID',
      '\treturn BazProps{ScopeID: scopeID}',
      '}',
    ].join('\n')

    const result = deduplicateGoTypes(input)
    expect(result).toContain('NOTE: `Children` is populated by the route handler')
    expect(result).toContain('func NewBazProps')
  })
})
