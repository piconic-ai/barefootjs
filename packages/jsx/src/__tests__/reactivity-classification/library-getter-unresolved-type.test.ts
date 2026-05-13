/**
 * Reactivity Classification — Library Getter (issue #1248 Case 1)
 *
 * A `Reactive<T>`-branded library getter (`form.isSubmitting()`,
 * `username.error()`, etc.) carries reactivity via the TypeChecker.
 * After unification (#1248 + #1251), classification must:
 *
 * 1. Recognise the library getter when a shared `ts.Program` is supplied,
 *    and tag the corresponding `FreeReference.kind` as `'reactive-brand'`.
 * 2. Refuse to compile (BFxxx) when no `ts.Program` is supplied — silent
 *    regex fallback is no longer allowed.
 *
 * Both phases (analyzer-derived IR flag and emit-time effect wrapping)
 * must agree, derived from the same `origin.freeRefs`.
 */

import { describe, test, expect } from 'bun:test'
import {
  createInMemoryProgram,
  compileToComponentIR,
  compileToClientJs,
  collectExpressions,
  hasFreeRefKind,
  EFFECT_WRAP_RE,
} from './_helpers'

const REACTIVE_DEFS = `
  export type Reactive<T> = T & { readonly __reactive: true };
  export interface FormReturn {
    isSubmitting: Reactive<() => boolean>;
  }
  export declare function createForm(): FormReturn;
`

const COMPONENT_SOURCE = `
  import { createForm, type FormReturn } from './_reactive-defs';
  export const Indicator = (props: { form: FormReturn }) => {
    return <div>{props.form.isSubmitting()}</div>
  }
`

describe('library getter — Reactive<T> brand', () => {
  test('with shared Program: IR marks expression as reactive via origin.freeRefs', () => {
    const { program, entryPath } = createInMemoryProgram(
      { '_reactive-defs.ts': REACTIVE_DEFS, '_indicator.tsx': COMPONENT_SOURCE },
      '_indicator.tsx'
    )
    const { componentIR } = compileToComponentIR(COMPONENT_SOURCE, entryPath, program)
    expect(componentIR).not.toBeNull()

    const exprs = collectExpressions(componentIR!.root)
    const target = exprs.find(e => e.expr.includes('isSubmitting'))
    expect(target).toBeDefined()

    // Phase 1 — `reactive` flag set
    expect(target!.reactive).toBe(true)

    // Post-refactor — `origin.freeRefs` carries a brand-derived kind
    expect(target!.origin).toBeDefined()
    expect(hasFreeRefKind(target!.origin!.freeRefs, 'reactive-brand')).toBe(true)
  })

  test('with shared Program: Phase 2 emits effect wrapping for library getter', () => {
    const { program, entryPath } = createInMemoryProgram(
      { '_reactive-defs.ts': REACTIVE_DEFS, '_indicator.tsx': COMPONENT_SOURCE },
      '_indicator.tsx'
    )
    const { componentIR } = compileToComponentIR(COMPONENT_SOURCE, entryPath, program)
    expect(componentIR).not.toBeNull()
    const clientJs = compileToClientJs(componentIR!)
    expect(clientJs).toMatch(EFFECT_WRAP_RE)
  })

  test('without shared Program: compile fails with BFxxx (no silent regex fallback)', () => {
    // Post-refactor behavior: when the source imports from a known brand
    // package (`@barefootjs/form`) we cannot classify reactivity from
    // regex alone — the analyzer must refuse to proceed without a shared
    // ts.Program. Today this falls through silently via the per-file
    // program fallback, which is the bug.
    const source = `
      import type { FormReturn } from '@barefootjs/form'
      export const Indicator = (props: { form: FormReturn }) => {
        return <div>{props.form.isSubmitting()}</div>
      }
    `
    const { componentIR, analyzerErrors } = compileToComponentIR(
      source,
      '/virtual/Indicator.tsx'
      // intentionally no `program`
    )
    const allErrors = [
      ...(analyzerErrors ?? []),
      ...(componentIR?.errors ?? []),
    ]
    const hasProgramRequiredError = allErrors.some(e =>
      typeof e.message === 'string' && /program required|shared program/i.test(e.message)
    )
    expect(hasProgramRequiredError).toBe(true)
  })
})
