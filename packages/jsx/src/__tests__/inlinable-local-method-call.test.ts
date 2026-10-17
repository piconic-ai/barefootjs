/**
 * #3513: a const read through a method call on another const that is itself
 * inlinable into the CSR template (`const text = props.label ?? 'd'; const
 * upper = text.toUpperCase()`) inlines as the call on that value, as the
 * same chain without a call (`label + '!'`) already did. Before, the
 * init-local receiver failed the adapter's call acceptance, `upper` reported
 * BF061 and the template slot fell back to `undefined`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'

function compile(body: string) {
  const source = `export function S(props: { label?: string }) {\n${body}\n}`
  const result = compileJSX(source, 'S.tsx', { adapter: new HonoAdapter() })
  const clientJs = result.files.find((f) => f.path.endsWith('.client.js'))?.content ?? ''
  const line = clientJs.split('\n').find((l) => l.includes('hydrate(')) ?? ''
  return { errors: result.errors.map((e) => e.code), template: line }
}

describe('a method call on an inlinable local inlines (#3513)', () => {
  test.each([
    ["const text = props.label ?? 'd'\nconst upper = text.toUpperCase()", 'upper'],
    ["const label = props.label ?? 'd'\nconst upper = label.toUpperCase()", 'upper'],
    ["const text = props.label ?? 'd'\nconst upper = text.toUpperCase()\nconst lower = upper.toLowerCase()", 'lower'],
  ])('%s', (decls, read) => {
    const { errors, template } = compile(`${decls}\nreturn <p title={${read}}>{${read}}</p>`)
    expect(errors).not.toContain('BF061')
    expect(template).toContain("(_p.label ?? 'd').toUpperCase()")
    expect(template).not.toContain('escapeAttr(undefined)')
  })

  test('a method call on a local that does not inline still reports BF061', () => {
    const { errors, template } = compile(
      'function readItems() { return [props.label] }\nconst items = readItems()\nconst first = items.join()\nreturn <p title={first}>{first}</p>',
    )
    expect(errors).toContain('BF061')
    expect(template).not.toContain('items.join()')
  })
})
