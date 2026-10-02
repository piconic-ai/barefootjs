/**
 * Regression test for #3266: a component reading its state through a call
 * the compiler can't see into — here `v = () => s.get()` on a class-held
 * store from an untyped prop, the shape a `<Flow renderNode={Card}>` node
 * body takes — rendered via CSR, keeps BOTH of these bound:
 *
 *   - text inside a conditional branch (`{v().kind === 'a' ? <p>{v().text}</p> : …}`),
 *     which used to keep its mount-time value until the condition flipped,
 *     while the same text outside the conditional updated;
 *   - a `hidden={v().hide}` attribute on an element with no other dynamic
 *     content, which used to get no slot id and was never applied, not
 *     even initially.
 *
 * Exercises the real production path end to end: `compileJSX` +
 * `CSRAdapter` (what `@barefootjs/vite` uses for a CSR project) and
 * `render()` from `@barefootjs/client/runtime`, with the card mounted the
 * way `<Flow>` mounts a node body — a `renderNode` prop invoked inside a
 * conditional given as a keyed loop item's children, with the item added
 * after mount. The compiled module and the test share this package's own
 * `src/` runtime (see `issue-3235-template-initializer-leak.test.ts`).
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { compileJSX } from '../../../jsx/src/compiler'
import { CSRAdapter } from '../../src/csr-adapter'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const runtimePath = join(__dirname, '../../src/runtime/index.ts')
const clientIndexPath = join(__dirname, '../../src/index.ts')

const COMPONENT_SOURCE = `
'use client'

export function Card(props: any) {
  const s = props.data.s
  const v = () => s.get()
  return (
    <div className="card">
      {v().kind === 'a' ? <p className="a">{v().text}</p> : <p className="b">{v().text}</p>}
      <p className="plain">{v().text}</p>
      <p className="h" hidden={v().hide}>x</p>
    </div>
  )
}

function Wrapper(props: { children?: any }) {
  return <div className="wrap">{props.children}</div>
}

export function Host(props: { list: () => { id: string }[]; renderNode?: (n: any) => any }) {
  return (
    <div>
      {props.list().map((n) => (
        <Wrapper key={n.id}>{props.renderNode ? props.renderNode(n) : <span data-default></span>}</Wrapper>
      ))}
    </div>
  )
}
`

type CardState = { kind: string; text: string; hide: boolean }

describe('#3266 — branch text and hidden= stay bound for a store read through an opaque call', () => {
  let dir: string

  beforeEach(() => {
    document.body.innerHTML = ''
    dir = mkdtempSync(join(tmpdir(), 'bf-3266-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('a renderNode-mounted card follows every store update', async () => {
    const result = compileJSX(COMPONENT_SOURCE, join(dir, 'Host.tsx'), { adapter: new CSRAdapter() })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const clientJs = result.files.find(f => f.type === 'clientJs')?.content
    if (!clientJs) throw new Error('No client JS emitted for Host.tsx')

    writeFileSync(
      join(dir, 'Host.client.js'),
      clientJs.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`),
    )

    const { render } = await import(runtimePath)
    const { createSignal } = await import(clientIndexPath)
    const mod = await import(join(dir, 'Host.client.js'))

    // A class-held store, as in the issue: the compiler sees `s.get()` as
    // an opaque method call, not a signal read.
    class Store {
      private read: () => CardState
      private write: (v: CardState) => void
      constructor(v: CardState) {
        const [read, write] = createSignal(v)
        this.read = read
        this.write = write
      }
      get(): CardState { return this.read() }
      set(v: CardState): void { this.write(v) }
    }

    const s = new Store({ kind: 'a', text: 'one', hide: true })
    const [list, setList] = createSignal<{ id: string; data: { s: Store } }[]>([])
    const container = document.createElement('div')
    document.body.appendChild(container)
    render(container, 'Host', { list, renderNode: (n: unknown) => mod.Card(n) })
    setList([{ id: 'n', data: { s } }])

    const text = (sel: string) => container.querySelector(`.card ${sel}`)?.textContent
    const hidden = () => (container.querySelector('.card .h') as HTMLElement).hidden

    expect(text('.a')).toBe('one')
    expect(text('.plain')).toBe('one')
    expect(hidden()).toBe(true)

    s.set({ kind: 'a', text: 'two', hide: false })
    expect(text('.a')).toBe('two')
    expect(text('.plain')).toBe('two')
    expect(hidden()).toBe(false)

    s.set({ kind: 'b', text: 'three', hide: true })
    expect(container.querySelector('.card .a')).toBeNull()
    expect(text('.b')).toBe('three')
    expect(hidden()).toBe(true)

    s.set({ kind: 'b', text: 'four', hide: true })
    expect(text('.b')).toBe('four')
  })
})
