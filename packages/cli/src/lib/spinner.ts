// Minimal braille-frame spinner for long-running CLI steps.
//
//   const spin = startSpinner({ text: 'Creating starter files...' })
//   await doWork()
//   spin.stop()   // silent on success — the result speaks for itself
//
// Mirrors the design of `select.ts` / `text.ts`: zero third-party deps,
// non-TTY-safe. When stdout isn't a TTY (CI, piped output) the spinner
// stays completely silent so logs aren't polluted with progress noise
// the user can't see anyway.

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export interface Spinner {
  /** Replace the running spinner's label. */
  update(text: string): void
  /** Stop the spinner and print a failure-mark line. */
  fail(text?: string): void
  /**
   * Stop the spinner silently — the success state isn't announced
   * because the work that follows is its own confirmation. (E.g. the
   * next-step instructions printed after a successful scaffold.)
   */
  stop(): void
}

export interface SpinnerArgs {
  text: string
  /** Override stdout for testing. */
  output?: NodeJS.WritableStream & { isTTY?: boolean }
  /** Frame interval in ms (default 80). */
  interval?: number
}

export function startSpinner(args: SpinnerArgs): Spinner {
  const output = (args.output ?? process.stdout) as NodeJS.WritableStream & { isTTY?: boolean }
  const tty = !!output.isTTY
  let text = args.text
  let frame = 0
  let timer: NodeJS.Timeout | null = null

  const clearLine = (): void => {
    output.write('\r\x1b[2K')
  }
  const renderFrame = (): void => {
    clearLine()
    output.write(`${FRAMES[frame]} ${text}`)
    frame = (frame + 1) % FRAMES.length
  }

  if (tty) {
    renderFrame()
    timer = setInterval(renderFrame, args.interval ?? 80)
  }
  // Non-TTY: stay completely silent. The spinner can't usefully animate
  // when there is no live terminal to redraw, and logging "Creating..."
  // / "Done" to a piped run just adds noise.

  const stopTicker = (): void => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return {
    update(next) {
      text = next
    },
    fail(next) {
      stopTicker()
      const final = next ?? text
      if (tty) clearLine()
      output.write(`✖ ${final}\n`)
    },
    stop() {
      stopTicker()
      if (tty) clearLine()
    },
  }
}
