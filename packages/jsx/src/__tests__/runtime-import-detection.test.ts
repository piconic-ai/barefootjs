/**
 * Runtime imports come from the names the client JS leaves unbound (#3537).
 *
 * `detectUsedImports` used to regex-scan the emitted code for `name(`, so a
 * user helper that shared a runtime export's name (`function insert`) got a
 * runtime `import { insert }` next to its own `var insert`, a duplicate
 * declaration. Detection now resolves scopes; a module-level binding that
 * collides with a runtime helper is BF057, since it would capture the
 * compiler's own calls to that helper.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { detectUsedImports } from '../ir-to-client-js/imports'

const adapter = new TestAdapter()
const transpiler = new Bun.Transpiler({ loader: 'js' })

function compile(moduleCode: string, body = '<button onClick={() => setItems(items().concat("a"))}>{items().length}</button>') {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    ${moduleCode}
    export function T() {
      const [items, setItems] = createSignal<string[]>([])
      return ${body}
    }
  `
  const result = compileJSX(source, 'T.tsx', { adapter })
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content ?? ''
  return { errors: result.errors, clientJs }
}

const runtimeImportLine = (js: string) => js.split('\n').find(l => l.includes("from '@barefootjs/client/runtime'")) ?? ''

describe('runtime import detection resolves scopes (#3537)', () => {
  test('a module-level helper named like a runtime export is BF057', () => {
    const { errors } = compile(
      'function insert(list: string[], x: string) { return [...list, x] }',
      '<button onClick={() => setItems(insert(items(), "a"))}>{items().length}</button>',
    )
    expect(errors.map(e => e.code)).toContain('BF057')
  })

  test('a module-level binding named like a runtime export but never called stays legal', () => {
    const { errors, clientJs } = compile(
      'const qsa = { step: 1 }',
      '<button onClick={() => setItems(items().concat(String(qsa.step)))}>{items().length}</button>',
    )
    expect(errors).toHaveLength(0)
    expect(() => transpiler.transformSync(clientJs)).not.toThrow()
  })

  test('a value import of a name the compiler always calls is BF057', () => {
    // Every client module registers itself with `hydrate(…)`.
    expect(compile("import hydrate from './lib'").errors.map(e => e.code)).toContain('BF057')
  })

  test('an inlined literal const binds nothing in the client JS, so it is not BF057', () => {
    const { errors, clientJs } = compile('const qsa = 1', '<p>{items().length + qsa}</p>')
    expect(errors).toHaveLength(0)
    expect(() => transpiler.transformSync(clientJs)).not.toThrow()
  })

  test('a value import named like a runtime export is BF057, an aliased one is not', () => {
    expect(compile("import { hydrate } from './lib'").errors.map(e => e.code)).toContain('BF057')
    expect(compile("import { hydrate as hydrateLib } from './lib'").errors.map(e => e.code)).not.toContain('BF057')
  })

  test('a type-only import and a runtime import of the same name are not BF057', () => {
    expect(compile("import type { insert } from './lib'").errors.map(e => e.code)).not.toContain('BF057')
    expect(compile("import { batch } from '@barefootjs/client'").errors.map(e => e.code)).not.toContain('BF057')
  })

  test('a nested binding that shadows a runtime name neither errors nor drops the import', () => {
    const { errors, clientJs } = compile(
      '',
      '<button onClick={() => { const $ = items(); setItems($.concat("a")) }}>{items().length}</button>',
    )
    expect(errors).toHaveLength(0)
    expect(() => transpiler.transformSync(clientJs)).not.toThrow()
    // The compiler's own slot lookup still needs the runtime `$`.
    expect(runtimeImportLine(clientJs)).toMatch(/[{ ,]\$[ ,}]/)
  })

  test('a non-colliding module-level helper is emitted once and imported never', () => {
    const { errors, clientJs } = compile(
      'function appendItem(list: string[], x: string) { return [...list, x] }',
      '<button onClick={() => setItems(appendItem(items(), "a"))}>{items().length}</button>',
    )
    expect(errors).toHaveLength(0)
    expect(() => transpiler.transformSync(clientJs)).not.toThrow()
    expect(runtimeImportLine(clientJs)).not.toContain('appendItem')
  })
})

describe('detectUsedImports', () => {
  test('reports a runtime name only where nothing binds it', () => {
    const code = [
      'var insert = insert ?? function (a) { return a }',
      'export function initT(qsa) { qsa(); insert(); createEffect(() => {}) }',
      "hydrate('T', {})",
    ].join('\n')
    expect([...detectUsedImports(code)].sort()).toEqual(['createEffect', 'hydrate'])
  })

  test('an object key or member name spelling a runtime name is not a reference', () => {
    expect([...detectUsedImports('const o = { insert: 1 }; o.hydrate(); qsa.x')]).toEqual(['qsa'])
  })
})
