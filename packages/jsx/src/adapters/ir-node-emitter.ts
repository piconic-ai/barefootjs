/**
 * Shared IRNode emitter (#1290 step 1).
 *
 * The same drift hazard that motivated `ParsedExprEmitter` for
 * `ParsedExpr.kind` (#1250 phase 1) also exists for `IRNode.type`:
 * each adapter writes its own `switch (node.type)` and ships its own
 * `default` arm, so a new IR node kind can land in core and silently
 * fall through in one or more adapters.
 *
 * This module gives `IRNode` the same shape: one shared recursive
 * dispatcher whose `assertNever` default arm forces every adapter to
 * extend a per-kind visitor method when a new kind is introduced.
 *
 * Why this dispatcher is generic over `Ctx` (and `ParsedExprEmitter`
 * is not):
 *
 * IRNode rendering is **render-context-sensitive** in ways the IR
 * itself does not record: whether the current scope is the root of a
 * client component, whether the current node is the root of a loop
 * iteration, etc. Each adapter records these via its own pass-through
 * shape (Hono carries three flags, Go-template one, Mojo none). A
 * generic `Ctx` lets every adapter declare its own context shape
 * without leaking it into core, while the shared dispatcher still
 * threads the context unchanged into the per-kind methods.
 *
 * Leaf-kind methods (`text`, `expression`, `slot`) do not take `Ctx`
 * because none of them have children to recurse into — passing
 * context through them would be noise.
 */

import type {
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRComponent,
  IRFragment,
  IRSlot,
  IRIfStatement,
  IRProvider,
  IRAsync,
} from '../types.ts'

/**
 * Recursive emit callback handed to each visitor method. Adapters
 * decide what `Ctx` to pass when recursing into children — that's
 * how loop-item / root-of-client / scope-comment-wrap state
 * propagates without the dispatcher knowing about it.
 */
export type EmitIRNode<Ctx> = (node: IRNode, ctx: Ctx) => string

/**
 * Per-kind method names carry an `emit` prefix to avoid collision when
 * a single adapter class implements multiple visitor interfaces
 * (`ParsedExprEmitter` already owns `conditional`, future
 * `AttrValueEmitter` will own `literal`, etc.). The prefix also reads
 * naturally with the dispatcher: `emitIRNode` → `emitter.emitElement`.
 */
export interface IRNodeEmitter<Ctx = unknown> {
  emitElement(node: IRElement, ctx: Ctx, emit: EmitIRNode<Ctx>): string
  emitText(node: IRText): string
  emitExpression(node: IRExpression): string
  emitConditional(node: IRConditional, ctx: Ctx, emit: EmitIRNode<Ctx>): string
  emitLoop(node: IRLoop, ctx: Ctx, emit: EmitIRNode<Ctx>): string
  emitComponent(node: IRComponent, ctx: Ctx, emit: EmitIRNode<Ctx>): string
  emitFragment(node: IRFragment, ctx: Ctx, emit: EmitIRNode<Ctx>): string
  emitSlot(node: IRSlot): string
  emitIfStatement(node: IRIfStatement, ctx: Ctx, emit: EmitIRNode<Ctx>): string
  emitProvider(node: IRProvider, ctx: Ctx, emit: EmitIRNode<Ctx>): string
  emitAsync(node: IRAsync, ctx: Ctx, emit: EmitIRNode<Ctx>): string
}

export function emitIRNode<Ctx>(
  node: IRNode,
  emitter: IRNodeEmitter<Ctx>,
  ctx: Ctx,
): string {
  const emit: EmitIRNode<Ctx> = (child, childCtx) => emitIRNode(child, emitter, childCtx)
  switch (node.type) {
    case 'element':
      return emitter.emitElement(node, ctx, emit)
    case 'text':
      return emitter.emitText(node)
    case 'expression':
      return emitter.emitExpression(node)
    case 'conditional':
      return emitter.emitConditional(node, ctx, emit)
    case 'loop':
      return emitter.emitLoop(node, ctx, emit)
    case 'component':
      return emitter.emitComponent(node, ctx, emit)
    case 'fragment':
      return emitter.emitFragment(node, ctx, emit)
    case 'slot':
      return emitter.emitSlot(node)
    case 'if-statement':
      return emitter.emitIfStatement(node, ctx, emit)
    case 'provider':
      return emitter.emitProvider(node, ctx, emit)
    case 'async':
      return emitter.emitAsync(node, ctx, emit)
    default: {
      const _exhaustive: never = node
      throw new Error(
        `emitIRNode: unhandled IRNode kind ${(_exhaustive as { type: string }).type}`,
      )
    }
  }
}
