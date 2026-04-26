/**
 * Stringify a `DeclarationEmitPlan` to source lines.
 *
 * Output shapes (preserved byte-identical from the legacy
 * the legacy `emitDeclaration` + `emitControlledSignalEffect`):
 *
 *   constant (with value):  <kw> <name> = <valueExpr>
 *   constant (bare):        <kw> <name>
 *   memo:                   const <name> = createMemo(<computationExpr>)
 *   function:               const <name> = (<paramList>) => <body>
 *
 *   signal (no setter):     const [<getter>] = createSignal(<initialValueExpr>)
 *   signal (with setter):   const [<getter>, <setter>] = createSignal(<initialValueExpr>)
 *
 *   controlled-signal effect (only when signal.controlledEffect != null):
 *     createEffect(() => {
 *       const __val = <accessorExpr>
 *       if (__val !== undefined) <setter>(__val)
 *     })
 *
 * Indent: every line is `  ` (2 spaces) — same as the legacy emitter.
 */

import type {
  ConstantEmitPlan,
  ControlledSignalEffectPlan,
  DeclarationEmitPlan,
  FunctionEmitPlan,
  MemoEmitPlan,
  SignalEmitPlan,
} from '../plan/declaration-emit'

export function stringifyDeclarationEmit(
  lines: string[],
  plan: DeclarationEmitPlan,
): void {
  switch (plan.kind) {
    case 'constant':
      emitConstant(lines, plan)
      break
    case 'signal':
      emitSignal(lines, plan)
      break
    case 'memo':
      emitMemo(lines, plan)
      break
    case 'function':
      emitFunction(lines, plan)
      break
  }
}

function emitConstant(lines: string[], plan: ConstantEmitPlan): void {
  if (plan.valueExpr !== null) {
    lines.push(`  ${plan.keyword} ${plan.name} = ${plan.valueExpr}`)
  } else {
    lines.push(`  ${plan.keyword} ${plan.name}`)
  }
}

function emitSignal(lines: string[], plan: SignalEmitPlan): void {
  if (plan.setter) {
    lines.push(`  const [${plan.getter}, ${plan.setter}] = createSignal(${plan.initialValueExpr})`)
  } else {
    lines.push(`  const [${plan.getter}] = createSignal(${plan.initialValueExpr})`)
  }
  if (plan.controlledEffect) {
    emitControlledEffect(lines, plan.controlledEffect)
  }
}

function emitControlledEffect(lines: string[], plan: ControlledSignalEffectPlan): void {
  lines.push(`  createEffect(() => {`)
  lines.push(`    const __val = ${plan.accessorExpr}`)
  lines.push(`    if (__val !== undefined) ${plan.setter}(__val)`)
  lines.push(`  })`)
}

function emitMemo(lines: string[], plan: MemoEmitPlan): void {
  lines.push(`  const ${plan.name} = createMemo(${plan.computationExpr})`)
}

function emitFunction(lines: string[], plan: FunctionEmitPlan): void {
  lines.push(`  const ${plan.name} = (${plan.paramList}) => ${plan.body}`)
}
