import { describe, test, expect } from 'bun:test'
import { analyzeComponent, buildMetadata, compileJSX, collectModuleStringConsts, lookupLiteralConst, type ComponentIR } from '../index'
import { TestAdapter } from '../adapters/test-adapter'
import { moduleScopeView } from '../module-scope'

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
