/**
 * #2960 — `addCondAttrToTemplate`'s `isSingleRootElement` heuristic
 * mis-classified a multi-root ternary branch as a single element root
 * whenever its LAST element happened to share its FIRST element's tag
 * name (`<div>...</div><div>...</div>`): the check was "does the string
 * end with a closing tag of the root's own tag name", which a second,
 * unrelated sibling of the same tag name satisfies just as well as a
 * genuine single root's own closing tag.
 *
 * Compiled wrong, this stamps `bf-c="<id>"` onto only the first element
 * instead of comment-wrapping the whole branch — which routes the
 * runtime's branch swap through `insert()`'s `updateElementConditional`
 * (`fragment.firstChild`-only) instead of `updateFragmentConditional`
 * (which moves every top-level node), silently dropping every sibling
 * but the first on a live branch swap.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { addCondAttrToTemplate } from '../ir-to-client-js/html-template'

const adapter = new TestAdapter()

describe('#2960: multi-root cond branch whose roots share a tag name', () => {
  test('comment-wraps a same-tag-name multi-root branch instead of stamping bf-c on only the first element', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Repro() {
        const [open, setOpen] = createSignal(false)
        return (
          <div>
            <button onClick={() => setOpen(true)}>open</button>
            {open() === false ? (
              <div id="welcome">Welcome</div>
            ) : (
              <>
                <div id="before">before</div>
                <div id="after">after</div>
              </>
            )}
          </div>
        )
      }
    `

    const result = compileJSX(source, 'Repro.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()

    // The multi-root branch must be comment-wrapped ...
    expect(clientJs!.content).toContain('bf-cond-start:')
    expect(clientJs!.content).toContain('bf-cond-end:')
    // ... and BOTH of its sibling elements must appear inside the
    // template literal, not just the first one.
    expect(clientJs!.content).toMatch(/id=\\?"before\\?"/)
    expect(clientJs!.content).toMatch(/id=\\?"after\\?"/)
  })

  test('a genuine single-root branch (no same-tag sibling) still gets bf-c, not comment markers', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Simple() {
        const [on, setOn] = createSignal(false)
        return <div>{on() ? <span id="a">A</span> : <span id="b">B</span>}</div>
      }
    `

    const result = compileJSX(source, 'Simple.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('bf-c=')
    expect(clientJs!.content).not.toContain('bf-cond-start:')
  })

  // The depth-tracking fix above must not widen which shapes are treated
  // as "single root" beyond what the sibling `bf-c` splice regex
  // (`html.replace(/^(<\w+)(\s|>)/, ...)`) can actually stamp — a
  // self-closing root's own `/` or a hyphenated custom-element tag name
  // both fail that splice. Every one of these must still come back
  // comment-wrapped (never bare, unmodified HTML with neither `bf-c` nor
  // markers, which would make `insert()` unable to find the branch at all).
  describe('does not widen single-root detection into shapes the bf-c splice cannot stamp', () => {
    const unstampable = [
      ['<input/>', 'self-closing void element root'],
      ['<my-widget>a</my-widget>', 'hyphenated custom-element root'],
      ['<my-widget>a</my-widget><my-widget>b</my-widget>', 'multi-root, same hyphenated tag'],
    ] as const

    for (const [html, label] of unstampable) {
      test(label, () => {
        const result = addCondAttrToTemplate(html, 'c1')
        expect(result).toContain('bf-cond-start:c1')
        expect(result).toContain('bf-cond-end:c1')
      })
    }
  })

  // The depth-tracking walk must not treat BarefootJS's own marker
  // comments (`<!--bf:sN-->`, its `<!--/-->` pair) as if they were real
  // tags — an earlier version of this fix's tag-matching regex matched
  // any `<...>` run indiscriminately, so a perfectly ordinary single-root
  // branch with an internal reactive text slot got miscounted into an
  // unbalanced depth and wrongly comment-wrapped instead of getting
  // `bf-c`. Caught by `doc-examples.test.ts`'s snapshot drifting on the
  // `count() > 0 ? <p>...</p> : <p>No items</p>` example.
  test('a single root containing internal bf: slot marker comments still gets bf-c, not comment-wrap', () => {
    const html = '<p bf="s2"><!--bf:s1-->${__bfSlot(count(), __slots)}<!--/--> items</p>'
    const result = addCondAttrToTemplate(html, 's0')
    expect(result).toContain('bf-c="s0"')
    expect(result).not.toContain('bf-cond-start:')
  })
})
