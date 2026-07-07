// Tiny arrow-key selector for interactive CLI prompts.
//
// Renders a list, lets the user move with ↑/↓ (or k/j) and confirm with
// Enter. Cancels with Ctrl-C / Esc, surfacing a `SelectCancelled`
// rejection so callers can distinguish a user abort from a real error.
//
// Falls back to returning the default value when **either** stdin or
// stdout is not a TTY (piped input, CI, redirected output) — arrow-key
// navigation has no rendering surface in those contexts, and any
// callers that want a deterministic value get one without hanging.

import readline from 'node:readline'

/**
 * Thrown (well, rejected) by `select()` when the user dismisses the
 * prompt with Ctrl-C or Esc. Callers catching `select()`'s Promise
 * can `instanceof`-check this to tell a deliberate cancel from a
 * real failure (lost stdin, render error, etc.).
 */
export class SelectCancelled extends Error {
  constructor(reason: 'sigint' | 'escape') {
    super(`select cancelled by user (${reason})`)
    this.name = 'SelectCancelled'
  }
}

export interface SelectOption<T extends string = string> {
  value: T
  /** Label rendered in the live arrow-key menu. */
  label: string
  /**
   * Label rendered in the post-confirmation summary line. Falls back
   * to `label` with any trailing `(parenthetical description)` stripped
   * — that default keeps existing single-noun options unchanged but
   * collapses verbose menu rows ("Hono (Cloudflare Workers, JSX SSR
   * + hydration)") to a confirmation noun ("Hono"). Set this
   * explicitly when two options share the same root noun and need
   * disambiguation in the confirmation line.
   */
  shortLabel?: string
}

/**
 * Confirmation-line label for a picked option — prefers an explicit
 * `shortLabel`, else strips a trailing parenthetical description
 * ("Hono (Cloudflare Workers, ...)" → "Hono"). Exported so callers
 * that resolve a choice *without* going through the interactive
 * `select()` prompt (an explicit `--adapter`/`--css` flag, or `--yes`'s
 * forwarded defaults) can still print the exact same
 * "✔ <message> <label>" confirmation the interactive picker renders —
 * keeping the interactive and non-interactive transcripts consistent.
 */
export function confirmationLabel(opt: { label: string; shortLabel?: string }): string {
  return opt.shortLabel ?? opt.label.replace(/\s*\(.*\)$/, '')
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

  // `findIndex` returns -1 when the default isn't in the list; fall
  // back to the first option in that case so the cursor still has a
  // legal starting position.
  const defaultIdx = args.options.findIndex(o => o.value === args.defaultValue)
  let cursor = defaultIdx === -1 ? 0 : defaultIdx

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

  // Inquirer-style prompt header: yellow "?" marker + bold message.
  //   ? Choose an adapter
  output.write(`\x1b[33m?\x1b[0m \x1b[1m${args.message}\x1b[0m\n`)
  render(true)

  return new Promise<T>((resolve, reject) => {
    readline.emitKeypressEvents(input)
    input.setRawMode?.(true)
    input.resume()

    // Invariant: every resolve / reject path in this Promise must
    // call `cleanup()` first so we never leave the input in raw mode
    // or leak the keypress listener.
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
        reject(new SelectCancelled('sigint'))
        return
      }
      if (key.name === 'escape') {
        cleanup()
        output.write('\n')
        reject(new SelectCancelled('escape'))
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
        // Wipe the rendered menu (message line + N option rows) and
        // replace it with a one-line confirmation so the transcript
        // reads as "✔ Choose an adapter Hono" instead of leaving the
        // raw arrow-key menu on screen.
        //
        // Confirmation label: prefer an explicit `shortLabel`, else
        // strip a trailing parenthetical description ("Hono (Cloudflare
        // Workers, ...)" → "Hono"). The auto-strip keeps short single-
        // noun rows unchanged but collapses verbose ones; explicit
        // shortLabel lets options that share a root noun stay
        // distinguishable ("Hono / Cloudflare Workers" vs.
        // "Hono / Node").
        const picked = args.options[cursor]
        const shortLabel = confirmationLabel(picked)
        const totalLines = args.options.length + 1
        output.write(`\x1b[${totalLines}A`)
        for (let i = 0; i < totalLines; i++) {
          output.write('\x1b[2K\n')
        }
        output.write(`\x1b[${totalLines}A`)
        output.write(`✔ ${args.message} \x1b[1;32m${shortLabel}\x1b[0m\n`)
        resolve(args.options[cursor].value)
        return
      }
    }

    input.on('keypress', onKey)
  })
}
