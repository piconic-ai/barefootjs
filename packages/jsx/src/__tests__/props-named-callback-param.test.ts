/**
 * Callback parameters spelled like the props object in the CSR client JS.
 *
 * The init body reads the component's props through `_p`, and a
 * destructured prop read compiles to `_p.<prop>`. The props-object rename
 * (`rewritePropsObjectRef`) used to rename EVERY `props` identifier in the
 * init body, binders included, so a `.map((props) => …)` row, a handler
 * `(props) => …` arrow, a `.filter((props) => …)` callback or a nested
 * `function f(props)` became a `_p` binding that captured the outer
 * `_p.<prop>` reads inside it: a client-created row lost its `suffix`, a
 * forwarded child prop read the row accessor, and `props.by * step` became
 * `NaN`. Fixture: `loop-param-named-props`.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

/** An `init<Name>` function body (excludes the module-level template lambda). */
function initBody(content: string, name = ''): string {
  const start = content.indexOf(`export function init${name}`)
  const end = content.indexOf('\nhydrate(', start)
  return content.slice(start, end)
}

describe('a callback param named `props` keeps its binding in the client JS', () => {
  test('destructured props: a reactive loop row reads the outer prop through `_p`', () => {
    const body = initBody(clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Rows({ suffix }: { suffix: string }) {
        const [items, setItems] = createSignal([{ id: 1, label: 'a' }])
        return (
          <div>
            <ul>{items().map((props) => <li key={props.id}>{props.label}{suffix}</li>)}</ul>
            <button onClick={() => setItems([...items(), { id: 2, label: 'b' }])}>add</button>
          </div>
        )
      }
    `))
    expect(body).toContain('const props = () => __e.item')
    expect(body).toContain('props().label')
    expect(body).toContain('_p.suffix')
    expect(body).not.toMatch(/const _p = /)
    expect(body).not.toContain('_p().')
  })

  test('a child component forwarded inside the row reads the outer prop, not the row', () => {
    const body = initBody(clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      function Item(props: { label: string; mark: string }) { return <li>{props.label}{props.mark}</li> }
      export function List({ mark }: { mark: string }) {
        const [items, setItems] = createSignal([{ label: 'a' }])
        return (
          <div>
            <ul>{items().map((props) => <Item key={props.label} label={props.label} mark={mark} />)}</ul>
            <button onClick={() => setItems([...items(), { label: 'b' }])}>add</button>
          </div>
        )
      }
    `), 'List')
    expect(body).toContain('get mark() { return _p.mark }')
    expect(body).toContain('get label() { return props().label }')
  })

  test('props object: an inlined outer read inside a `props` row stays on `_p`', () => {
    const body = initBody(clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Rows(props: { title: string }) {
        const t = props.title
        const [items, setItems] = createSignal([{ id: 1 }])
        return (
          <div>
            <ul>{items().map((props) => <li key={props.id}>{props.id}{t}</li>)}</ul>
            <button onClick={() => setItems([...items(), { id: 2 }])}>add</button>
          </div>
        )
      }
    `))
    expect(body).toContain('const props = () => __e.item')
    expect(body).toContain('_p.title')
    expect(body).not.toMatch(/const _p = /)
  })

  test('a handler arrow param and a filter callback param keep their names', () => {
    const body = initBody(clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Counter({ step }: { step: number }) {
        const [n, setN] = createSignal(0)
        const [items, setItems] = createSignal([{ id: 1 }, { id: 2 }])
        const bump = (props: { by: number }) => setN(n() + props.by * step)
        return (
          <div>
            <button onClick={() => bump({ by: 2 })}>{n()}</button>
            <button onClick={() => setItems(items().filter((props) => props.id !== step))}>{items().length}</button>
          </div>
        )
      }
    `))
    expect(body).toContain('const bump = (props) => setN(n() + props.by * _p.step)')
    expect(body).toContain('.filter((props) => props.id !== _p.step)')
  })

  test('a nested function param keeps its name', () => {
    const body = initBody(clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Say({ suffix }: { suffix: string }) {
        const [last, setLast] = createSignal('')
        function describe(props: { label: string }) { return props.label + suffix }
        return <button onClick={() => setLast(describe({ label: 'x' }))}>{last()}</button>
      }
    `))
    expect(body).toContain('props.label + _p.suffix')
  })

  test('a free `props` read in a destructured component is still renamed', () => {
    const body = initBody(clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function Free({ id }: { id: string }) {
        const [n, setN] = createSignal(0)
        return <button data-id={id} onClick={() => setN(n() + (props as any).delta)}>{n()}</button>
      }
    `))
    expect(body).toContain('(_p).delta')
  })
})
