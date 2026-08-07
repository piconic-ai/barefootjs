/**
 * The single renderer for a structured `template` variant's parts back into
 * JS template-literal source.
 *
 * Three sites used to carry byte-identical copies of this loop — the IR-time
 * component-prop collapse (`jsx-to-ir.ts`), the client-JS emitter
 * (`ir-to-client-js/utils.ts`), and the JSX adapters' attribute renderer. They
 * have to agree: the collapse's output is what a JSX adapter emits verbatim
 * for a component prop, so a divergence between any two of them is a silent
 * SSR/CSR mismatch. One door, three callers.
 */

import type { IRTemplatePart } from './types.ts'

export interface TemplatePartsToJsOptions {
  /**
   * Prefer each part's prop-rewritten projection (`templateValue` /
   * `templateCondition` / `templateKey`, i.e. destructured props rewritten
   * to `_p.X`) when present. Used by the client-JS / module-registration
   * template emitters, which run outside the component's destructured scope.
   */
  useTemplate?: boolean
  /**
   * Emit TypeScript type annotations. Only adapters whose output is
   * type-checked as .tsx set this — see `JsxAdapterConfig.preserveTypes`.
   * The neutral (untyped) form is what DSL adapters' expression pipelines
   * and the client-JS bundle consume, so it must stay plain JS.
   */
  typed?: boolean
}

/**
 * Render one `lookup` part — `${MAP[KEY]}` structurally captured at IR time
 * so DSL adapters can emit a switch — as the equivalent runtime indexed
 * access against the resolved cases.
 *
 * Under `typed`, the inlined object literal is annotated
 * `as Record<string, string>` (#2565). The IR's `key` is the TYPE-STRIPPED
 * source text of the index expression, so a narrowing assertion written at
 * the use site — `strokePaths[name as keyof typeof strokePaths]` — is already
 * gone by the time the record's cases are folded in here. That leaves the
 * literal's exact key set indexed by the binding's unnarrowed union, which
 * fails TS7053 ("expression of type 'IconName' can't be used to index type
 * '{ check: string; … }'") in any consumer that type-checks its compiled
 * templates. Widening the literal to a string index signature restores the
 * assertion's effect without reconstructing its text, which may name types
 * the emitted template never declares (`keyof typeof strokePaths` where
 * `strokePaths` was localised into a component body). Purely a type-level
 * annotation — the runtime expression is identical either way.
 */
export function lookupPartToJsExpr(
  part: Extract<IRTemplatePart, { type: 'lookup' }>,
  opts?: TemplatePartsToJsOptions,
): string {
  const key = (opts?.useTemplate && part.templateKey) ? part.templateKey : part.key
  const obj = '{' + Object.entries(part.cases).map(
    ([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`
  ).join(', ') + '}'
  const typed = opts?.typed ? ' as Record<string, string>' : ''
  return `(${obj}${typed})[${key}]`
}

/** Convert a `template` variant's parts into a JS template-literal string. */
export function templatePartsToJsExpr(
  parts: readonly IRTemplatePart[],
  opts?: TemplatePartsToJsOptions,
): string {
  let result = '`'
  for (const part of parts) {
    if (part.type === 'string') {
      result += (opts?.useTemplate && part.templateValue) ? part.templateValue : part.value
    } else if (part.type === 'ternary') {
      const cond = (opts?.useTemplate && part.templateCondition) ? part.templateCondition : part.condition
      result += `\${${cond} ? '${part.whenTrue}' : '${part.whenFalse}'}`
    } else if (part.type === 'lookup') {
      result += `\${${lookupPartToJsExpr(part, opts)}}`
    }
  }
  result += '`'
  return result
}
