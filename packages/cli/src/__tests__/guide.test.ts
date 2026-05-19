import { describe, test, expect, spyOn } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { createContext } from '../context'
import type { CliContext } from '../context'

// We test the guide command's behavior indirectly through docs-loader
// and directly test the command's run function for edge cases.

describe('bf guide', () => {
  test('lists documents when no argument', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/guide')
      const ctx = await createContext(false)
      run([], ctx)

      const output = logSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('NAME')
      expect(output).toContain('CATEGORY')
      expect(output).toContain('document(s) available')
    } finally {
      logSpy.mockRestore()
    }
  })

  test('shows document content by slug', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/guide')
      const ctx = await createContext(false)
      run(['reactivity/create-signal'], ctx)

      const output = logSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('createSignal')
    } finally {
      logSpy.mockRestore()
    }
  })

  test('shows document content by short name', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/guide')
      const ctx = await createContext(false)
      run(['create-signal'], ctx)

      const output = logSpy.mock.calls.map(c => c[0]).join('\n')
      expect(output).toContain('createSignal')
    } finally {
      logSpy.mockRestore()
    }
  })

  test('--json outputs structured JSON', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/guide')
      const ctx = await createContext(true)
      run(['create-signal'], ctx)

      const output = logSpy.mock.calls.map(c => c[0]).join('\n')
      const parsed = JSON.parse(output)
      expect(parsed.slug).toBe('reactivity/create-signal')
      expect(parsed.title).toBeDefined()
      expect(parsed.content).toBeDefined()
    } finally {
      logSpy.mockRestore()
    }
  })

  test('errors with both candidate paths when docs/core is missing everywhere', async () => {
    // Simulates a scaffolded app installed from a hypothetically-broken
    // CLI tarball (no bundled docs) — `ctx.root` is a fresh tmp dir
    // with no `docs/core`, and the source-mode bundled path doesn't
    // exist either when bun runs TS directly. The error must surface
    // both candidate paths so the user can see what's missing.
    const fakeRoot = mkdtempSync(path.join(tmpdir(), 'bf-guide-noroot-'))
    const ctx: CliContext = {
      root: fakeRoot,
      metaDir: path.join(fakeRoot, 'meta'),
      jsonFlag: false,
      config: null,
      projectDir: null,
    }
    const exitSpy = spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as never)
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/guide')
      expect(() => run([], ctx)).toThrow('exit')
      const errors = errorSpy.mock.calls.map(c => c.join(' ')).join('\n')
      expect(errors).toContain('Core documentation not found.')
      expect(errors).toContain(path.join(fakeRoot, 'docs/core'))
      expect(errors).toContain('(monorepo)')
      expect(errors).toContain('(bundled CLI)')
    } finally {
      exitSpy.mockRestore()
      errorSpy.mockRestore()
      rmSync(fakeRoot, { recursive: true, force: true })
    }
  })

  test('errors on nonexistent document', async () => {
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/guide')
      const ctx = await createContext(false)
      expect(() => run(['nonexistent-doc'], ctx)).toThrow('exit')
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
    } finally {
      exitSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})
