import { describe, test, expect } from 'bun:test'
import { select } from '../lib/select'

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
  test('returns default when only one option is provided', async () => {
    const result = await select({
      message: 'pick',
      options: [{ value: 'only', label: 'Only' }],
      defaultValue: 'only',
      input: ttyInput,
      output: fakeOutput,
    })
    expect(result).toBe('only')
  })

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
})
