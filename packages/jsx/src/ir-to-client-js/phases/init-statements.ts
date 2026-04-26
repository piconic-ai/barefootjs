/**
 * `init-statements` phase — preserve user-written top-level imperative
 * statements from the component body verbatim (#930).
 *
 * Each statement is re-indented so it nests neatly inside `init()`.
 * Examples: `if (typeof window !== 'undefined') { window.addEventListener(...) }`,
 * `console.log(...)`, `try { localStorage.getItem(...) } catch {}`.
 *
 * The trailing blank line (only when statements were emitted) is owned
 * by this phase — it used to live as a conditional `lines.push('')` in
 * the orchestrator. Folding it in keeps the phase self-contained.
 */

import type { ClientJsContext } from '../types'

export function emitInitStatements(lines: string[], ctx: ClientJsContext): void {
  if (ctx.initStatements.length === 0) return
  for (const stmt of ctx.initStatements) {
    // Preserve blank lines inside the body as-is; indent every other line
    // by 2 spaces so the statement nests visually under `init() {`.
    const indented = stmt.body
      .split('\n')
      .map((ln, i) => (i === 0 || ln === '' ? ln : '  ' + ln))
      .join('\n')
    lines.push(`  ${indented}`)
  }
  lines.push('')
}
