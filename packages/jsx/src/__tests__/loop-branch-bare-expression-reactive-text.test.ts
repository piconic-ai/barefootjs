/**
 * Emission pin for the text effect of a loop-row conditional branch that is
 * one bare expression (no wrapping element).
 *
 * `insert()` (runtime/insert.ts) leaves a branch alone while its condition
 * is unchanged, so a keyed row reused with a new item only rewrites such a
 * branch through an effect inside the arm. `summarizeLoopChildBranch`
 * (ir-to-client-js/collect-elements.ts) takes the branch's text slots from
 * `collectLoopChildReactiveTexts`, the collector every other row text goes
 * through, so a branch gets the effect when it reads the row or a reactive
 * source, or contains a call.
 *
 * A branch with a call in it used to be left out whatever it called
 * (#3894): `cond ? fmt(row.wait) : '0s'` kept the value the row was built
 * with, while the same call directly in the row, or in a conditional
 * outside a loop, was re-evaluated. The one branch still left out is the
 * one Phase 1 marks `IRExpression.readsCallerValue`: it reads something the
 * caller supplied that may be or build a live element, which the row keeps
 * (`caller-value-reach.ts`; `nested-loop-conditional.test.ts` and
 * `packages/client/__tests__/runtime/loop-branch-live-element.test.ts`).
 *
 * `transformConditionalBranch` (jsx-to-ir.ts) gives a bare branch reading
 * the loop item its `slotId`, which the effect claims and which puts the
 * `<!--bf:sN-->` marker in the template.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

const PROPS_TYPE = `{
      format?: (s: string) => string
      label?: (s: string) => string | number | null
      count: number
      rows2: Row[]
      render?: (row: Row) => unknown
      cell?: (row: Row) => JSX.Element
      untyped?: any
      children?: (row: Row) => unknown
      slots: { cell: (row: Row) => unknown }
      cols: Col[]
    }`

/** Compile a keyed loop whose row is `row.done ? <branchTrue> : 'pending'`. */
function clientJsFor(branchTrue: string, opts: { params?: string; body?: string } = {}): string {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    import { createMemo } from '@barefootjs/client'
    type Row = { id: number; label: string; done: boolean }
    interface Col { key: string; cell?: (row: Row) => unknown }
    type Props = ${PROPS_TYPE}
    const fmt = (s: string) => s.trim()
    const apply = (f: any, ...args: any[]) => f(...args)
    export function C(${opts.params ?? '_p: Props'}) {
      const [rows] = createSignal<Row[]>([])
      ${opts.body ?? ''}
      return <ul>{rows().map(row => <li key={row.id}>{row.done ? ${branchTrue} : 'pending'}</li>)}</ul>
    }
  `
  const result = compileJSX(source, 'C.tsx', { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'))
  return result.files.find(f => f.type === 'clientJs')!.content
}

/** The arm's text effects, as the expression each one writes. */
function armEffects(js: string): string[] {
  const out: string[] = []
  const open = "createDisposableEffect(() => { __bfw_"
  for (let at = js.indexOf(open); at !== -1; at = js.indexOf(open, at + 1)) {
    const start = js.indexOf('escapeTextOrNode(', at) + 'escapeTextOrNode('.length
    out.push(js.slice(start, js.indexOf(')) })', start)))
  }
  return out
}

const ARM_WRITER = /lazySlots\(__branchScope, \[\{ id: 's\d+', kind: 'markup', path: \[\] \}\]\)/

describe('loop-row conditional: a bare-expression branch gets its own text effect', () => {
  test('a bare property read', () => {
    const js = clientJsFor('row.label')
    expect(js).toContain("createDisposableEffect(() => { __bfw_s1('s1', escapeTextOrNode(row().label)) })")
    expect(js).toMatch(ARM_WRITER)
  })

  test('a template literal built from property reads', () => {
    const js = clientJsFor('`[${row.label}]`')
    expect(js).toContain('escapeTextOrNode(`[${row().label}]`)')
  })

  test('a call to a module-level function (#3894)', () => {
    const js = clientJsFor('fmt(row.label)')
    expect(js).toContain("createDisposableEffect(() => { __bfw_s1('s1', escapeTextOrNode(fmt(row().label))) })")
    expect(js).toMatch(ARM_WRITER)
  })

  test('a call nested inside a template literal', () => {
    const js = clientJsFor('`${fmt(row.label)}!`')
    expect(js).toContain('escapeTextOrNode(`${fmt(row().label)}!`)')
  })

  test('a method call on the row value and a global call', () => {
    expect(clientJsFor('row.label.toUpperCase()')).toContain('escapeTextOrNode(row().label.toUpperCase())')
    expect(clientJsFor('String(row.id)')).toContain('escapeTextOrNode(String(row().id))')
  })

  test('a call to a callback prop declared to return only primitives', () => {
    expect(armEffects(clientJsFor('_p.format(row.label)'))).toEqual(['_p.format(row().label)'])
    expect(armEffects(clientJsFor('_p.label(row.label)'))).toEqual(['_p.label(row().label)'])
    // A destructured prop, through its declared type too.
    const destructured = clientJsFor('format(row.label)', { params: '{ format }: Props' })
    expect(armEffects(destructured)).toHaveLength(1)
    expect(armEffects(destructured)[0]).toContain('format(row().label)')
  })

  test('a call in the leaf of a nested ternary binds inside the nested arm', () => {
    const js = clientJsFor("row.id > 0 ? fmt(row.label) : row.label")
    // The nested conditional has its own `insert()`; each of its leaves
    // gets its own effect there, not one effect over the whole ternary.
    expect(js).toContain('escapeTextOrNode(fmt(row().label))')
    expect(js).toContain('escapeTextOrNode(row().label)')
    expect(js).not.toContain('escapeTextOrNode(row().id > 0 ?')
  })

  test('a literal branch (no row read, no call) gets no slot and no effect', () => {
    const js = clientJsFor("'yes'")
    expect(js).not.toContain("escapeTextOrNode('yes')")
    expect(js).not.toMatch(ARM_WRITER)
  })
})

type Case = [name: string, branch: string, opts?: { params?: string; body?: string }]

describe('loop-row conditional: a branch that can reach a caller-supplied element gets no text effect', () => {
  const NO_EFFECT: Case[] = [
    // The callee is the prop, in any spelling.
    ['a callback prop returning unknown', '_p.render(row)'],
    ['a callback prop returning an element', '_p.cell(row)'],
    ['a prop with no function type', '_p.untyped(row)'],
    ['children called as a function', '_p.children(row)'],
    ['a bracket access', "_p['render'](row)"],
    ['a computed bracket access', '_p[row.label](row)'],
    ['an optional call', '_p.render?.(row)'],
    ['a non-null assertion on the callee', '_p.render!(row)'],
    ['a parenthesized, cast call', '(_p.render(row) as string)'],
    ['`.call` on the prop', '_p.render.call(null, row)'],
    ['a deeper member', '_p.slots.cell(row)'],
    ['a member of a typed row object holding a callback', '_p.cols[0].cell(row)'],
    // Anywhere in the branch, not only as its value.
    ['the value side of `&&`', 'row.id > 0 && _p.render(row)'],
    ['either side of `??`', '_p.render(row) ?? row.label'],
    ['inside a template literal', '`${_p.render(row)}!`'],
    ['as an operand', "_p.render(row) + ''"],
    // The prop is handed to something else.
    ['a prop passed as an argument', 'apply(_p.render, row)'],
    ['the whole props object passed as an argument', 'apply(_p, row)'],
    ['a prop inside an argument', 'fmt(String(_p.render(row)))'],
    // A component declaration that reads it.
    ['a local wrapper arrow', 'draw(row)', { body: 'const draw = (r: Row) => _p.render(r)' }],
    ['a local wrapper function declaration', 'draw(row)', { body: 'function draw(r: Row) { return _p.render(r) }' }],
    ['a wrapper calling a wrapper', 'outer(row)', { body: 'const inner = (r: Row) => _p.render(r)\n      const outer = (r: Row) => inner(r)' }],
    ['a wrapper declared after its user', 'outer(row)', { body: 'const outer = (r: Row) => inner(r)\n      const inner = (r: Row) => _p.render(r)' }],
    ['a callback stored in a const object', 'o.draw(row)', { body: 'const o = { draw: _p.render }' }],
    ['a const alias of a callback prop', 'draw(row)', { body: 'const draw = _p.render' }],
    ['a const alias of the props object', 'p.render(row)', { body: 'const p = _p' }],
    ['a body destructure of a callback prop', 'render(row)', { body: 'const { render } = _p' }],
    ['a nested pattern in a body destructure', 'cell(row)', { body: 'const { slots: { cell } } = _p' }],
    ['a memo holding the prop', 'draw()(row)', { body: 'const draw = createMemo(() => _p.render)' }],
    ['a signal seeded from the prop', 'draw()(row)', { body: 'const [draw] = createSignal(_p.render)' }],
    ['a `let`', 'draw(row)', { body: 'let draw = fmt' }],
    // A destructured props parameter.
    ['a destructured callback prop', 'render(row)', { params: '{ render }: Props' }],
    ['a renamed destructured callback prop', 'draw(row)', { params: '{ render: draw }: Props' }],
    ['a rest bag', 'rest.render(row)', { params: '{ count, ...rest }: Props' }],
    ['a nested pattern in the parameter', 'cell(row)', { params: '{ slots: { cell } }: Props' }],
    ['a wrapper over a destructured callback prop', 'draw(row)', { params: '{ render }: Props', body: 'const draw = (r: Row) => render(r)' }],
  ]
  for (const [name, branch, opts] of NO_EFFECT) {
    test(name, () => {
      expect(armEffects(clientJsFor(branch, opts))).toEqual([])
    })
  }

  test('the callback is still called where the branch is built', () => {
    const js = clientJsFor('_p.render(row)')
    expect(js).toContain('__bfSlot(_p.render(row()), __slots)')
  })

  test('a `.map()` preamble local is not known safe', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { id: number; label: string; done: boolean }
      const fmt = (s: string) => s.trim()
      export function C(props: { render: (row: Row) => unknown }) {
        const [rows] = createSignal<Row[]>([])
        return <ul>{rows().map(row => { const draw = props.render; return <li key={row.id}>{row.done ? draw(row) : 'pending'}</li> })}</ul>
      }
    `
    const result = compileJSX(source, 'C.tsx', { adapter })
    const js = result.files.find(f => f.type === 'clientJs')!.content
    expect(armEffects(js)).toEqual([])
  })
})

describe('loop-row conditional: a branch the caller cannot reach with an element keeps its text effect', () => {
  const EFFECT: Case[] = [
    ['a module function', 'fmt(row.label)'],
    ['an imported function', 'String(createMemo(() => row.label)())'],
    ['a method and a global', 'String(row.label.toUpperCase())'],
    ['a callback prop returning a string, by bracket access', "_p['format'](row.label)"],
    ['a callback prop returning a string, passed as an argument', 'apply(_p.format, row.label)'],
    ['a data prop read as an argument', 'fmt(String(_p.count + row.id))'],
    ['a prop array of a data-only row type', 'fmt(_p.rows2.find(r => r.id === row.id)?.label ?? row.label)'],
    ['a const alias of the props object, for a data prop', 'p.format(row.label)', { body: 'const p = _p' }],
    ['a body destructure of a data prop', 'format(row.label)', { body: 'const { format } = _p' }],
    ['a local function that reads no prop', 'tidy(row.label)', { body: 'const tidy = (s: string) => fmt(s)' }],
    ['a local wrapper over a string-returning callback prop', 'tidy(row.label)', { body: 'const tidy = (s: string) => _p.format(s)' }],
    ['a const computed from a data prop', 'fmt(String(twice + row.id))', { body: 'const twice = _p.count * 2' }],
    ['a signal seeded from a data prop', 'fmt(String(n() + row.id))', { body: 'const [n] = createSignal(_p.count)' }],
    ['a memo over a data prop', 'fmt(String(n() + row.id))', { body: 'const n = createMemo(() => _p.count * 2)' }],
    ['a destructured data prop with a default', 'format(row.label)', { params: '{ format = fmt }: Props' }],
    ['a nested arrow whose parameter is named like the props object', 'fmt([row.label].map(_p => _p.trim()).join())'],
  ]
  for (const [name, branch, opts] of EFFECT) {
    test(name, () => {
      expect(armEffects(clientJsFor(branch, opts))).toHaveLength(1)
    })
  }

  test('a loop row named like the props object or a prop shadows it', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Cell = { id: number; done: boolean; render: (n: number) => string }
      export function C(props: { render?: (c: Cell) => unknown }) {
        const [cells] = createSignal<Cell[]>([])
        return (
          <div>
            <ul>{cells().map(props => <li key={props.id}>{props.done ? props.render(props.id) : 'pending'}</li>)}</ul>
            <ol>{cells().map(({ id, done, render }) => <li key={id}>{done ? render(id) : 'pending'}</li>)}</ol>
          </div>
        )
      }
    `
    const result = compileJSX(source, 'C.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const js = result.files.find(f => f.type === 'clientJs')!.content
    // Both rows call the row's own `render`, so both branches get the effect.
    expect(armEffects(js)).toHaveLength(2)
  })
})
