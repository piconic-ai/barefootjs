/**
 * Regression for #1100: a local `const`/memo whose name matches a property
 * read off a `useContext()` value (e.g. local `bars` while the body also
 * calls `ctx.bars()`) used to corrupt the CSR template that the compiler
 * embeds inside `hydrate(name, { template })`.
 *
 * The corruption was a textual rewrite that did not respect member access:
 *   - `ctx` was inlined to `(useContext(Context))`
 *   - then `bars()` was matched again — even after the new `.` — and replaced
 *     a second time, producing `(useContext(Context)).<memo body IIFE>()`,
 *     which is not valid JavaScript.
 *
 * The fix is to make the signal-getter and memo-name regex replacements
 * skip member accesses (negative lookbehind for `.` / `-`), the same way
 * `inlinableConstants` already does at the call site in html-template.ts.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'

const onlyErrors = (errors: { severity?: string }[]) =>
  errors.filter((e) => e.severity === 'error')

/**
 * Extract the back-tick template that follows `template:` in the emitted
 * `hydrate(name, { ..., template: `...` })` call. The template body itself
 * may contain nested template literals (loop bodies emit their own
 * back-tick string), so this scanner tracks back-tick depth via the
 * standard JS template-literal grammar:
 *   - `\`` opens a template; another `\`` at the same depth closes it
 *   - `${` inside a template opens an expression context where another
 *     `\`` increases depth
 *   - `}` returns to template context only when balanced against `${`
 */
const findTemplateLiteral = (clientJs: string): string => {
  const idx = clientJs.indexOf('template:')
  expect(idx).toBeGreaterThanOrEqual(0)
  const start = clientJs.indexOf('`', idx)
  expect(start).toBeGreaterThanOrEqual(0)
  let i = start + 1
  // Stack of contexts: 'tpl' = inside template, 'expr' = inside ${...}
  const stack: Array<'tpl' | 'expr'> = ['tpl']
  // Brace counter for the current expr frame; one per 'expr' on the stack.
  const braceCounts: number[] = []
  while (i < clientJs.length) {
    const ch = clientJs[i]
    const top = stack[stack.length - 1]
    if (top === 'tpl') {
      if (ch === '\\') { i += 2; continue }
      if (ch === '`') {
        stack.pop()
        if (stack.length === 0) return clientJs.slice(start, i + 1)
        i++
        continue
      }
      if (ch === '$' && clientJs[i + 1] === '{') {
        stack.push('expr')
        braceCounts.push(0)
        i += 2
        continue
      }
      i++
    } else {
      // expr context: skip strings, count braces
      if (ch === '\\') { i += 2; continue }
      if (ch === '`') { stack.push('tpl'); i++; continue }
      if (ch === "'" || ch === '"') {
        const quote = ch
        i++
        while (i < clientJs.length && clientJs[i] !== quote) {
          if (clientJs[i] === '\\') i += 2
          else i++
        }
        i++
        continue
      }
      if (ch === '{') { braceCounts[braceCounts.length - 1]++; i++; continue }
      if (ch === '}') {
        if (braceCounts[braceCounts.length - 1] === 0) {
          stack.pop()
          braceCounts.pop()
          i++
          continue
        }
        braceCounts[braceCounts.length - 1]--
        i++
        continue
      }
      i++
    }
  }
  throw new Error('unterminated template literal')
}

describe('CSR template: shadowed ctx.<method>() (#1100)', () => {
  test('local memo `bars` does not corrupt ctx.bars() in the template', () => {
    const source = `
      'use client'
      import { createMemo, useContext } from '@barefootjs/client'
      import { BarChartContext } from './bar-chart-context'

      export function Bar(props) {
        const ctx = useContext(BarChartContext)

        const bars = createMemo(() => {
          const xs = ctx.xScale()
          const ys = ctx.yScale()
          if (!xs || !ys) return []
          const allBars = ctx.bars()
          return allBars
        })

        return (
          <g class="bar">
            {bars().map((b, i) => (
              <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} />
            ))}
          </g>
        )
      }
    `
    const result = compileJSX(source, 'Bar.tsx', { adapter: new HonoAdapter() })
    expect(onlyErrors(result.errors)).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const tpl = findTemplateLiteral(clientJs!.content)

    // The bug emitted `(useContext(BarChartContext)).((() => {...})())`
    // — a `.` followed immediately by a `(` is the smoking gun.
    expect(tpl).not.toMatch(/\)\)\.\(\(/)
    expect(tpl).not.toMatch(/\)\)\.\(/)

    // The correct rewrite preserves the property access. `ctx` is bound
    // once per template evaluation (#4021), so the access reads the binding.
    expect(tpl).toContain('(__bf_const_ctx).bars()')
    expect(tpl).toContain(')((useContext(BarChartContext)))')

    // And the embedded template literal must parse as valid JavaScript.
    expect(() => new Function(`return ${tpl}`)).not.toThrow()
  })

  test('local signal getter shadowed by a ctx method survives intact', () => {
    const source = `
      'use client'
      import { createSignal, useContext } from '@barefootjs/client'
      import { CountContext } from './count-context'

      export function Counter(props) {
        const ctx = useContext(CountContext)
        const [count, setCount] = createSignal(0)
        return <div>{ctx.count()} / {count()}</div>
      }
    `
    const result = compileJSX(source, 'Counter.tsx', { adapter: new HonoAdapter() })
    expect(onlyErrors(result.errors)).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const tpl = findTemplateLiteral(clientJs!.content)

    // ctx.count() must remain a member call, not be replaced with the signal's
    // initial value. The local `count()` getter inlines to `(0)`.
    // `ctx` is bound once per template evaluation (#4021).
    expect(tpl).toContain('(__bf_const_ctx).count()')
    expect(tpl).toContain(')((useContext(CountContext)))')
    expect(tpl).not.toMatch(/\)\)\.\(0\)/)
    expect(tpl).not.toMatch(/\)\.\(0\)/)
    expect(() => new Function(`return ${tpl}`)).not.toThrow()
  })
})
