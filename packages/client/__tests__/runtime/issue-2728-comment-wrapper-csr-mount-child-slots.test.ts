/**
 * Regression test for #2728: a "root is a child call" comment-wrapper
 * component (`comment: true`, no `fragmentRoot` — the shape `Tabs`'
 * generated `TabsBasicDemo`-style entry point compiles to) mounted bare at
 * the top level via `createComponent` (the CSR-mount path, no SSR markup
 * to hydrate) never registered a `<!--bf-scope:-->` boundary-comment pair
 * for itself, unlike hydration's `hydrateCommentScope`, which DOES
 * register one from the SSR-rendered comments. `$c()`'s dual-scope lookup
 * (`getDualScopeIds`) then found nothing for any of the wrapper's own
 * sibling child slots — they were never `initChild`'d at all, so their
 * props/effects never ran even though their markup was present (dead
 * click handlers, un-applied template-only attributes).
 *
 * `materializeComponent` now emits the same boundary-comment pair for this
 * wrapper shape that a genuine fragment root already gets (#2722),
 * derived from the SAME `wrapperScopeId` #2757 already computes for
 * thread-only purposes — verified here by mounting bare (no SSR, no
 * `mountAt`), appending the returned `DocumentFragment`, and confirming
 * every sibling slot actually got initialized and stays reactive.
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

async function compileAndEvalClientJs(source: string, filename: string): Promise<void> {
  const result = compileJSX(source, filename, { adapter })
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors in ${filename}:\n${errors.map(e => e.message).join('\n')}`)
  }
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content
  if (!clientJs) throw new Error('No client JS emitted')

  const runtimePath = join(__dirname, '../../src/runtime/index.ts')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')

  const dir = mkdtempSync(join(tmpdir(), 'bf-2728-'))
  const file = join(dir, `${filename.replace(/\W/g, '_')}_${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(file, rewritten)
  try {
    await import(file)
  } finally {
    try { unlinkSync(file) } catch {}
  }
}

const BOX_SRC = `
  'use client'
  export function Box2728({ children }: { children?: unknown }) {
    return <div data-box="true">{children}</div>
  }
`

const LEAF_SRC = `
  'use client'
  export function Leaf2728(props: { a: number; onBump: () => void }) {
    return <button data-leaf="true" onClick={props.onBump}>{props.a}</button>
  }
`

const boxSrc = (suffix: string) => `
  'use client'
  export function Box2728${suffix}({ children }: { children?: unknown }) {
    return <div data-box="true">{children}</div>
  }
`

const leafSrc = (suffix: string) => `
  'use client'
  export function Leaf2728${suffix}(props: { a: number; onBump: () => void }) {
    return <button data-leaf="true" onClick={props.onBump}>{props.a}</button>
  }
`

describe('#2728 — comment-wrapper CSR-mount registers a comment scope for its own sibling slots', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a bare top-level mount is a DocumentFragment carrying boundary comments', async () => {
    await compileAndEvalClientJs(BOX_SRC, 'Box2728.tsx')
    await compileAndEvalClientJs(LEAF_SRC, 'Leaf2728.tsx')
    await compileAndEvalClientJs(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Box2728 } from './Box2728'
      import { Leaf2728 } from './Leaf2728'
      export function Outer2728() {
        const [x, setX] = createSignal(1)
        return (
          <Box2728>
            <Leaf2728 a={x()} onBump={() => setX(v => v + 1)} />
          </Box2728>
        )
      }
    `,
      'Outer2728.tsx',
    )

    const { createComponent } = await import('../../src/runtime')
    const { commentScopeRegistry } = await import('../../src/runtime/scope')
    const result = createComponent('Outer2728', {})
    expect(result.nodeType).toBe(11) // DocumentFragment

    const box = (result as DocumentFragment).querySelector('[data-box]')!
    expect(box).not.toBeNull()
    expect(commentScopeRegistry.has(box)).toBe(true)
  })

  test('every sibling child slot is initialized and stays reactive after a bare CSR mount', async () => {
    await compileAndEvalClientJs(boxSrc('b'), 'Box2728b.tsx')
    await compileAndEvalClientJs(leafSrc('b'), 'Leaf2728b.tsx')
    await compileAndEvalClientJs(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Box2728b } from './Box2728b'
      import { Leaf2728b } from './Leaf2728b'
      export function Outer2728b() {
        const [x, setX] = createSignal(1)
        return (
          <Box2728b>
            <Leaf2728b a={x()} onBump={() => setX(v => v + 1)} />
          </Box2728b>
        )
      }
    `,
      'Outer2728b.tsx',
    )

    const { createComponent } = await import('../../src/runtime')
    const result = createComponent('Outer2728b', {})
    document.body.appendChild(result)

    const leaf = document.body.querySelector('[data-leaf]') as HTMLButtonElement
    expect(leaf).not.toBeNull()
    // Pre-fix: the Leaf's own initChild never ran (no comment scope for
    // the wrapper meant `$c()` found nothing), so its onClick handler was
    // never wired and its text stayed whatever the raw template baked in.
    expect(leaf.textContent).toBe('1')
    leaf.click()
    expect(leaf.textContent).toBe('2')
  })
})
