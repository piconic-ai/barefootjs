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
import { TestAdapter } from '../adapters/test-adapter'

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

/**
 * #3975: a const that CALLS such a helper (`const B = mk()`) is substituted
 * too. Its CSR form applies the spliced arrow (`(() => body)()`), which the
 * template-safety check accepts exactly as it would `body`: the body's own
 * reads and calls are still checked.
 */
describe('a const built by a zero-param helper call in the CSR template (#3975)', () => {
  test('the const reads the value the helper returns', () => {
    const { template } = compile("const mk = () => ({ k: props.mode })\nconst B = mk()", '<p data-k={B.k}>x</p>')
    expect(render(template, { mode: 'wide' })).toContain('data-k="wide"')
  })

  test('a helper the substitution leaves alone keeps the const out of the template', () => {
    const { template } = compile(
      "const mk = async () => ({ k: props.mode })\nconst B = mk()",
      '<p data-k={String(B)}>x</p>',
    )
    expect(template).not.toContain('_p.mode')
  })

  test('a call inside the helper body is still checked', () => {
    // `Date.now()` is a zero-arg call no template primitive vouches for on
    // the test adapter; applying the arrow around it must not accept it.
    const source = `'use client'\nconst mk = () => ({ t: Date.now() })\nconst B = mk()\nexport function S() {\nreturn <p data-t={B.t}>x</p>\n}`
    const result = compileJSX(source, 'S.tsx', { adapter: new TestAdapter() })
    const clientJs = result.files.find((f) => f.path.endsWith('.client.js'))?.content ?? ''
    const template = clientJs.split('\n').find((l) => l.includes('hydrate(')) ?? ''
    expect(template).toContain('template:')
    expect(template).not.toContain('Date.now')
  })
})

/**
 * #3975 review: the CSR template splices a const's value at every read, so
 * the applied helper must evaluate the same each time. Two reads of one
 * initialized value (an attribute and the text) agree, and a helper that
 * samples a value (`Math.random()`) is kept out of the template instead of
 * being sampled once per read.
 */
describe('two reads of a const built by a module helper call (#3975)', () => {
  function compileModule(decls: string, jsx: string) {
    const source = `'use client'\n${decls}\nexport function S() {\nreturn ${jsx}\n}`
    const result = compileJSX(source, 'S.tsx', { adapter: new HonoAdapter() })
    const clientJs = result.files.find((f) => f.path.endsWith('.client.js'))?.content ?? ''
    return clientJs.split('\n').find((l) => l.includes('hydrate(')) ?? ''
  }

  /** Evaluate the template lambda with `Math.random` returning 0.1, 0.2, ... */
  function renderSampled(template: string): string {
    const lambda = template.match(/template: (\(_p\) => `.*`) \}\)/)?.[1]
    expect(lambda).toBeDefined()
    let n = 0
    const math = { ...Math, random: () => ++n / 10 }
    return new Function('Math', 'escapeAttr', 'escapeText', `return ${lambda}`)(math, String, String)({})
  }

  test('an attribute and the text read the same value', () => {
    const template = compileModule("const V = 'v'\nconst mk = () => ({ k: V })\nconst B = mk()", '<p title={B.k}>{B.k}</p>')
    expect(renderSampled(template)).toBe('<p title="v">v</p>')
  })

  test('a helper that samples a value is not spliced at each read', () => {
    const template = compileModule(
      "const V = 'v'\nconst mk = () => ({ k: V + Math.random() })\nconst B = mk()",
      '<p title={B.k}>{B.k}</p>',
    )
    expect(template).not.toContain('Math.random')
  })

  test.each([
    ['Date.now()', 'Date.now()'],
    ['a constructor', 'new Date(0).getTime()'],
    ['a method call', "V.toUpperCase()"],
  ])('a helper body calling %s is not spliced', (_label, body) => {
    const template = compileModule(`const V = 'v'\nconst mk = () => ({ k: ${body} })\nconst B = mk()`, '<p title={String(B.k)}>x</p>')
    expect(template).not.toContain(body)
  })
})
