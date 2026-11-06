/**
 * Build a `DeclarationEmitPlan` from a `Declaration` + the surrounding
 * client-JS context. Resolves every initial-value / accessor decision
 * up-front so the stringifier never reads `ctx`.
 *
 * The signal builder mirrors the legacy `emitDeclaration::signal` 4-branch
 * cascade exactly. Comments below name each case so future drift between
 * the branches is easy to review.
 */

import type { ControlledSignal } from '../init-declarations.ts'
import type { Declaration } from '../declaration-sort.ts'
import type { ClientJsContext } from '../types.ts'
import type { ConstantInfo, ParamInfo, SignalInfo } from '../../types.ts'
import { inferDefaultValue, PROPS_PARAM, readsBareProp } from '../utils.ts'
import { coalesceDefaultText, composePropRead, livePropReadExpr, propDefaultText } from '../../props-binding.ts'
import { signalFactoryInitializer, signalSecondBinding } from '../../signal-initializer.ts'
import type {
  ControlledSignalEffectPlan,
  DeclarationEmitPlan,
  SignalEmitPlan,
} from './declaration-emit.ts'

/**
 * Pre-computed lookup tables used while building declaration plans.
 * Built once per `emitSortedDeclarations` call so per-signal lookups are
 * O(1) instead of an O(d × c) `.find()` cascade.
 */
export interface DeclarationEmitLookups {
  controlledBySignal: ReadonlyMap<SignalInfo, ControlledSignal>
  propByName: ReadonlyMap<string, ParamInfo>
}

export function buildDeclarationEmitLookups(
  ctx: ClientJsContext,
  controlledSignals: readonly ControlledSignal[],
): DeclarationEmitLookups {
  const controlledBySignal = new Map<SignalInfo, ControlledSignal>()
  for (const c of controlledSignals) controlledBySignal.set(c.signal, c)
  const propByName = new Map<string, ParamInfo>()
  for (const p of ctx.propsParams) propByName.set(p.name, p)
  return { controlledBySignal, propByName }
}

export function buildDeclarationEmitPlan(
  decl: Declaration,
  ctx: ClientJsContext,
  lookups: DeclarationEmitLookups,
): DeclarationEmitPlan {
  switch (decl.kind) {
    case 'constant': {
      const c = decl.info
      return {
        kind: 'constant',
        keyword: c.declarationKind ?? 'const',
        name: c.name,
        valueExpr: bodyDestructureValue(c, ctx) ?? (c.value !== undefined ? c.value : null),
      }
    }
    case 'signal':
      return buildSignalPlan(decl.info, ctx, lookups)
    case 'memo':
      return {
        kind: 'memo',
        name: decl.info.name,
        computationExpr: decl.info.computation,
        bfId: ctx.profile ? `${ctx.componentName}#memo:${decl.info.name}` : undefined,
      }
    case 'function': {
      const fn = decl.info
      return {
        kind: 'function',
        name: fn.name,
        paramList: fn.params.map(p => {
          const rest = p.isRest ? '...' : ''
          return p.defaultValue !== undefined ? `${rest}${p.name} = ${p.defaultValue}` : `${rest}${p.name}`
        }).join(', '),
        body: fn.body,
        isAsync: fn.isAsync ?? false,
      }
    }
  }
}

function buildSignalPlan(
  signal: SignalInfo,
  ctx: ClientJsContext,
  lookups: DeclarationEmitLookups,
): SignalEmitPlan {
  // Env signals (#2057) and async factories (#3165) re-emit their own factory
  // call, as written (alias / namespace aware), instead of `createSignal`.
  const initializerOverride = signalFactoryInitializer(signal)
  if (initializerOverride) {
    return {
      kind: 'signal',
      getter: signal.getter,
      setter: signalSecondBinding(signal),
      getterElided: signal.getterElided,
      initialValueExpr: '',
      controlledEffect: null,
      initializerOverride,
      // An env signal is a stable request-scoped view, emitted unconditionally;
      // an async factory owns a request, so it is created only on its branch.
      branchCondition: signal.factory ? signal.branchCondition : undefined,
    }
  }
  const controlledEffect = buildControlledSignalEffect(signal, lookups)
  if (controlledEffect && ctx.profile) {
    controlledEffect.bfId = `${ctx.componentName}#effect:controlled:${signal.setter}`
  }
  return {
    kind: 'signal',
    getter: signal.getter,
    setter: signal.setter,
    getterElided: signal.getterElided,
    initialValueExpr: resolveSignalInitialValue(signal, lookups),
    controlledEffect,
    branchCondition: signal.branchCondition,
    bfId: ctx.profile ? `${ctx.componentName}#signal:${signal.getter}` : undefined,
  }
}

/**
 * The signal's initial value, decided from `SignalInfo.propSeed` (#3508):
 *   1. A bare read of the props object (`props.X`, `props.row.count`) →
 *      `<it> ?? <inferred default>`, so the signal never starts as
 *      `undefined`.
 *   2. A controlled signal seeded by a bare destructured binding →
 *      `_p.<caller key>` with the prop's default (`composePropRead`).
 *   3. Anything else (a `??` / `||` fallback the user wrote, any other
 *      expression) → the initializer as written; `generateInit`'s
 *      `rewritePropsObjectRef` maps its `props.X` reads to `_p.X`.
 */
function resolveSignalInitialValue(signal: SignalInfo, lookups: DeclarationEmitLookups): string {
  const seed = signal.propSeed
  if (readsBareProp(signal)) return `${signal.initialValue} ?? ${inferDefaultValue(signal.type)}`
  if (seed && seed.fallback === null) {
    const controlled = lookups.controlledBySignal.get(signal)
    if (controlled) {
      const prop = lookups.propByName.get(controlled.propName)
      const defaultText = prop && propDefaultText(prop)
      // `_p` is always keyed by the caller-facing name (#2524 CSR half). The
      // prop's own default applies to an absent or `undefined` prop only;
      // the inferred one keeps the signal from starting as either nil.
      const base = `${PROPS_PARAM}.${prop?.sourceName ?? controlled.propName}`
      return composePropRead(
        base,
        defaultText
          ? { kind: 'default', text: coalesceDefaultText(defaultText, prop.defaultContainsArrow) }
          : { kind: 'guard', text: inferDefaultValue(signal.type) },
      )
    }
  }
  return signal.initialValue
}

/**
 * The client-JS initializer of a body destructure of the props object with
 * a default (`const { label = 'x' } = props`): its prop read with the
 * default applied to an absent or `undefined` prop only
 * (`composePropRead`). The IR encodes the destructure as `props.label ??
 * 'x'` (`ConstantInfo.value`), which the SSR seed plans read; built here
 * from the props param the analyzer overlays the default onto (#2943), not
 * from that text. The default is the authored expression: a read of an
 * earlier binding (`{ a = [], b = a }`) stays a read of that local, which
 * `rewriteBodyAliasReads` turns into a live prop read only where it drops
 * the local's declaration. Null for any other constant, which keeps its own
 * value.
 */
function bodyDestructureValue(c: ConstantInfo, ctx: ClientJsContext): string | null {
  const sourceKey = c.propsDestructure?.sourceKey
  if (sourceKey === undefined || ctx.propsObjectName === null) return null
  const param = ctx.propsParams.find(p => p.name === c.name && (p.sourceName ?? p.name) === sourceKey)
  const defaultText = param?.defaultValue
  if (!param || !defaultText) return null
  return composePropRead(`${ctx.propsObjectName}.${sourceKey}`, {
    kind: 'default',
    text: coalesceDefaultText(defaultText, param.defaultContainsArrow),
  })
}

function buildControlledSignalEffect(
  signal: SignalInfo,
  lookups: DeclarationEmitLookups,
): ControlledSignalEffectPlan | null {
  const controlled = lookups.controlledBySignal.get(signal)
  if (!controlled) return null
  if (!signal.setter) return null // read-only — no sync needed

  const prop = lookups.propByName.get(controlled.propName)
  // No `usage`/`usedAsCondition`: a controlled prop's sync effect reads it
  // as a plain value, never as a loop array or a conditional guard.
  const accessorExpr = prop
    ? livePropReadExpr(prop, undefined, false)
    : `${PROPS_PARAM}.${controlled.propName}`

  // A `||` fallback (`createSignal(props.value || '')`) also replaces a
  // falsy prop, so the re-sync sets the initializer's value, not the raw prop.
  const valueExpr = signal.propSeed?.fallback?.op === '||' ? signal.initialValue : undefined
  return { setter: signal.setter, accessorExpr, valueExpr }
}
