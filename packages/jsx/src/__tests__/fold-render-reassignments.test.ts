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
    expect(decl).toBe("  let label = ((!(props.label ?? 'Default')) ? ('Fallback') : (props.label ?? 'Default'))")
    expect(removed!.trim()).toBe('')
  })

  test('`if`/`else`, blocks and compound assignments fold in order', () => {
    const out = fold("  let label = 'a'\n  if (props.label) { label = props.label } else { label += '!' }\n  label ??= 'z'")
    expect(out?.split('\n')[0]).toBe("  let label = ((((props.label) ? (props.label) : ((('a') + ('!'))))) ?? ('z'))")
  })

  test('removed statements keep their lines, so later locations stay valid', () => {
    const body = "  let label = 'a'\n  if (props.label) {\n    label = 'b'\n  }"
    expect(fold(body)?.split('\n').length).toBe(body.split('\n').length)
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
