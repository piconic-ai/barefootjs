/**
 * #3562: the CSR template substitutes a zero-param local helper
 * (`const isWide = () => props.mode === 'wide'`) like any other const, so a
 * template call `isWide()` reads its body instead of falling back to empty.
 * A helper that is not a synchronous, pure value (a body that mutates state,
 * an async arrow, a generator) is left alone: splicing `() => ({ id:
 * ++nextId })` produced `++(0)`, a SyntaxError in the client bundle.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'

const PRELUDE = "'use client'\nimport { createSignal } from '@barefootjs/client'\n"

function compile(body: string, jsx: string) {
  const source = `${PRELUDE}export function S(props: { mode?: string; flag?: boolean }) {\n${body}\nreturn ${jsx}\n}`
  const result = compileJSX(source, 'S.tsx', { adapter: new HonoAdapter() })
  const clientJs = result.files.find((f) => f.path.endsWith('.client.js'))?.content ?? ''
  const template = clientJs.split('\n').find((l) => l.includes('hydrate(')) ?? ''
  return { clientJs, template }
}

/** Evaluate the registered `template:` lambda against `props`. */
function render(template: string, props: Record<string, unknown>): string {
  const lambda = template.match(/template: (\(_p\) => `.*`) \}\)/)?.[1]
  expect(lambda).toBeDefined()
  return new Function('escapeAttr', 'escapeTextOrMarkup', `return ${lambda}`)(String, String)(props)
}

describe('zero-param helper in the CSR template (#3562)', () => {
  test('a pure helper call reads its body', () => {
    const { template } = compile(
      "const isWide = () => props.mode === 'wide'\nconst [shown] = createSignal(isWide() ? 'wide' : 'narrow')",
      '<p data-shown={shown()}>x</p>',
    )
    expect(render(template, { mode: 'wide' })).toContain('data-shown="wide"')
    expect(render(template, { mode: 'tall' })).toContain('data-shown="narrow"')
  })

  test('a helper that mutates state is not spliced, and the bundle still parses', () => {
    const { clientJs } = compile(
      "let nextId = 0\nconst createField = () => ({ id: ++nextId, value: '' })\nconst [fields] = createSignal([createField()])",
      '<ul>{fields().map((f) => <li key={f.id}>{f.value}</li>)}</ul>',
    )
    expect(clientJs).not.toContain('++(')
    expect(() => new Bun.Transpiler({ loader: 'js' }).transformSync(clientJs)).not.toThrow()
  })

  test.each([
    ['an async arrow', 'const helper = async () => props.flag'],
    ['a generator function', 'const helper = function* () { return props.flag }'],
  ])('%s is not spliced', (_label, decl) => {
    const { template } = compile(`${decl}\nconst [shown] = createSignal(helper() ? 'yes' : 'no')`, '<p data-shown={shown()}>x</p>')
    expect(template).not.toContain('_p.flag')
  })
})
