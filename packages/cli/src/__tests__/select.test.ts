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
      message: 'Choose a framework or runtime',
      options: [
        { value: 'hono', label: 'Hono (Node, JSX SSR + hydration)' },
        { value: 'csr', label: 'CSR (client-side rendering only)' },
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
    const joined = chunks.join('')
    // The menu header is rendered inquirer-style with a yellow "?"
    // marker and a bold message.
    const ansiStripped = joined.replace(/\x1b\[[0-9;]*m/g, '')
    expect(ansiStripped).toContain('? Choose a framework or runtime')
    // The confirmation strips the parenthetical description and
    // highlights the picked option in bold green.
    expect(joined).toContain('✔ Choose a framework or runtime \x1b[1;32mHono\x1b[0m\n')
    // The full label (with parens) appears only in the menu render,
    // never in the confirmation line itself.
    expect(joined.split('\x1b[1;32m')[1]).not.toContain('(Node')
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
