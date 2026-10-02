/**
 * #3265: a loop inside `<svg>` whose row is a COMPONENT with an SVG root
 * (`<g>`) created its rows in the HTML namespace when they were added
 * after mount — `G` / `PATH` elements in the XHTML namespace, which draw
 * nothing. Rows present at the first render were fine: the parent's
 * template bakes them into its own `<svg>`-wrapped markup. Rows created
 * later go through `createComponent`, which parsed the row component's
 * template with no namespace context. This is what left the registry
 * `<Flow>`'s `<SimpleEdge>` (`<g>` in `.bf-flow__edges`) invisible under
 * CSR: edges usually arrive after mount.
 *
 * Mounts the real compiled output (same harness as
 * `inner-loop-svg-namespace-e2e.test.ts`, the #2219 sibling for a plain
 * element row) and checks `namespaceURI` on rows added after mount, for a
 * signal-driven loop and for one nested component level below the row.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '../../../jsx/src/compiler'
import { TestAdapter } from '../../../jsx/src/adapters/test-adapter'
import { writeFileSync, mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

async function load(source: string, filename: string): Promise<void> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter((e) => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map((e) => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find((f) => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')
  const dir = mkdtempSync(join(tmpdir(), 'bf-3265-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewritten)
  await import(file)
}

async function mount(name: string): Promise<HTMLElement> {
  const { createComponent } = await import(runtimePath)
  const el = createComponent(name, {}) as HTMLElement
  document.body.appendChild(el)
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function namespaces(el: Element, selector: string): string[] {
  return Array.from(el.querySelectorAll(selector)).map((e) => `${e.localName}:${e.namespaceURI}`)
}

describe('#3265 — SVG-rooted component rows added to an <svg> loop after mount', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('rows added after mount are created in the SVG namespace', async () => {
    await load(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Edge3265(props: { id: string }) {
        return (
          <g data-id={props.id}>
            <path d="M0,0 L1,1" />
          </g>
        )
      }
      export function Edges3265() {
        const [items, setItems] = createSignal<string[]>([])
        return (
          <div onClick={() => setItems(['a', 'b'])}>
            <svg className="edges">
              {items().map((i) => <Edge3265 key={i} id={i} />)}
            </svg>
          </div>
        )
      }
    `,
      'Edges3265.tsx',
    )
    const el = await mount('Edges3265')
    expect(el.querySelectorAll('g')).toHaveLength(0)

    el.dispatchEvent(new window.Event('click', { bubbles: true }))

    expect(namespaces(el, 'g, path')).toEqual([
      `g:${SVG_NS}`,
      `path:${SVG_NS}`,
      `g:${SVG_NS}`,
      `path:${SVG_NS}`,
    ])
  })

  test('a row appended next to an existing one matches it', async () => {
    await load(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Dot3265(props: { x: number }) {
        return <circle cx={props.x} cy="0" r="1" />
      }
      export function Dots3265() {
        const [xs, setXs] = createSignal<number[]>([1])
        return (
          <svg onClick={() => setXs((prev) => [...prev, 2, 3])}>
            {xs().map((x) => <Dot3265 key={x} x={x} />)}
          </svg>
        )
      }
    `,
      'Dots3265.tsx',
    )
    const el = await mount('Dots3265')
    expect(namespaces(el, 'circle')).toEqual([`circle:${SVG_NS}`])

    el.dispatchEvent(new window.Event('click', { bubbles: true }))

    expect(namespaces(el, 'circle')).toEqual([`circle:${SVG_NS}`, `circle:${SVG_NS}`, `circle:${SVG_NS}`])
  })

  test('a component nested inside an SVG row is created in the SVG namespace too', async () => {
    await load(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Label3265(props: { text: string }) {
        return <text x="0" y="0">{props.text}</text>
      }
      export function Node3265(props: { id: string }) {
        return (
          <g data-id={props.id}>
            <Label3265 text={props.id} />
          </g>
        )
      }
      export function Nodes3265() {
        const [ids, setIds] = createSignal<string[]>([])
        return (
          <svg onClick={() => setIds(['n1'])}>
            {ids().map((id) => <Node3265 key={id} id={id} />)}
          </svg>
        )
      }
    `,
      'Nodes3265.tsx',
    )
    const el = await mount('Nodes3265')

    el.dispatchEvent(new window.Event('click', { bubbles: true }))

    expect(namespaces(el, 'g, text')).toEqual([`g:${SVG_NS}`, `text:${SVG_NS}`])
  })
})

describe('#3265 — rows inside <foreignObject> stay HTML', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  // `<foreignObject>` is an SVG element whose children are HTML, so its
  // rows must NOT be parsed as SVG just because their container is in the
  // SVG namespace.
  test('a component row added to a <foreignObject> loop after mount is an HTML element', async () => {
    await load(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Card3265(props: { id: string }) {
        return <div className="card" data-id={props.id}><span>{props.id}</span></div>
      }
      export function Cards3265() {
        const [ids, setIds] = createSignal<string[]>([])
        return (
          <svg onClick={() => setIds(['c1', 'c2'])}>
            <foreignObject width="100" height="100">
              {ids().map((id) => <Card3265 key={id} id={id} />)}
            </foreignObject>
          </svg>
        )
      }
    `,
      'Cards3265.tsx',
    )
    const el = await mount('Cards3265')

    el.dispatchEvent(new window.Event('click', { bubbles: true }))

    const HTML_NS = 'http://www.w3.org/1999/xhtml'
    expect(namespaces(el, 'div, span')).toEqual([
      `div:${HTML_NS}`,
      `span:${HTML_NS}`,
      `div:${HTML_NS}`,
      `span:${HTML_NS}`,
    ])
    expect(Array.from(el.querySelectorAll('foreignObject > div')).map((d) => d.getAttribute('data-id'))).toEqual([
      'c1',
      'c2',
    ])
  })
})
