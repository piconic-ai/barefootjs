import { describe, test, expect, spyOn } from 'bun:test'
import { createContext } from '../context'

// We test the core command's behavior indirectly through docs-loader
// and directly test the command's run function for edge cases.

describe('barefoot core', () => {
  test('lists documents when no argument', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/core')
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
      const { run } = await import('../commands/core')
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
      const { run } = await import('../commands/core')
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
      const { run } = await import('../commands/core')
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

  test('errors on nonexistent document', async () => {
    const exitSpy = spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit') })
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { run } = await import('../commands/core')
      const ctx = await createContext(false)
      expect(() => run(['nonexistent-doc'], ctx)).toThrow('exit')
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
    } finally {
      exitSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})
