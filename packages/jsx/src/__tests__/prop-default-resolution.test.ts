// What a computed destructure default stands for once the declarations it
// reads are resolved (`appliedPropDefaults`), the SSR seed plan's prop steps
// built from it, and the refusal of a default no template can apply
// (`refuseUnappliedPropDefaults`), against IR built by the real pipeline.
// The rendered output is pinned by the conformance fixtures
// `destructure-default-local-const*`, `destructure-default-param-module-scope`
// and `destructure-default-reads-signal`.

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'
import { stringifyParsedExpr } from '../expression-parser'
import { jsxToIR } from '../jsx-to-ir'
import { appliedPropDefaults, computeSsrSeedPlan } from '../ssr-seed-plan'
import { refuseUnappliedPropDefaults } from '../adapters/unapplied-prop-default'
import type { CompilerError, ComponentIR } from '../types'

function irFor(body: string, signature = 'props: { a?: string; b?: string; c?: string }', preamble = ''): ComponentIR {
  const ctx = analyzeComponent(`
    'use client'
    import { createSignal, createMemo } from '@barefootjs/client'
    function Child(props: { v?: string; onDone?: () => void }) { return <b>{props.v}</b> }
    ${preamble}
    export function C(${signature}) {
      ${body}
    }
  `, 'C.tsx', 'C')
  return { version: '0.1', metadata: buildMetadata(ctx), root: jsxToIR(ctx)!, errors: [] }
}

/** Each applied default as `name = <resolved>`, with `!names` for what blocks it, in application order. */
function defaults(ir: ComponentIR): string[] {
  const { order, defaults } = appliedPropDefaults(ir.metadata)
  return order.flatMap((p) => {
    const d = defaults.get(p.name)
    if (!d) return []
    return [`${p.name} = ${stringifyParsedExpr(d.expr)}${d.blocked.length ? ` !${d.blocked.join(',')}` : ''}`]
  })
}

/** The seed plan's prop steps, as their expression text. */
function propSteps(ir: ComponentIR): string[] {
  return computeSsrSeedPlan(ir.metadata).steps.flatMap(s => (s.kind === 'derived' && s.origin === 'prop' ? [s.expr] : []))
}

function refusals(ir: ComponentIR): string[] {
  const errors: CompilerError[] = []
  refuseUnappliedPropDefaults(ir, { errors, componentName: 'C' })
  return errors.map(e => `${e.code} ${/^The default of prop '(\w+)' reads ([^,]+(?:, '[^']+')*), which/.exec(e.message)?.slice(1).join(' <- ')}`)
}

describe('appliedPropDefaults', () => {
  test('a body destructure default reads a component const, through a method, a const of a const and a function', () => {
    const ir = irFor(`
      const DEF = 'z'
      const SUFFIX = DEF + '!'
      const label = () => DEF + '?'
      const { a = DEF.toUpperCase(), b = SUFFIX, c = label() } = props
      return <p>{a}{b}{c}</p>`)
    expect(defaults(ir)).toEqual(['a = "z".toUpperCase()', 'b = "z" + "!"', 'c = "z" + "?"'])
    expect(propSteps(ir)).toEqual(['a ?? "z".toUpperCase()', 'b ?? "z" + "!"', 'c ?? "z" + "?"'])
  })

  test('a component const hides a module const of the same name in a body destructure default', () => {
    const ir = irFor(`
      const DEF = 'z'
      const { a = DEF.toUpperCase(), b = DEF } = props
      return <p>{a}{b}</p>`, undefined, `const DEF = 'm'`)
    expect(defaults(ir)).toEqual(['a = "z".toUpperCase()', 'b = "z"'])
  })

  test('a parameter default reads the module const, whatever the body declares under that name', () => {
    const ir = irFor(`
      const DEF = 'local'
      return <p>{a}{b}</p>`, `{ a = DEF.toUpperCase(), b = NEXT }: { a?: string; b?: number }`, `const DEF = 'm'\nconst START = 3\nconst NEXT = START + 1`)
    expect(defaults(ir)).toEqual(['a = "m".toUpperCase()', 'b = 3 + 1'])
    expect(propSteps(ir)).toEqual(['a ?? "m".toUpperCase()', 'b ?? 3 + 1'])
  })

  test('a module const reads the module scope where a component const has a name it reads', () => {
    const ir = irFor(`
      const BASE = 'local'
      const { a = TAG } = props
      return <p>{a}{BASE}</p>`, undefined, `const BASE = 'm'\nconst TAG = BASE + '!'`)
    expect(defaults(ir)).toEqual(['a = "m" + "!"'])
  })

  test('a prop named like a module const is the prop', () => {
    const ir = irFor(`return <p>{DEF}{b}</p>`, `{ DEF = 'p', b = DEF + '!' }: { DEF?: string; b?: string }`, `const DEF = 'm'`)
    expect(defaults(ir)).toEqual(['b = DEF + "!"'])
  })

  test('a default reading an earlier prop through a const is applied after that prop', () => {
    const ir = irFor(`
      const { a = 'x'.toUpperCase() } = props
      const L = a + '!'
      const { b = L } = props
      return <p>{a}{b}</p>`, 'props: { b?: string; a?: string }')
    expect(defaults(ir)).toEqual(['a = "x".toUpperCase()', 'b = a + "!"'])
    expect(propSteps(ir)).toEqual(['a ?? "x".toUpperCase()', 'b ?? a + "!"'])
  })

  test('a const under a callback param of a name it reads is not resolved into the callback', () => {
    const ir = irFor(`
      const { a = 'x'.toUpperCase() } = props
      const L = a + '!'
      const { b = ['p'].map(a => a + L).join('') } = props
      return <p>{a}{b}</p>`)
    expect(defaults(ir)[1]).toEndWith(' !L')
    expect(propSteps(ir)).toEqual(['a ?? "x".toUpperCase()'])
  })

  test('a const declared after the destructure is not initialized when the default runs', () => {
    const ir = irFor(`
      const { a = DEF, b = EARLY } = props
      const DEF = 'z'
      return <p>{a}{b}</p>`, undefined, `const DEF = 'm'\nconst EARLY = 'e'`)
    expect(defaults(ir)).toEqual(['a = DEF !DEF', 'b = "e"'])
    expect(propSteps(ir)).toEqual(['b ?? "e"'])
  })

  test('a signal, a memo, a let, a reassigned const and a function with a parameter block the default', () => {
    const ir = irFor(`
      const [s] = createSignal('q')
      const m = createMemo(() => s() + '!')
      let n = 'n'
      function fmt(x: string) { return x }
      const L = s() + '!'
      const { a = L, b = m() + n, c = fmt('x') } = props
      return <p>{a}{b}{c}</p>`)
    expect(defaults(ir)).toEqual(['a = s() + "!" !s', 'b = m() + n !m,n', 'c = fmt("x") !fmt'])
    expect(propSteps(ir)).toEqual([])
  })
})

describe('refuseUnappliedPropDefaults', () => {
  const BLOCKED = `
      const [s] = createSignal('q')
      const L = s() + '!'
      const { a = L, b = a } = props`

  test('a blocked default is refused where a position reads the prop', () => {
    expect(refusals(irFor(`${BLOCKED}
      return <p>{a}</p>`))).toEqual([`BF101 a <- 's'`])
  })

  test('through a signal seed, a memo, a child prop and another prop default', () => {
    expect(refusals(irFor(`${BLOCKED}
      const [n] = createSignal(a)
      return <p>{n()}</p>`))).toEqual([`BF101 a <- 's'`])
    expect(refusals(irFor(`${BLOCKED}
      const m = createMemo(() => a + '?')
      return <p>{m()}</p>`))).toEqual([`BF101 a <- 's'`])
    expect(refusals(irFor(`${BLOCKED}
      return <Child v={a} />`))).toEqual([`BF101 a <- 's'`])
    expect(refusals(irFor(`${BLOCKED}
      return <p>{b}</p>`))).toEqual([`BF101 a <- 's'`])
  })

  test('not where only the client reads the prop', () => {
    expect(refusals(irFor(`${BLOCKED}
      return <p>{/* @client */ a}</p>`))).toEqual([])
    expect(refusals(irFor(`${BLOCKED}
      return <button onClick={() => console.log(a)}>x</button>`))).toEqual([])
  })

  test('claims the /* @client */ escape unless a child prop reads the prop', () => {
    const claims = (body: string) => {
      const errors: CompilerError[] = []
      refuseUnappliedPropDefaults(irFor(body), { errors, componentName: 'C' })
      return errors.map(e => e.suggestion?.escape?.map(x => x.kind) ?? [])
    }
    expect(claims(`${BLOCKED}
      return <p>{a}</p>`)).toEqual([['client-directive']])
    expect(claims(`${BLOCKED}
      return <p>{a}<Child v={b} /></p>`)).toEqual([[]])
  })

  test('a handler default naming a component function is not refused', () => {
    expect(refusals(irFor(`
      function handleDone() {}
      const { onDone = handleDone } = props
      return <div><button onClick={onDone}>x</button><Child onDone={onDone} /></div>`, 'props: { onDone?: () => void }'))).toEqual([])
  })
})
