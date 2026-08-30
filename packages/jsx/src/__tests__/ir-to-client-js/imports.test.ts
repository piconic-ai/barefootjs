import { describe, test, expect } from 'bun:test'
import { collectExternalImports, collectUserDomImports } from '../../ir-to-client-js/imports'
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
      isExported: true,
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
      templateImports: imports.filter(imp => !['@barefootjs/client', '@barefootjs/client'].includes(imp.source)),
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

function makeSideEffectImport(source: string): ImportInfo {
  return {
    source,
    specifiers: [],
    isTypeOnly: false,
    loc: dummyLoc,
  }
}

/** `import <localName> from 'source'`, optionally alongside named specifiers. */
function makeDefaultImport(source: string, localName: string, namedSpecifiers: string[] = []): ImportInfo {
  return {
    source,
    specifiers: [
      { name: localName, alias: null, isDefault: true, isNamespace: false },
      ...namedSpecifiers.map(name => ({ name, alias: null, isDefault: false, isNamespace: false })),
    ],
    isTypeOnly: false,
    loc: dummyLoc,
  }
}

/** `import * as localName from 'source'`. */
function makeNamespaceImport(source: string, localName: string): ImportInfo {
  return {
    source,
    specifiers: [{ name: localName, alias: null, isDefault: false, isNamespace: true }],
    isTypeOnly: false,
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

  // #2767 follow-up: a default-imported binding (e.g. a JSON module's
  // `import lock from '...json' with { type: 'json' }`) was previously
  // always re-emitted as a NAMED import (`import { lock } from '...'`),
  // which is a real, silently-wrong ESM import — the module has no such
  // named export — that only failed once a bundler actually resolved it.
  test('preserves a default import with correct default-import syntax, not named braces', () => {
    const ir = makeIR([makeDefaultImport('../data.json', 'lock')])
    const code = 'lock.adapters'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import lock from '../data.json'"])
  })

  test('preserves a namespace import with correct namespace-import syntax', () => {
    const ir = makeIR([makeNamespaceImport('./ns-module', 'NS')])
    const code = 'NS.helper()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import * as NS from './ns-module'"])
  })

  test('combines a used default specifier with used named specifiers on one declaration', () => {
    const ir = makeIR([makeDefaultImport('./mixed', 'Default', ['helper', 'other'])])
    const code = 'Default(); helper()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import Default, { helper } from './mixed'"])
  })

  test('drops an unused default specifier but keeps a used named sibling', () => {
    const ir = makeIR([makeDefaultImport('./mixed', 'Default', ['helper'])])
    const code = 'helper()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { helper } from './mixed'"])
  })

  // `import Foo, * as NS from 'x'` is legal JS, but never emitted as one
  // line — a namespace specifier always gets its own declaration (see
  // `renderUsedImportLines`'s docstring). Pin the two-line output so a
  // future refactor can't silently collapse or drop one of them.
  test('a used default specifier and a used namespace specifier from the same source emit two separate lines', () => {
    const ir = makeIR([
      {
        source: './both',
        specifiers: [
          { name: 'Foo', alias: null, isDefault: true, isNamespace: false },
          { name: 'NS', alias: null, isDefault: false, isNamespace: true },
        ],
        isTypeOnly: false,
        loc: dummyLoc,
      },
    ])
    const code = 'Foo(); NS.helper()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import Foo from './both'", "import * as NS from './both'"])
  })

  test('a default-imported COMPONENT is skipped, same as a named-imported one', () => {
    const ir = makeIR([makeDefaultImport('./button', 'Button')], ['Button'])
    const code = '<Button/>'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('rewrites a default import to the .client.js sibling when its source is a client-signal import', () => {
    const ir = makeIR([makeDefaultImport('./state', 'store')])
    ir.metadata.clientSignalImportSources = new Set(['./state'])
    const code = 'store.count'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import store from './state.client.js'"])
  })

  test('rewrites a namespace import to the .client.js sibling when its source is a client-signal import', () => {
    const ir = makeIR([makeNamespaceImport('./state', 'NS')])
    ir.metadata.clientSignalImportSources = new Set(['./state'])
    const code = 'NS.count'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import * as NS from './state.client.js'"])
  })

  test('drops an unused namespace specifier entirely', () => {
    const ir = makeIR([makeNamespaceImport('./ns-module', 'NS')])
    const code = 'somethingElse()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('skips @barefootjs/client imports', () => {
    const ir = makeIR([makeImport('@barefootjs/client', ['createSignal'])])
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

  test('preserves side-effect imports (empty specifiers)', () => {
    const ir = makeIR([makeSideEffectImport('@barefootjs/chart')])
    const code = ''
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import '@barefootjs/chart'"])
  })

  test('skips @barefootjs/client side-effect imports', () => {
    const ir = makeIR([{ source: '@barefootjs/client', specifiers: [], isTypeOnly: false, loc: dummyLoc }])
    const code = ''
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('skips side-effect imports matching localImportPrefixes', () => {
    const ir = makeIR([makeSideEffectImport('@ui/styles/theme')])
    const code = ''
    const result = collectExternalImports(ir, code, ['@ui/'])
    expect(result).toEqual([])
  })

  test('preserves side-effect imports alongside normal imports', () => {
    const ir = makeIR([
      makeSideEffectImport('@barefootjs/chart'),
      makeImport('zod', ['z']),
    ])
    const code = 'z.string()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([
      "import '@barefootjs/chart'",
      "import { z } from 'zod'",
    ])
  })

  // #2432: `collectExternalImports` used a `\bname\b` text scan to decide
  // which specifiers survive into the client bundle. That scan never
  // consulted the per-specifier `isTypeOnly` flag, so a per-specifier
  // `import { paperColor, type Theme } from '../lib/theme'` re-emitted
  // `Theme` as a VALUE import whenever the word "Theme" merely appeared in
  // the generated code (e.g. as an object key) — the CLI's relative-import
  // inliner then put `Theme` in the IIFE's `return { … }` with no binding,
  // producing `ReferenceError: Theme is not defined` at load.
  test('per-specifier type-only specifier is not emitted, while its value sibling is (#2432)', () => {
    const ir: ReturnType<typeof makeIR> = makeIR([{
      source: '../lib/theme',
      specifiers: [
        { name: 'paperColor', alias: null, isDefault: false, isNamespace: false },
        { name: 'Theme', alias: null, isDefault: false, isNamespace: false, isTypeOnly: true },
      ],
      isTypeOnly: false,
      loc: dummyLoc,
    }])
    const code = "const labels = { Theme: 'テーマ' };\nconst c = paperColor({ paper: '#fff' });"
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { paperColor } from '../lib/theme'"])
  })

  test('a value specifier that appears ONLY as an object key is not emitted (#2432)', () => {
    const ir = makeIR([makeImport('./utils', ['helper'])])
    const code = 'const o = { helper: 1 };'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('a value specifier that appears ONLY inside a string literal is not emitted (#2432)', () => {
    const ir = makeIR([makeImport('./utils', ['helper'])])
    const code = "const s = 'helper is a function';"
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('a value specifier that appears ONLY as a property-access name is not emitted (#2432)', () => {
    const ir = makeIR([makeImport('./utils', ['helper'])])
    const code = 'obj.helper();'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  test('a value specifier used via shorthand property IS emitted (#2432)', () => {
    const ir = makeIR([makeImport('./utils', ['helper'])])
    const code = 'const o = { helper };'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { helper } from './utils'"])
  })

  test('unparseable generated text falls back to the text scan (#2432)', () => {
    const ir = makeIR([makeImport('some-lib', ['helper'])])
    const code = 'MyComponent helper()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { helper } from 'some-lib'"])
  })

  // These two pin the fallback branch specifically (generated text that does
  // NOT parse cleanly, so `makeValueUsageTest` falls back to a substring
  // scan rather than the AST-based value-reference set). #2432: the
  // fallback used to be a `new RegExp(`\\b${localName}\\b`)` scan, which
  // silently DROPPED the import for either shape below — `\b` isn't defined
  // for `$` or non-ASCII characters, and `$` is also a regex metacharacter
  // (end-of-input anchor) when spliced unescaped into `new RegExp(...)`, so
  // `\b$fetch\b` could never match `$fetch` at all. Dropping the import is
  // the one failure direction this helper must never take.
  test('fallback matches a $-prefixed specifier (#2432)', () => {
    const ir = makeIR([makeImport('ofetch', ['$fetch'])])
    const code = 'MyComponent $fetch()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { $fetch } from 'ofetch'"])
  })

  test('fallback matches a non-ASCII specifier (#2432)', () => {
    const ir = makeIR([makeImport('some-lib', ['日本語'])])
    const code = 'MyComponent 日本語()'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { 日本語 } from 'some-lib'"])
  })

  // #2432 follow-up: a class field name is a member key, not a read — the
  // same treatment as an object-literal key above.
  test('a specifier that appears ONLY as a class field name is not emitted (#2432 follow-up)', () => {
    const ir = makeIR([makeImport('./utils', ['helper'])])
    const code = 'class Widget { helper = 1 }'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual([])
  })

  // #2432 follow-up: a COMPUTED class field name (`[helper]`) IS a read of
  // the binding — pins that the class-field exclusion didn't over-exclude.
  test('a specifier that appears as a COMPUTED class field name IS emitted (#2432 follow-up)', () => {
    const ir = makeIR([makeImport('./utils', ['helper'])])
    const code = 'class Widget { [helper] = 1 }'
    const result = collectExternalImports(ir, code)
    expect(result).toEqual(["import { helper } from './utils'"])
  })
})

describe('collectUserDomImports', () => {
  test('per-specifier type-only specifier is not emitted from the runtime subpath (#2432)', () => {
    const ir = makeIR([{
      source: '@barefootjs/client',
      specifiers: [
        { name: 'createSignal', alias: null, isDefault: false, isNamespace: false },
        { name: 'Signal', alias: null, isDefault: false, isNamespace: false, isTypeOnly: true },
      ],
      isTypeOnly: false,
      loc: dummyLoc,
    }])
    const result = collectUserDomImports(ir)
    expect(result).toEqual(['createSignal'])
  })
})
