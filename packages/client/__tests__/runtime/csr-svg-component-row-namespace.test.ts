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
import ts from 'typescript'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const adapter = new TestAdapter()
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

/**
 * Point the compiled module's runtime import at the runtime source and drop
 * the `/* @bf-child:… *\/` marker imports, by walking the module's top-level
 * import declarations (the AGENTS.md rule: no regex over JS syntax).
 */
function rewriteImports(clientJs: string): string {
  const sf = ts.createSourceFile('client.mjs', clientJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const edits: { start: number; end: number; text: string }[] = []
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const spec = stmt.moduleSpecifier
    if (spec.text === '@barefootjs/client/runtime') {
      edits.push({ start: spec.getStart(sf), end: spec.getEnd(), text: JSON.stringify(runtimePath) })
    } else if (!stmt.importClause && spec.text.startsWith('/* @bf-child:')) {
      edits.push({ start: stmt.getStart(sf), end: stmt.getEnd(), text: '' })
    }
  }
  let out = clientJs
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end)
  return out
}

async function load(source: string, filename: string): Promise<void> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter((e) => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compile errors in ${filename}:\n${errors.map((e) => `${e.code}: ${e.message}`).join('\n')}`)
  }
  const clientJs = result.files.find((f) => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')
  const dir = mkdtempSync(join(tmpdir(), 'bf-3265-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}.mjs`)
  writeFileSync(file, rewriteImports(clientJs))
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

describe('#3265 — rows under an HTML integration point stay HTML', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  const HTML_NS = 'http://www.w3.org/1999/xhtml'

  // `<foreignObject>`, `<desc>` and `<title>` (SVG) and `<mtext>` (MathML)
  // are elements whose children the HTML parser reads as HTML, so their
  // rows must NOT be parsed as SVG / MathML just because their container
  // is in that namespace.
  for (const [parent, open, close] of [
    ['foreignObject', '<svg><foreignObject width="100" height="100">', '</foreignObject></svg>'],
    ['desc', '<svg><desc>', '</desc></svg>'],
    ['title', '<svg><title>', '</title></svg>'],
    ['mtext', '<math><mtext>', '</mtext></math>'],
  ] as const) {
    test(`a component row added to a <${parent}> loop after mount is an HTML element`, async () => {
      const tag = parent.charAt(0).toUpperCase() + parent.slice(1)
      await load(
        `
        'use client'
        import { createSignal } from '@barefootjs/client'
        export function Link${tag}3265(props: { id: string }) {
          return <a href={'#' + props.id} data-id={props.id}><span>{props.id}</span></a>
        }
        export function Host${tag}3265() {
          const [ids, setIds] = createSignal<string[]>([])
          return (
            <div onClick={() => setIds(['c1', 'c2'])}>
              ${open}
                {ids().map((id) => <Link${tag}3265 key={id} id={id} />)}
              ${close}
            </div>
          )
        }
      `,
        `Host${tag}3265.tsx`,
      )
      const el = await mount(`Host${tag}3265`)

      el.dispatchEvent(new window.Event('click', { bubbles: true }))

      expect(namespaces(el, 'a, span')).toEqual([
        `a:${HTML_NS}`,
        `span:${HTML_NS}`,
        `a:${HTML_NS}`,
        `span:${HTML_NS}`,
      ])
      const container = el.querySelector(parent === 'foreignObject' ? 'foreignObject' : parent)!
      expect(Array.from(container.children).map((c) => c.getAttribute('data-id'))).toEqual(['c1', 'c2'])
    })
  }
})
