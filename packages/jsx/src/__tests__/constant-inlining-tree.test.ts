/**
 * Constant inlining in the client JS runs on the expression tree (#3535).
 *
 * The component template used to inline a constant with
 * ``text.replace(new RegExp(`(?<![-.])\\b${name}\\b`), `(${value})`)`` behind
 * a quoted-string protector. The static segments of a template literal and an
 * object-literal shorthand were exposed, so `` `btn size-${size}` `` rendered
 * `btn ('lg')-lg` and `{ size }` became the SyntaxError `{ ('lg') }`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { resolveChainedRefs } from '../ir-to-client-js/emit-registration'

const adapter = new TestAdapter()
const transpiler = new Bun.Transpiler({ loader: 'js' })

function clientJs(locals: string, jsx: string): string {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function T(props: { label: string; items: string[] }) {
      const [on, setOn] = createSignal(false)
      ${locals}
      return ${jsx}
    }
  `
  const result = compileJSX(source, 'T.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  const js = result.files.find(f => f.type === 'clientJs')!.content
  expect(() => transpiler.transformSync(js)).not.toThrow()
  return js
}

/** The `template: (_p) => …` lambda the client registers for CSR. */
function templateOf(js: string): string {
  const line = js.split('\n').find(l => l.includes('template: (_p) =>'))
  expect(line).toBeDefined()
  return line!
}

const button = (attrs: string) => `<button ${attrs} onClick={() => setOn(!on())}>{props.label}</button>`

describe('constant inlining on the tree (#3535)', () => {
  test('a template-literal static segment that spells the constant is kept', () => {
    const tpl = templateOf(clientJs("const size = 'lg'", button('className={`btn size-${size}`}')))
    expect(tpl).not.toContain("('lg')-")
    expect(tpl).toContain("size-${('lg')}")
  })

  test('an object-literal shorthand expands to a key-value pair', () => {
    const tpl = templateOf(clientJs("const size = 'lg'", button('data-o={JSON.stringify({ size })}')))
    expect(tpl).toContain("size: ('lg')")
  })

  test('a member name and a string spelling the constant are kept', () => {
    const tpl = templateOf(clientJs("const size = 'lg'", button("data-o={props.label.size + 'size'}")))
    expect(tpl).toContain('.size')
    expect(tpl).toContain("'size'")
  })

  test('a $-named constant is inlined', () => {
    const tpl = templateOf(clientJs("const size$ = 'lg'", button('data-size={size$}')))
    expect(tpl).not.toMatch(/\bsize\$/)
    expect(tpl).toContain('lg')
  })

  test('a loop row binding that shadows the constant is not replaced', () => {
    const js = clientJs(
      "const item = 'outer'",
      "<ul data-x={item}>{props.items.map(item => <li key={item}>{item}</li>)}</ul>",
    )
    expect(js).not.toContain("key={('outer')}")
  })
})

describe('resolveChainedRefs', () => {
  test('resolves a chain on the tree, leaving strings and member names alone', () => {
    const constants = new Map([
      ['base', "'lg'"],
      ['cls', '`btn base-${base}`'],
      ['opts', '({ base, other: o.base })'],
    ])
    resolveChainedRefs(constants)
    expect(constants.get('cls')).toBe("`btn base-${('lg')}`")
    expect(constants.get('opts')).toBe("({ base: ('lg'), other: o.base })")
  })

  test('a value brought in by a substitution is resolved too', () => {
    const constants = new Map([
      ['a', 'b + 1'],
      ['b', 'c * 2'],
      ['c', '3'],
    ])
    const freeIds = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['c'])],
      ['c', new Set<string>()],
    ])
    resolveChainedRefs(constants, freeIds)
    expect(constants.get('a')).toBe('((3) * 2) + 1')
    expect([...freeIds.get('a')!]).toEqual([])
  })
})
