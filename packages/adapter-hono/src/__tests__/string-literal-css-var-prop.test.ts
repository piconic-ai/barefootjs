/**
 * Hono adapter: string-literal props containing JS-shaped values (#135).
 *
 * A JSX string attribute like `fill="var(--area-fill)"` is an SVG
 * presentation attribute whose value happens to look like a JS function
 * call. The old adapter used a regex (`isJsExpression`) to disambiguate
 * string literals from arrow / call expressions and tripped on values
 * shaped like `var(...)`, `url(...)`, or `calc(...)`, emitting them as
 * `fill={var(--area-fill)}` — `var` is then parsed as a JS identifier
 * and the build fails with "Unexpected var".
 *
 * The IR's `isLiteral` flag is the authoritative source of truth here,
 * so the adapter now short-circuits on it before falling back to the
 * regex.
 *
 * Surfaced by the area chart palette demo (#135 Concrete Additions).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter'

const adapter = new HonoAdapter()

describe('string-literal component prop containing CSS function-shape (#135)', () => {
  test('fill="var(--x)" survives as a string literal in the marked template', () => {
    const source = `
      function Area(props: { fill: string }) {
        return <path d="M0 0" fill={props.fill} />
      }

      export function Demo() {
        return <Area fill="var(--area-fill)" />
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const template = result.files.find((f) => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    const content = template!.content

    // Must emit the string literal verbatim — NOT as a JS expression
    expect(content).toContain('fill="var(--area-fill)"')
    expect(content).not.toContain('fill={var(--area-fill)}')
  })

  test('stroke="url(#grad)" survives as a string literal', () => {
    const source = `
      function S(props: { stroke: string }) {
        return <line x1="0" y1="0" x2="10" y2="10" stroke={props.stroke} />
      }

      export function Demo() {
        return <S stroke="url(#grad)" />
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'markedTemplate')!.content

    expect(content).toContain('stroke="url(#grad)"')
    expect(content).not.toContain('stroke={url(#grad)}')
  })

  test('arrow-function expression prop is still emitted as a JS expression', () => {
    // Regression guard — the JS-expression branch must remain reachable
    // for non-literal values (the case `isJsExpression` was added for).
    const source = `
      function B(props: { onClick: (e: Event) => void }) {
        return <button onClick={props.onClick} />
      }

      export function Demo() {
        return <B onClick={() => 1} />
      }
    `
    const result = compileJSX(source, 'Demo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'markedTemplate')!.content

    expect(content).toContain('onClick={() => 1}')
  })
})
