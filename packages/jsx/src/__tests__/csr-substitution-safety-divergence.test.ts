/**
 * Regression tests for #2106: the templatePrimitives V2 widening (#2069)
 * let a call whose RAW callee is an identifier path
 * (`someModuleArray.includes(prop)`) pass `computeInlinability`'s Stage-2
 * classification (`classifyConstantInitial`, compute-inlinability.ts) —
 * e.g. via an adapter with a broad `acceptsTemplateCall` (Hono's SSR
 * runtime is a full JS engine, so it accepts any identifier-path callee).
 * That check runs on the RAW initializer text so it can still see
 * bridged prop args for the #1138 rejection.
 *
 * `populateCsrInlinable` (compute-inlinability.ts) re-runs the same
 * `isInlinableInTemplate` check on the CSR-*substituted* form, where the
 * module-scope array has already been literal-inlined
 * (`['plus','minus'].includes(name)`). The callee is no longer an
 * identifier path at all, so the adapter can't vouch for it, and the
 * bridged-arg rejection correctly fires — recorded as
 * `ctx.csrInlinable.get(name) === null`.
 *
 * Pre-fix, `unsafeLocalNames` (Stage-2-derived) didn't know about this
 * second, stricter refusal, so the CSR template emitter
 * (`generateCsrTemplate` / `transformExpr` in html-template.ts) found
 * neither a substitution (excluded by `csrInlinableConstantsFromCtx`,
 * which skips null entries) NOR an unsafe flag — the bare,
 * module-scope-invisible identifier leaked straight into the emitted
 * template text, throwing `ReferenceError` when the template function
 * actually ran. This is the same bug class (and same shape) as the real
 * repro in `ui/components/ui/icon`'s `linecap` constant.
 *
 * Fix: `generateCsrTemplate` (html-template.ts) folds `ctx.csrInlinable`'s
 * null verdicts into the unsafe-name set it uses internally
 * (`mergeCsrNullUnsafe`), so a name `populateCsrInlinable` refused is
 * always treated as unsafe at the CSR template layer, regardless of what
 * the looser Stage-2 check concluded elsewhere.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { extractTemplateBody } from './staged-ir/helpers'
import { RUNTIME_IMPORT_CANDIDATES } from '../ir-to-client-js/imports'

const onlyErrors = (errors: { severity?: string }[]) =>
  errors.filter((e) => e.severity === 'error')

/**
 * Compile `source` with `HonoAdapter` (broad `acceptsTemplateCall`, the
 * ingredient the real bug needs) and extract the CSR template's
 * back-tick body.
 */
function compileTemplateBody(source: string, fileName: string): { templateBody: string; clientJs: string; errors: string[] } {
  const result = compileJSX(source, fileName, { adapter: new HonoAdapter() })
  expect(onlyErrors(result.errors)).toHaveLength(0)
  const clientJs = result.files.find((f) => f.type === 'clientJs')!.content
  return { templateBody: extractTemplateBody(clientJs), clientJs, errors: result.errors.map((e) => e.code) }
}

/**
 * Evaluate an extracted CSR template body as a real template-literal
 * function, with every runtime helper the compiler might reference
 * stubbed out. Mirrors what `hydrate()` does at runtime, minus the DOM.
 */
function evalTemplate(templateBody: string, props: Record<string, unknown>): string {
  const helperNames = [...RUNTIME_IMPORT_CANDIDATES]
  const stubs = helperNames.map((name) => {
    if (name === 'escapeAttr' || name === 'escapeText' || name === 'styleToCss') {
      return (v: unknown) => String(v)
    }
    return (..._args: unknown[]) => ''
  })
  // eslint-disable-next-line no-new-func
  const fn = new Function('_p', ...helperNames, `return \`${templateBody}\``)
  return fn(props, ...stubs)
}

describe('CSR template: Stage-2 / post-substitution inline-safety divergence (#2106)', () => {
  test('a const whose RAW form is adapter-accepted but whose CSR-substituted form is refused falls back to undefined, not a bare identifier', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const buttLinecapIcons = ['plus', 'minus']

      export function CsrNullDivergence({ name }: { name: string }) {
        const [count] = createSignal(0)
        const linecap = (buttLinecapIcons).includes(name) ? 'butt' : 'round'
        return <div data-linecap={linecap}>{count()}</div>
      }
    `
    const { templateBody } = compileTemplateBody(source, 'CsrNullDivergence.tsx')

    // (a) No bare `linecap` identifier anywhere in the template body.
    // Excludes the HTML attribute name text `data-linecap="` (preceded by
    // `-`, not a real identifier reference) from the check.
    expect(templateBody).not.toMatch(/(?<![-.\w$])linecap(?![\w$])/)

    // (c) The fallback is the spec'd null-guarded `undefined` shape
    // (`(undefined) != null ? '...' : ''`), the same fallback every other
    // unsafe-template-scope reference degrades to (html-template.ts's
    // `templateAttrExpr` generic path).
    expect(templateBody).toMatch(/\(undefined\)\s*!=\s*null/)

    // (b) Evaluating the template with stub runtime helpers must not
    // throw `ReferenceError: linecap is not defined` — the pre-fix
    // manifestation of this bug.
    let rendered = ''
    expect(() => { rendered = evalTemplate(templateBody, { name: 'plus', size: 'md', className: '' }) }).not.toThrow()

    // The dropped-attribute fallback: SSR/CSR-initial HTML omits the
    // attribute entirely rather than emitting a bogus value.
    expect(rendered).not.toContain('linecap=')
  })

  test('control: a plain object-literal lookup (no call involved) still inlines through the same CSR path', () => {
    // Guards against over-suppression: the fix must only affect names
    // `ctx.csrInlinable` actually refused (`=== null`), not every const
    // whose value happens to reference a module-scope constant.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      const sizeMap: Record<string, string> = { sm: 'h-4', md: 'h-6' }

      export function CsrStillInlines({ size }: { size: string }) {
        const [count] = createSignal(0)
        const cls = sizeMap[size]
        return <div data-cls={cls}>{count()}</div>
      }
    `
    const { templateBody } = compileTemplateBody(source, 'CsrStillInlines.tsx')

    // No bare `cls` identifier left in the template — it was inlined.
    expect(templateBody).not.toMatch(/(?<![-.\w$])cls(?![\w$])/)
    // The module-scope object literal was substituted in place of `sizeMap`,
    // and the prop was correctly bridged to `_p.size` — not marked unsafe.
    expect(templateBody).toContain(`{ sm: 'h-4', md: 'h-6' })[_p.size]`)
    expect(templateBody).not.toContain('undefined')
  })
})
