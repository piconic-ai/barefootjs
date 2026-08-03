/**
 * Coverage of `HonoAdapter.generate()`'s `AdapterGenerateOptions.scriptAssets`
 * handling — the Vite-pipeline replacement for `build.ts`'s
 * `addScriptCollection` post-process (see `scripts.tsx`'s
 * `registerComponentScripts`/`wrapWithInlineScripts` docstrings and
 * `hono-adapter.ts`'s `scriptAssets` field docstring for the full design).
 *
 * Mirrors `GoTemplateAdapter`'s own `scriptAssets` contract:
 * `undefined` → legacy codegen untouched (no scriptAssets-driven output at
 * all — the post-process path still owns script registration);
 * `[]` → resolved, but nothing to register (server-only file, or a
 * client file whose bundle isn't in the manifest yet) — no dead codegen;
 * non-empty → bake exactly these URLs in via `registerComponentScripts`.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
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
  test('undefined scriptAssets: no scriptAssets-driven codegen at all (legacy path untouched)', () => {
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
