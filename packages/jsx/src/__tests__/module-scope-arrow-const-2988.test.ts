/**
 * Regression tests for #2988: a module-top-level helper declared as
 * `const name = (params) => expr` (arrow form) that closes over nothing
 * but its own parameters is safe to reference from a component's CSR
 * template lambda by bare name — same as the equivalent
 * `function name(params) { ... }` declaration form. Pre-fix,
 * `compute-inlinability.ts`'s `classifyConstantInitial` returned
 * `arrow-literal` (template-unsafe) for EVERY arrow-valued constant
 * unconditionally, ignoring `isModule` entirely — so the CSR-emitted
 * template lambda substituted `${''}` for the slot instead of the real
 * value, even though `compute-scope.ts` had no equivalent
 * forward-reachability fixpoint for constants either (it fell straight
 * to `'init'` scope, disagreeing with `relocate.ts`'s independent
 * `'module-local'` classification, which reads only the raw `isModule`
 * flag).
 *
 * The fix folds arrow-valued module constants into the SAME
 * forward-reachability fixpoint `compute-scope.ts` already runs for
 * module-level functions, and has `compute-inlinability.ts` read that
 * one answer (via a fresh, pure call to `computeDeclarationScopes`)
 * instead of re-deriving an independent verdict.
 *
 * These tests exercise `compileJSX` — the same entry point
 * `@barefootjs/vite`'s plugin and `packages/adapter-tests/src/csr-render.ts`
 * call — and evaluate the extracted CSR template body as a real
 * template-literal function, mirroring what `hydrate()` does at runtime
 * (minus the DOM). This is the closest unit-level stand-in for the real
 * pipeline: `compileJSX` performs the exact analysis → compute-scope →
 * compute-inlinability → html-template sequence `generateClientJsWithSourceMap`
 * runs in production (`packages/jsx/src/ir-to-client-js/generate-init.ts`
 * L66-73), with nothing mocked.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { extractTemplateBody } from './staged-ir/helpers'
import { RUNTIME_IMPORT_CANDIDATES } from '../ir-to-client-js/imports'

const onlyErrors = (errors: { severity?: string }[]) =>
  errors.filter((e) => e.severity === 'error')

function compileTemplateBody(source: string, fileName: string): { templateBody: string; clientJs: string } {
  const result = compileJSX(source, fileName, { adapter: new HonoAdapter() })
  expect(onlyErrors(result.errors)).toHaveLength(0)
  const clientJs = result.files.find((f) => f.type === 'clientJs')!.content
  return { templateBody: extractTemplateBody(clientJs), clientJs }
}

/** Module-level declarations (`var fmt = fmt ?? (...)`, etc.) sit
 *  between the import line and `export function init<Name>` in the
 *  compiled bundle. The template lambda runs at real module scope in
 *  production, closing over these by normal JS scoping — reproduce
 *  that here instead of leaving them undeclared in the sandbox. */
function extractModulePreamble(clientJs: string): string {
  const m = clientJs.match(/\n\n([\s\S]*?)\nexport function init\w+/)
  return m ? m[1] : ''
}

/** Evaluate an extracted CSR template body as a real template-literal
 *  function, with every runtime helper the compiler might reference
 *  stubbed to identity/no-op, and the compiled bundle's module-level
 *  declarations (if any) in scope. Mirrors `hydrate()` minus the DOM. */
function evalTemplate(templateBody: string, props: Record<string, unknown>, modulePreamble = ''): string {
  const helperNames = [...RUNTIME_IMPORT_CANDIDATES]
  const stubs = helperNames.map((name) => {
    if (name === 'escapeAttr' || name === 'escapeText' || name === 'escapeTextOrMarkup' || name === 'styleToCss') {
      return (v: unknown) => String(v)
    }
    return (..._args: unknown[]) => ''
  })
  // eslint-disable-next-line no-new-func
  const fn = new Function('_p', ...helperNames, `${modulePreamble}\nreturn \`${templateBody}\``)
  return fn(props, ...stubs)
}

describe('CSR template: module-scope arrow-valued const helper (#2988)', () => {
  test('an arrow-valued module const applied to a prop renders its real value, not an empty seed', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const fmt = (s: string) => s.toUpperCase()

      export function Widget({ label }: { label: string }) {
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <span>{fmt(label)}</span>
            <button onClick={() => setCount(count() + 1)}>{count()}</button>
          </div>
        )
      }
    `
    const { templateBody, clientJs } = compileTemplateBody(source, 'Widget.tsx')

    // The module-level declaration is emitted once, parenthesised on
    // the right of `??` (an arrow function is NOT a valid `??` operand
    // unwrapped — `x ?? (s) => …` is a SyntaxError).
    expect(clientJs).toContain('var fmt = fmt ?? ((s) => s.toUpperCase())')

    // `fmt` is referenced by bare name in the template (wrapped in
    // relocate/CSR-substitution parens, so match on the word boundary
    // rather than the literal call-site text), not substituted away as
    // an unsafe/empty fallback.
    expect(/\bfmt\b/.test(templateBody)).toBe(true)
    expect(templateBody).not.toBe('')

    const html = evalTemplate(templateBody, { label: 'hi' }, extractModulePreamble(clientJs))
    expect(html).toContain('HI')
    expect(html).not.toContain('undefined')
  })

  test('the function-declaration form of the same helper renders identically (parity check)', () => {
    const arrowSource = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const fmt = (s: string) => s.toUpperCase()
      export function Widget({ label }: { label: string }) {
        const [count] = createSignal(0)
        return <div>{fmt(label)}{count()}</div>
      }
    `
    const functionSource = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function fmt(s: string) { return s.toUpperCase() }
      export function Widget({ label }: { label: string }) {
        const [count] = createSignal(0)
        return <div>{fmt(label)}{count()}</div>
      }
    `
    const arrow = compileTemplateBody(arrowSource, 'ArrowWidget.tsx')
    const fn = compileTemplateBody(functionSource, 'FunctionWidget.tsx')

    const arrowHtml = evalTemplate(arrow.templateBody, { label: 'hi' }, extractModulePreamble(arrow.clientJs))
    const fnHtml = evalTemplate(fn.templateBody, { label: 'hi' }, extractModulePreamble(fn.clientJs))

    expect(arrowHtml).toBe(fnHtml)
    expect(arrowHtml).toContain('HI')
  })

  test('an arrow-valued module const that reads a signal stays template-unsafe (no over-widening)', () => {
    // `fmt` here closes over the module-scope-invisible signal getter
    // `count`, so it must stay classified unsafe — #2988's fixpoint
    // must demote it to 'init' scope exactly like a module-scope
    // FUNCTION that touches component internals already is.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const fmt = (s: string) => \`\${s}-\${count()}\`

      export function Widget({ label }: { label: string }) {
        const [count, setCount] = createSignal(0)
        return <div>{fmt(label)}</div>
      }
    `
    const { templateBody } = compileTemplateBody(source, 'UnsafeWidget.tsx')
    // Falls back to the empty-slot sentinel, same as pre-#2988 behavior
    // for any const that genuinely can't be hoisted to module scope —
    // NOT a bare `fmt(...)` reference (which would ReferenceError: `fmt`
    // never gets a module-level declaration for this shape).
    expect(templateBody).not.toContain('fmt(')
  })

  test('a component-scope (non-module) arrow const of the same shape stays template-unsafe', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Widget({ label }: { label: string }) {
        const [count, setCount] = createSignal(0)
        const fmt = (s: string) => s.toUpperCase()
        return <div>{fmt(label)}{count()}</div>
      }
    `
    const { templateBody } = compileTemplateBody(source, 'LocalArrowWidget.tsx')
    expect(templateBody).not.toContain('fmt(')
  })
})
