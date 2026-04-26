/**
 * Declarative emit-phase pipeline for `generateInitFunction`.
 *
 * Replaces the 20+ direct `emit*(lines, ctx, …)` calls in `generate-init.ts`
 * with a single `PHASES` registry whose entries declare their inputs
 * (`dependsOn`) and emission action (`run`). `runPhases` walks the
 * registry in stable topological order so cross-phase contracts like
 * "loop updates must come after provider/child inits" become first-class
 * data instead of comments.
 *
 * Adding a new phase: write a new `EmitPhase`, append it to `PHASES`,
 * declare its `dependsOn`. No hunting for the right insertion point in
 * a long manual sequence.
 *
 * B1 of the post-#1054 emit-init maintainability plan.
 */

import type { ComponentIR, PropUsage, ReferencesGraph } from '../types'
import type { ClientJsContext } from './types'
import type { LocalClassification } from './init-declarations'
import {
  collectConditionalSlotIds,
  emitEffectsAndOnMounts,
  emitEventHandlers,
  emitInitStatements,
  emitProviderAndChildInits,
  emitPropsEventHandlers,
  emitPropsExtraction,
  emitRefCallbacks,
  emitRestAttrApplications,
  emitStaticArrayChildInits,
} from './emit-init-sections'
import { emitClientOnlyConditionals, emitConditionalUpdates, emitLoopUpdates } from './control-flow'
import {
  emitClientOnlyExpressions,
  emitDynamicTextUpdates,
  emitReactiveAttributeUpdates,
  emitReactiveChildProps,
  emitReactivePropBindings,
} from './emit-reactive'
import { emitSortedDeclarations } from './init-declarations'
import { generateElementRefs } from './element-refs'

/**
 * Inputs available to every phase. Built once by `generateInitFunction`
 * before phase execution starts; phases read but never mutate.
 */
export interface PhaseCtx {
  ctx: ClientJsContext
  ir: ComponentIR
  graph: ReferencesGraph
  classification: LocalClassification
  propUsage: Map<string, PropUsage>
  usedFunctions: Set<string>
  /** Slots that live inside a conditional branch (handled via `insert()`).
   *  Cached so `event-handlers` and `ref-callbacks` don't recompute. */
  conditionalSlotIds: Set<string>
}

/** Build the read-only carrier that every phase consumes. */
export function buildPhaseCtx(args: Omit<PhaseCtx, 'conditionalSlotIds'>): PhaseCtx {
  return {
    ...args,
    conditionalSlotIds: collectConditionalSlotIds(args.ctx),
  }
}

/**
 * One emission step. `run` appends to the shared `lines` array; if the
 * step needs to coordinate with another step (output ordering, shared
 * runtime guarantees), declare the upstream `id` in `dependsOn`.
 */
export interface EmitPhase {
  id: string
  /** Phase ids that must execute before this one. Missing ids → throw. */
  dependsOn: readonly string[]
  run: (lines: string[], pctx: PhaseCtx) => void
}

/**
 * Stable topological execution.
 *
 * Pick the first phase (in array order) whose `dependsOn` are all
 * already emitted. The "first in array order" tiebreaker preserves the
 * legacy by-position emission order whenever no constraint forces a
 * different one — so a freshly-introduced `dependsOn` doesn't perturb
 * unrelated downstream output.
 *
 * Throws on cycle or unknown `dependsOn` id (caught early during
 * development, not silently miss-ordered).
 */
export function runPhases(
  lines: string[],
  pctx: PhaseCtx,
  phases: readonly EmitPhase[],
): void {
  const knownIds = new Set(phases.map(p => p.id))
  for (const phase of phases) {
    for (const dep of phase.dependsOn) {
      if (!knownIds.has(dep)) {
        throw new Error(`EmitPhase '${phase.id}' depends on unknown phase '${dep}'`)
      }
    }
  }

  const emitted = new Set<string>()
  const remaining = phases.slice()
  while (remaining.length > 0) {
    const idx = remaining.findIndex(p => p.dependsOn.every(d => emitted.has(d)))
    if (idx < 0) {
      const stuck = remaining.map(p => p.id).join(', ')
      throw new Error(`EmitPhase cycle or unsatisfied dependency among: ${stuck}`)
    }
    const phase = remaining.splice(idx, 1)[0]
    phase.run(lines, pctx)
    emitted.add(phase.id)
  }
}

// ============================================================================
// PHASES — array order matches the legacy `generate-init.ts` L65-94 sequence
// so output stays byte-identical when `dependsOn` is empty / non-conflicting.
//
// The single non-trivial constraint is `loop-updates` after
// `provider-and-child-inits` — previously a code comment, now a typed
// `dependsOn`.
// ============================================================================

export const PHASES: readonly EmitPhase[] = [
  {
    id: 'props-extraction',
    dependsOn: [],
    run: (lines, p) => emitPropsExtraction(lines, p.ctx, p.classification.neededProps, p.propUsage),
  },
  {
    id: 'sorted-declarations',
    dependsOn: ['props-extraction'],
    run: (lines, p) => emitSortedDeclarations(lines, p.ctx, p.classification, p.graph),
  },
  {
    id: 'init-statements',
    dependsOn: ['sorted-declarations'],
    run: (lines, p) => {
      emitInitStatements(lines, p.ctx)
      // Trailing blank line (only when statements were emitted) — folded in
      // here so the orchestrator stays a flat phase list.
      if (p.ctx.initStatements.length > 0) lines.push('')
    },
  },
  {
    id: 'props-event-handlers',
    dependsOn: ['init-statements'],
    run: (lines, p) => emitPropsEventHandlers(lines, p.ctx, p.usedFunctions, p.classification.neededProps),
  },
  {
    id: 'element-refs',
    dependsOn: ['props-event-handlers'],
    run: (lines, p) => {
      const refs = generateElementRefs(p.ctx)
      if (refs) {
        lines.push(refs)
        lines.push('')
      }
    },
  },
  {
    id: 'dynamic-text-updates',
    dependsOn: ['element-refs'],
    run: (lines, p) => emitDynamicTextUpdates(lines, p.ctx),
  },
  {
    id: 'client-only-expressions',
    dependsOn: ['dynamic-text-updates'],
    run: (lines, p) => emitClientOnlyExpressions(lines, p.ctx),
  },
  {
    id: 'reactive-attribute-updates',
    dependsOn: ['client-only-expressions'],
    run: (lines, p) => emitReactiveAttributeUpdates(lines, p.ctx),
  },
  {
    id: 'conditional-updates',
    dependsOn: ['reactive-attribute-updates'],
    run: (lines, p) => emitConditionalUpdates(lines, p.ctx),
  },
  {
    id: 'client-only-conditionals',
    dependsOn: ['conditional-updates'],
    run: (lines, p) => emitClientOnlyConditionals(lines, p.ctx),
  },
  {
    id: 'rest-attr-applications',
    dependsOn: ['client-only-conditionals'],
    run: (lines, p) => emitRestAttrApplications(lines, p.ctx),
  },
  {
    id: 'event-handlers',
    dependsOn: ['rest-attr-applications'],
    run: (lines, p) => emitEventHandlers(lines, p.ctx, p.conditionalSlotIds),
  },
  {
    id: 'reactive-prop-bindings',
    dependsOn: ['event-handlers'],
    run: (lines, p) => emitReactivePropBindings(lines, p.ctx),
  },
  {
    id: 'reactive-child-props',
    dependsOn: ['reactive-prop-bindings'],
    run: (lines, p) => emitReactiveChildProps(lines, p.ctx),
  },
  {
    id: 'ref-callbacks',
    dependsOn: ['reactive-child-props'],
    run: (lines, p) => emitRefCallbacks(lines, p.ctx, p.conditionalSlotIds),
  },
  {
    id: 'effects-and-on-mounts',
    dependsOn: ['ref-callbacks'],
    run: (lines, p) => emitEffectsAndOnMounts(lines, p.ctx),
  },
  {
    id: 'provider-and-child-inits',
    dependsOn: ['effects-and-on-mounts'],
    run: (lines, p) => emitProviderAndChildInits(lines, p.ctx),
  },
  {
    // Loop updates must run AFTER provider/child inits so parent components
    // have already provided their context before loop children call
    // useContext(). Encoded as data instead of a code comment so the
    // contract is enforceable at registry-validation time.
    id: 'loop-updates',
    dependsOn: ['provider-and-child-inits'],
    run: (lines, p) => emitLoopUpdates(lines, p.ctx),
  },
  {
    id: 'static-array-child-inits',
    dependsOn: ['loop-updates'],
    run: (lines, p) => emitStaticArrayChildInits(lines, p.ctx),
  },
]
