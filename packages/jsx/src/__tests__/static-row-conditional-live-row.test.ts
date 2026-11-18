/**
 * #3911 / #3912 — when a static (non-signal) array's `.map()` row with a
 * conditional may keep the compile-time static path.
 *
 * #2897 moved a static row off that path when its conditional's CONDITION
 * reads a signal. Two holes were left:
 *
 * - #3911: the condition reads only the row (`r.on`) but a BRANCH reads a
 *   signal, or carries an event handler. The static path binds nothing inside
 *   a row conditional, so the branch froze at its SSR value and the handler
 *   was never attached.
 * - #3912: the condition reaches a signal only through a component-local
 *   helper (`isSel(r.id)`). A `function` declaration is not a constant and a
 *   function-valued constant was skipped, so the call read as row-only.
 *
 * Only ROUTING is pinned here: which family the loop is emitted through.
 * Whether the branch really updates after a click is the
 * `static-loop-row-conditional-branch-signal` and
 * `static-loop-conditional-function-helper` fixtures, in a real browser.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compile(source: string): string {
  const result = compileJSX(source.trimStart(), 'C.tsx', { adapter })
  expect(result.errors).toHaveLength(0)
  return result.files.find((f) => f.type === 'clientJs')!.content
}

/** The loop is reconciled (a `mapArray` family call), so its row conditional is wired. */
const isLive = (js: string) =>
  js.includes('mapArray(') || js.includes('mapArrayLazy(') || js.includes('mapArrayAnchored(')

/** A component whose static rows hold `row`, with `body` declared ahead of the return. */
function component(row: string, body = '', moduleScope = ''): string {
  return `
    'use client'
    import { createMemo, createSignal } from '@barefootjs/client'
    ${moduleScope}
    const ROWS = [{ id: 'a', on: true }, { id: 'b', on: false }]
    export function C(props: { label?: string }) {
      const [n, setN] = createSignal(0)
      const doubled = createMemo(() => n() * 2)
      ${body}
      return (
        <div>
          <ul>{ROWS.map(r => <li key={r.id}>${row}</li>)}</ul>
          <button onClick={() => setN(n() + 1)}>inc</button>
        </div>
      )
    }
  `
}

describe('#3911 — a row-only condition whose branch needs wiring', () => {
  const live: Array<[string, string]> = [
    ['a signal read in a text', `{r.on ? <b>{'n=' + n()}</b> : <i>off</i>}`],
    ['a signal read in the false branch', `{r.on ? <b>on</b> : <i>{'off ' + n()}</i>}`],
    ['a signal read in an attribute', `{r.on ? <b title={'n=' + n()}>x</b> : <i>off</i>}`],
    ['a memo read', `{r.on ? <b>{doubled()}</b> : <i>off</i>}`],
    ['a prop read', `{r.on ? <b>{props.label}</b> : <i>off</i>}`],
    ['a nested conditional on a signal', `{r.on ? (n() > 0 ? <b>some</b> : <em>zero</em>) : <i>off</i>}`],
    ['a signal read under `&&`', `{r.on && <b>{n()}</b>}`],
    ['an event handler', `{r.on ? <button onClick={() => setN(n() + 10)}>add</button> : <i>off</i>}`],
    [
      'a nested static loop whose row reads a signal',
      `{r.on ? <span>{ROWS.map(q => <u key={q.id}>{q.id + n()}</u>)}</span> : <i>off</i>}`,
    ],
  ]
  for (const [name, row] of live) {
    test(`${name} takes the row off the static path`, () => {
      expect(isLive(compile(component(row)))).toBe(true)
    })
  }

  test('the read is wired, not only routed: the branch text has its own effect', () => {
    const js = compile(component(`{r.on ? <b>{'n=' + n()}</b> : <i>off</i>}`))
    const init = js.slice(0, js.indexOf("hydrate('C'"))
    expect(init).toContain("'n=' + n()")
  })

  const fixed: Array<[string, string]> = [
    ['static branches', `{r.on ? <b>on</b> : <i>off</i>}`],
    ['a branch reading only the row', `{r.on ? <b>{r.id}</b> : <i>off</i>}`],
    ['a branch attribute reading only the row', `{r.on ? <b title={r.id}>x</b> : <i>off</i>}`],
    ['a method call on the row', `{r.id.startsWith('a') ? <b>{r.id.toUpperCase()}</b> : <i>off</i>}`],
    [
      'a nested static loop reading only its rows',
      `{r.on ? <span>{ROWS.map(q => <u key={q.id}>{q.id + r.id}</u>)}</span> : <i>off</i>}`,
    ],
  ]
  for (const [name, row] of fixed) {
    test(`${name} keeps the static path`, () => {
      expect(isLive(compile(component(row)))).toBe(false)
    })
  }

  test('a row param named like a signal is the row, not the signal', () => {
    const source = component('').replace(
      `{ROWS.map(r => <li key={r.id}></li>)}`,
      `{ROWS.map(n => <li key={n.id}>{n.on ? <b>{n.id}</b> : <i>off</i>}</li>)}`,
    )
    expect(source).toContain('ROWS.map(n =>')
    expect(isLive(compile(source))).toBe(false)
  })
})

describe('#3912 — a condition that reaches a signal through a local helper', () => {
  const helpers: Array<[string, string]> = [
    ['an expression arrow', `const isSel = (id: string) => String(n()) === id`],
    ['a block-bodied arrow', `const isSel = (id: string) => { const s = String(n()); return s === id }`],
    ['a function declaration', `function isSel(id: string) { const s = String(n()); return s === id }`],
    ['a function expression', `const isSel = function (id: string) { return String(n()) === id }`],
    [
      'a function declaration calling another helper',
      `const current = () => String(n())
       function isSel(id: string) { return current() === id }`,
    ],
    ['a helper reading a memo', `function isSel(id: string) { return String(doubled()) === id }`],
    ['a helper reading a prop', `function isSel(id: string) { return props.label === id }`],
  ]
  for (const [name, helper] of helpers) {
    test(`${name} takes the row off the static path`, () => {
      const js = compile(component(`{isSel(r.id) ? <b>on</b> : <i>off</i>}`, helper))
      expect(isLive(js)).toBe(true)
    })
  }

  test('a helper in a branch text takes the row off the static path', () => {
    const helper = `function label(id: string) { return id + ':' + n() }`
    expect(isLive(compile(component(`{r.on ? <b>{label(r.id)}</b> : <i>off</i>}`, helper)))).toBe(true)
  })

  test('a helper in a branch attribute takes the row off the static path', () => {
    const helper = `function cls(id: string) { return id + '-' + n() }`
    expect(isLive(compile(component(`{r.on ? <b title={cls(r.id)}>x</b> : <i>off</i>}`, helper)))).toBe(true)
  })

  test('mutually recursive helpers terminate, and reach the signal one of them reads', () => {
    const helper = `
      function even(k: number): boolean { return k === 0 ? n() > 0 : odd(k - 1) }
      function odd(k: number): boolean { return k === 0 ? false : even(k - 1) }
    `
    expect(isLive(compile(component(`{odd(r.id.length) ? <b>on</b> : <i>off</i>}`, helper)))).toBe(true)
  })

  test('mutually recursive helpers that read no state keep the static path', () => {
    const helper = `
      function even(k: number): boolean { return k === 0 ? true : odd(k - 1) }
      function odd(k: number): boolean { return k === 0 ? false : even(k - 1) }
    `
    expect(isLive(compile(component(`{odd(r.id.length) ? <b>on</b> : <i>off</i>}`, helper)))).toBe(false)
  })

  const pure: Array<[string, string, string]> = [
    ['a local function that reads no state', `function isA(id: string) { return id === 'a' }`, ''],
    ['a local arrow that reads no state', `const isA = (id: string) => id === 'a'`, ''],
    ['a module-scope function that reads no state', '', `function isA(id: string) { return id === 'a' }`],
  ]
  for (const [name, body, moduleScope] of pure) {
    test(`${name} keeps the static path`, () => {
      const js = compile(component(`{isA(r.id) ? <b>on</b> : <i>off</i>}`, body, moduleScope))
      expect(isLive(js)).toBe(false)
    })
  }

  // Kept as it was: the compiler cannot see into another module, and a call
  // to an imported predicate (`isNavGroup(entry)`) is the common row-only
  // condition. An imported helper that reads a module-scope signal of its
  // own file is not followed.
  test('an imported helper is not followed and keeps the static path', () => {
    const source = component(`{isA(r.id) ? <b>on</b> : <i>off</i>}`, '', `import { isA } from './helpers'`)
    expect(isLive(compile(source))).toBe(false)
  })
})

describe('a depth-1 inner static loop row gets the same answer', () => {
  function nested(row: string, body = ''): string {
    return `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const ROWS = [{ id: 'a', on: true }, { id: 'b', on: false }]
      export function C() {
        const [n, setN] = createSignal(0)
        ${body}
        return (
          <div>
            <ul>{ROWS.map(r => <li key={r.id}><span>{ROWS.map(q => <u key={q.id}>${row}</u>)}</span></li>)}</ul>
            <button onClick={() => setN(n() + 1)}>inc</button>
          </div>
        )
      }
    `
  }

  test('#3911: a signal read in a branch of the inner row conditional', () => {
    expect(isLive(compile(nested(`{q.on ? <b>{'n=' + n()}</b> : <i>off</i>}`)))).toBe(true)
  })

  test('#3912: a function-declaration helper in the inner row condition', () => {
    const helper = `function isSel(id: string) { return String(n()) === id }`
    expect(isLive(compile(nested(`{isSel(q.id) ? <b>on</b> : <i>off</i>}`, helper)))).toBe(true)
  })

  test('a branch reading the OUTER row keeps the static path', () => {
    expect(isLive(compile(nested(`{q.on ? <b>{r.id}</b> : <i>off</i>}`)))).toBe(false)
  })
})
