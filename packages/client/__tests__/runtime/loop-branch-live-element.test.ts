/**
 * A keyed `.map()` row whose conditional branch holds a LIVE element the
 * caller's callback built must keep that element, and its state, when the
 * row is reused with a new item under the same key (#3894 follow-up).
 *
 * A bare-expression branch with a call gets a per-item text effect so that a
 * scalar (`cond ? fmt(row.label) : 'pending'`) follows the item. That effect
 * re-evaluates the branch, and the arm's markup writer replaces the claimed
 * range whenever the value is a fresh Node. For a callback prop that returns
 * an element this would throw the mounted element away on every item change,
 * with whatever the user typed into it. Phase 1 therefore marks a branch that
 * can reach a caller-supplied value (`IRExpression.readsCallerValue`,
 * `packages/jsx/src/caller-value-reach.ts`) and such a branch gets no effect,
 * however the callback is reached: called directly, through a bracket
 * access, a local wrapper, an argument or a deeper member.
 *
 * Each case supplies a callback that builds an `<input>`, edits the input,
 * replaces the row's item under the same key and expects the SAME node with
 * the edit intact. A scalar branch in the same row is the control: it must
 * still follow the item.
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

const adapter = new TestAdapter()

async function compileAndRegister(source: string, filename: string): Promise<string> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')

  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')

  const dir = mkdtempSync(join(tmpdir(), 'bf-loop-branch-live-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
  return clientJs
}

interface Row { id: number; label: string; done: boolean }

/**
 * A component whose row has two bare-expression branches: `branch`, which
 * reaches the caller's `render`, and a scalar one calling a module function.
 */
function source(name: string, branch: string, body = '', types = '', propsType = 'Props'): string {
  return `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: number; label: string; done: boolean }
type Props = { render: (row: Row) => unknown; slots: { cell: (row: Row) => unknown } }
${types}
const shout = (s: string) => s + '!'
const apply = (f: (row: Row) => unknown, row: Row) => f(row)
export function ${name}(props: ${propsType}) {
  const [rows, setRows] = createSignal<Row[]>([])
  const load = () => setRows([{ id: 1, label: 'AAA', done: true }])
  const bump = () => setRows([{ id: 1, label: 'BBB', done: true }])
  ${body}
  return (
    <div>
      <button id="load" onClick={load}>load</button>
      <button id="bump" onClick={bump}>bump</button>
      <ul id="list">{rows().map(row => (
        <li key={row.id}>
          <span className="live">{row.done ? ${branch} : 'pending'}</span>
          <span className="scalar">{row.done ? shout(row.label) : 'pending'}</span>
        </li>
      ))}</ul>
    </div>
  )
}
`
}

const CASES: Array<{ name: string; component: string; branch: string; body?: string; types?: string; propsType?: string }> = [
  { name: 'called directly', component: 'LiveDirect', branch: 'props.render(row)' },
  { name: 'called through a bracket access', component: 'LiveBracket', branch: "props['render'](row)" },
  {
    name: 'called through a local wrapper',
    component: 'LiveWrapper',
    branch: 'draw(row)',
    body: 'const draw = (row: Row) => props.render(row)',
  },
  { name: 'passed as an argument', component: 'LiveArgument', branch: 'apply(props.render, row)' },
  { name: 'reached through a deeper member', component: 'LiveMember', branch: 'props.slots.cell(row)' },
  // Prop types whose recorded property list is not the whole member list.
  {
    name: 'declared as a method signature',
    component: 'LiveMethodSig',
    branch: 'props.slots.render(row)',
    propsType: '{ render: (row: Row) => unknown; slots: { render(row: Row): unknown } }',
  },
  {
    name: 'declared under an index signature',
    component: 'LiveIndexSig',
    branch: "props.slots['render'](row)",
    propsType: '{ render: (row: Row) => unknown; slots: { [key: string]: (row: Row) => unknown } }',
  },
  {
    name: 'declared on an inherited interface member',
    component: 'LiveInherited',
    branch: 'props.slots.render(row)',
    types: 'interface Base { render: (row: Row) => unknown }\ninterface Slots extends Base { label: string }',
    propsType: '{ render: (row: Row) => unknown; slots: Slots }',
  },
]

describe('a loop-row branch holding a caller-built element keeps it across a same-key reuse', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  for (const c of CASES) {
    test(`callback prop ${c.name}`, async () => {
      await compileAndRegister(source(c.component, c.branch, c.body, c.types, c.propsType), `${c.component}.tsx`)
      const { createComponent } = await import('../../src/runtime')

      let built = 0
      const render = (row: Row): HTMLInputElement => {
        built++
        const input = document.createElement('input')
        input.value = row.label
        return input
      }
      const el = createComponent(c.component, { render, slots: { cell: render, render } }) as Element
      document.body.appendChild(el)

      ;(el.querySelector('#load') as HTMLElement).click()
      const input = el.querySelector('#list .live input') as HTMLInputElement
      expect(input).not.toBeNull()
      expect(input.value).toBe('AAA')
      expect(el.querySelector('#list .scalar')?.textContent).toBe('AAA!')

      // The user edits the element the callback built.
      input.value = 'user edit'
      const builtBeforeBump = built

      // Same key (id: 1), condition unchanged, only `label` differs.
      ;(el.querySelector('#bump') as HTMLElement).click()

      const after = el.querySelector('#list .live input') as HTMLInputElement
      expect(after).toBe(input)
      expect(after.value).toBe('user edit')
      expect(el.querySelectorAll('#list .live input')).toHaveLength(1)
      // The callback is not called again for the reused row.
      expect(built).toBe(builtBeforeBump)
      // The scalar branch of the same row follows the item.
      expect(el.querySelector('#list .scalar')?.textContent).toBe('BBB!')
    })
  }
})

describe('a loop-row branch reading a data-only prop object stays reactive', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('an object of primitives does not keep the branch', async () => {
    const component = 'DataObject'
    const src = source(
      component,
      'shout(props.cfg.prefix + row.label)',
      '',
      '',
      '{ render: (row: Row) => unknown; slots: { cell: (row: Row) => unknown }; cfg: { prefix: string; n: number } }',
    )
    await compileAndRegister(src, `${component}.tsx`)
    const { createComponent } = await import('../../src/runtime')
    const el = createComponent(component, { render: () => null, slots: { cell: () => null }, cfg: { prefix: '>', n: 1 } }) as Element
    document.body.appendChild(el)
    ;(el.querySelector('#load') as HTMLElement).click()
    expect(el.querySelector('#list .live')?.textContent).toBe('>AAA!')
    ;(el.querySelector('#bump') as HTMLElement).click()
    expect(el.querySelector('#list .live')?.textContent).toBe('>BBB!')
  })
})
