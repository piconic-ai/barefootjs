/**
 * A destructure default reading an earlier binding of its own pattern
 * (`{ a = [], b = a }`) reads that binding, as in JS: where the init body
 * keeps the earlier binding as a local (a `let`, a mutated or a written
 * binding), the default is a read of that local, not a fresh prop read, so
 * the two names share one array and a value a default assigned to the
 * earlier binding (`b = (a = 2)`) is what a later default sees. The default
 * still applies to an absent or `undefined` prop only, never to `null`.
 *
 * Each case compiles the component, loads its client JS against the real
 * runtime and runs the generated `init` over the component's server markup,
 * as hydration does.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

let serial = 0

/**
 * Compile `source`, load its client JS, and run component `name`'s generated
 * `init` against `markup` (its server render, `bf-s` on the root) with
 * `props`, as hydration does. Returns the hydrated root.
 */
async function hydrate(name: string, source: string, markup: string, props: Record<string, unknown>): Promise<Element> {
  const result = compileJSX(source, `${name}.tsx`, { adapter: new TestAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'))
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')
  // The same import rewrite the sibling runtime tests use, so `import()`
  // resolves the runtime from a temp directory.
  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
  const dir = mkdtempSync(join(tmpdir(), 'bf-default-earlier-'))
  const file = join(dir, `${name}_${serial++}.mjs`)
  writeFileSync(file, rewritten)
  let mod: Record<string, unknown>
  try {
    mod = await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
  const init = mod[`init${name}`] as (scope: Element, props: Record<string, unknown>) => void
  document.body.innerHTML = markup
  const root = document.body.firstElementChild!
  init(root, props)
  return root
}

/** A `<p>` whose one text slot `s0` the init fills. */
const TEXT = '<p bf-s="T" bf="s1"><!--bf:s0-->?<!--/--></p>'

describe('a destructure default reading an earlier binding reads that binding', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a body destructure shares the earlier binding’s array', async () => {
    const el = await hydrate('SharedArray', `
'use client'
export function SharedArray(props: { a?: string[]; b?: string[] }) {
  let { a = [], b = a } = props
  a.push('x')
  return <p>{b.length}</p>
}
`, TEXT, {})
    expect(el.textContent).toBe('1')
  })

  test('a renamed body destructure shares the earlier binding’s array', async () => {
    const el = await hydrate('RenamedSharedArray', `
'use client'
export function RenamedSharedArray(props: { a?: string[]; b?: string[] }) {
  let { a: x = [], b = x } = props
  x.push('x')
  return <p>{b.length}</p>
}
`, TEXT, {})
    expect(el.textContent).toBe('1')
  })

  test('a const destructure keeps a binding whose default reads a mutated one', async () => {
    const el = await hydrate('ConstSharedArray', `
'use client'
export function ConstSharedArray(props: { a?: string[]; b?: string[] }) {
  const { a = [], b = a } = props
  a.push('x')
  return <p>{b.length}</p>
}
`, TEXT, {})
    expect(el.textContent).toBe('1')
  })

  test('written parameters share the earlier binding’s array', async () => {
    const el = await hydrate('WrittenParamArray', `
'use client'
export function WrittenParamArray({ a = [], b = a }: { a?: string[]; b?: string[] }) {
  a = a
  a.push('x')
  b = b
  return <p>{b.length}</p>
}
`, TEXT, {})
    expect(el.textContent).toBe('1')
  })

  test('a later default sees the value an earlier default assigned', async () => {
    const el = await hydrate('AssignedEarlier', `
'use client'
export function AssignedEarlier(props: { a?: number; b?: number; c?: number }) {
  let { a = 1, b = (a = 2), c = a } = props
  return <p>{c}</p>
}
`, TEXT, {})
    expect(el.textContent).toBe('2')
  })

  test('a written parameter keeps its local for a later default', async () => {
    const el = await hydrate('WrittenParam', `
'use client'
export function WrittenParam({ a = 1, b = a }: { a?: number; b?: number }) {
  a = a + 1
  return <p onClick={() => { a = 0 }}>{b}</p>
}
`, TEXT, {})
    expect(el.textContent).toBe('1')
  })

  test('the default applies to an omitted or undefined prop, not to null', async () => {
    const NULLISH = '<p bf-s="T" bf="s1"><!--bf:s0-->?<!--/--></p>'
    const source = `
'use client'
export function NullishDefault(props: { label?: string | null }) {
  const { label = 'D' } = props
  return <p title={label}>{label}</p>
}
`
    const omitted = await hydrate('NullishDefault', source, NULLISH, {})
    expect(omitted.textContent).toBe('D')
    expect(omitted.getAttribute('title')).toBe('D')
    const undef = await hydrate('NullishDefault', source, NULLISH, { label: undefined })
    expect(undef.textContent).toBe('D')
    const nul = await hydrate('NullishDefault', source, NULLISH, { label: null })
    expect(nul.textContent).toBe('')
    expect(nul.hasAttribute('title')).toBe(false)
  })

  test('a parameter default reading an earlier parameter applies to undefined only', async () => {
    const source = `
'use client'
export function ParamChain({ a = 'A', b = a }: { a?: string | null; b?: string | null }) {
  return <p>{b}</p>
}
`
    expect((await hydrate('ParamChain', source, TEXT, {})).textContent).toBe('A')
    expect((await hydrate('ParamChain', source, TEXT, { a: 'x' })).textContent).toBe('x')
    expect((await hydrate('ParamChain', source, TEXT, { b: null })).textContent).toBe('')
    expect((await hydrate('ParamChain', source, TEXT, { a: null })).textContent).toBe('')
  })
})
