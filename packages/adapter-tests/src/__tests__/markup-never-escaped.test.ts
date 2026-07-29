/**
 * Guard: a MARKUP value must never be `escapeText`-wrapped in emitted client JS.
 *
 * ## Why this test exists separately from the goldens
 *
 * `escapeText` around a text value is correct and is the default (see
 * `IRExpression.contentKind`). Around a value that is already HTML it is a
 * composition bug: the markup renders as visible `&lt;div&gt;` instead of
 * becoming DOM.
 *
 * The committed `__snapshots__/*.client.js` goldens cannot catch that on their
 * own, because CI REGENERATES them (`.github/workflows/update-fixtures.yml`).
 * When a compiler change starts escaping a markup value, the workflow rewrites
 * the golden to contain the escaped form and the suite goes GREEN on a real
 * regression. That happened: `escapeText((_p.children.props).children)` — the
 * grandchild markup the `Slot` / asChild path forwards — was written into
 * `slot.client.js` as the expected output, and every unit and conformance suite
 * still passed. It was found by reading the auto-generated diff by hand.
 *
 * So this test asserts INVARIANTS over those same files rather than their exact
 * contents. It is not auto-generated, so regeneration cannot absorb a violation
 * — the golden may change freely, but it may not come to contain these shapes.
 *
 * String-level suites are structurally blind here in another way too: escaping
 * markup keeps the output a well-formed string, so byte comparisons stay happy
 * and only a browser notices. That is why this is a cheap textual guard and not
 * a substitute for the e2e suites.
 *
 * ## Adding a case
 *
 * Add a shape only when it is markup by CONSTRUCTION, never by convention. Each
 * entry needs a reason a reviewer can check, because a false positive here
 * blocks unrelated work.
 */

import { describe, test, expect } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SNAPSHOT_DIR = join(import.meta.dir, '../../fixtures/__snapshots__')

/**
 * Extract the argument source of every `escapeText(...)` call in `code`, by
 * matching parentheses rather than with a regex: the arguments nest
 * (`escapeText((_p.children.props).children)`), so `[^)]*` stops at the first
 * inner `)` and silently misses exactly the calls this test is about.
 */
function escapeTextArguments(code: string): string[] {
  const out: string[] = []
  const CALL = 'escapeText('
  let from = 0
  for (;;) {
    const at = code.indexOf(CALL, from)
    if (at === -1) return out
    let depth = 1
    let i = at + CALL.length
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === '(') depth++
      else if (code[i] === ')') depth--
    }
    // Unbalanced (truncated file) — stop rather than report a bogus argument.
    if (depth !== 0) return out
    out.push(code.slice(at + CALL.length, i - 1))
    from = i
  }
}

/**
 * Shapes that are markup by construction. `reason` is what a reviewer checks
 * when this test fails: if the reason does not hold for the flagged code, the
 * ENTRY is wrong, not the compiler.
 */
const FORBIDDEN: ReadonlyArray<{
  name: string
  reason: string
  matches: (arg: string) => boolean
}> = [
  {
    name: 'a rendered child component',
    reason:
      '`renderChild(...)` returns a child component\'s rendered HTML. Escaping it '
      + 'renders the child as visible markup text instead of mounting it.',
    matches: (arg) => arg.trimStart().startsWith('renderChild('),
  },
  {
    name: 'a children passthrough',
    reason:
      'A value whose final access is `.children` (or the bare `children` prop) is '
      + 'the rendered HTML of what a parent nested inside this component. This is '
      + 'the shape the Slot / asChild path forwards, and the one CI\'s fixture '
      + 'regeneration absorbed once already.',
    matches: (arg) => {
      const t = arg.trim().replace(/\)+$/, '')
      return t === 'children' || t === '_p.children' || t.endsWith('.children')
    },
  },
  {
    name: 'an already-escaped value',
    reason:
      'Two wrappers double-escape: `&` becomes `&amp;amp;`. Exactly one layer is '
      + 'the invariant — see the `escapeLeafTextExpressions` removal, which existed '
      + 'only to compensate for emitters that skipped un-slotted expressions.',
    matches: (arg) => arg.trimStart().startsWith('escapeText('),
  },
]

const snapshots = readdirSync(SNAPSHOT_DIR)
  .filter((f) => f.endsWith('.client.js'))
  .sort()

describe('markup is never escapeText-wrapped in emitted client JS', () => {
  // A corpus that silently emptied would make every case below vacuous.
  test('the snapshot corpus is non-empty', () => {
    expect(snapshots.length).toBeGreaterThan(20)
  })

  for (const { name, reason, matches } of FORBIDDEN) {
    test(`never escapes ${name}`, () => {
      const violations: string[] = []
      for (const file of snapshots) {
        const code = readFileSync(join(SNAPSHOT_DIR, file), 'utf8')
        for (const arg of escapeTextArguments(code)) {
          if (matches(arg)) {
            const shown = arg.length > 90 ? `${arg.slice(0, 90)}…` : arg
            violations.push(`  ${file}: escapeText(${shown})`)
          }
        }
      }
      expect(
        violations,
        `Escaped ${name} in emitted client JS.\n\n${reason}\n\n`
          + `${violations.length} occurrence(s):\n${violations.join('\n')}\n\n`
          + 'Fix the compiler classification (`IRExpression.contentKind`), not the '
          + 'golden. Regenerating the golden makes this test pass while leaving the '
          + 'composition broken — that is the failure mode this test exists to stop.',
      ).toEqual([])
    })
  }
})
