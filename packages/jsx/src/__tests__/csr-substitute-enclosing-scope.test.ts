/**
 * #2482 Stage 1b — `csrSubstitute`'s `enclosingScope` parameter.
 *
 * `csrSubstitute`'s `boundStack` only ever learns about bindings found
 * while walking the substituted expression's OWN AST (nested arrow/
 * function parameters and block-scoped locals inside `value` itself) — it
 * has no way to see a binding introduced OUTSIDE that expression, e.g. an
 * enclosing `.map()` row's item/index/destructured/preamble binding.
 * `enclosingScope` (a `BindingScope`) seeds those outer frames so
 * `isBound` treats them identically to an in-expression arrow param.
 *
 * Direct unit coverage, not a full-pipeline conformance fixture: every
 * current call site (`html-template.ts`'s `generateCsrTemplateWithOpts`)
 * already pre-filters `env.substitutions` to remove loop-shadowed names
 * BEFORE calling in (see the `loop` case's `childEnv` construction, itself
 * migrated onto `BindingScope.enterLoopRow` in this same stage) — so by
 * the time `csrSubstitute` runs inside a loop body today, the shadowed
 * name is already absent from `env.substitutions` and `enclosingScope`
 * never gets a chance to matter. This test exercises the module function
 * directly, bypassing that pre-filtering, to pin the parameter's own
 * contract in isolation: SHOULD a future call site ever hand `csrSubstitute`
 * an unfiltered env alongside a loop's `BindingScope` (e.g. a caller that
 * wants substitution and shadow-guarding as one step instead of two), the
 * shadow guard already works correctly.
 */

import { describe, test, expect } from 'bun:test'
import { csrSubstitute, type CsrEnv } from '../ir-to-client-js/csr-substitute.ts'
import { BindingScope } from '../scope/binding-scope.ts'

describe('csrSubstitute enclosingScope (#2482)', () => {
  test('a name bound by the enclosing loop scope is left unsubstituted, even though the env still has an entry for it', () => {
    // Deliberately UNFILTERED env — in real call sites this would already
    // have `label` removed by the caller's own loop-scope filtering; here
    // we keep it to isolate what `enclosingScope` alone contributes.
    const env: CsrEnv = {
      substitutions: new Map([
        ['label', { kind: 'identifier', replacement: "'MODULE_CONST'", freeIdentifiers: new Set() }],
      ]),
      propsObjectName: null,
    }
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'label' })

    const withoutScope = csrSubstitute('label', env)
    const withScope = csrSubstitute('label', env, scope)

    expect(withoutScope.rewritten).toBe("('MODULE_CONST')")
    expect(withScope.rewritten).toBe('label')
  })

  test('a name NOT bound by the enclosing scope still substitutes normally', () => {
    const env: CsrEnv = {
      substitutions: new Map([
        ['label', { kind: 'identifier', replacement: "'MODULE_CONST'", freeIdentifiers: new Set() }],
      ]),
      propsObjectName: null,
    }
    // Scope binds a DIFFERENT name (`item`) — `label` stays substitutable.
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'item' })

    const { rewritten } = csrSubstitute('label', env, scope)
    expect(rewritten).toBe("('MODULE_CONST')")
  })

  test('a preamble-bound name (not item/index/destructure) is also guarded', () => {
    const env: CsrEnv = {
      substitutions: new Map([
        ['label', { kind: 'identifier', replacement: "'MODULE_CONST'", freeIdentifiers: new Set() }],
      ]),
      propsObjectName: null,
    }
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'item', preamble: { declaredNames: ['label'] } })

    const { rewritten } = csrSubstitute('label', env, scope)
    expect(rewritten).toBe('label')
  })
})
