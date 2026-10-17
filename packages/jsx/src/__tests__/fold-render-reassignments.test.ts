import { describe, expect, test } from 'bun:test'
import { foldRenderReassignmentsInSource } from '../fold-render-reassignments.ts'

/**
 * A `let`'s render-time reassignments fold into its initializer (#3501), so
 * every stage reads the one value the binding holds when the component
 * returns. Only side-effect-free reassignments that directly follow the
 * declaration fold; anything else is left as written.
 */
function fold(body: string): string | null {
  const out = foldRenderReassignmentsInSource(`export function S(props: { label?: string }) {\n${body}\n  return <p>{label}</p>\n}\n`, 'S.tsx')
  return out === null ? null : out.split('\n').slice(1, -3).join('\n')
}

describe('foldRenderReassignmentsInSource', () => {
  test('an `if` reassignment becomes a conditional over the value so far', () => {
    const [decl, removed] = fold("  let label = props.label ?? 'Default'\n  if (!label) label = 'Fallback'")!.split('\n')
    expect(decl).toBe("  const label_1 = props.label ?? 'Default'; let label = ((!(label_1)) ? ('Fallback') : (label_1))")
    expect(removed!.trim()).toBe('')
  })

  test('`if`/`else`, blocks and compound assignments fold in order', () => {
    const out = fold("  let label = 'a'\n  if (props.label) { label = props.label } else { label += '!' }\n  label ??= 'z'")
    expect(out?.split('\n')[0]).toBe(
      "  const label_1 = ((props.label) ? (props.label) : ((('a') + ('!')))); let label = ((label_1) ?? ('z'))",
    )
  })

  test('removed statements keep their lines, so later locations stay valid', () => {
    const body = "  let label = 'a'\n  if (props.label) {\n    label = 'b'\n  }"
    expect(fold(body)?.split('\n').length).toBe(body.split('\n').length)
  })

  test('a computed value read twice on one path inside a statement is not folded', () => {
    expect(fold("  let label = 'a'\n  if (props.label) { label = props.label; label = label + label }")).toBeNull()
  })

  test('a reassignment with a side effect is not folded', () => {
    expect(fold("  let label = 'a'\n  if (check()) label = 'b'")).toBeNull()
    expect(fold("  let label = 'a'\n  label = make()")).toBeNull()
  })

  test('a reassignment after an unrelated statement is not folded', () => {
    expect(fold("  let label = 'a'\n  console.log(label)\n  label = 'b'")).toBeNull()
  })

  test('a reassignment in a loop is not folded', () => {
    expect(fold("  let label = 'a'\n  for (const t of [1]) label = 'b'")).toBeNull()
  })

  test('a `const` and a `let` with no reassignment are left as written', () => {
    expect(fold("  const label = 'a'")).toBeNull()
    expect(fold("  let label = 'a'")).toBeNull()
  })
})

/**
 * The folded source evaluates every expression as often, and in the same
 * order, as the original: a getter on the props object observes the same
 * reads and the binding ends with the same value.
 */
describe('folding preserves evaluation', () => {
  const bodies = [
    "let label = props.label ?? 'Default'\n  if (!label) label = 'Fallback'",
    'let label = props.label\n  if (label) label = 0',
    "let label = props.label\n  if (props.label) { label = props.label } else { label += '!' }\n  label ??= 'z'",
    "let label = 'a'\n  if (props.label) { label = props.label; label += '!' }",
  ]
  const run = (source: string, values: unknown[]) => {
    const log: unknown[] = []
    let k = 0
    const props = {
      get label() {
        const v = values[k++ % values.length]
        log.push(v)
        return v
      },
    }
    const fn = new Function('props', source.slice(source.indexOf('{') + 1, source.lastIndexOf('}')))
    return { value: fn(props), log }
  }
  for (const body of bodies) {
    for (const values of [[undefined], [''], ['x'], [0, 1, 2]]) {
      test(`${JSON.stringify(body)} with label reads ${JSON.stringify(values)}`, () => {
        const original = `function S(props) {\n  ${body}\n  return label\n}\n`
        const folded = foldRenderReassignmentsInSource(original, 'S.js')
        expect(folded).not.toBeNull()
        expect(run(folded!, values)).toEqual(run(original, values))
      })
    }
  }
})
