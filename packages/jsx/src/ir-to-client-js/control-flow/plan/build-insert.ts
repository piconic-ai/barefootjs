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
} from '../../types'
import { addCondAttrToTemplate } from '../../html-template'
import { buildBranchLoopPlan } from './build-branch-loop'
import type {
  InsertPlan,
  InsertArm,
  ArmBody,
  ScopeRef,
} from './types'

export interface BuildInsertOptions {
  scope: ScopeRef
  eventNameMode: 'dom' | 'raw'
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
    arms: [
      buildArm(elem.whenTrueHtml, elem.slotId, elem.whenTrue, options),
      buildArm(elem.whenFalseHtml, elem.slotId, elem.whenFalse, options),
    ],
  }
}

function buildArm(
  html: string,
  slotId: string,
  branch: BranchSummary,
  options: BuildInsertOptions,
): InsertArm {
  return {
    templateHtml: addCondAttrToTemplate(html, slotId),
    body: buildArmBody(branch, options),
  }
}

function buildArmBody(branch: BranchSummary, options: BuildInsertOptions): ArmBody {
  return {
    events: branch.events.map(e => ({
      slotId: e.slotId,
      eventName: e.eventName,
      handler: e.handler,
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
    loops: branch.loops.map(buildBranchLoopPlan),
    // Nested conditionals are themselves InsertPlans — built recursively so
    // the same stringifier handles arbitrary depth. Their scope is always
    // `__branchScope` (the parent arm's bindEvents argument), regardless of
    // the outer scope; only the eventNameMode is inherited.
    conditionals: branch.conditionals.map(c =>
      buildInsertPlan(c, { scope: { kind: 'branchScope' }, eventNameMode: options.eventNameMode }),
    ),
  }
}
