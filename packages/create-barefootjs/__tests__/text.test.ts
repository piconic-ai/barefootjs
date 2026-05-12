// Direct contract test for the `text()` prompt helper.
//
// The scenario suite exercises the end-to-end CLI behavior, but the
// child runs with non-TTY pipes — so the actual prompt rendering path
// is never reached there. These tests inject mock TTY streams to
// cover the interactive branch:
//
//   - empty answer       → resolves to the default
//   - non-empty answer   → resolves to the trimmed input
//   - non-TTY            → short-circuits to the default
//   - Ctrl-C while open  → raises TextCancelled

import { describe, test, expect } from 'bun:test'
import { PassThrough } from 'node:stream'
import { text, TextCancelled } from '../src/text'

function mockTtyPair(): {
  input: PassThrough & { isTTY: boolean }
  output: PassThrough & { isTTY: boolean }
  rendered: () => string
} {
  const input = Object.assign(new PassThrough(), { isTTY: true })
  const output = Object.assign(new PassThrough(), { isTTY: true })
  const chunks: string[] = []
  output.on('data', (c) => chunks.push(c.toString()))
  return { input, output, rendered: () => chunks.join('') }
}

describe('text()', () => {
  test('resolves to the default when the user submits an empty line', async () => {
    const { input, output, rendered } = mockTtyPair()
    const promise = text({
      message: 'Target directory',
      defaultValue: 'my-app',
      input,
      output,
    })
    input.write('\n')
    expect(await promise).toBe('my-app')
    const out = rendered()
    expect(out).toContain('Target directory: (my-app)')
    // After confirmation, the prompt line is replaced by a compact
    // "✔ <message> *<answer>*" summary.
    expect(out).toContain('✔ Target directory *my-app*\n')
  })

  test('resolves to the trimmed input when the user types a name', async () => {
    const { input, output, rendered } = mockTtyPair()
    const promise = text({
      message: 'Target directory',
      defaultValue: 'my-app',
      input,
      output,
    })
    input.write('  acme-app  \n')
    expect(await promise).toBe('acme-app')
    expect(rendered()).toContain('✔ Target directory *acme-app*\n')
  })

  test('short-circuits to the default when stdin is not a TTY', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: false })
    const output = Object.assign(new PassThrough(), { isTTY: true })
    const answer = await text({
      message: 'Target directory',
      defaultValue: 'my-app',
      input,
      output,
    })
    expect(answer).toBe('my-app')
  })

  test('short-circuits to the default when stdout is not a TTY', async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true })
    const output = Object.assign(new PassThrough(), { isTTY: false })
    const answer = await text({
      message: 'Target directory',
      defaultValue: 'my-app',
      input,
      output,
    })
    expect(answer).toBe('my-app')
  })

  test('raises TextCancelled when the user dismisses the prompt', async () => {
    const { input, output } = mockTtyPair()
    const promise = text({
      message: 'Target directory',
      defaultValue: 'my-app',
      input,
      output,
    })
    // readline emits a SIGINT-like event for Ctrl-C (0x03).
    input.write('\x03')
    await expect(promise).rejects.toBeInstanceOf(TextCancelled)
  })
})
