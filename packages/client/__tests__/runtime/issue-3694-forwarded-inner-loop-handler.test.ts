/**
 * #3694: an event handler inside an inner `.map()` of a loop-row child
 * component's forwarded children
 * (`rows.map(o => <Chip key={o.id}><ul>{o.tags.map(tag => <li><button
 * onClick={…}/></li>)}</ul></Chip>)`) was never attached: the component-root
 * row wired only the handlers outside an inner loop (#3607), and the static
 * twin did the same. Each row now runs the composite row's inner-loop
 * emission over its own element.
 *
 * Runs the real compiled client JS against a real DOM: the hydrated rows of
 * the Hono SSR markup, and (for a signal array) a row built on the client by
 * a prepend that shifts every outer index. Shared fixture:
 * `loop-row-child-children-inner-loop-handler`.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { renderHonoComponent } from '../../../adapter-hono/src/test-render'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

const CHIP = `
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}
`

async function hydrateSsr(source: string, name: string, props: Record<string, unknown> = {}): Promise<void> {
  const result = compileJSX(source, `${name}.tsx`, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => `${e.code}: ${e.message}`).join('\n'))
  const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
  const file = join(mkdtempSync(join(tmpdir(), 'bf-3694-')), `${name}.mjs`)
  writeFileSync(file, clientJs)
  await import(file)
  document.body.innerHTML = await renderHonoComponent({
    adapter: new HonoAdapter(),
    source,
    componentName: name,
    props: { __instanceId: `${name}_test`, ...props },
  })
  const { rehydrateAll, flushHydration } = await import(runtimePath)
  rehydrateAll()
  flushHydration()
}

function click(selector: string): void {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`no element for ${selector}`)
  el.dispatchEvent(new window.Event('click', { bubbles: true }))
}

function picked(): string {
  return document.querySelector('.picked')!.textContent!
}

describe('#3694 — handler in an inner loop of a loop-row child component\'s forwarded children', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('module-const rows: each hydrated inner button picks its own inner and outer item', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHIP}
      const ROWS = [{ id: 'a', tags: ['x', 'y'] }, { id: 'b', tags: ['z'] }]
      export function StaticRows() {
        const [picked, setPicked] = createSignal('none')
        return (
          <div>
            <p className="picked">{picked()}</p>
            <div className="rows">
              {ROWS.map((o, i) => (
                <Chip key={o.id}>
                  <ul>
                    {o.tags.map((tag, j) => (
                      <li key={tag}>
                        <button className="pick" onClick={() => setPicked(\`\${o.id}-\${tag}-\${i}-\${j}\`)}>{tag}</button>
                      </li>
                    ))}
                  </ul>
                </Chip>
              ))}
            </div>
          </div>
        )
      }
    `
    await hydrateSsr(source, 'StaticRows')
    expect(picked()).toBe('none')
    click('.rows > .chip:nth-child(1) li:nth-child(2) .pick')
    expect(picked()).toBe('a-y-0-1')
    click('.rows > .chip:nth-child(2) li:nth-child(1) .pick')
    expect(picked()).toBe('b-z-1-0')
  })

  test('signal rows: hydrated rows and a client-built row read their current outer index', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHIP}
      export function SignalRows() {
        const [rows, setRows] = createSignal([{ id: 'a', tags: ['x', 'y'] }, { id: 'b', tags: ['z'] }])
        const [picked, setPicked] = createSignal('none')
        return (
          <div>
            <p className="picked">{picked()}</p>
            <button className="add" onClick={() => setRows([{ id: 'c', tags: ['p', 'q'] }, ...rows()])}>add</button>
            <div className="rows">
              {rows().map((o, i) => (
                <Chip key={o.id}>
                  <ul>
                    {o.tags.map((tag, j) => (
                      <li key={tag}>
                        <button className="pick" onClick={() => setPicked(\`\${o.id}-\${tag}-\${i}-\${j}\`)}>{tag}</button>
                      </li>
                    ))}
                  </ul>
                </Chip>
              ))}
            </div>
          </div>
        )
      }
    `
    await hydrateSsr(source, 'SignalRows')
    click('.rows > .chip:nth-child(1) li:nth-child(2) .pick')
    expect(picked()).toBe('a-y-0-1')
    click('.add')
    click('.rows > .chip:nth-child(1) li:nth-child(2) .pick')
    expect(picked()).toBe('c-q-0-1')
    click('.rows > .chip:nth-child(2) li:nth-child(1) .pick')
    expect(picked()).toBe('a-x-1-0')
    click('.rows > .chip:nth-child(3) li:nth-child(1) .pick')
    expect(picked()).toBe('b-z-2-0')
  })

  test('destructured outer and inner params, an inner param shadowing the outer one, and a callback param', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHIP}
      export function ShapeRows(props: { prefix: string }) {
        const [rows, setRows] = createSignal([{ id: 'a', tags: [{ t: 'x' }, { t: 'y' }] }, { id: 'b', tags: [{ t: 'z' }] }])
        const [picked, setPicked] = createSignal('none')
        return (
          <div>
            <p className="picked">{picked()}</p>
            <button className="add" onClick={() => setRows([{ id: 'c', tags: [{ t: 'p' }] }, ...rows()])}>add</button>
            <div className="destructured">
              {rows().map(({ id, tags }, i) => (
                <Chip key={id}>
                  <ul>
                    {tags.map(({ t }) => (
                      <li key={t}>
                        <button className="pick" onClick={() => setPicked(props.prefix + id + t + i)}>{t}</button>
                      </li>
                    ))}
                  </ul>
                </Chip>
              ))}
            </div>
            <div className="shadow">
              {rows().map((o) => (
                <Chip key={o.id}>
                  <ul>
                    {o.tags.map((o) => (
                      <li key={o.t}>
                        <button className="pick" onClick={() => setPicked([o.t].map((o) => o + '!').join(''))}>{o.t}</button>
                      </li>
                    ))}
                  </ul>
                </Chip>
              ))}
            </div>
          </div>
        )
      }
    `
    await hydrateSsr(source, 'ShapeRows', { prefix: '>' })
    click('.destructured > .chip:nth-child(2) li:nth-child(1) .pick')
    expect(picked()).toBe('>bz1')
    click('.shadow > .chip:nth-child(1) li:nth-child(2) .pick')
    expect(picked()).toBe('y!')
    click('.add')
    click('.destructured > .chip:nth-child(1) li:nth-child(1) .pick')
    expect(picked()).toBe('>cp0')
    click('.destructured > .chip:nth-child(3) li:nth-child(1) .pick')
    expect(picked()).toBe('>bz2')
    click('.shadow > .chip:nth-child(1) li:nth-child(1) .pick')
    expect(picked()).toBe('p!')
  })

  test('a handler on the inner row root, a two-deep inner loop, and a handler outside the inner loop', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHIP}
      export function DeepRows() {
        const [rows, setRows] = createSignal([
          { id: 'a', groups: [{ g: 'g1', tags: ['x', 'y'] }] },
          { id: 'b', groups: [{ g: 'g2', tags: ['z'] }, { g: 'g3', tags: ['w'] }] },
        ])
        const [picked, setPicked] = createSignal('none')
        return (
          <div>
            <p className="picked">{picked()}</p>
            <button className="add" onClick={() => setRows([{ id: 'c', groups: [{ g: 'g0', tags: ['p'] }] }, ...rows()])}>add</button>
            <div className="rows">
              {rows().map((o) => (
                <Chip key={o.id}>
                  <button className="own" onClick={() => setPicked('own-' + o.id)}>{o.id}</button>
                  <ul>
                    {o.groups.map((grp) => (
                      <li key={grp.g} className="grp" onClick={() => setPicked('grp-' + o.id + grp.g)}>
                        {grp.tags.map((tag) => (
                          <b key={tag} className="tag" onClick={(e) => { e.stopPropagation(); setPicked(o.id + grp.g + tag) }}>{tag}</b>
                        ))}
                      </li>
                    ))}
                  </ul>
                </Chip>
              ))}
            </div>
          </div>
        )
      }
    `
    await hydrateSsr(source, 'DeepRows')
    click('.rows > .chip:nth-child(2) li:nth-child(2) .tag')
    expect(picked()).toBe('bg3w')
    click('.rows > .chip:nth-child(2) li:nth-child(1)')
    expect(picked()).toBe('grp-bg2')
    click('.rows > .chip:nth-child(1) .own')
    expect(picked()).toBe('own-a')
    click('.add')
    click('.rows > .chip:nth-child(1) li:nth-child(1) .tag')
    expect(picked()).toBe('cg0p')
    click('.rows > .chip:nth-child(1) li:nth-child(1)')
    expect(picked()).toBe('grp-cg0')
    click('.rows > .chip:nth-child(2) li:nth-child(1) .tag:nth-child(2)')
    expect(picked()).toBe('ag1y')
  })

  test('a handler inside a conditional of the inner row, and a filtered inner loop', async () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHIP}
      export function BranchRows() {
        const [rows, setRows] = createSignal([{ id: 'a', tags: ['x', 'y'] }, { id: 'b', tags: ['z'] }])
        const [picked, setPicked] = createSignal('none')
        return (
          <div>
            <p className="picked">{picked()}</p>
            <button className="add" onClick={() => setRows([{ id: 'c', tags: ['p', 'x'] }, ...rows()])}>add</button>
            <div className="cond">
              {rows().map((o) => (
                <Chip key={o.id}>
                  <ul>
                    {o.tags.map((tag) => (
                      <li key={tag}>
                        {tag === 'x'
                          ? <button className="pick" onClick={() => setPicked('X' + o.id + tag)}>{tag}</button>
                          : <button className="pick" onClick={() => setPicked('O' + o.id + tag)}>{tag}</button>}
                      </li>
                    ))}
                  </ul>
                </Chip>
              ))}
            </div>
            <div className="filtered">
              {rows().map((o) => (
                <Chip key={o.id}>
                  <ul>
                    {o.tags.filter((t) => t !== 'x').map((tag) => (
                      <li key={tag}>
                        <button className="pick" onClick={() => setPicked(o.id + tag)}>{tag}</button>
                      </li>
                    ))}
                  </ul>
                </Chip>
              ))}
            </div>
          </div>
        )
      }
    `
    await hydrateSsr(source, 'BranchRows')
    click('.cond > .chip:nth-child(1) li:nth-child(1) .pick')
    expect(picked()).toBe('Xax')
    click('.cond > .chip:nth-child(1) li:nth-child(2) .pick')
    expect(picked()).toBe('Oay')
    // The filtered inner rows stay the rendered ones after hydration.
    expect(document.querySelector('.filtered > .chip:nth-child(1)')!.textContent).toBe('y')
    click('.filtered > .chip:nth-child(1) li:nth-child(1) .pick')
    expect(picked()).toBe('ay')
    click('.add')
    click('.cond > .chip:nth-child(1) li:nth-child(2) .pick')
    expect(picked()).toBe('Xcx')
    expect(document.querySelector('.filtered > .chip:nth-child(1)')!.textContent).toBe('p')
    click('.filtered > .chip:nth-child(1) li:nth-child(1) .pick')
    expect(picked()).toBe('cp')
  })

  test('element rows (control): a two-deep inner handler reads the outermost item, and a filtered inner loop keeps its rows', async () => {
    // The inner-loop emission the component-root row now shares: before
    // #3694 it left the outermost row's item unwrapped two loops down, and
    // reconciled a filtered inner loop over its unfiltered base array.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function ElementRows() {
        const [rows, setRows] = createSignal([{ id: 'a', groups: [{ g: 'g1', tags: ['x', 'y'] }] }])
        const [picked, setPicked] = createSignal('none')
        return (
          <div>
            <p className="picked">{picked()}</p>
            <div className="rows">
              {rows().map((o) => (
                <section key={o.id}>
                  <ul>
                    {o.groups.map((grp) => (
                      <li key={grp.g}>
                        {grp.tags.filter((t) => t !== 'x').map((tag) => (
                          <b key={tag} className="tag" onClick={() => setPicked(o.id + grp.g + tag)}>{tag}</b>
                        ))}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )
      }
    `
    await hydrateSsr(source, 'ElementRows')
    expect(document.querySelector('.rows li')!.textContent).toBe('y')
    click('.rows .tag')
    expect(picked()).toBe('ag1y')
  })
})
