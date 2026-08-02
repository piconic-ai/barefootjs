/**
 * Build `InsertPlan` from a `ConditionalElement` IR node.
 *
 * The builder is a pure function: given the same IR + eventNameMode it
 * returns the same Plan. All wrapping decisions (DOM event name vs. raw,
 * conditional template HTML augmentation, child-component selector vs.
 * placeholder id) are made here so the stringifier can be a deterministic
 * data-to-text mapping.
 */

import type {
  ConditionalElement,
  BranchSummary,
} from '../../types.ts'
import { addCondAttrToTemplate } from '../../html-template.ts'
import { buildBranchLoopPlan } from './build-branch-loop.ts'
import type { LazyRowScopeInfo } from './lazy-row-eligibility.ts'
import type {
  InsertPlan,
  InsertArm,
  ArmBody,
  ScopeRef,
} from './types.ts'

export interface BuildInsertOptions {
  scope: ScopeRef
  eventNameMode: 'dom' | 'raw'
  /** Owning component name in profile mode (#1690, SR3) — else undefined. */
  profileComponentName?: string
  /**
   * Component-scope name facts for the lazy row graph gate
   * (`spec/slot-unification.md` §9.4). Threaded down to branch-scoped plain
   * loops; omitted → those loops keep today's eager emission.
   */
  lazyScope?: LazyRowScopeInfo
}

export function buildInsertPlan(
  elem: ConditionalElement,
  options: BuildInsertOptions,
): InsertPlan {
  return {
    kind: 'insert',
    scope: options.scope,
    slotId: elem.slotId,
    condition: elem.condition,
    eventNameMode: options.eventNameMode,
    profileComponentName: options.profileComponentName,
    rootSwap: elem.rootSwap || undefined,
    arms: [
      buildArm(elem.whenTrueHtml, elem.slotId, elem.whenTrue, options, elem.rootSwap),
      buildArm(elem.whenFalseHtml, elem.slotId, elem.whenFalse, options, elem.rootSwap),
    ],
  }
}

function buildArm(
  html: string,
  slotId: string,
  branch: BranchSummary,
  options: BuildInsertOptions,
  rootSwap?: boolean,
): InsertArm {
  return {
    // A root if-statement's branch IS the component's own scope root (no
    // synthetic `bf-c` wrapper — see `ConditionalElement.rootSwap`), so
    // `addCondAttrToTemplate` must not run: adding `bf-c` here would mismatch
    // the SSR HTML this fix does not touch (the pinned `bf-s`/`bf="sN"`-only
    // shape), and `insertRoot()` never queries for it anyway.
    templateHtml: rootSwap ? html : addCondAttrToTemplate(html, slotId),
    body: buildArmBody(branch, options),
  }
}

function buildArmBody(branch: BranchSummary, options: BuildInsertOptions): ArmBody {
  const pc = options.profileComponentName
  return {
    events: branch.events.map(e => ({
      slotId: e.slotId,
      eventName: e.eventName,
      handler: e.handler,
      // Profile mode (#1690, SR3): turn id so the arm listener is wrapped with
      // beginTurn/endTurn, matching the top-level/delegation paths.
      turnId: pc ? `${pc}#handler:${e.slotId}:${e.eventName}` : undefined,
    })),
    refs: branch.refs.map(r => ({
      slotId: r.slotId,
      callback: r.callback,
    })),
    childComponents: branch.childComponents.map(c => ({
      name: c.name,
      slotId: c.slotId,
      propsExpr: c.propsExpr,
    })),
    // Branch-scoped reactive attribute bindings (#1071). Spread the
    // collected entry as-is — `ConditionalBranchReactiveAttr` already
    // extends `AttrMeta` so the meta flags carry through to the
    // emitter (`emitAttrUpdate` consumes them).
    reactiveAttrs: branch.reactiveAttrs.map(a => ({ ...a })),
    textEffects: branch.textEffects.map(t => ({
      slotId: t.slotId,
      expression: t.expression,
    })),
    // Branch-scoped loops, fully Plan-built (Item 2 final migration).
    loops: branch.loops.map(l => buildBranchLoopPlan(l, pc, options.lazyScope)),
    // Nested conditionals are themselves InsertPlans — built recursively so
    // the same stringifier handles arbitrary depth. Their scope is always
    // `__branchScope` (the parent arm's bindEvents argument), regardless of
    // the outer scope; only the eventNameMode is inherited.
    conditionals: branch.conditionals.map(c =>
      buildInsertPlan(c, { scope: { kind: 'branchScope' }, eventNameMode: options.eventNameMode, profileComponentName: pc, lazyScope: options.lazyScope }),
    ),
  }
}
