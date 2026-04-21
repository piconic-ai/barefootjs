/**
 * Tests for `barefoot why-wrap <component>` — surface fallback-wrapped
 * expressions emitted by Solid-style wrap-by-default (#937).
 *
 * Fallback wraps are harmless but invisible in the source: the compiler
 * chose `createEffect` because it couldn't statically prove the
 * expression is (or isn't) reactive. This CLI is the opt-in channel users
 * rely on to find candidates for `createMemo` refactor; regressing its
 * filter or its JSON shape silently hides the whole reactive footprint.
 */

import { describe, test, expect, spyOn } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import type { CliContext } from '../context'

function makeCtx(jsonFlag: boolean): CliContext {
  // Minimal context — `resolveComponentSource` only needs `root`, `config`,
  // `projectDir` to resolve a bare name; we always pass an absolute .tsx
  // path below, so those fall back fields are irrelevant for this suite.
  return {
    root: process.cwd(),
    metaDir: '',
    jsonFlag,
    config: null,
    projectDir: null,
  }
}

function tmpComponent(source: string, name = 'Demo.tsx'): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'barefoot-why-wrap-'))
  const file = path.join(dir, name)
  writeFileSync(file, source)
  return file
}

describe('barefoot why-wrap', () => {
  test('reactive-only component reports no fallbacks', async () => {
    // Counter reads a signal — emitter wraps it but classification is
    // 'reactive'. why-wrap's filter drops it; output is the "none" line.
    const file = tmpComponent(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(c => c + 1)}>{count()}</button>
      }
    `)
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/why-wrap')
      await run([file], makeCtx(false))
      const output = logSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('no fallback-wrapped expression')
      expect(output).not.toContain('~')
    } finally {
      logSpy.mockRestore()
      rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  test('component with fallback-wrapped text binding lists it', async () => {
    // `formatTitle(page)` is the #939 canonical fallback shape — opaque
    // call on a non-reactive argument.
    const file = tmpComponent(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { formatTitle } from './format'
      export function Page() {
        const [, setFoo] = createSignal(0)
        const page = 'home'
        return <h1 onClick={() => setFoo(1)}>{formatTitle(page)}</h1>
      }
    `)
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/why-wrap')
      await run([file], makeCtx(false))
      const output = logSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('1 fallback-wrapped expression')
      // The text binding's slotId appears in the report line.
      expect(output).toMatch(/text "s\d+"/)
      expect(output).toContain('~')
      // The actual expression text is printed so users can locate the
      // binding in their source without running `inspect` separately.
      expect(output).toContain('formatTitle(page)')
      // Guidance footer — helps the user know what to do next.
      expect(output).toContain('createMemo')
    } finally {
      logSpy.mockRestore()
      rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  test('--json emits machine-readable shape with classification', async () => {
    // Editor integrations and CI scripts depend on the JSON shape.
    // Lock in: componentName, sourceFile, fallbacks[].classification,
    // fallbacks[].type, fallbacks[].slotId, fallbacks[].deps.
    const file = tmpComponent(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { format } from './fmt'
      export function Tag() {
        const [, setFoo] = createSignal(0)
        const label = 'hi'
        return <button class={format(label)} onClick={() => setFoo(1)}>x</button>
      }
    `)
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/why-wrap')
      await run([file], makeCtx(true))
      const output = logSpy.mock.calls.map(c => c[0]).join('\n')
      const parsed = JSON.parse(output) as {
        componentName: string
        sourceFile: string
        fallbacks: Array<{ classification: string; type: string; label: string; deps: string[]; slotId: string; expression?: string }>
      }
      expect(parsed.componentName).toBe('Tag')
      expect(parsed.fallbacks.length).toBeGreaterThan(0)
      // All entries must be fallbacks — reactive bindings are filtered out.
      for (const f of parsed.fallbacks) {
        expect(f.classification).toBe('fallback')
      }
      const attrFallback = parsed.fallbacks.find(f => f.type === 'attribute')
      expect(attrFallback).toBeDefined()
      expect(attrFallback!.label).toBe('class')
      expect(attrFallback!.deps).toEqual([])
      expect(attrFallback!.expression).toBe('format(label)')
    } finally {
      logSpy.mockRestore()
      rmSync(path.dirname(file), { recursive: true, force: true })
    }
  })

  test('errors on unknown component', async () => {
    const exitSpy = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`)
    }) as never)
    const errSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/why-wrap')
      await expect(run(['NoSuchComponent12345'], makeCtx(false))).rejects.toThrow('exit 1')
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot find'))
    } finally {
      exitSpy.mockRestore()
      errSpy.mockRestore()
    }
  })

  test('errors with usage when no component argument', async () => {
    const exitSpy = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`)
    }) as never)
    const errSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/why-wrap')
      await expect(run([], makeCtx(false))).rejects.toThrow('exit 1')
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Component name required'))
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'))
    } finally {
      exitSpy.mockRestore()
      errSpy.mockRestore()
    }
  })
})
