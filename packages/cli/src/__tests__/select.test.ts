import { describe, test, expect } from 'bun:test'
import { PassThrough } from 'node:stream'
import { select, SelectCancelled } from '../lib/select'

// The interactive arrow-key path is hard to drive in unit tests (it
// expects a raw-mode TTY); these tests pin the deterministic
// short-circuit branches that callers rely on for non-interactive
// contexts (single option, non-TTY stdin, CI).

const fakeOutput = {
  isTTY: true,
  write: () => true,
} as unknown as NodeJS.WritableStream & { isTTY?: boolean }

const ttyInput = {
  isTTY: true,
  setRawMode: () => {},
  resume: () => {},
  pause: () => {},
  on: () => {},
  removeListener: () => {},
} as unknown as NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (m: boolean) => void }

const nonTtyInput = {
  isTTY: false,
  on: () => {},
  removeListener: () => {},
} as unknown as NodeJS.ReadableStream & { isTTY?: boolean }

describe('select short-circuit behavior', () => {
  test('returns default when stdin is not a TTY (e.g. piped input)', async () => {
    const result = await select({
      message: 'pick',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      defaultValue: 'a',
      input: nonTtyInput,
      output: fakeOutput,
    })
    expect(result).toBe('a')
  })

  test('returns default when stdout is not a TTY', async () => {
    const result = await select({
      message: 'pick',
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      defaultValue: 'b',
      input: ttyInput,
      output: { isTTY: false, write: () => true } as unknown as NodeJS.WritableStream & { isTTY?: boolean },
    })
    expect(result).toBe('b')
  })

  test('returns default when no options are provided', async () => {
    const result = await select({
      message: 'pick',
      options: [],
      defaultValue: 'fallback',
      input: ttyInput,
      output: fakeOutput,
    })
    expect(result).toBe('fallback')
  })
})

describe('select — confirmation line', () => {
  test('on Enter, wipes the menu and writes `✔ <message> *<label>*`', async () => {
    const input = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: () => {},
    })
    const output = Object.assign(new PassThrough(), { isTTY: true })
    const chunks: string[] = []
    output.on('data', (c) => chunks.push(c.toString()))

    const promise = select({
      message: 'Choose an adapter',
      options: [
        { value: 'hono', label: 'Hono' },
        { value: 'csr', label: 'CSR' },
      ],
      defaultValue: 'hono',
      input,
      output,
    })

    // Let `select()` finish wiring up its keypress listener before we
    // feed it the Enter byte. `readline.emitKeypressEvents` translates
    // a CR (\r) on stdin into a `{ name: 'return' }` keypress event.
    await new Promise((r) => setImmediate(r))
    input.write('\r')

    const result = await promise

    expect(result).toBe('hono')
    expect(chunks.join('')).toContain('✔ Choose an adapter *Hono*\n')
  })
})

describe('SelectCancelled', () => {
  test('is an Error subclass with a typed name', () => {
    const cancelled = new SelectCancelled('sigint')
    expect(cancelled).toBeInstanceOf(Error)
    expect(cancelled.name).toBe('SelectCancelled')
    // Reason ends up in the message so log output includes it.
    expect(cancelled.message).toContain('sigint')
  })

  test('distinguishes a user cancel from other errors via instanceof', () => {
    const generic: unknown = new Error('boom')
    const cancelled: unknown = new SelectCancelled('escape')
    expect(generic instanceof SelectCancelled).toBe(false)
    expect(cancelled instanceof SelectCancelled).toBe(true)
  })
})
