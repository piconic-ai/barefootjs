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
