import { describe, test, expect } from 'bun:test'
import { collectExternalImports } from '../../ir-to-client-js/imports'
import type { ComponentIR, ImportInfo, SourceLocation } from '../../types'

const dummyLoc: SourceLocation = { file: 'test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

function makeIR(imports: ImportInfo[], componentNames: string[] = []): ComponentIR {
  const children = componentNames.map(name => ({
    type: 'component' as const,
    name,
    props: [],
    propsType: null,
    children: [],
    template: '',
    slotId: null,
    loc: dummyLoc,
  }))

  return {
    version: '0.1',
    metadata: {
      componentName: 'TestComponent',
      hasDefaultExport: true,
      isClientComponent: true,
      typeDefinitions: [],
      propsType: null,
      propsParams: [],
      propsObjectName: null,
      restPropsName: null,
      restPropsExpandedKeys: [],
      signals: [],
      memos: [],
      effects: [],
      onMounts: [],
      imports,
      localFunctions: [],
      localConstants: [],
    },
    root: {
      type: 'element',
      tag: 'div',
      attrs: [],
      events: [],
      ref: null,
      children,
      slotId: null,
      needsScope: false,
      loc: dummyLoc,
    },
    errors: [],
  }
}

function makeImport(source: string, specifiers: string[], isTypeOnly = false): ImportInfo {
  return {
    source,
    specifiers: specifiers.map(name => ({ name, alias: null, isDefault: false, isNamespace: false })),
    isTypeOnly,
    loc: dummyLoc,
  }
}

describe('collectExternalImports', () => {
  test('preserves third-party library imports used in generated code', () => {
    const ir = makeIR([makeImport('zod', ['z'])])
    const code = 'z.string().min(1)'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { z } from 'zod'"])
  })

  test('skips @barefootjs/dom imports', () => {
    const ir = makeIR([makeImport('@barefootjs/dom', ['createSignal'])])
    const code = 'createSignal(0)'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('preserves relative imports when specifiers are used in generated code', () => {
    const ir = makeIR([makeImport('./utils', ['helper'])])
    const code = 'helper()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { helper } from './utils'"])
  })

  test('skips relative imports when specifiers are not used in generated code', () => {
    const ir = makeIR([makeImport('./utils', ['helper'])])
    const code = 'somethingElse()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('skips relative imports for component names', () => {
    const ir = makeIR([makeImport('./MyWidget', ['MyWidget'])], ['MyWidget'])
    const code = 'MyWidget'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('preserves parent-relative imports when specifiers are used', () => {
    const ir = makeIR([makeImport('../shared/format', ['formatCurrency'])])
    const code = 'formatCurrency(price)'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { formatCurrency } from '../shared/format'"])
  })

  test('preserves relative import with alias when used', () => {
    const ir: ReturnType<typeof makeIR> = makeIR([{
      source: './utils',
      specifiers: [{ name: 'helper', alias: 'h', isDefault: false, isNamespace: false }],
      isTypeOnly: false,
      loc: dummyLoc,
    }])
    const code = 'h()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { helper as h } from './utils'"])
  })

  test('only preserves used specifiers from relative import with mixed usage', () => {
    const ir = makeIR([makeImport('./utils', ['used', 'unused'])])
    const code = 'used()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { used } from './utils'"])
  })

  test('preserves @ui/ imports by default (no localImportPrefixes)', () => {
    const ir = makeIR([makeImport('@ui/components/ui/input-otp', ['REGEXP_ONLY_DIGITS'])])
    const code = 'REGEXP_ONLY_DIGITS'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { REGEXP_ONLY_DIGITS } from '@ui/components/ui/input-otp'"])
  })

  test('preserves @/ imports by default (no localImportPrefixes)', () => {
    const ir = makeIR([makeImport('@/lib/utils', ['formatDate'])])
    const code = 'formatDate(date)'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { formatDate } from '@/lib/utils'"])
  })

  test('skips @ui/ imports when localImportPrefixes includes @ui/', () => {
    const ir = makeIR([makeImport('@ui/components/ui/input-otp', ['REGEXP_ONLY_DIGITS'])])
    const code = 'REGEXP_ONLY_DIGITS'
    const result = collectExternalImports(ir, code, ['@/', '@ui/'])
    expect(result).toEqual([])
  })

  test('skips @/ imports when localImportPrefixes includes @/', () => {
    const ir = makeIR([makeImport('@/lib/utils', ['formatDate'])])
    const code = 'formatDate(date)'
    const result = collectExternalImports(ir, code, ['@/', '@ui/'])
    expect(result).toEqual([])
  })

  test('skips custom prefix when specified in localImportPrefixes', () => {
    const ir = makeIR([makeImport('~/lib/helpers', ['doStuff'])])
    const code = 'doStuff()'
    const result = collectExternalImports(ir, code, ['~/'])
    expect(result).toEqual([])
  })

  test('skips type-only imports', () => {
    const ir = makeIR([makeImport('some-lib', ['SomeType'], true)])
    const code = 'SomeType'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('skips component names even if in third-party import', () => {
    const ir = makeIR([makeImport('some-lib', ['MyComponent', 'helper'])], ['MyComponent'])
    const code = 'MyComponent helper()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { helper } from 'some-lib'"])
  })

  test('skips specifiers not used in generated code', () => {
    const ir = makeIR([makeImport('some-lib', ['used', 'unused'])])
    const code = 'used()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { used } from 'some-lib'"])
  })

  test('does not skip scoped npm packages starting with @', () => {
    const ir = makeIR([makeImport('@barefootjs/form', ['useForm'])])
    const code = 'useForm()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { useForm } from '@barefootjs/form'"])
  })
})
