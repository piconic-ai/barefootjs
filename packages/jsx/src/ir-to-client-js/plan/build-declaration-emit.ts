/**
 * Build a `DeclarationEmitPlan` from a `Declaration` + the surrounding
 * client-JS context. Resolves every initial-value / accessor decision
 * up-front so the stringifier never reads `ctx`.
 *
 * The signal builder mirrors the pre-A2 `emitDeclaration::signal` 4-branch
 * cascade exactly. Comments below cite the legacy lines so future drift
 * between the cases is easy to review.
 *
 * A2 of the post-#1054 emit-init maintainability plan.
 */

import type { ControlledSignal } from '../init-declarations'
import type { Declaration } from '../declaration-sort'
import type { ClientJsContext } from '../types'
import type { SignalInfo } from '../../types'
import { inferDefaultValue, PROPS_PARAM } from '../utils'
import type {
  ControlledSignalEffectPlan,
  DeclarationEmitPlan,
  SignalEmitPlan,
} from './declaration-emit'

export function buildDeclarationEmitPlan(
  decl: Declaration,
  ctx: ClientJsContext,
  controlledSignals: readonly ControlledSignal[],
): DeclarationEmitPlan {
  switch (decl.kind) {
    case 'constant': {
      const c = decl.info
      return {
        kind: 'constant',
        keyword: c.declarationKind ?? 'const',
        name: c.name,
        valueExpr: c.value !== undefined ? c.value : null,
      }
    }
    case 'signal':
      return buildSignalPlan(decl.info, ctx, controlledSignals)
    case 'memo':
      return {
        kind: 'memo',
        name: decl.info.name,
        computationExpr: decl.info.computation,
      }
    case 'function': {
      const fn = decl.info
      return {
        kind: 'function',
        name: fn.name,
        paramList: fn.params.map(p => p.name).join(', '),
        body: fn.body,
      }
    }
  }
}

function buildSignalPlan(
  signal: SignalInfo,
  ctx: ClientJsContext,
  controlledSignals: readonly ControlledSignal[],
): SignalEmitPlan {
  return {
    kind: 'signal',
    getter: signal.getter,
    setter: signal.setter,
    initialValueExpr: resolveSignalInitialValue(signal, ctx, controlledSignals),
    controlledEffect: buildControlledSignalEffect(signal, ctx, controlledSignals),
  }
}

/**
 * Mirror of the pre-A2 `emitDeclaration::signal` decision tree. The
 * `propsName` here is what the user wrote (e.g. `props` or a custom
 * destructure object name) — `signal.initialValue` may reference it via
 * `propsName.X`, in which case we rewrite to the generated `_p.X`.
 *
 * Order of checks:
 *   1. Reads a prop directly without `??` → wrap with the prop's inferred
 *      default (`_p.X ?? <inferredDefault>`).
 *   2. Controlled signal:
 *      - has `??` already → respect the user's expression (rewrite props
 *        prefix only).
 *      - no `??`           → synthesize `_p.<propName> ?? <defaultVal>`.
 *   3. Other reads of `propsName.X` → straight prop rewrite.
 *   4. Otherwise            → verbatim.
 */
function resolveSignalInitialValue(
  signal: SignalInfo,
  ctx: ClientJsContext,
  controlledSignals: readonly ControlledSignal[],
): string {
  const propsName = ctx.propsObjectName ?? 'props'
  const propsPrefix = `${propsName}.`
  const startsWithPropsPrefix = signal.initialValue.startsWith(propsPrefix)
  const hasNullish = signal.initialValue.includes('??')

  // Case 1: bare `propsName.X` read — append the inferred default so the
  // signal never starts as `undefined`.
  if (startsWithPropsPrefix && !hasNullish) {
    const propRef = `${PROPS_PARAM}.` + signal.initialValue.slice(propsPrefix.length)
    return `${propRef} ?? ${inferDefaultValue(signal.type)}`
  }

  const controlled = controlledSignals.find(c => c.signal === signal)
  if (controlled) {
    // Case 2a: user already wrote `??` — keep their default but rewrite
    // a leading `propsName.` prefix.
    if (hasNullish) {
      if (ctx.propsObjectName && startsWithPropsPrefix) {
        return `${PROPS_PARAM}.` + signal.initialValue.slice(propsPrefix.length)
      }
      return signal.initialValue
    }
    // Case 2b: synthesize the prop accessor + default.
    const prop = ctx.propsParams.find(p => p.name === controlled.propName)
    const defaultVal = prop?.defaultValue ?? inferDefaultValue(signal.type)
    return `${PROPS_PARAM}.${controlled.propName} ?? ${defaultVal}`
  }

  // Case 3: non-controlled `propsObjectName.X` (only when destructured-
  // props mode is OFF — the destructured form has no `propsObjectName`).
  if (ctx.propsObjectName && startsWithPropsPrefix) {
    return `${PROPS_PARAM}.` + signal.initialValue.slice(propsPrefix.length)
  }

  // Case 4: fall-through.
  return signal.initialValue
}

function buildControlledSignalEffect(
  signal: SignalInfo,
  ctx: ClientJsContext,
  controlledSignals: readonly ControlledSignal[],
): ControlledSignalEffectPlan | null {
  const controlled = controlledSignals.find(c => c.signal === signal)
  if (!controlled) return null
  if (!signal.setter) return null // read-only — no sync needed

  const prop = ctx.propsParams.find(p => p.name === controlled.propName)
  const accessorExpr = prop?.defaultValue
    ? `(${PROPS_PARAM}.${controlled.propName} ?? ${prop.defaultValue})`
    : `${PROPS_PARAM}.${controlled.propName}`

  return { setter: signal.setter, accessorExpr }
}
