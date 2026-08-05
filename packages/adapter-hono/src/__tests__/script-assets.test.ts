/**
 * Coverage of `HonoAdapter.generate()`'s `AdapterGenerateOptions.scriptAssets`
 * handling (see `scripts.tsx`'s `registerComponentScripts`/
 * `wrapWithInlineScripts` docstrings and `hono-adapter.ts`'s `scriptAssets`
 * field docstring for the full design).
 *
 * Mirrors `GoTemplateAdapter`'s own `scriptAssets` contract: `undefined` →
 * no scriptAssets-driven output at all; `[]` → resolved, but nothing to
 * register (server-only file, or a client file whose bundle isn't in the
 * manifest yet) — no dead codegen; non-empty → bake exactly these URLs in
 * via `registerComponentScripts`.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import type { ComponentIR } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter'

function compileMarkedTemplate(source: string, scriptAssets: string[] | undefined, file = 'Demo.tsx'): string {
  const adapter = new HonoAdapter()
  const result = compileJSX(source, file, { adapter, scriptAssets })
  const errors = result.errors.filter((e) => e.severity === 'error')
  expect(errors).toEqual([])
  const tmpl = result.files.find((f) => f.type === 'markedTemplate')
  expect(tmpl).toBeDefined()
  return tmpl!.content
}

const CLIENT_COMPONENT = `'use client'
import { createSignal } from '@barefootjs/client'

export function Counter(props: { initial: number }) {
  const [count, setCount] = createSignal(props.initial)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

const CLIENT_COMPONENT_IF_ROOT = `'use client'
import { createSignal } from '@barefootjs/client'

export function Toggle(props: { asChild?: boolean }) {
  const [open, setOpen] = createSignal(false)

  if (props.asChild) {
    return <span onClick={() => setOpen(!open())}>child</span>
  }

  return <button onClick={() => setOpen(!open())}>toggle</button>
}
`

describe('HonoAdapter scriptAssets codegen', () => {
  test('undefined scriptAssets: no scriptAssets-driven codegen at all', () => {
    const output = compileMarkedTemplate(CLIENT_COMPONENT, undefined)
    expect(output).not.toContain('registerComponentScripts')
    expect(output).not.toContain('wrapWithInlineScripts')
    expect(output).not.toContain("@barefootjs/hono/scripts'")
  })

  test('empty scriptAssets: resolved-but-empty emits no registration codegen', () => {
    const output = compileMarkedTemplate(CLIENT_COMPONENT, [])
    expect(output).not.toContain('registerComponentScripts')
    expect(output).not.toContain('wrapWithInlineScripts')
  })

  test('non-empty scriptAssets: bakes registerComponentScripts + wraps the return, no separate runtime script', () => {
    const output = compileMarkedTemplate(CLIENT_COMPONENT, ['/static/build/assets/Counter-abc123.js'])

    expect(output).toContain("import { registerComponentScripts, wrapWithInlineScripts } from '@barefootjs/hono/scripts'")
    expect(output).toContain('const __bfInlineScripts = registerComponentScripts(["/static/build/assets/Counter-abc123.js"])')
    expect(output).toContain('return wrapWithInlineScripts((')
    expect(output).toContain('), __bfInlineScripts)')
    // No hand-rolled `barefoot.js` registration — the runtime is a shared
    // ESM chunk the resolved entry already imports.
    expect(output).not.toContain('barefoot.js')
  })

  test('multiple scriptAssets URLs are all baked into one registerComponentScripts call', () => {
    const output = compileMarkedTemplate(CLIENT_COMPONENT, [
      'http://localhost:5173/@vite/client',
      'http://localhost:5173/src/components/Counter.tsx',
    ])
    expect(output).toContain(
      'registerComponentScripts(["http://localhost:5173/@vite/client","http://localhost:5173/src/components/Counter.tsx"])',
    )
  })

  test('if-statement root: both branches wrap their return with wrapWithInlineScripts', () => {
    const output = compileMarkedTemplate(CLIENT_COMPONENT_IF_ROOT, ['/static/build/assets/Toggle-abc123.js'])

    const wrapOpens = output.match(/return wrapWithInlineScripts\(\(/g) ?? []
    const wrapCloses = output.match(/\), __bfInlineScripts\)/g) ?? []
    // One wrapped return per branch (the `if` consequent and the trailing
    // `return (...)` alternate) — an if-statement root never emits a bare,
    // unwrapped `return (`.
    expect(wrapOpens.length).toBe(2)
    expect(wrapCloses.length).toBe(2)
    // No branch falls back to a bare, unwrapped `return (`.
    expect(output).not.toMatch(/return \(\n/)
  })
})

/**
 * Coverage of `HonoAdapter.generate()`'s `AdapterGenerateOptions.preloadAssets`
 * handling — the sibling option to `scriptAssets` above. See
 * `scripts.tsx`'s `registerComponentPreloads`/`wrapWithInlineScripts`
 * docstrings and `hono-adapter.ts`'s `preloadAssets` field docstring for
 * the full design.
 *
 * Same `undefined`/`[]`/non-empty contract as `scriptAssets`, with the
 * added constraint that `preloadAssets` is only meaningful alongside a
 * non-empty `scriptAssets` — see `AdapterGenerateOptions.preloadAssets`.
 */
/** IR for a source, for the tests that drive `generate()` directly rather
 * than through `compileJSX` — `AdapterGenerateOptions`-only fields (e.g.
 * `skipScriptRegistration`) have no `CompileOptions` counterpart to travel
 * through. Mirrors the same helper in every other adapter's suite. */
function compileToIR(source: string): ComponentIR {
  const result = compileJSX(source.trimStart(), 'test.tsx', {
    adapter: new HonoAdapter(),
    outputIR: true,
  })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('No IR output')
  return JSON.parse(irFile.content) as ComponentIR
}

function compileMarkedTemplateWithPreloads(
  source: string,
  scriptAssets: string[] | undefined,
  preloadAssets: string[] | undefined,
  file = 'Demo.tsx',
): string {
  const adapter = new HonoAdapter()
  const result = compileJSX(source, file, { adapter, scriptAssets, preloadAssets })
  const errors = result.errors.filter((e) => e.severity === 'error')
  expect(errors).toEqual([])
  const tmpl = result.files.find((f) => f.type === 'markedTemplate')
  expect(tmpl).toBeDefined()
  return tmpl!.content
}

describe('HonoAdapter preloadAssets codegen', () => {
  test('preloadAssets bakes registerComponentPreloads and wraps the return with the preload list, before the script registration', () => {
    const output = compileMarkedTemplateWithPreloads(
      CLIENT_COMPONENT,
      ['/static/build/assets/Counter-abc123.js'],
      ['/static/build/assets/index-def456.js', '/static/build/assets/TodoItem-ghi789.js'],
    )

    expect(output).toContain("import { registerComponentScripts, registerComponentPreloads, wrapWithInlineScripts } from '@barefootjs/hono/scripts'")
    expect(output).toContain(
      'const __bfInlinePreloads = registerComponentPreloads(["/static/build/assets/index-def456.js","/static/build/assets/TodoItem-ghi789.js"])',
    )
    const preloadIdx = output.indexOf('registerComponentPreloads(')
    const scriptIdx = output.indexOf('registerComponentScripts(')
    expect(preloadIdx).toBeGreaterThanOrEqual(0)
    expect(scriptIdx).toBeGreaterThan(preloadIdx)
    expect(output).toContain('return wrapWithInlineScripts((')
    expect(output).toContain('), __bfInlineScripts, __bfInlinePreloads)')
  })

  test('preloadAssets: [] emits no registerComponentPreloads codegen', () => {
    const output = compileMarkedTemplateWithPreloads(
      CLIENT_COMPONENT,
      ['/static/build/assets/Counter-abc123.js'],
      [],
    )
    expect(output).not.toContain('registerComponentPreloads')
    expect(output).not.toContain('__bfInlinePreloads')
    // scriptAssets codegen is unaffected — same wrap shape as before.
    expect(output).toContain('), __bfInlineScripts)')
  })

  test('preloadAssets: undefined emits no registerComponentPreloads codegen', () => {
    const output = compileMarkedTemplateWithPreloads(
      CLIENT_COMPONENT,
      ['/static/build/assets/Counter-abc123.js'],
      undefined,
    )
    expect(output).not.toContain('registerComponentPreloads')
    expect(output).not.toContain('__bfInlinePreloads')
    expect(output).toContain('), __bfInlineScripts)')
  })

  test('preloadAssets is ignored when scriptAssets is empty (only meaningful alongside a non-empty scriptAssets)', () => {
    const output = compileMarkedTemplateWithPreloads(CLIENT_COMPONENT, [], ['/static/build/assets/index-def456.js'])
    expect(output).not.toContain('registerComponentPreloads')
    expect(output).not.toContain('registerComponentScripts')
  })

  // `skipScriptRegistration` lives on `AdapterGenerateOptions`, NOT on
  // `CompileOptions` — a parent adapter sets it when emitting a child, so it
  // never travels through `compileJSX`. Exercising it therefore means calling
  // `generate()` directly, the same way every other adapter's suite does.
  //
  // Note what actually enforces this: `hasPreloadAssets()` is conjoined with
  // `hasScriptAssets()`, so suppressing scripts suppresses preloads
  // structurally — mutating the `skipScriptRegistration` branch alone cannot
  // make this test fail. The independent guarantee is pinned by the
  // "ignored when scriptAssets is empty" test above, which DOES go red when
  // that conjunct is dropped. Both are kept: this one states the intent a
  // reader looks for, that one holds the line.
  test('skipScriptRegistration suppresses the preload registration as well as the script registration', () => {
    const ir = compileToIR(CLIENT_COMPONENT)
    const { template } = new HonoAdapter().generate(ir, {
      skipScriptRegistration: true,
      scriptAssets: ['/static/build/assets/Counter-abc123.js'],
      preloadAssets: ['/static/build/assets/index-def456.js'],
    })
    expect(template).not.toContain('registerComponentPreloads')
    expect(template).not.toContain('registerComponentScripts')
    expect(template).not.toContain('wrapWithInlineScripts')
    expect(template).not.toContain("@barefootjs/hono/scripts'")
  })

  test('if-statement root: both branches wrap with wrapWithInlineScripts passing __bfInlinePreloads', () => {
    const output = compileMarkedTemplateWithPreloads(
      CLIENT_COMPONENT_IF_ROOT,
      ['/static/build/assets/Toggle-abc123.js'],
      ['/static/build/assets/index-def456.js'],
    )

    const wrapOpens = output.match(/return wrapWithInlineScripts\(\(/g) ?? []
    const wrapCloses = output.match(/\), __bfInlineScripts, __bfInlinePreloads\)/g) ?? []
    expect(wrapOpens.length).toBe(2)
    expect(wrapCloses.length).toBe(2)
  })
})
