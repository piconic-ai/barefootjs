// Contract test for the spinner helper.
//
// The spinner is *silent* on success: it animates while work is in
// progress (TTY only) and either clears its line on `stop()` or paints
// a ✖ row on `fail()`. There is no success-announcement variant — the
// next thing the CLI prints is its own confirmation.

import { describe, test, expect } from 'bun:test'
import { PassThrough } from 'node:stream'
import { startSpinner } from '../lib/spinner'

function collect(isTTY: boolean): {
  output: PassThrough & { isTTY: boolean }
  text: () => string
} {
  const out = Object.assign(new PassThrough(), { isTTY })
  const chunks: string[] = []
  out.on('data', (c) => chunks.push(c.toString()))
  return { output: out, text: () => chunks.join('') }
}

describe('startSpinner — non-TTY', () => {
  test('writes nothing on start, stop, or success', () => {
    const { output, text } = collect(false)
    const s = startSpinner({ text: 'Working...', output })
    s.stop()
    expect(text()).toBe('')
  })

  test('fail prints ✖ even in non-TTY (errors must be visible)', () => {
    const { output, text } = collect(false)
    const s = startSpinner({ text: 'Checking registry...', output })
    s.fail('Registry unreachable')
    expect(text()).toBe('✖ Registry unreachable\n')
  })
})

describe('startSpinner — TTY', () => {
  test('animates while running and clears the line on stop', async () => {
    const { output, text } = collect(true)
    const s = startSpinner({ text: 'Working...', output, interval: 10 })
    await new Promise((r) => setTimeout(r, 35))
    s.stop()
    const joined = text()
    // At least one braille frame rendered while the spinner was alive.
    expect(joined).toMatch(/[⠇⠏⠙⠹⠸⠼⠴⠦⠧⠋]/)
    // …and the spinner ends with a clear-line escape — no success
    // banner remains on screen.
    expect(joined.endsWith('\r\x1b[2K')).toBe(true)
    expect(joined).not.toMatch(/✔/)
  })

  test('fail stops the animation and prints ✖ with the override text', async () => {
    const { output, text } = collect(true)
    const s = startSpinner({ text: 'Checking registry...', output, interval: 10 })
    await new Promise((r) => setTimeout(r, 25))
    s.fail('Registry unreachable')
    expect(text()).toMatch(/✖ Registry unreachable\n$/)
  })
})
