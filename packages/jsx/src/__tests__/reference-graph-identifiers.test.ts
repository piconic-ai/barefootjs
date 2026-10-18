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
