/**
 * The client-JS reference graph finds identifiers with TypeScript's scanner
 * (#3536).
 *
 * The graph decides which locals the emitted `init` keeps. Its identifier
 * scan used to be the regex `\b[a-zA-Z_][a-zA-Z0-9_]*\b`: `$` is not a word
 * character, so a `$`-named local reached only through a helper was dropped
 * and the handler threw ReferenceError. Words inside strings, comments and
 * template static text were collected too.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/index'
import {
  extractIdentifiers,
  extractTemplateExpressions,
  extractTemplateIdentifiers,
} from '../ir-to-client-js/identifiers'

const adapter = new TestAdapter()

function clientJsFor(locals: string, handlerBody: string): string {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function T(props: { n: number }) {
      const [count, setCount] = createSignal(0)
      ${locals}
      return <button onClick={() => setCount(${handlerBody})}>{count()}</button>
    }
  `
  const result = compileJSX(source, 'T.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

describe('reference graph keeps $-named locals (#3536)', () => {
  for (const name of ['step$', '$step', '$', 'a$b']) {
    test(`a local \`${name}\` reached only through a helper is emitted`, () => {
      const js = clientJsFor(
        `const ${name} = props.n * 2\n      const _helper = (x: number) => x + ${name}`,
        '_helper(count())',
      )
      expect(js).toContain(`const ${name} = `)
    })
  }

  test('a contextual-keyword local (`type`) reached through a helper is emitted', () => {
    const js = clientJsFor('const type = props.n + 1\n      const _helper = (x: number) => x + type', '_helper(count())')
    expect(js).toContain('const type = ')
  })
})

describe('extractIdentifiers', () => {
  const ids = (expr: string) => {
    const set = new Set<string>()
    extractIdentifiers(expr, set)
    return [...set].sort()
  }

  test('skips string contents, comments and template static text; keeps member names', () => {
    // A member name stays in: the graph reads `props.value` as a use of the
    // `value` prop in props-object mode.
    expect(ids("obj.member + other?.deep + 'word in a string' /* note */ + `tpl ${inner}`")).toEqual([
      'deep',
      'inner',
      'member',
      'obj',
      'other',
    ])
  })

  test('reports $ names and contextual keywords, never reserved words', () => {
    expect(ids('(x) => x + step$ + $ + type + of')).toEqual(['$', 'of', 'step$', 'type', 'x'])
  })
})

describe('template substitutions', () => {
  test('a body with an object literal or a nested template stays whole', () => {
    expect(extractTemplateExpressions('<p>${a ? { x: 1 }.x : b}</p>${`n${deep}`}')).toEqual([
      'a ? { x: 1 }.x : b',
      '`n${deep}`',
    ])
  })

  test('static text is not scanned for identifiers', () => {
    const set = new Set<string>()
    extractTemplateIdentifiers('<div class="btn size-lg ${cls}">${label$}</div>', set)
    expect([...set].sort()).toEqual(['cls', 'label$'])
  })
})

describe('regex literals and keyword-named members (#3536 review)', () => {
  test('a quote inside a regex literal does not hide a later dependency', () => {
    const js = clientJsFor('const step = props.n * 2\n      const _helper = (x: string) => (/"/.test(x) ? step : 0)', "_helper('a')")
    expect(js).toContain('const step = ')
  })

  test('division after a contextual-keyword local does not hide a later dependency', () => {
    const js = clientJsFor('const type = props.n\n      const step = props.n * 2\n      const _helper = () => type / 2 + step / 3', '_helper()')
    expect(js).toContain('const step = ')
  })

  test('division after a keyword-named member does not hide a later dependency', () => {
    const js = clientJsFor('const step = props.n * 2\n      const _helper = (o: { default: number }) => o.default / 2 + step / 3', '_helper({ default: 1 })')
    expect(js).toContain('const step = ')
  })

  test('a brace inside a regex literal does not close a template substitution', () => {
    expect(extractTemplateExpressions('<p>${/}/.test(dep) ? dep : fallback}</p>')).toEqual([
      '/}/.test(dep) ? dep : fallback',
    ])
  })

  test('a reserved word read as a member name is reported; as a keyword it is not', () => {
    const set = new Set<string>()
    extractIdentifiers('props.default + obj?.enum + (x instanceof Y)', set)
    expect([...set].sort()).toEqual(['Y', 'default', 'enum', 'obj', 'props', 'x'])
  })

  test('a keyword-named prop read only by a handler is still hydrated', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function T(props: { default: number }) {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(props.default)}>{count()}</button>
      }
    `
    const hono = compileJSX(source, 'T.tsx', { adapter: new HonoAdapter() })
    expect(hono.errors).toHaveLength(0)
    const template = hono.files.find(f => f.type === 'markedTemplate')!.content
    expect(template).toContain("__hydrateProps['default']")
  })
})
