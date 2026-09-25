/**
 * The loop-row child constructions (`lowerLoopRowChildInputFields`) refuse a
 * row-independent prop they can't lower with BF101 — but only a prop that is
 * SSR data and should have been delivered. These pin the shapes that are NOT
 * SSR data, or that have no Go field to go to, and so must stay silent the
 * way they are at a non-loop call site.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, analyzeComponent, buildMetadata, jsxToIR, type ComponentIR, type IRComponent, type IRNode } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

const compile = (source: string) => {
  const result = compileJSX(source.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter(), outputIR: false })
  const types = result.files.find(f => f.type === 'types')?.content ?? ''
  const template = result.files.find(f => f.type === 'markedTemplate')?.content ?? ''
  return { types, template, bf101: result.errors.filter(e => e.code === 'BF101'), errors: result.errors }
}

// `markProps` lands on a component nested in the row component's forwarded
// children; `chipProps` on the loop-body (row) component itself. The rows
// come from a memo over the module array — the shape whose row component
// gets its own row-independent props lowered into the shared constructor
// (`loop-row-child-children-own-reactive-prop`).
const rowSource = (markProps: string, chipProps = '') => `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
function Chip({ children, ...rest }: { children?: any; [key: string]: unknown }) {
  return <span class="chip" {...rest}>{children}</span>
}
function Mark({ on, update, children }: { on?: boolean; update?: (n: number) => void; children?: any }) {
  return <em data-hl={on ? '' : undefined}>{children}</em>
}
type Opt = { id: string; label: string; flag: boolean }
const opts: Opt[] = [{ id: 'a', label: 'A', flag: true }, { id: 'b', label: 'B', flag: false }]
const noop = (_n: number) => {}
export function Row() {
  const [count, setCount] = createSignal(0)
  const [highlight] = createSignal(true)
  const [ready] = createSignal(false)
  const [only] = createSignal<string | null>(null)
  const shown = createMemo(() => {
    const id = only()
    if (!id) return opts
    return opts.filter(o => o.id === id)
  })
  const handleMount = (el: Element) => { el.setAttribute('data-mounted', String(count())) }
  return (
    <div>
      {${chipProps ? 'shown()' : 'opts'}.map(o => (
        <Chip key={o.id} ${chipProps}>
          <Mark ${markProps}>{o.label}</Mark>
        </Chip>
      ))}
    </div>
  )
}
`

describe('GoTemplateAdapter - loop-row child BF101 covers only undelivered SSR data', () => {
  for (const [label, props] of [
    ['a `ref` callback', 'ref={handleMount}'],
    ['a bare setter', 'update={setCount}'],
    ['an inline handler-valued prop', 'update={(n: number) => setCount(n)}'],
    ['a block-bodied inline handler', 'update={(n: number) => { setCount(n) }}'],
    ['a callback const', 'update={handleMount}'],
    ['a module-scope callback const', 'update={noop}'],
    ['an expression `children` prop', 'children={highlight() && ready() ? "x" : "y"}'],
    ['an unlowerable `/* @client */` prop', 'on={/* @client */ highlight() && ready()}'],
  ] as const) {
    test(`${label} on a component nested in the row's forwarded children is not refused`, () => {
      const { bf101 } = compile(rowSource(props))
      expect(bf101).toEqual([])
    })
    test(`${label} on the loop-body component itself is not refused`, () => {
      const { bf101 } = compile(rowSource('on={highlight()}', props))
      expect(bf101).toEqual([])
    })
  }

  // A hyphenated name can't be a Go field, so without a rest bag to route it
  // into it has nowhere to go whether or not its value lowers
  // (`emitChildField` drops it) — not a refusal. `Mark` declares no rest bag.
  test("an unlowerable hyphenated prop on a child with no rest bag is not refused", () => {
    const { bf101 } = compile(rowSource('on={highlight()} data-x={highlight() && ready()}'))
    expect(bf101).toEqual([])
  })

  // `Chip` spreads `...rest` onto its root, so the same prop is SSR data it
  // should receive: a lowerable value goes into the bag, an unlowerable one
  // refuses instead of vanishing.
  test('a hyphenated prop routed into the rest bag is delivered, or refused when unlowerable', () => {
    const lowered = compile(rowSource('on={highlight()}', 'data-x={highlight()}'))
    expect(lowered.bf101).toEqual([])
    expect(lowered.types).toContain('Rest: map[string]any{"data-x": true}')
    const refused = compile(rowSource('on={highlight()}', 'data-x={highlight() && ready()}'))
    expect(refused.bf101).toHaveLength(1)
    expect(refused.bf101[0].message).toContain("Prop 'data-x' on <Chip> inside a loop row")
  })

  test('an unlowerable row-independent data prop still refuses', () => {
    const { bf101 } = compile(rowSource('on={highlight() && ready()}'))
    expect(bf101).toHaveLength(1)
    expect(bf101[0].message).toContain("Prop 'on' on <Mark> inside a loop row")
  })

  // `only`/`once` start with `on` but are not event handlers (`on[A-Z]`):
  // an unlowerable value must refuse like any other data prop, not be
  // skipped as a handler.
  const withOnce = (markProps: string) =>
    rowSource(markProps)
      .replace('function Mark({ on,', 'function Mark({ once, on,')
      .replace('on?: boolean;', 'on?: boolean; once?: boolean;')

  test('an unlowerable prop named like `once` refuses like any data prop', () => {
    const { bf101 } = compile(withOnce('on={highlight()} once={highlight() && ready()}'))
    expect(bf101).toHaveLength(1)
    expect(bf101[0].message).toContain("Prop 'once' on <Mark> inside a loop row")
  })

  // `/* @client */` on a row-reading prop: delivered per row like any other
  // when it lowers (the reference renders it at SSR); the escape when it
  // doesn't, so the per-row lowering's own refusal stays silent.
  test('a row-reading `/* @client */` prop is re-applied per row when it lowers', () => {
    const { template, bf101 } = compile(rowSource('on={/* @client */ o.flag}'))
    expect(bf101).toEqual([])
    expect(template).toContain('(bf_with_props .MarkSlot1 "On" .Flag)')
  })

  test('an unlowerable row-reading prop refuses, and `/* @client */` escapes it', () => {
    const refused = compile(rowSource('on={new Intl.NumberFormat().format(o.label.length) === "1"}'))
    expect(refused.bf101.length).toBeGreaterThan(0)
    const escaped = compile(rowSource('on={/* @client */ new Intl.NumberFormat().format(o.label.length) === "1"}'))
    expect(escaped.bf101).toEqual([])
    expect(escaped.errors).toEqual([])
  })

  test('a prop named like `once` reading the row is re-applied per row', () => {
    const { template, bf101 } = compile(withOnce('once={o.flag}'))
    expect(bf101).toEqual([])
    expect(template).toContain('(bf_with_props .MarkSlot1 "Once" .Flag)')
  })
})

// A prop whose value is an imported binding can't be lowered (the value lives
// in a module this compile doesn't read), and nothing at this stage says
// whether it is a function or data: the IR records no type for an import and
// the adapter has no type checker. It is refused only when the receiving
// param's own declared type can't hold a function (a primitive, an array, or
// a union of those); otherwise it is left out silently, as at a non-loop call
// site.
describe('GoTemplateAdapter - loop-row child BF101 and imported bindings', () => {
  const importSource = (imports: string, markProps: string, chipProps = '') => `
'use client'
${imports}
type Formatter = (s: string) => string
function Chip({ children, ...rest }: { children?: any; [key: string]: unknown }) {
  return <span class="chip" {...rest}>{children}</span>
}
function Mark({ update, fmt, cb, items, label, children }: {
  update?: (s: string) => string
  fmt?: Formatter
  cb?: unknown
  items?: string[]
  label?: string
  children?: any
}) {
  return <em data-label={label}>{children}</em>
}
type Opt = { id: string; label: string }
const opts: Opt[] = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
export function Row() {
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id} ${chipProps}>
          <Mark ${markProps}>{o.label}</Mark>
        </Chip>
      ))}
    </div>
  )
}
`

  for (const [label, imports, props] of [
    ['a named import', "import { formatTone } from './format'", 'update={formatTone}'],
    ['an aliased named import', "import { formatTone as tone } from './format'", 'update={tone}'],
    ['a default import', "import formatTone from './format'", 'update={formatTone}'],
    ['a namespace member', "import * as utils from './format'", 'update={utils.formatTone}'],
    ['a named import into an aliased function type', "import { formatTone } from './format'", 'fmt={formatTone}'],
    ['a named import into an `unknown` param', "import { formatTone } from './format'", 'cb={formatTone}'],
  ] as const) {
    test(`${label} on a component nested in the row's forwarded children is not refused`, () => {
      const { bf101 } = compile(importSource(imports, props))
      expect(bf101).toEqual([])
    })
  }

  test('a named import on the loop-body component itself is not refused', () => {
    const { bf101 } = compile(importSource("import { formatTone } from './format'", '', 'data-fmt={formatTone}'))
    expect(bf101).toEqual([])
  })

  // The param's declared type settles it: a `string[]` or `string`
  // param can't hold a function, so the imported value is data the child
  // should have received.
  for (const [label, imports, props, name] of [
    ['a named import into an array param', "import { ITEMS } from './format'", 'items={ITEMS}', 'items'],
    ['a namespace member into a primitive param', "import * as utils from './format'", 'label={utils.LABEL}', 'label'],
  ] as const) {
    test(`${label} is refused`, () => {
      const { bf101 } = compile(importSource(imports, props))
      expect(bf101.map(e => e.message)).toEqual([
        `Prop '${name}' on <Mark> inside a loop row can't be lowered to an SSR value by the Go template adapter`,
      ])
    })
  }
})

// `propReadsRow` answers from the IR's own `IRProp.freeIdentifiers` when it is
// a live `Set` (what `compileJSX` hands the adapter) and only falls back to
// walking the parsed value when it isn't (the debug IR's JSON round trip,
// which the conformance harness's `test-render.ts` goes through). Pin the
// live-`Set` path on its own: drop the parsed value so the fallback cannot
// answer, and row detection must still hold.
describe('GoTemplateAdapter - loop-row prop row detection from a live freeIdentifiers Set', () => {
  const source = `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}
function Mark({ tone }: { tone?: string }) {
  return <em data-tone={tone}></em>
}
type Opt = { id: string; tone: string }
const opts: Opt[] = [{ id: 'a', tone: 'warm' }, { id: 'b', tone: 'cool' }]
export function Row() {
  return <div>{opts.map(o => (<Chip key={o.id}><Mark tone={o.tone} /></Chip>))}</div>
}
`.trimStart()

  const buildIR = (name: string): ComponentIR => {
    const ctx = analyzeComponent(source, 'test.tsx', name)
    return { version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }
  }
  const findComponent = (node: IRNode, name: string): IRComponent | null => {
    if (node.type === 'component' && (node as IRComponent).name === name) return node as IRComponent
    for (const child of (node as { children?: IRNode[] }).children ?? []) {
      const hit = findComponent(child, name)
      if (hit) return hit
    }
    return null
  }
  // Generate the same-file children first, then the parent, on one adapter —
  // the order `compileJSX` uses — with the tone prop's parsed value dropped.
  // `generateTypes` (where the shared constructor is built) is handed either
  // that live IR or its JSON round trip, as `test-render.ts` does.
  const generateRow = (typesFromRoundTrip: boolean) => {
    const adapter = new GoTemplateAdapter()
    for (const name of ['Chip', 'Mark']) adapter.generate(buildIR(name))
    const ir = buildIR('Row')
    const tone = findComponent(ir.root, 'Mark')!.props.find(p => p.name === 'tone')!
    expect(tone.freeIdentifiers instanceof Set).toBe(true)
    if (tone.value.kind === 'expression') delete tone.value.parsed
    const { template } = adapter.generate(ir)
    const typesIR: ComponentIR = typesFromRoundTrip ? JSON.parse(JSON.stringify(ir)) : ir
    const types = adapter.generateTypes(typesIR) ?? ''
    const start = types.indexOf('child_MarkSlot0 := NewMarkProps(MarkInput{')
    return {
      template,
      ctor: start === -1 ? '' : types.slice(start, types.indexOf('\t})', start)),
      bf101: adapter.errors.filter(e => e.code === 'BF101'),
    }
  }

  test('the live Set alone detects the row read', () => {
    const { template, ctor, bf101 } = generateRow(false)
    expect(ctor).toContain('BfMount: "s0",')
    expect(ctor).not.toContain('Tone:')
    expect(bf101).toEqual([])
    expect(template).toContain('(bf_with_props .MarkSlot0 "Tone" .Tone)')
  })

  // Control: the same IR after the round trip has neither the Set nor the
  // parsed value, so the constructor no longer sees a row read and refuses
  // `tone` as an unlowerable row-independent prop — the Set was what answered.
  test('without the Set or the parsed value there is nothing to detect it from', () => {
    const { bf101 } = generateRow(true)
    expect(bf101.map(e => e.message)).toEqual([
      "Prop 'tone' on <Mark> inside a loop row can't be lowered to an SSR value by the Go template adapter",
    ])
  })
})
