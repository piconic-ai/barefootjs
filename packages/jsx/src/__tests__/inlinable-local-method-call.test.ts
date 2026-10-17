/**
 * #3513: a const read through a method call on another const that is itself
 * inlinable into the CSR template (`const text = props.label ?? 'd'; const
 * upper = text.toUpperCase()`) inlines as the call on that value, as the
 * same chain without a call (`label + '!'`) already did. Before, the
 * init-local receiver failed the adapter's call acceptance, `upper` reported
 * BF061 and the template slot fell back to `undefined`.
 *
 * Both template paths are covered: the static template (no signal) and the
 * CSR template a component with a signal registers, which reads
 * `ctx.csrInlinable`. A receiver that is classified inlinable but gets no
 * CSR form (`(choices).includes(name)`) withdraws the acceptance, so the call
 * reports BF061 again instead of rendering `undefined.toUpperCase()`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'

const SIGNAL_PRELUDE = "'use client'\nimport { createSignal } from '@barefootjs/client'\n"

function compile(body: string, { prelude = '', signal = false } = {}) {
  const head = signal ? `${SIGNAL_PRELUDE}${prelude}` : prelude
  const signalDecl = signal ? 'const [count] = createSignal(0)\n' : ''
  const source = `${head}export function S(props: { label?: string }) {\n${signalDecl}${body}\n}`
  const result = compileJSX(source, 'S.tsx', { adapter: new HonoAdapter() })
  const clientJs = result.files.find((f) => f.path.endsWith('.client.js'))?.content ?? ''
  const line = clientJs.split('\n').find((l) => l.includes('hydrate(')) ?? ''
  return { errors: result.errors.map((e) => e.code), template: line }
}

/** Evaluate the registered `template:` lambda against `props`. */
function render(template: string, props: Record<string, unknown>): string {
  const lambda = template.match(/template: (\(_p\) => `.*`) \}\)/)?.[1]
  expect(lambda).toBeDefined()
  return new Function('escapeAttr', 'escapeTextOrMarkup', `return ${lambda}`)(String, String)(props)
}

const CHAINS: [string, string, string][] = [
  ["const text = props.label ?? 'd'\nconst upper = text.toUpperCase()", 'upper', 'ABC'],
  ["const label = props.label ?? 'd'\nconst upper = label.toUpperCase()", 'upper', 'ABC'],
  ["const text = props.label ?? 'd'\nconst upper = text.toUpperCase()\nconst lower = upper.toLowerCase()", 'lower', 'abc'],
]

describe('a method call on an inlinable local inlines (#3513)', () => {
  test.each(CHAINS)('static template: %s', (decls, read, rendered) => {
    const { errors, template } = compile(`${decls}\nreturn <p title={${read}}>{${read}}</p>`)
    expect(errors).not.toContain('BF061')
    expect(template).toContain("(_p.label ?? 'd').toUpperCase()")
    expect(template).not.toContain('escapeAttr(undefined)')
    expect(render(template, { label: 'aBc' })).toContain(`title="${rendered}"`)
  })

  test.each(CHAINS)('CSR template: %s', (decls, read, rendered) => {
    const { errors, template } = compile(`${decls}\nreturn <p title={${read}}>{count()}</p>`, { signal: true })
    expect(errors).not.toContain('BF061')
    expect(template).toContain("(_p.label ?? 'd').toUpperCase()")
    expect(render(template, { label: 'aBc' })).toContain(`title="${rendered}"`)
  })

  test('a method call on a local that does not inline still reports BF061', () => {
    const { errors, template } = compile(
      'function readItems() { return [props.label] }\nconst items = readItems()\nconst first = items.join()\nreturn <p title={first}>{first}</p>',
    )
    expect(errors).toContain('BF061')
    expect(template).not.toContain('items.join()')
  })

  test.each([
    ['const upper = text.toUpperCase()', 'upper'],
    ['const upper = text.toUpperCase()\nconst lower = upper.toLowerCase()', 'lower'],
  ])('a receiver refused after classification withdraws the call: %s', (decls, read) => {
    const { errors, template } = compile(
      `const text = (choices).includes(props.label) ? 'yes' : 'no'\n${decls}\nreturn <p title={${read}}>{count()}</p>`,
      { prelude: "const choices = ['a']\n", signal: true },
    )
    expect(errors).toContain('BF061')
    expect(template).not.toContain('undefined.')
    expect(() => render(template, { label: 'a' })).not.toThrow()
  })
})
