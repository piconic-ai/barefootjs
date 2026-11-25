import { describe, test, expect } from 'bun:test'
import { analyzeComponent, buildMetadata, compileJSX, collectModuleStringConsts, lookupLiteralConst, type ComponentIR } from '../index'
import { TestAdapter } from '../adapters/test-adapter'
import { moduleScopeView } from '../module-scope'
import { combineParentChildClientJs } from '../combine-client-js'

function compile(src: string) {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new TestAdapter(), outputIR: true })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'))
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  return {
    metadata: (JSON.parse(irFile.content) as ComponentIR).metadata,
    template: result.files.find(f => f.type === 'markedTemplate')?.content ?? '',
    clientJs: result.files.find(f => f.type === 'clientJs')?.content ?? '',
  }
}

/** The text of the statement that declares `name` in `code` (`const name = …` up to the line end). */
function declarationsOf(code: string, name: string): string[] {
  return code.split('\n').map(line => line.trim()).filter(line => line.startsWith(`const ${name} = `))
}

/**
 * Load a compiled client script and return what its template renders, with
 * the runtime imports replaced by plain stand-ins. A script that declares a
 * name twice fails here, as it does in a browser.
 */
function renderClientTemplate(clientJs: string, props: Record<string, unknown> = {}): string {
  const body = clientJs
    .split('\n')
    .filter(line => !line.startsWith('import '))
    .join('\n')
    .replace(/^export /gm, '')
  const run = new Function(
    '__props',
    `
    let __template
    const hydrate = (_name, def) => { __template = def.template }
    const createComponent = () => null
    const escapeText = (v) => String(v)
    const escapeAttr = (v) => String(v)
    const escapeTextOrMarkup = (v) => String(v)
    const escapeTextOrNode = (v) => String(v)
    ${body}
    return __template(__props)
    `,
  )
  return run(props) as string
}

describe('module scope in the client script (#3739)', () => {
  test('a component const named like a module const loads and reads its own value', () => {
    const { clientJs } = compile(`
'use client'
const x = 'module'
const a = x
export function C() {
  const x = 'local'
  return <p>{x}/{a}</p>
}
`)
    expect(renderClientTemplate(clientJs)).toContain('local/module')
  })

  test('a module const reading a name a prop has keeps the module value', () => {
    const { clientJs } = compile(`
'use client'
const base = 'm'
const tag = base + '!'
export function C({ base }: { base: string }) {
  return <p title={base}>{tag}</p>
}
`)
    const html = renderClientTemplate(clientJs, { base: 'p' })
    expect(html).toContain('title="p"')
    expect(html).toContain('m!')
  })

  test('a module const reading a global keeps reading it when a prop has the name', () => {
    const { clientJs } = compile(`
'use client'
const big = Math.max(1, 2)
export function C({ Math }: { Math: string }) {
  return <p title={Math}>{big}</p>
}
`)
    expect(renderClientTemplate(clientJs, { Math: 'm' })).toContain('>2<')
  })

  test('an object const is evaluated once for every module const that reads it', () => {
    const { clientJs } = compile(`
'use client'
const reg = { k: 'v' }
const a = reg
const b = reg
export function C({ reg }: { reg?: string }) {
  return <p title={reg}>{String(a === b)}</p>
}
`)
    expect(declarationsOf(clientJs, 'reg')).toHaveLength(1)
    expect(renderClientTemplate(clientJs)).toContain('true')
  })

  test('a module function reading a hidden module const is called for the module value', () => {
    const { clientJs } = compile(`
'use client'
const unit = 'px'
function label() { return 'v-' + unit }
export function C() {
  const unit = 'em'
  return <p title={unit}>{label()}</p>
}
`)
    expect(renderClientTemplate(clientJs)).toContain('v-px')
  })

  test('a component function hides the module function of its name', () => {
    const { clientJs } = compile(`
'use client'
function value() { return 1 }
export function C() {
  function value() { return 2 }
  return <p>{value()}</p>
}
`)
    expect(clientJs).not.toContain('return 1')
    expect(renderClientTemplate(clientJs)).toContain('>2<')
  })

  test('a module const the component never reads is not shipped in the replica', () => {
    const { clientJs } = compile(`
'use client'
const size = 16
const secret = size * 2
const shown = size + 1
export function C({ size }: { size: number }) {
  return <p title={String(size)}>{shown}</p>
}
`)
    expect(clientJs).toContain('__bf_module_C')
    expect(clientJs).not.toContain('secret')
    expect(renderClientTemplate(clientJs, { size: 1 })).toContain('17')
  })

  test('a file with no name a module declaration and the component share emits no replica', () => {
    const { clientJs } = compile(`
'use client'
const base = 'm'
const tag = base + '!'
export function C({ label }: { label: string }) {
  return <p title={label}>{tag}</p>
}
`)
    expect(clientJs).not.toContain('__bf_module_')
  })
})

describe('moduleScopeView (#3739)', () => {
  // Straight from the analyzer: the IR's JSON form drops `freeIdentifiers`.
  const metadata = buildMetadata(analyzeComponent(`
'use client'
const x = 'module'
const a = x
const plain = 'p'
function read() { return x }
function free() { return 1 }
export function C() {
  const x = 'local'
  return <p>{x}/{a}/{plain}/{read()}/{free()}</p>
}
`, 'T.tsx'))
  const view = moduleScopeView(metadata, '__bf_module_C')

  test('hides the module const the component declares again', () => {
    expect(view.localConstants.filter(c => c.name === 'x').map(c => c.value)).toEqual(["'local'"])
  })

  test('reads a module const and a module function that read the hidden name through the replica', () => {
    expect(view.localConstants.find(c => c.name === 'a')?.value).toBe('__bf_module_C.a')
    expect(view.localConstants.find(c => c.name === 'read')?.value).toBe('__bf_module_C.read')
    expect(view.localFunctions.map(f => f.name)).toEqual(['free'])
  })

  test('leaves a module const that reads no component name unchanged', () => {
    expect(view.localConstants.find(c => c.name === 'plain')?.value).toBe("'p'")
  })

  test('declares the hidden const in the replica without exporting it', () => {
    expect(view.replica?.constants.map(c => c.name)).toEqual(['x', 'a'])
    expect(view.replica?.functions.map(f => f.name)).toEqual(['read'])
    expect(view.replica?.exported).toEqual(['a', 'read'])
  })

  test('lengthens the replica name past a name the file already uses', () => {
    expect(moduleScopeView(metadata, 'plain').replica?.name).toBe('plain_')
  })
})

describe('module scope in the Hono-style template (#3739)', () => {
  test('keeps a module const at module scope when it reads a name the component binds', () => {
    const { template } = compile(`
const base = 'm'
const tag = base + '!'
export function C({ base }: { base: string }) {
  return <p title={base}>{tag}</p>
}
`)
    const component = template.indexOf('function C(')
    expect(component).toBeGreaterThan(-1)
    expect(template.indexOf("const tag = base + '!'")).toBeGreaterThan(-1)
    expect(template.indexOf("const tag = base + '!'")).toBeLessThan(component)
  })

  test('declares the component const beside a module const of its name', () => {
    const { template } = compile(`
const x = 'module'
const a = x
export function C(props: { n: number }) {
  const x = 'local' + props.n
  return <p>{x}/{a}</p>
}
`)
    const component = template.indexOf('function C(')
    expect(template.indexOf("const x = 'module'")).toBeLessThan(component)
    expect(template.indexOf("const x = 'local' + props.n")).toBeGreaterThan(component)
  })

  test('declares a module const written after the component', () => {
    const { template, metadata } = compile(`
export function C() {
  return <p>{late}</p>
}
const late = 'late'
`)
    expect(metadata.localConstants.find(c => c.name === 'late')?.isModule).toBe(true)
    expect(template).toContain("const late = 'late'")
  })

  test('does not take a const inside the component for a module const', () => {
    const { metadata } = compile(`
const early = 'e'
export function C() {
  const inner = early + '!'
  return <p>{inner}</p>
}
`)
    expect(metadata.localConstants.find(c => c.name === 'inner')?.isModule).toBeUndefined()
  })
})

describe('const lookups by name (#3739)', () => {
  const { metadata } = compile(`
const z = 'mz'
const n = 1
const p = 'mp'
const tag = \`\${p}!\`
export function C({ p, k }: { p: string; k: number }) {
  const z = 'lz'
  const n = k * 2
  return <p title={p}>{z}/{n}/{tag}</p>
}
`)
  const constants = metadata.localConstants
  const never = () => false

  test('lookupLiteralConst reads the component const, not the module const of its name', () => {
    expect(lookupLiteralConst('z', constants, never)).toEqual({ kind: 'string', text: 'lz' })
  })

  test('lookupLiteralConst does not read a module literal a computed component const hides', () => {
    expect(lookupLiteralConst('n', constants, never)).toBeNull()
  })

  test('lookupLiteralConst does not read a module literal a prop hides', () => {
    expect(lookupLiteralConst('p', constants, never)).toBeNull()
  })

  test('collectModuleStringConsts omits a hidden const and still composes from it', () => {
    const strings = collectModuleStringConsts(constants)
    expect(strings.has('z')).toBe(false)
    expect(strings.has('p')).toBe(false)
    expect(strings.get('tag')).toBe('mp!')
  })
})

describe('a module const the component writes (#3739)', () => {
  const component = (extra: string) => `
'use client'
const base = 'm'
const box = { n: 1 }
function g() { return base + box.n }
${extra}
export function C({ base }: { base: string }) {
  box.n = 2
  return <button onClick={() => console.log(g())}>{base}</button>
}
`

  test('a function reading a hidden const and the written object is declared in the replica with it', () => {
    const { clientJs } = compile(component(''))
    // The replica evaluates `g` against the module `base`; the component reads
    // the one `box` object the replica holds, so its write is what `g` sees.
    expect(declarationsOf(clientJs, 'box')).toEqual(['const box = { n: 1 }', 'const box = __bf_module_C.box'])
    expect(declarationsOf(clientJs, 'g')).toContain('const g = __bf_module_C.g')
  })
})

describe('a module let the component reassigns (#3932)', () => {
  const component = (decl: string, read: string) => `
'use client'
const base = 'm'
${decl}
function g() { return base + ${read} }
export function C({ base }: { base: string }) {
  counter = 2
  return <button onClick={() => console.log(g())}>{base}</button>
}
`
  const lines = (code: string, prefix: string) => code.split('\n').map(l => l.trim()).filter(l => l.startsWith(prefix))

  test('the replica evaluates the function against the module const and the let stays one module variable', () => {
    const { clientJs } = compile(component('let counter = 0', 'counter'))
    expect(lines(clientJs, 'const g = ')).toContain('const g = __bf_module_C.g')
    // One storage: declared at module level, given its value by the replica
    // at its source-order position, and written by the component's init as the
    // same variable.
    expect(lines(clientJs, 'var counter')).toEqual(['var counter'])
    expect(lines(clientJs, 'counter = counter')).toEqual(['counter = counter ?? 0'])
    expect(lines(clientJs, 'let counter')).toEqual([])
    expect(lines(clientJs, 'counter = 2')).toEqual(['counter = 2'])
  })

  test('a let without an initializer starts undefined, as in the module', () => {
    const { clientJs } = compile(component('let counter', 'counter'))
    expect(lines(clientJs, 'counter = counter')).toEqual(['counter = counter ?? undefined'])
  })

  test('a let whose initializer reads the hidden const is evaluated in the replica', () => {
    const { clientJs } = compile(component('let counter = base.length', 'counter'))
    expect(lines(clientJs, 'counter = counter')).toEqual(['counter = counter ?? base.length'])
  })

  test('shared lets and the consts reading them are assigned in source order', () => {
    const { clientJs } = compile(`
'use client'
const base = 'm'
let first = 1
let counter = first + 1
const seed = counter
function g() { return base + counter + seed }
export function C({ base }: { base: string }) {
  first = 3
  counter++
  return <button onClick={() => console.log(g())}>{base}</button>
}
`)
    const order = clientJs.split('\n').map(l => l.trim()).filter(l => /^(first|counter) = |^const seed = /.test(l))
    expect(order.slice(0, 3)).toEqual(['first = first ?? 1', 'counter = counter ?? (first + 1)', 'const seed = counter'])
  })

  test('a let only a module function writes is the same variable for the replica and the component', () => {
    const { clientJs } = compile(`
'use client'
const base = 'm'
let counter = 0
function bump() { counter += 1 }
function g() { return base + counter }
export function C({ base }: { base: string }) {
  return <button onClick={() => { bump(); console.log(g() + counter) }}>{base}</button>
}
`)
    expect(lines(clientJs, 'var counter')).toEqual(['var counter'])
    expect(lines(clientJs, 'const counter')).toEqual([])
    expect(lines(clientJs, 'let counter')).toEqual([])
  })

  // `??` takes no bare `||` / `&&`, and an arrow, a conditional or an
  // assignment would swallow it: the whole module must still load.
  describe.each([
    ['a logical expression', "base || 'fallback'", true],
    ['a conjunction', "base && 'x'", true],
    ['a nullish chain', "base ?? 'x'", true],
    ['a conditional', 'base ? 1 : 2', true],
    ['an arrow', '() => base', true],
    ['an async arrow', 'async () => base', true],
    ['an object literal', '{ n: base }', false],
    ['an assignment', 'other = base', true],
    ['a function expression', 'function () { return base }', true],
    ['a sequence', '(0, base)', true],
  ])('a shared initializer that is %s', (_label, init, grouped) => {
    test('the client script loads and the initializer is one grouped operand', () => {
      const { clientJs } = compile(`
'use client'
const base = 'm'
let other = ''
let counter = ${init}
function g() { return base + counter }
export function C({ base }: { base: string }) {
  counter = 2
  return <button onClick={() => console.log(g())}>{base}</button>
}
`)
      // In the replica (`counter = …`) or, when the initializer reads a bare
      // `let` the replica cannot evaluate, at module level (`var counter = …`).
      const assigned = clientJs.split('\n').map(l => l.trim()).filter(l => l.includes('counter = counter ?? '))
      expect(assigned.map(l => l.replace(/^var /, ''))).toEqual([`counter = counter ?? ${grouped ? `(${init})` : init}`])
      // Loading the module runs the replica; a SyntaxError would throw here.
      expect(() => renderClientTemplate(clientJs, { base: 'p' })).not.toThrow()
    })
  })

  test('a module-level let with a logical initializer and no hidden name loads too', () => {
    const { clientJs } = compile(`
'use client'
let counter = '' || 'fallback'
export function C() {
  counter = counter + '!'
  return <button onClick={() => console.log(counter)}>log</button>
}
`)
    // The handler reads `counter`; the markup does not: a server read of a
    // binding a body statement writes is refused (BF101, `checkStatementWrites`).
    expect(lines(clientJs, 'var counter')).toEqual(["var counter = counter ?? ('' || 'fallback')"])
    expect(() => renderClientTemplate(clientJs)).not.toThrow()
  })
})

describe('a module let initializer that reads a module declaration (#3968)', () => {
  const lines = (code: string, prefix: string) => code.split('\n').map(l => l.trim()).filter(l => l.startsWith(prefix))

  test('a module const only the initializer reads is evaluated before the let', () => {
    const { clientJs } = compile(`
'use client'
const seed = ''
let counter = seed || 'x'
export function C() {
  counter = counter + '!'
  return <button onClick={() => console.log(counter)}>x</button>
}
`)
    // One storage at module level; the replica gives it the value the module
    // computes, with `seed` declared beside it.
    expect(lines(clientJs, 'var counter')).toEqual(['var counter'])
    expect(lines(clientJs, 'counter = counter ??')).toEqual(["counter = counter ?? (seed || 'x')"])
    expect(lines(clientJs, "const seed = ''")).toEqual(["const seed = ''"])
    expect(() => renderClientTemplate(clientJs)).not.toThrow()
  })

  test('a module function the initializer calls is declared before the let', () => {
    const { clientJs } = compile(`
'use client'
function suffix() { return 'q' }
const head = 'p'
const start = head + suffix()
let counter = start
export function C() {
  counter = counter + '!'
  return <button onClick={() => console.log(counter)}>x</button>
}
`)
    const order = clientJs.split('\n').map(l => l.trim())
      .filter(l => /^(const suffix = |const head = |const start = head|counter = counter \?\?)/.test(l))
    expect(order).toEqual([
      "const suffix = function() { return 'q' }",
      "const head = 'p'",
      'const start = head + suffix()',
      'counter = counter ?? start',
    ])
    expect(() => renderClientTemplate(clientJs)).not.toThrow()
  })

  test('a let whose initializer reads only globals stays a plain module-level declaration', () => {
    const { clientJs } = compile(`
'use client'
let counter = String(1)
export function C() {
  counter = counter + '!'
  return <button onClick={() => console.log(counter)}>x</button>
}
`)
    expect(lines(clientJs, 'var counter')).toEqual(['var counter = counter ?? String(1)'])
    expect(clientJs).not.toContain('__bf_module_C')
  })
})

/**
 * Load a client script with stand-in runtime helpers and return each
 * component's init, by component name. The handlers report through `__log`,
 * which pushes onto `log`.
 */
function loadClientScript(clientJs: string, log: unknown[]): Map<string, (scope: unknown) => void> {
  const body = clientJs
    .split('\n')
    .filter(line => !line.startsWith('import '))
    .join('\n')
    .replace(/^export /gm, '')
  const inits = new Map<string, (scope: unknown) => void>()
  new Function(
    '__log', '__inits',
    `
    const hydrate = (name, def) => { __inits.set(name, def.init) }
    const createComponent = () => null
    const renderChild = () => ''
    const initChild = () => {}
    const $ = (scope, ...ids) => ids.map(id => scope.el(id))
    const $c = $
    const createEffect = (fn) => fn()
    const lazySlots = () => () => {}
    const createContext = (v) => ({ defaultValue: v })
    const useContext = (c) => c.defaultValue
    const createSignal = (v) => { let x = v; return [() => x, (n) => { x = typeof n === 'function' ? n(x) : n }] }
    const escapeText = (v) => String(v)
    const escapeTextOrMarkup = (v) => String(v)
    const escapeTextOrNode = (v) => String(v)
    ${body}
    `,
  )(((v: unknown) => log.push(v)), inits)
  return inits
}

/** A stand-in scope whose elements record their click handlers. */
function fakeScope() {
  const handlers = new Map<string, () => void>()
  return {
    getAttribute: () => 'test',
    el: (id: string) => ({ addEventListener: (_ev: string, fn: () => void) => handlers.set(id, fn) }),
    click: (id: string) => handlers.get(id)!(),
  }
}

describe('module let storage after #3968 (review follow-up)', () => {
  const clientJsOf = (src: string, file: string) =>
    compileJSX(src.trimStart(), file, { adapter: new TestAdapter() }).files.find(f => f.type === 'clientJs')?.content ?? ''

  test('a handler-written let of one name in a parent and an inlined child keeps one binding per source module', () => {
    const child = clientJsOf(`
'use client'
const seed = 1
let count = seed
export function Child() {
  return <button onClick={() => { count = count + 1; __log(count) }}>c</button>
}
`, 'Child.tsx')
    const parent = clientJsOf(`
'use client'
import { Child } from './Child'
const seed = 10
let count = seed
export function Parent() {
  return <div><button onClick={() => { count = count + 1; __log(count) }}>p</button><Child /></div>
}
`, 'Parent.tsx')
    const combined = combineParentChildClientJs(new Map([['Parent', parent], ['Child', child]])).get('Parent')!
    const log: unknown[] = []
    const inits = loadClientScript(combined, log)
    const parentScope = fakeScope()
    const childScope = fakeScope()
    inits.get('Parent')!(parentScope)
    inits.get('Child')!(childScope)
    parentScope.click('s0')
    childScope.click('s0')
    expect(log).toEqual([11, 2])
  })

  test('a module const reading a shared let and a module function is evaluated with the function in scope', () => {
    const { clientJs } = compile(`
'use client'
const seed = 1
let count = seed
function offset() { return seed + 10 }
const initial = count + offset()
export function C() {
  count = count + 1
  return <button onClick={() => __log([initial, count])}>x</button>
}
`)
    const log: unknown[] = []
    const inits = loadClientScript(clientJs, log)
    const scope = fakeScope()
    inits.get('C')!(scope)
    scope.click('s0')
    expect(log).toEqual([[12, 2]])
  })

  test('the reviewer repro: a handler-written let read by a module const that calls a module function loads', () => {
    const { clientJs } = compile(`
'use client'
const seed = 1
let count = seed
function offset() { return seed + 10 }
const initial = count + offset()
export function C() {
  return <button onClick={() => { count = count + 1; __log([initial, count]) }}>x</button>
}
`)
    const log: unknown[] = []
    const inits = loadClientScript(clientJs, log)
    const scope = fakeScope()
    inits.get('C')!(scope)
    scope.click('s0')
    expect(log).toEqual([[12, 2]])
  })

  // The wider replica of #3968 is all or nothing: when what it would take in
  // reaches a declaration the replica cannot host (a system construct, a bare
  // `let`, a hidden name of that kind), or an initializer outside it reads one
  // of its bindings, the client script is the one the narrower replica gives.
  const run = (clientJs: string, instances = 1) => {
    const log: unknown[] = []
    const inits = loadClientScript(clientJs, log)
    const scopes = Array.from({ length: instances }, () => fakeScope())
    for (const scope of scopes) inits.get('C')!(scope)
    return { log, scopes }
  }

  describe.each([
    ['a context', 'const dep = createContext(0)'],
    ['a WeakMap', 'const dep = new WeakMap()'],
  ])('a replica const whose module function reads %s', (_label, decl) => {
    test('is still evaluated once for every instance, as before', () => {
      const { clientJs } = compile(`
'use client'
import { createContext } from '@barefootjs/client'
const base = 'm'
let count = 1
${decl}
function offset() { return dep ? 10 : 20 }
const initial = count + offset()
function g() { return base + count }
export function C({ base }: { base: string }) {
  count = count + 1
  return <button onClick={() => __log([initial, g()])}>{base}</button>
}
`)
      // The context stays a module-level declaration; the replica does not take it in.
      expect(clientJs).toContain('var dep = dep ?? ')
      const { log, scopes } = run(clientJs, 2)
      for (const scope of scopes) scope.click('s1')
      expect(log).toEqual([[11, 'm3'], [11, 'm3']])
    })
  })

  test('a context initialized from a shared let initialized from a context keeps its order', () => {
    const { clientJs } = compile(`
'use client'
import { createContext, useContext } from '@barefootjs/client'
const first = createContext(1)
let count = first.defaultValue ?? 0
const second = createContext(count)
export function C() {
  count = count + 1
  return <button onClick={() => __log([count, useContext(second)])}>x</button>
}
`)
    expect(clientJs).not.toContain('__bf_module_C')
    const { log, scopes } = run(clientJs)
    scopes[0].click('s0')
    expect(log).toEqual([[2, 1]])
  })

  test('a shared let initialized from a context and a module const is not taken into the replica', () => {
    const { clientJs } = compile(`
'use client'
import { createContext } from '@barefootjs/client'
const ctx = createContext('a')
const seed = ''
let counter = seed || ctx.defaultValue
export function C() {
  counter = counter + '!'
  return <button onClick={() => __log(counter)}>x</button>
}
`)
    // As before #3968: the module-level initializer reads the copied const
    // (a known limitation; see the PR's remaining limitations).
    expect(clientJs).not.toContain('__bf_module_C')
    expect(clientJs).toContain("var counter = counter ?? (seed || ctx.defaultValue)")
  })

  test('a replica const whose module function reads a bare let nobody writes is not widened', () => {
    const { clientJs } = compile(`
'use client'
const base = 'm'
let count = 1
let dep
function offset() { return dep ? 20 : 10 }
const initial = count + offset()
function g() { return base + count }
export function C({ base }: { base: string }) {
  count = count + 1
  return <button onClick={() => __log([initial, g()])}>{base}</button>
}
`)
    // The replica declares neither the function nor the bare `let`, as before
    // #3968 (the replica's `initial` then calls an `offset` it cannot see: a
    // known limitation of the narrower replica).
    const replica = clientJs.slice(clientJs.indexOf('var __bf_module_C'), clientJs.indexOf('})()'))
    expect(replica).toContain('const initial = count + offset()')
    expect(replica).not.toContain('offset = ')
    expect(replica).not.toContain('dep')
  })

  test('a shared let a later shared let reads is assigned before it in the replica', () => {
    const { clientJs } = compile(`
'use client'
const seed = 'a'
let counter = seed
let other = counter + '?'
export function C() {
  counter = counter + '!'
  other = other + '.'
  return <button onClick={() => __log([counter, other])}>x</button>
}
`)
    const { log, scopes } = run(clientJs)
    scopes[0].click('s0')
    expect(log).toEqual([['a!', 'a?.']])
  })
})
