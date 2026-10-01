import { expect, test } from 'bun:test'
import ts from 'typescript'
import { analyzeComponent } from '../analyzer.ts'
import { compileJSX } from '../compiler.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'
import { fixture } from '../../../adapter-tests/fixtures/signal-literal-prop-name-collision.ts'

test('literal-seeded signal and bare prop have independent binding names', () => {
  const ctx = analyzeComponent(fixture.source, 'test.tsx')
  expect(ctx.signals[0].getter).not.toBe('rows')
  expect(ctx.propsParams[0].name).toBe('rows')
  expect(ctx.sourceFile.text).toContain('props.rows.map')
  expect(ctx.sourceFile.text).toContain(`${ctx.signals[0].getter}().map`)
})

test('rename follows binding identity, preserves keys, and avoids source names', () => {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function App(props: { count: number }) {
      const bfSignal_count = 8
      const BfSignal_count_1 = 9
      const [count, setCount] = createSignal(7)
      const alias = count
      const object = { count }
      const shadow = (count: number) => ({ count, label: 'count', value: count })
      return <button onClick={() => setCount(count() + 1)}>{props.count}{count()}{alias()}{object.count()}{shadow(2).count}</button>
    }
  `
  const ctx = analyzeComponent(source, 'test.tsx')
  const name = ctx.signals[0].getter
  expect(name).not.toBe('count')
  expect(name).not.toBe('bfSignal_count')
  expect(name.toLowerCase()).not.toBe('bfsignal_count_1')
  expect(ctx.sourceFile.text).toContain(`const alias = ${name}`)
  expect(ctx.sourceFile.text).toContain(`{ count: ${name} }`)
  expect(ctx.sourceFile.text).toContain("(count: number) => ({ count, label: 'count', value: count })")
  expect(ctx.sourceFile.text).toContain('object.count()')
  expect(ctx.sourceFile.text).toContain(`setCount(${name}() + 1)`)
  const result = compileJSX(source, 'test.tsx', { adapter: new TestAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  expect(result.files.find(f => f.type === 'clientJs')?.content).toContain(name)
})

test('same-prop derived seeds and ordinary bindings stay unchanged', () => {
  const ctx = analyzeComponent(`
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function App(props: { count: number }) {
      const [count] = createSignal(props.count ?? 7)
      const [other] = createSignal(2)
      return <p>{count()}{other()}</p>
    }
  `, 'test.tsx')
  expect(ctx.signals.map(s => s.getter)).toEqual(['count', 'other'])
})

test('signed literal seeds are separated without a type-based program', () => {
  const ctx = analyzeComponent(`
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function App(props: { count: number }) {
      const [count] = createSignal(-7)
      return <p>{props.count}{count()}</p>
    }
  `, 'test.tsx')
  expect(ctx.signals[0].getter).not.toBe('count')
  expect(ctx.signals[0].initialValue).toBe('-7')
})

test('re-analysis preserves a supplied Program and its virtual imports', () => {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    import { n } from './virtual'
    export function App(props: { count: number }) {
      const [count] = createSignal(7)
      const extra = n
      return <p>{props.count}{count()}{extra}</p>
    }
  `
  const files = new Map([
    ['/virtual/app.tsx', source],
    ['/virtual/virtual.ts', 'export const n = 42'],
  ])
  const options: ts.CompilerOptions = {
    noLib: true, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve,
  }
  const program = ts.createProgram([...files.keys()], options, {
    ...ts.createCompilerHost(options),
    getCurrentDirectory: () => '/virtual',
    directoryExists: name => name === '/virtual',
    fileExists: name => files.has(name),
    readFile: name => files.get(name),
    getSourceFile: (name, version) => files.has(name)
      ? ts.createSourceFile(name, files.get(name)!, version, true, ts.ScriptKind.TSX) : undefined,
  })
  const ctx = analyzeComponent(source, '/virtual/app.tsx', undefined, program)
  expect(ctx.signals[0].getter).not.toBe('count')
  expect(ctx.checker).not.toBeNull()
  let extra: ts.VariableDeclaration | undefined
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'extra') extra = node
    ts.forEachChild(node, visit)
  }
  visit(ctx.sourceFile)
  expect(ctx.checker!.typeToString(ctx.checker!.getTypeAtLocation(extra!.initializer!))).toBe('42')
  expect(program.getSourceFile('/virtual/app.tsx')!.text).toBe(source)
})

test('multi-component production compilation separates each component independently', () => {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function First(props: { count: number }) {
      const [count] = createSignal(7)
      return <p>{props.count}{count()}</p>
    }
    export function Second(props: { count: number }) {
      const [count] = createSignal(9)
      return <p>{props.count}{count()}</p>
    }
  `
  const result = compileJSX(source, 'test.tsx', { adapter: new TestAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const clientJs = result.files.find(f => f.type === 'clientJs')!.content
  expect(clientJs).toContain('initFirst')
  expect(clientJs).toContain('initSecond')
  expect(clientJs.match(/\[bfSignal_count\]/g)).toHaveLength(2)
})
