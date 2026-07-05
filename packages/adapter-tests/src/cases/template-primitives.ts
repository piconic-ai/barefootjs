/**
 * Template-primitive conformance cases (#1187 phase 3, extended #2069).
 *
 * Pure data + a `runner` that turns each case into the artifact its
 * `assert` inspects. Imported by per-adapter test files; this module
 * never imports a concrete adapter.
 *
 * Each case is a small JSX component whose generated client JS should
 * either inline a template-scope call or fall back to `(undefined)` —
 * depending on what the adapter promises it can render via
 * `templatePrimitives` / `acceptsTemplateCall`, OR (#2069) via a
 * registered `LoweringPlugin` matcher — the seam that lets a user-imported
 * helper (never in any adapter's string-keyed registry) still be recognised
 * structurally. `USER_IMPORT_VIA_CONST` and `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT`
 * register a small `customSerialize` plugin (see below) around the compile so
 * every adapter — not just the JS-runtime ones (Hono) whose broad
 * `acceptsTemplateCall` already covered this shape — exercises the same
 * matcher-based acceptance path.
 */

import { expect } from 'bun:test'
import { compileJSX } from '../../../jsx/src/compiler'
import type { TemplateAdapter } from '../../../jsx/src/types'
import type { ConformanceCase } from '../conformance'
import {
  registerLoweringPlugin,
  getLoweringPlugins,
  __resetLoweringPluginsForTest,
  type LoweringPlugin,
} from '../../../jsx/src/index'

export const FALLBACK_SENTINEL = '(undefined)'

export const TemplatePrimitiveCaseId = {
  JSON_STRINGIFY_VIA_CONST: 'json-stringify-via-const',
  MATH_FLOOR_VIA_CONST: 'math-floor-via-const',
  USER_IMPORT_VIA_CONST: 'user-import-via-const',
  NO_DOUBLE_REWRITE_OF_PROPS_OBJECT: 'no-double-rewrite-of-props-object',
} as const

export type TemplatePrimitiveCaseId =
  (typeof TemplatePrimitiveCaseId)[keyof typeof TemplatePrimitiveCaseId]

export interface TemplatePrimitiveInput {
  source: string
}

export const templatePrimitiveCases: ReadonlyArray<
  ConformanceCase<TemplatePrimitiveCaseId, TemplatePrimitiveInput, string>
> = [
  {
    id: TemplatePrimitiveCaseId.JSON_STRINGIFY_VIA_CONST,
    description: 'JSON.stringify(props.x) via const inlines into template',
    input: {
      source: `
        'use client'
        export function Foo(props: { config: object }) {
          const json = JSON.stringify(props.config)
          return <div data-config={json}>hi</div>
        }
      `,
    },
    assert: (clientJs) => {
      expect(clientJs).not.toContain(FALLBACK_SENTINEL)
      expect(clientJs).toContain('JSON.stringify(_p.config)')
    },
  },
  {
    id: TemplatePrimitiveCaseId.MATH_FLOOR_VIA_CONST,
    description: 'Math.floor(props.score) via const inlines into template',
    input: {
      source: `
        'use client'
        export function Foo(props: { score: number }) {
          const rounded = Math.floor(props.score)
          return <div data-rounded={rounded}>hi</div>
        }
      `,
    },
    assert: (clientJs) => {
      expect(clientJs).not.toContain(FALLBACK_SENTINEL)
      expect(clientJs).toContain('Math.floor(_p.score)')
    },
  },
  {
    id: TemplatePrimitiveCaseId.USER_IMPORT_VIA_CONST,
    description: 'user-imported function via const inlines into template',
    input: {
      source: `
        'use client'
        import { customSerialize } from './lib'
        export function Foo(props: { config: object }) {
          const serialized = customSerialize(props.config)
          return <div data-config={serialized}>hi</div>
        }
      `,
    },
    assert: (clientJs) => {
      expect(clientJs).not.toContain(FALLBACK_SENTINEL)
      expect(clientJs).toContain('customSerialize(_p.config)')
    },
  },
  {
    id: TemplatePrimitiveCaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
    description: 'props-object lift does not leak `_p._p.X` into the template',
    input: {
      source: `
        'use client'
        import { customSerialize } from './lib'
        export function Foo(props: { a: number; b: number }) {
          const json = customSerialize({ a: props.a, b: props.b })
          return <div data-config={json}>hi</div>
        }
      `,
    },
    assert: (clientJs) => {
      // Pre-fix this produced `_p._p.a` / `_p._p.b` because the
      // props-object name was lifted via the per-key form.
      expect(clientJs).not.toContain('_p._p')
      expect(clientJs).toContain('_p.a')
      expect(clientJs).toContain('_p.b')
    },
  },
]

/**
 * Test-only `LoweringPlugin` (#2057) recognising `customSerialize` imported
 * from `./lib` — models `queryHrefPlugin` in
 * `packages/jsx/src/builtin-lowering-plugins.ts`: resolve the local name(s)
 * `customSerialize` is imported under from `metadata.imports` (same shape
 * `queryHrefLocalNames` reads), then match a call whose callee is exactly
 * that local identifier. Lowers to a `helper-call` node (the neutral
 * vocabulary's single-invocation escape hatch, `custom_serialize` helper id)
 * rather than `guard-list` — `customSerialize` takes one arg, not a
 * `(base, paramsObject)` pair.
 *
 * This is what makes `USER_IMPORT_VIA_CONST` / `NO_DOUBLE_REWRITE_OF_PROPS_OBJECT`
 * exercise the SAME acceptance path a real userland plugin author would use,
 * on every template adapter — not just the JS-runtime ones (Hono) whose
 * broad `acceptsTemplateCall` predicate already accepted this shape without
 * any plugin at all.
 */
const customSerializeTestPlugin: LoweringPlugin = {
  name: 'template-primitives-test:customSerialize',
  prepare(metadata) {
    const local = metadata.imports
      .filter((i) => i.source === './lib' && !i.isTypeOnly)
      .flatMap((i) => i.specifiers)
      .filter((s) => !s.isTypeOnly && !s.isNamespace && !s.isDefault)
      .find((s) => s.name === 'customSerialize')
    if (!local) return null
    const localName = local.alias ?? local.name
    return (callee, args) => {
      if (callee.kind !== 'identifier' || callee.name !== localName) return null
      return { kind: 'helper-call', helper: 'custom_serialize', args }
    }
  },
}

/**
 * Standard runner for template-primitive cases: compile the source
 * with the adapter and return the generated client JS. Adapters can
 * pass this directly to `runConformanceSuite`'s `run`.
 *
 * Registers {@link customSerializeTestPlugin} around every compile (harmless
 * no-op for cases that don't import `customSerialize` from `./lib` — its
 * `prepare` returns null when the import is absent) and restores the
 * registry's exact prior contents in a `finally`, so a case assertion
 * failure can't leak the test plugin into unrelated suites sharing the
 * same global registry (#2069 danger zone).
 */
export function runTemplatePrimitiveCase(
  adapter: TemplateAdapter,
  input: TemplatePrimitiveInput,
): string {
  const previousPlugins = getLoweringPlugins()
  registerLoweringPlugin(customSerializeTestPlugin)
  try {
    const result = compileJSX(input.source, 'Test.tsx', { adapter })
    return result.files.find((f) => f.type === 'clientJs')?.content ?? ''
  } finally {
    __resetLoweringPluginsForTest(previousPlugins)
  }
}
