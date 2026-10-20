import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { buildMetadata } from '../compiler'
import { DslTemplateAdapter, type TemplateIdentifierSpelling } from '../adapters/dsl-template-adapter'
import type {
  ComponentIR,
  IRComponent,
  IRConditional,
  IRElement,
  IRExpression,
  IRIfStatement,
  IRLoop,
  IRNode,
} from '../types'

// #3475: the `generate()` the eight DSL template adapters share. A minimal
// adapter stands in for one; each hook records what it saw.
function componentIR(source: string): ComponentIR {
  const ctx = analyzeComponent(source, 'Test.tsx')
  const root = jsxToIR(ctx)
  if (!root) throw new Error('expected IR')
  return { version: '0.1', metadata: buildMetadata(ctx), root, errors: [] }
}

class StubAdapter extends DslTemplateAdapter {
  name = 'stub'
  extension = '.stub'
  protected readonly loopChildDiagnosticName = 'Stub'
  protected override readonly templateIdentifierSpelling: TemplateIdentifierSpelling | null
  /** What `resetAdapterState` saw of the shared state. */
  seenAtReset: { propNames: string[]; errors: number; counter: number } | null = null
  scriptCalls: unknown[][] = []

  constructor(spelling: TemplateIdentifierSpelling | null = null) {
    super()
    this.templateIdentifierSpelling = spelling
  }

  protected stringValueNamesFor(): Set<string> {
    return new Set()
  }
  protected override resetAdapterState(): void {
    this.seenAtReset = {
      propNames: this.propsParams.map(p => p.name),
      errors: this.errors.length,
      counter: this.childrenCaptureCounter,
    }
  }
  protected renderIfStatement(ifStmt: IRIfStatement): string {
    return `[if ${ifStmt.condition}]`
  }
  protected generateScriptRegistrations(...args: unknown[]): string {
    this.scriptCalls.push(args.slice(1))
    return '[scripts]'
  }
  protected contextConsumerSeed(): string {
    return '[ctx]'
  }
  protected derivedMemoSeed(): string {
    return '[memo]'
  }

  renderNode(node: IRNode): string {
    if (node.type === 'component') {
      // A rendering diagnostic, and a use of the per-compile counter.
      this.errors.push({
        code: 'BF999',
        severity: 'error',
        message: `rendered ${(node as IRComponent).name}`,
        loc: { file: 'Test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      })
      return `[child ${this.childrenCaptureCounter++}]`
    }
    if (node.type === 'element') return `<${(node as IRElement).tag}>${this.renderChildren((node as IRElement).children)}`
    if (node.type === 'loop') return this.renderChildren((node as IRLoop).children)
    return `{${node.type}}`
  }
  renderElement(element: IRElement): string {
    return this.renderNode(element)
  }
  renderExpression(expr: IRExpression): string {
    return this.renderNode(expr)
  }
  renderConditional(cond: IRConditional): string {
    return this.renderNode(cond)
  }
  renderLoop(loop: IRLoop): string {
    return this.renderNode(loop)
  }
  renderComponent(comp: IRComponent): string {
    return this.renderNode(comp)
  }
  renderScopeMarker(): string {
    return ''
  }
  renderSlotMarker(): string {
    return ''
  }
  renderCondMarker(): string {
    return ''
  }
}

const LOOP_CHILD = `
  import Child from './child'
  export function Test({ items }: { items: string[] }) {
    return <ul>{items.map(i => <Child key={i} />)}</ul>
  }
`

describe('DslTemplateAdapter.generate (#3475)', () => {
  test('the template is the script registrations, the two seeds and the body, in that order', () => {
    const out = new StubAdapter().generate(componentIR(`export function Test() { return <p>hi</p> }`))
    expect(out.template).toBe('[scripts][ctx][memo]<p>{text}\n')
    expect(out.sections).toEqual({ imports: '', types: '', component: out.template, defaultExport: '' })
    expect(out.extension).toBe('.stub')
  })

  test('skipScriptRegistration drops the registrations; the script options reach the adapter', () => {
    const ir = componentIR(`export function Test() { return <p>hi</p> }`)
    const adapter = new StubAdapter()
    expect(adapter.generate(ir, { skipScriptRegistration: true }).template).toBe('[ctx][memo]<p>{text}\n')
    adapter.generate(ir, { scriptBaseName: 'Base', scriptAssets: ['/a.js'], preloadAssets: ['/p.js'] })
    expect(adapter.scriptCalls).toEqual([['Base', ['/a.js'], ['/p.js']]])
  })

  test('a root if statement renders through renderIfStatement', () => {
    const ir = componentIR(`
      export function Test({ on }: { on: boolean }) {
        if (on) return <p>on</p>
        return <p>off</p>
      }
    `)
    expect(ir.root.type).toBe('if-statement')
    expect(new StubAdapter().generate(ir, { skipScriptRegistration: true }).template).toBe('[ctx][memo][if on]\n')
  })

  test('the adapter hook runs after the shared state is reset', () => {
    const adapter = new StubAdapter()
    adapter.generate(componentIR(LOOP_CHILD))
    adapter.generate(componentIR(`export function Test({ label }: { label: string }) { return <p>{label}</p> }`))
    expect(adapter.seenAtReset).toEqual({ propNames: ['label'], errors: 0, counter: 0 })
  })

  test('BF103 names the adapter, comes before rendering diagnostics, and is suppressed for registered siblings', () => {
    const ir = componentIR(LOOP_CHILD)
    const out = new StubAdapter().generate(ir)
    expect(out.template).toContain('[child 0]')
    expect(ir.errors.map(e => e.code)).toEqual(['BF103', 'BF999'])
    expect(ir.errors[0]!.message).toContain('The Stub adapter emits')

    const registered = componentIR(LOOP_CHILD)
    new StubAdapter().generate(registered, { siblingTemplatesRegistered: true })
    expect(registered.errors.map(e => e.code)).toEqual(['BF999'])
  })

  test('the reserved-name collision check runs only for an adapter that renames names', () => {
    const source = `
      export function Test(props: { loop: string; __bf_loop: string }) {
        return <div>{props.loop}{props.__bf_loop}</div>
      }
    `
    const spelling = { ident: (name: string) => (name === 'loop' ? '__bf_loop' : name), label: 'Stub' }
    const renamed = componentIR(source)
    new StubAdapter(spelling).generate(renamed)
    expect(renamed.errors.map(e => e.code)).toEqual(['BF105'])

    const plain = componentIR(source)
    new StubAdapter().generate(plain)
    expect(plain.errors).toEqual([])
  })
})
