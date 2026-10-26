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

// #3473: the loop row window every DSL adapter's `renderLoop` goes through.
class RowAdapter extends StubAdapter {
  events: string[] = []
  row: ReturnType<DslTemplateAdapter['renderLoopRow']> | null = null

  private at(what: string): string {
    return `${what} inLoop=${this.inLoop} row=${this.scope.isBound('item')}`
  }
  override renderNode(node: IRNode): string {
    if (node.type === 'loop') return this.renderLoop(node as IRLoop)
    if (node.type === 'expression' || node.type === 'conditional') {
      this.events.push(this.at('child'))
      return `{${node.type}}`
    }
    return super.renderNode(node)
  }
  override renderLoop(loop: IRLoop): string {
    this.row = this.renderLoopRow(loop, {
      enter: (row, outside) => {
        this.events.push(`${this.at('enter')} entered=${this.scope === row} outside=${outside.isBound('item')}`)
      },
      preamble: (d) => {
        this.events.push(this.at(`preamble ${d.name}`))
        return `[set ${d.name}]`
      },
      keyAnchor: (key) => {
        this.events.push(this.at(`key ${key}`))
        return `[anchor ${key}]`
      },
    })
    this.events.push(this.at('after'))
    return this.row.body
  }
}

describe('DslTemplateAdapter.renderLoopRow (#3473)', () => {
  test('the preamble, then the children under inLoop, all under the row scope, restored after', () => {
    const adapter = new RowAdapter()
    adapter.generate(componentIR(`
      export function Test({ items, label }: { items: { id: string; label: string }[]; label: string }) {
        return <ul>{items.map(item => { const label = item.label; return <li key={item.id}>{label}</li> })}</ul>
      }
    `))
    expect(adapter.events).toEqual([
      'enter inLoop=false row=true entered=true outside=false',
      'preamble label inLoop=false row=true',
      'child inLoop=true row=true',
      'after inLoop=false row=false',
    ])
    expect(adapter.row!.preamble).toEqual(['[set label]'])
    expect(adapter.row!.row.innermostNames()).toEqual(['item', 'label'])
    expect(adapter.row!.rootAliases).toEqual([{ name: 'label', alias: '__bf_root_label' }])
  })

  test('a whole-item-conditional body gets its key anchor after the children, outside inLoop', () => {
    const adapter = new RowAdapter()
    const out = adapter.generate(componentIR(`
      export function Test({ items }: { items: { id: string; on: boolean }[] }) {
        return <ul>{items.map(item => item.on ? <li key={item.id}>{item.id}</li> : null)}</ul>
      }
    `))
    expect(adapter.events.slice(-3)).toEqual([
      'child inLoop=true row=true',
      'key item.id inLoop=false row=true',
      'after inLoop=false row=false',
    ])
    expect(out.template).toContain('[anchor item.id]\n')
  })
})
