// Tiny single-line text prompt for interactive CLI input.
//
// Renders `<message>: (default) ` and reads one line from stdin. Empty
// input resolves to the default; Ctrl-C / Esc raise `TextCancelled`.
//
// Mirrors the design of `@barefootjs/cli`'s `select()` helper:
//   - No third-party dependency. Built on `node:readline`.
//   - Falls back to the default value when either stdin or stdout is
//     not a TTY (CI, piped input, redirected output). Keeps CI runs
//     deterministic instead of hanging on a hidden prompt.

import readline from 'node:readline'

export class TextCancelled extends Error {
  constructor(reason: 'sigint' | 'escape') {
    super(`text prompt cancelled by user (${reason})`)
    this.name = 'TextCancelled'
  }
}

export interface TextArgs {
  message: string
  defaultValue: string
  /** Override stdin/stdout for testing. */
  input?: NodeJS.ReadableStream & { isTTY?: boolean }
  output?: NodeJS.WritableStream & { isTTY?: boolean }
}

export async function text(args: TextArgs): Promise<string> {
  const input = (args.input ?? process.stdin) as NodeJS.ReadableStream & { isTTY?: boolean }
  const output = (args.output ?? process.stdout) as NodeJS.WritableStream & { isTTY?: boolean }

  if (!input.isTTY || !output.isTTY) {
    return args.defaultValue
  }

  const rl = readline.createInterface({ input, output, terminal: true })
  const prompt = `${args.message}: (${args.defaultValue}) `

  return new Promise<string>((resolve, reject) => {
    const onSigInt = (): void => {
      rl.close()
      output.write('\n')
      reject(new TextCancelled('sigint'))
    }
    rl.once('SIGINT', onSigInt)
    rl.question(prompt, (answer) => {
      rl.close()
      const trimmed = answer.trim()
      const value = trimmed.length > 0 ? trimmed : args.defaultValue
      // Replace the prompt line with a compact confirmation so the
      // transcript reads as "✔ Target directory *my-app*" rather than
      // leaving the raw "Target directory: (my-app) <input>" line.
      output.write('\x1b[1A\x1b[2K')
      output.write(`✔ ${args.message} *${value}*\n`)
      resolve(value)
    })
  })
}
