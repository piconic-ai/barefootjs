// Tiny arrow-key selector for interactive CLI prompts.
//
// Renders a list, lets the user move with ↑/↓ (or k/j) and confirm with
// Enter. Cancels with Ctrl-C / Esc. Falls back to returning the default
// value when stdin is not a TTY (e.g. piped input or CI), so callers can
// safely use this in non-interactive contexts.

import readline from 'node:readline'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
}

export interface SelectArgs<T extends string = string> {
  message: string
  options: SelectOption<T>[]
  defaultValue: T
  /** Override stdin/stdout for testing. */
  input?: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => void }
  output?: NodeJS.WritableStream & { isTTY?: boolean }
}

export async function select<T extends string = string>(args: SelectArgs<T>): Promise<T> {
  const input = (args.input ?? process.stdin) as NodeJS.ReadableStream & {
    isTTY?: boolean
    setRawMode?: (mode: boolean) => void
  }
  const output = (args.output ?? process.stdout) as NodeJS.WritableStream & { isTTY?: boolean }

  // No options: nothing to choose — fall through to the default.
  if (args.options.length === 0) {
    return args.defaultValue
  }
  // Non-TTY: arrow-key navigation can't render, fall through to the
  // default so CI / piped-input callers don't hang.
  if (!input.isTTY || !output.isTTY) {
    return args.defaultValue
  }

  const startIdx = Math.max(0, args.options.findIndex(o => o.value === args.defaultValue))
  let cursor = startIdx === -1 ? 0 : startIdx

  const render = (firstPaint: boolean): void => {
    if (!firstPaint) {
      // Move cursor up `options.length` lines and clear them so the next
      // paint overwrites the previous menu in place.
      output.write(`\x1b[${args.options.length}A`)
    }
    for (let i = 0; i < args.options.length; i++) {
      const opt = args.options[i]
      const marker = i === cursor ? '\x1b[36m❯\x1b[0m' : ' '
      const label = i === cursor ? `\x1b[36m${opt.label}\x1b[0m` : opt.label
      output.write(`\x1b[2K${marker} ${label}\n`)
    }
  }

  output.write(`${args.message}\n`)
  render(true)

  return new Promise<T>((resolve, reject) => {
    readline.emitKeypressEvents(input)
    input.setRawMode?.(true)
    input.resume()

    const cleanup = (): void => {
      input.setRawMode?.(false)
      input.pause()
      input.removeListener('keypress', onKey)
    }

    const onKey = (_: string, key: { name?: string; ctrl?: boolean }): void => {
      if (!key) return
      if (key.ctrl && key.name === 'c') {
        cleanup()
        // Mimic shell SIGINT: blank line, then bail.
        output.write('\n')
        reject(new Error('cancelled'))
        return
      }
      if (key.name === 'escape') {
        cleanup()
        output.write('\n')
        reject(new Error('cancelled'))
        return
      }
      if (key.name === 'up' || key.name === 'k') {
        cursor = (cursor - 1 + args.options.length) % args.options.length
        render(false)
        return
      }
      if (key.name === 'down' || key.name === 'j') {
        cursor = (cursor + 1) % args.options.length
        render(false)
        return
      }
      if (key.name === 'return') {
        cleanup()
        resolve(args.options[cursor].value)
        return
      }
    }

    input.on('keypress', onKey)
  })
}
