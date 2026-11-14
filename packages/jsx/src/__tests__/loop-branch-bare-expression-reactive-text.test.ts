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
 * one Phase 1 marks `IRExpression.callerCallbackResult`: its value can be
 * an element a callback prop built, which the row keeps (see
 * `nested-loop-conditional.test.ts`).
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
      render?: (row: Row) => unknown
      cell?: (row: Row) => JSX.Element
      untyped?: any
      children?: (row: Row) => unknown
      rows2: Row[]
    }`

/** Compile a keyed loop whose row is `row.done ? <branchTrue> : 'pending'`. */
function clientJsFor(branchTrue: string, opts: { params?: string; body?: string } = {}): string {
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    type Row = { id: number; label: string; done: boolean }
    type Props = ${PROPS_TYPE}
    const fmt = (s: string) => s.trim()
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

describe('loop-row conditional: a branch that may be a callback prop\'s element gets no text effect', () => {
  const NO_EFFECT: Array<[string, string, { params?: string; body?: string }?]> = [
    ['a callback prop returning unknown', '_p.render(row)'],
    ['a callback prop returning an element', '_p.cell(row)'],
    ['a prop with no function type', '_p.untyped(row)'],
    ['children called as a function', '_p.children(row)'],
    ['an optional call', '_p.render?.(row)'],
    ['a non-null assertion on the callee', '_p.render!(row)'],
    ['a parenthesized, cast call', '(_p.render(row) as string)'],
    ['the value side of `&&`', 'row.id > 0 && _p.render(row)'],
    ['either side of `??`', '_p.render(row) ?? row.label'],
    ['a destructured callback prop', 'render(row)', { params: '{ render }: Props' }],
    ['a renamed destructured callback prop', 'draw(row)', { params: '{ render: draw }: Props' }],
    ['a const alias of a callback prop', 'draw(row)', { body: 'const draw = _p.render' }],
    ['a body destructure of a callback prop', 'render(row)', { body: 'const { render } = _p' }],
    ['a const alias of the props object', 'p.render(row)', { body: 'const p = _p' }],
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
})

describe('loop-row conditional: a callback prop outside the value position does not hold the effect back', () => {
  test('inside a template literal, as an argument, or as an operand', () => {
    expect(armEffects(clientJsFor('`${_p.render(row)}!`'))).toEqual(['`${_p.render(row())}!`'])
    expect(armEffects(clientJsFor('fmt(String(_p.render(row)))'))).toEqual(['fmt(String(_p.render(row())))'])
    expect(armEffects(clientJsFor("_p.render(row) + ''"))).toEqual(["_p.render(row()) + ''"])
  })

  test('a method of a prop value is not a callback prop', () => {
    expect(armEffects(clientJsFor('_p.rows2.find(r => r.id === row.id)?.label'))).toHaveLength(1)
    expect(armEffects(clientJsFor('String(_p.rows2.length + row.id)'))).toHaveLength(1)
  })

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
