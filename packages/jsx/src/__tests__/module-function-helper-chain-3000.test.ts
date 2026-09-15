/**
 * Regression tests for #3000: a module-top-level helper declared as
 * `function name(params) { ... }` that calls ANOTHER module-top-level
 * `function` helper (not itself, not any component-scope name) is safe to
 * reference from a component's CSR template lambda by bare name. This is
 * the function-declaration analog of #2988 (arrow-valued module consts).
 *
 * Pre-fix, `compute-inlinability.ts`'s `functionReferencesDeclaredName`
 * flagged a module-scope function unsafe if it referenced ANY name in
 * `graph.declaredNames` — every local const/function/signal/prop — not
 * just names that are themselves unsafe. `fmt` calling `inner` (itself a
 * safe module-scope helper) tripped that check even though both would
 * correctly land at true module scope per `compute-scope.ts`'s own
 * forward-reachability fixpoint — so the CSR-emitted template lambda
 * substituted `${''}` for the `fmt(label)` slot instead of referencing
 * `fmt` by name.
 *
 * The fix has `computeInlinability`'s function loop read `functionScope`
 * from the same `computeDeclarationScopes(ctx, graph)` call #2998 already
 * added for constants, instead of re-deriving an independent (and more
 * conservative) verdict — closing out the "one producer, three
 * consumers" restructuring #2988's issue body proposed for constants and
 * functions alike.
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

/** Module-level declarations sit between the import line and
 *  `export function init<Name>` in the compiled bundle. The template
 *  lambda runs at real module scope in production, closing over these
 *  by normal JS scoping — reproduce that here instead of leaving them
 *  undeclared in the sandbox. */
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

describe('CSR template: module-scope function calling another module-scope function (#3000)', () => {
  test('a module function helper that calls another module function helper renders its real value, not an empty seed', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function inner(s: string) { return s.toUpperCase() }
      function fmt(s: string) { return inner(s) }

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

    // Both helpers are referenced by bare name in the template (wrapped
    // in relocate/CSR-substitution parens, so match on the word boundary
    // rather than the literal call-site text), not substituted away as
    // an unsafe/empty fallback.
    expect(/\bfmt\b/.test(templateBody)).toBe(true)
    expect(templateBody).not.toBe('')

    const html = evalTemplate(templateBody, { label: 'hi' }, extractModulePreamble(clientJs))
    expect(html).toContain('HI')
    expect(html).not.toContain('undefined')
  })

  test('the arrow-const form of the same two-hop helper chain renders identically (parity check with #2988)', () => {
    const functionSource = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function inner(s: string) { return s.toUpperCase() }
      function fmt(s: string) { return inner(s) }
      export function Widget({ label }: { label: string }) {
        const [count] = createSignal(0)
        return <div>{fmt(label)}{count()}</div>
      }
    `
    const arrowSource = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const inner = (s: string) => s.toUpperCase()
      const fmt = (s: string) => inner(s)
      export function Widget({ label }: { label: string }) {
        const [count] = createSignal(0)
        return <div>{fmt(label)}{count()}</div>
      }
    `
    const fn = compileTemplateBody(functionSource, 'FunctionChainWidget.tsx')
    const arrow = compileTemplateBody(arrowSource, 'ArrowChainWidget.tsx')

    const fnHtml = evalTemplate(fn.templateBody, { label: 'hi' }, extractModulePreamble(fn.clientJs))
    const arrowHtml = evalTemplate(arrow.templateBody, { label: 'hi' }, extractModulePreamble(arrow.clientJs))

    expect(fnHtml).toBe(arrowHtml)
    expect(fnHtml).toContain('HI')
  })

  test('a module function that calls a helper reading a signal stays template-unsafe (no over-widening)', () => {
    // `fmt` here transitively references the module-scope-invisible
    // signal getter `count` (via `inner`), so both must stay classified
    // unsafe — the fixpoint must demote them to 'init' scope exactly
    // like a single module-scope function that touches component
    // internals directly already is.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function inner(s: string) { return \`\${s}-\${count()}\` }
      function fmt(s: string) { return inner(s) }

      export function Widget({ label }: { label: string }) {
        const [count, setCount] = createSignal(0)
        return <div>{fmt(label)}</div>
      }
    `
    const { templateBody } = compileTemplateBody(source, 'UnsafeChainWidget.tsx')
    // Falls back to the empty-slot sentinel, same as the pre-existing
    // behavior for any function that genuinely can't be hoisted to
    // module scope — NOT a bare `fmt(...)` reference (which would
    // ReferenceError: `fmt` never gets a module-level declaration for
    // this shape).
    expect(templateBody).not.toContain('fmt(')
  })

  test('a three-hop module function chain resolves the same fixpoint transitively', () => {
    // `outer` -> `mid` -> `inner`, none touching component internals.
    // Exercises resolve-by-name for a chain longer than one hop, not just
    // the direct two-function case above. Since none of the three
    // transitively reference an init-required name, all three land on
    // `'module'` via the fixpoint's trailing "survivors are module"
    // assignment on the very first pass (`changed` never flips `true`) —
    // this is coverage for the 3-hop resolve-by-name behavior, not for
    // multi-round fixpoint iteration specifically (that would need at
    // least one hop to genuinely demote before a later pass re-checks a
    // caller of it).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function inner(s: string) { return s.toUpperCase() }
      function mid(s: string) { return inner(s) }
      function outer(s: string) { return mid(s) }

      export function Widget({ label }: { label: string }) {
        const [count] = createSignal(0)
        return <div>{outer(label)}{count()}</div>
      }
    `
    const { templateBody, clientJs } = compileTemplateBody(source, 'ThreeHopWidget.tsx')
    expect(/\bouter\b/.test(templateBody)).toBe(true)

    const html = evalTemplate(templateBody, { label: 'hi' }, extractModulePreamble(clientJs))
    expect(html).toContain('HI')
    expect(html).not.toContain('undefined')
  })
})
