import { describe, expect, test } from 'bun:test'
import { combineGoTypes, deduplicateGoTypes } from '../build'

describe('combineGoTypes stdlib imports', () => {
  // The combined types file strips each component's own import block and
  // rebuilds one header, pulling in stdlib packages only when the merged code
  // references them. A `searchParams()`-backed constructor emits
  // `strings.TrimRight(in.Base, "/")`, so the header must include "strings" or
  // the generated file fails to compile (`undefined: strings`).
  test('adds "strings" import when a constructor uses strings.*', () => {
    const types = new Map<string, string>([
      [
        'Foo',
        [
          'package main',
          '',
          'import (',
          '\t"strings"',
          ')',
          '',
          'func NewFooProps(in FooInput) FooProps {',
          '\treturn FooProps{Root: strings.TrimRight(in.Base, "/")}',
          '}',
        ].join('\n'),
      ],
    ])
    const result = combineGoTypes({ types, packageName: 'main' })
    expect(result).toContain('\t"strings"')
  })

  test('omits "strings" import when unused', () => {
    const types = new Map<string, string>([
      [
        'Foo',
        ['package main', '', 'func NewFooProps(in FooInput) FooProps {', '\treturn FooProps{}', '}'].join('\n'),
      ],
    ])
    const result = combineGoTypes({ types, packageName: 'main' })
    expect(result).not.toContain('"strings"')
  })
})

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
