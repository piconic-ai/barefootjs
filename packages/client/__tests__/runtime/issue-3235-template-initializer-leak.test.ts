/**
 * Regression test for #3235: a CSR `template()` call re-runs a local's
 * initializer when that local is read in JSX (`const value = follow(props.source);
 * return <p>{value()}</p>` inlines to `(follow(_p.source))()` in the compiled
 * template — see `csr-substitute.ts` / `compute-inlinability.ts`). That
 * duplicate call is BY DESIGN for CSR (it mirrors Hono SSR's own contract —
 * `CSRAdapter.acceptsTemplateCall` deliberately accepts any call, see
 * `packages/adapter-tests/src/csr-skip-set.ts`'s `opaque-local-accessor-call`
 * note and `csr-adapter.test.ts`'s own pin on that predicate). The actual bug
 * is that `render()` calls `template(props)` BEFORE `init` and with no owner,
 * so a helper that creates a signal and registers `onMount`/`onCleanup`
 * during that throwaway call leaks: `onMount` runs synchronously and
 * `onCleanup` is a permanent no-op, since nothing ever disposes the node it
 * was registered on.
 *
 * This test exercises the REAL production entry points end to end:
 *   - `compileJSX` + `CSRAdapter` (`@barefootjs/client/csr-adapter`) — the
 *     exact adapter `@barefootjs/vite` uses for a CSR project, producing the
 *     same template-inlined shape the issue's compiled-JS excerpt shows.
 *   - `render()` from `@barefootjs/client/runtime` — the documented CSR
 *     mount entry point the issue's repro calls directly.
 *
 * The helper module (`follow`) and the compiled component both resolve
 * `@barefootjs/client(/runtime)` to this package's OWN `src/` tree (not the
 * published `dist/` build `package.json#exports` points at) so they share
 * ONE `reactive.ts` module instance — exactly what a real bundler (Vite)
 * does when it bundles an app from source. Two separate module instances
 * (src here, stale dist there) would each have their own `Owner`/`Listener`
 * globals and the test would not observe the fix either way.
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

const clientIndexPath = join(__dirname, '../../src/index.ts')
const runtimePath = join(__dirname, '../../src/runtime/index.ts')

const HELPER_SOURCE = `
import { createSignal, onCleanup, onMount } from '${clientIndexPath}'

export function follow(src) {
  const [v, setV] = createSignal(src.get())
  onMount(() => onCleanup(src.subscribe(setV)))
  return v
}
`

const COMPONENT_SOURCE = `
'use client'
import { follow } from './leak-helper.ts'

export function LeakProbe(props) {
  const value = follow(props.source)
  return <p>{value()}</p>
}
`

function createLeakSource(initial: string): { active: number; get: () => string; subscribe: (setV: (v: string) => void) => () => void } {
  let value = initial
  const src = {
    active: 0,
    get: () => value,
    subscribe(setV: (v: string) => void): () => void {
      src.active++
      setV(value)
      return () => { src.active-- }
    },
  }
  return src
}

describe('#3235 — CSR template does not leak a template-inlined initializer', () => {
  let dir: string

  beforeEach(() => {
    document.body.innerHTML = ''
    dir = mkdtempSync(join(tmpdir(), 'bf-3235-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('render() leaves exactly one live subscription, not two', async () => {
    const result = compileJSX(COMPONENT_SOURCE, join(dir, 'LeakProbe.tsx'), { adapter: new CSRAdapter() })
    const errors = result.errors.filter(e => e.severity === 'error')
    expect(errors).toEqual([])

    const clientJs = result.files.find(f => f.type === 'clientJs')?.content
    if (!clientJs) throw new Error('No client JS emitted for LeakProbe.tsx')

    // Sanity check on the premise this test protects: the template DOES
    // inline the initializer call (the duplicate-execution half of the bug,
    // which is by-design/unchanged — see file docstring). If this ever stops
    // being true the test below would pass for the wrong reason.
    expect(clientJs).toContain('(follow(_p.source))()')

    writeFileSync(join(dir, 'leak-helper.ts'), HELPER_SOURCE)
    writeFileSync(
      join(dir, 'LeakProbe.client.js'),
      clientJs.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`),
    )

    const { render } = await import(runtimePath)
    await import(join(dir, 'LeakProbe.client.js'))

    const container = document.createElement('div')
    document.body.appendChild(container)
    const source = createLeakSource('hello')

    render(container, 'LeakProbe', { source })

    // The throwaway template-time call to `follow` must have subscribed and
    // then immediately released — only the real, retained call made inside
    // `init` should still be active.
    expect(source.active).toBe(1)
    expect(container.querySelector('p')?.textContent).toBe('hello')
  })
})

/**
 * Review follow-up on #3254 (the fix for #3235 above): `evalTemplateFn`
 * originally gave EVERY `template()` call a throwaway root, unconditionally
 * — including calls that already run under a real, persistent owner. For a
 * `renderNode`-style prop (an inline JSX-returning arrow passed as a prop,
 * invoked inside a conditional expression given as another component's
 * CHILDREN — `<Wrapper>{props.renderNode ? props.renderNode(n) : <Fallback/>}</Wrapper>`,
 * the exact shape `<Flow renderNode={(n) => <Body id={n.id}/>}>`'s per-node
 * `<NodeWrapper>` uses), the compiler emits an `insert()` branch whose
 * `template()` calls the synthesized callback component directly
 * (`__bfSlot(_p.renderNode(n()), __slots)`), with an EMPTY `bindEvents()` —
 * unlike a ternary written directly in a component's OWN body, there is no
 * second, later invocation anywhere else to fall back on. That call chain
 * runs `materializeComponent` AND its `initFn` SYNCHRONOUSLY, inside
 * `insert.ts`'s `evalBranchTemplate` — there is no separate later "real
 * init" the way a plain nested `<Child/>` JSX element gets (that path defers
 * init to `bindEvents()`/`initChild()`, safely outside the template call).
 * Wrapping the whole call in a throwaway root disposed the instant it
 * returned tore down whatever reactive effects that child's `initFn`
 * registered before a single signal update could ever reach them — found by
 * running `site/ui`'s xyflow Highlight-Depth demo for real: the per-node
 * `--node-glow` style effect fired once for the initial value and then
 * never again.
 *
 * This test reproduces the same shape at a fraction of the size — a
 * `renderNode`-style prop, invoked inside a conditional given as another
 * component's children, whose child reads a Context-provided signal in a
 * style binding — through the same real production path (`compileJSX` +
 * `CSRAdapter` + `render()`), and drives an actual signal update via a real
 * click after mount. A ternary written directly in a component's own body
 * (rather than passed down as children) does NOT reproduce this: that shape
 * gets its own `bindEvents()`-driven re-invocation outside the throwaway
 * root, masking the bug — the children-prop path above has no such fallback.
 */
describe('#3254 review follow-up — a live child mounted during a branch template() must keep its effects', () => {
  let dir: string

  beforeEach(() => {
    document.body.innerHTML = ''
    dir = mkdtempSync(join(tmpdir(), 'bf-3254-branch-live-child-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const COMPONENT_SOURCE = `
'use client'
import { createSignal, createContext, useContext } from '@barefootjs/client'

type NodeType = { id: string }

const GlowContext = createContext<{ value: () => number }>({ value: () => 0 })

function GlowBody(props: { id: string }) {
  const ctx = useContext(GlowContext)
  return <div data-glow={props.id} style={{ '--glow': String(ctx.value()) }} />
}

function Wrapper(props: { children?: any }) {
  return <div className="wrap">{props.children}</div>
}

export function ConditionalGlow(props: { nodes: NodeType[]; renderNode?: (n: NodeType) => any }) {
  const [value, setValue] = createSignal(1)
  return (
    <GlowContext.Provider value={{ value }}>
      <div>
        <button type="button" data-bump onClick={() => setValue(value() + 1)}>bump</button>
        {props.nodes.map((n) => (
          <Wrapper key={n.id}>{props.renderNode ? props.renderNode(n) : <span data-default></span>}</Wrapper>
        ))}
      </div>
    </GlowContext.Provider>
  )
}
`

  test('a Context-driven style effect on a renderNode-mounted child survives a later signal update', async () => {
    const result = compileJSX(COMPONENT_SOURCE, join(dir, 'ConditionalGlow.tsx'), { adapter: new CSRAdapter() })
    const errors = result.errors.filter(e => e.severity === 'error')
    expect(errors).toEqual([])

    const clientJs = result.files.find(f => f.type === 'clientJs')?.content
    if (!clientJs) throw new Error('No client JS emitted for ConditionalGlow.tsx')

    // Sanity check on the premise this test protects: the renderNode call is
    // compiled as an insert() branch whose template spliced a live Node via
    // __bfSlot, with an empty bindEvents() (no second invocation to fall
    // back on) — not a statically-known nested JSX child (renderChild +
    // deferred initChild), which doesn't exercise this bug at all. If this
    // stops matching, the test below passes for the wrong reason.
    expect(clientJs).toContain('__bfSlot(_p.renderNode(n()), __slots)')
    expect(clientJs).toContain("bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {\n      }")

    writeFileSync(
      join(dir, 'ConditionalGlow.client.js'),
      clientJs.replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from '${runtimePath}'`),
    )

    const { render } = await import(runtimePath)
    const mod = await import(join(dir, 'ConditionalGlow.client.js'))

    const container = document.createElement('div')
    document.body.appendChild(container)

    render(container, 'ConditionalGlow', {
      nodes: [{ id: 'a' }],
      renderNode: (n: { id: string }) => mod.GlowBody({ id: n.id }),
    })

    const glow = container.querySelector('[data-glow="a"]') as HTMLElement | null
    expect(glow).not.toBeNull()
    expect(glow!.style.getPropertyValue('--glow')).toBe('1')

    const bump = container.querySelector('[data-bump]') as HTMLButtonElement | null
    expect(bump).not.toBeNull()
    bump!.click()

    // Pre-fix: this style effect was disposed the instant evalBranchTemplate
    // returned from mounting GlowBody, so the click's signal write had no
    // live subscriber left and the value stayed frozen at '1'.
    expect(glow!.style.getPropertyValue('--glow')).toBe('2')
  })
})
