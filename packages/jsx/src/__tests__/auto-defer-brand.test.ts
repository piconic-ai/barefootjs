/**
 * Auto-defer of reactive brand-package bindings (#1638).
 *
 * Controlled bindings to `@barefootjs/form` state — `value={field.value()}`,
 * `disabled={form.isSubmitting()}`, `{field.error() && …}` — read per-instance
 * init-scope state (`createForm` calls `createSignal` internally) that the
 * module-scope SSR template lambda cannot evaluate. Previously each binding
 * raised BF061 and forced a manual `/* @client *​/`. The compiler now treats
 * such reads as implicitly client-only: the SSR template skips them and a
 * hydrate-time effect applies the value — exactly what `/* @client *​/` did.
 *
 * These tests need a real TypeChecker that resolves the `Reactive<T>` brand,
 * so they build a ts.Program with virtual form-library type defs and inject
 * it into `compileJSX` (the brand is invisible to the regex fallback).
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import path from 'path'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { extractTemplateBody, extractInitBody } from './staged-ir/helpers'

const adapter = new TestAdapter()

const FORM_DEFS = `
  export type Reactive<T> = T & { readonly __reactive: true };
  export type Memo<T> = Reactive<() => T>;

  export interface FieldReturn<V> {
    value: Reactive<() => V>;
    error: Reactive<() => string>;
    setValue: (value: V) => void;
    handleInput: (e: Event) => void;
  }

  export interface FormReturn {
    field: (name: string) => FieldReturn<string>;
    isSubmitting: Reactive<() => boolean>;
    handleSubmit: (e: Event) => Promise<void>;
  }

  export declare function createForm(opts?: unknown): FormReturn;
`

interface BrandCompileResult {
  errors: string[]
  templateBody: string
  initBody: string
  clientJs: string
}

/**
 * Compile `componentSource` with a TypeChecker that resolves the form brand.
 * The component must `import { createForm } from './_form-defs'`.
 */
function compileWithBrand(componentSource: string): BrandCompileResult {
  const baseDir = path.resolve(__dirname)
  const componentPath = path.join(baseDir, '_brand-component.tsx')
  const defsPath = path.join(baseDir, '_form-defs.ts')

  const virtualFiles = new Map<string, string>([
    [componentPath, componentSource],
    [defsPath, FORM_DEFS],
  ])

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  }

  const defaultHost = ts.createCompilerHost(compilerOptions)
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(fileName, languageVersion) {
      const resolved = path.resolve(fileName)
      const content = virtualFiles.get(resolved)
      if (content !== undefined) {
        const kind = resolved.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        return ts.createSourceFile(fileName, content, languageVersion, true, kind)
      }
      return defaultHost.getSourceFile(fileName, languageVersion)
    },
    fileExists(fileName) {
      return virtualFiles.has(path.resolve(fileName)) || defaultHost.fileExists(fileName)
    },
    readFile(fileName) {
      return virtualFiles.get(path.resolve(fileName)) ?? defaultHost.readFile(fileName)
    },
  }

  const program = ts.createProgram([componentPath], compilerOptions, host)
  const result = compileJSX(componentSource, componentPath, { adapter, program })
  const clientJs = result.files.find((f) => f.type === 'clientJs')?.content ?? ''
  return {
    errors: result.errors.map((e) => `[${e.code}] ${e.message}`),
    templateBody: extractTemplateBody(clientJs),
    initBody: extractInitBody(clientJs),
    clientJs,
  }
}

describe('auto-defer brand-package reactive bindings (#1638)', () => {
  test('sanity: the injected program resolves the Reactive<T> brand', () => {
    // If the brand did not resolve, the regex fallback would not flag
    // `email.value()` reactive and nothing below would be meaningful.
    const { errors } = compileWithBrand(`
      'use client'
      import { createForm } from './_form-defs'

      export function Probe() {
        const form = createForm()
        const email = form.field('email')
        return <input value={email.value()} />
      }
    `)
    // No BF050 (we supplied a program) and, crucially, no BF061.
    expect(errors.find((e) => e.startsWith('[BF061]'))).toBeUndefined()
  })

  test('element attribute `value={field.value()}` does not raise BF061', () => {
    const { errors, templateBody, initBody } = compileWithBrand(`
      'use client'
      import { createForm } from './_form-defs'

      export function SignupForm() {
        const form = createForm()
        const email = form.field('email')
        return <input value={email.value()} />
      }
    `)

    expect(errors.find((e) => e.startsWith('[BF061]'))).toBeUndefined()
    // SSR template must not carry the deferred attribute...
    expect(templateBody).not.toContain('value=')
    // ...but the element keeps a slot marker and init wires the value.
    expect(templateBody).toMatch(/bf="s\d+"/)
    expect(initBody).toMatch(/setAttribute\(['"]value['"]|\.value\s*=/)
  })

  test('multiple controlled bindings each defer (value + disabled)', () => {
    const { errors, templateBody } = compileWithBrand(`
      'use client'
      import { createForm } from './_form-defs'

      export function SignupForm() {
        const form = createForm()
        const email = form.field('email')
        return <input value={email.value()} disabled={form.isSubmitting()} />
      }
    `)

    expect(errors.find((e) => e.startsWith('[BF061]'))).toBeUndefined()
    expect(templateBody).not.toContain('value=')
    expect(templateBody).not.toContain('disabled=')
  })

  test('conditional condition `field.error() && <p/>` defers instead of BF061', () => {
    const { errors } = compileWithBrand(`
      'use client'
      import { createForm } from './_form-defs'

      export function SignupForm() {
        const form = createForm()
        const email = form.field('email')
        return (
          <form>
            <input value={email.value()} />
            {email.error() && <p>{email.error()}</p>}
          </form>
        )
      }
    `)

    expect(errors.find((e) => e.startsWith('[BF061]'))).toBeUndefined()
    expect(errors.find((e) => e.startsWith('[BF060]'))).toBeUndefined()
  })

  test('native createSignal getter is NOT deferred (keeps SSR value)', () => {
    // Same component imports the brand package (so a TypeChecker is present),
    // but `count()` is a real signal with a derivable initial value — it must
    // keep rendering server-side, not get stripped to a hydrate-only binding.
    const { templateBody } = compileWithBrand(`
      'use client'
      import { createForm } from './_form-defs'
      import { createSignal } from '@barefootjs/client'

      export function Mixed() {
        const form = createForm()
        const [count, setCount] = createSignal(0)
        return <input data-count={count()} />
      }
    `)

    // The signal-backed attribute is still emitted into the SSR template.
    expect(templateBody).toContain('data-count=')
  })
})

describe('client hydrate template defers brand conditionals (#1645)', () => {
  // The `template: (_p) => ...` lambda runs at module scope when the
  // component is client-rendered via `createComponent` (not when hydrating
  // existing SSR DOM). It cannot reproduce per-instance `createForm` state,
  // so an auto-deferred conditional must emit empty cond markers — exactly
  // like the SSR adapter — and let `init`'s `insert()` populate the branch.

  test('non-inlinable createForm (onSubmit): no undefined.field, emits cond markers', () => {
    const { templateBody } = compileWithBrand(`
      'use client'
      import { createForm } from './_form-defs'

      export function SignupForm() {
        const form = createForm({
          onSubmit: async (data) => { await fetch('/signup', { method: 'POST', body: JSON.stringify(data) }) },
        })
        const email = form.field('email')
        return (
          <form>
            <input value={email.value()} />
            {email.error() && <p>{email.error()}</p>}
          </form>
        )
      }
    `)

    // Never re-derive the form at module scope: `undefined.field(...)` throws.
    expect(templateBody).not.toContain('undefined.field')
    expect(templateBody).not.toContain('.field(')
    // The deferred conditional collapses to the same empty markers SSR emits.
    expect(templateBody).toMatch(/<!--bf-cond-start:s\d+--><!--bf-cond-end:s\d+-->/)
  })

  test('inlinable createForm (no onSubmit): no re-inlined createForm in template', () => {
    const { templateBody } = compileWithBrand(`
      'use client'
      import { createForm } from './_form-defs'

      export function SignupForm() {
        const form = createForm({ defaultValues: { email: '' } })
        const email = form.field('email')
        return (
          <form>
            <input value={email.value()} />
            {email.error() && <p>{email.error()}</p>}
          </form>
        )
      }
    `)

    // A re-inlined `createForm({...})` would build a throwaway instance on
    // every template render (error always '', never the live instance).
    expect(templateBody).not.toContain('createForm(')
    expect(templateBody).not.toContain('undefined.field')
    expect(templateBody).toMatch(/<!--bf-cond-start:s\d+--><!--bf-cond-end:s\d+-->/)
  })

  test('init still wires the deferred conditional via insert()', () => {
    const { initBody } = compileWithBrand(`
      'use client'
      import { createForm } from './_form-defs'

      export function SignupForm() {
        const form = createForm()
        const email = form.field('email')
        return (
          <form>
            <input value={email.value()} />
            {email.error() && <p>{email.error()}</p>}
          </form>
        )
      }
    `)

    // The reactive binding lives in init (where `email`/`form` are in scope),
    // not in the module-scope template lambda.
    expect(initBody).toMatch(/insert\(/)
    expect(initBody).toContain('email.error()')
  })
})
