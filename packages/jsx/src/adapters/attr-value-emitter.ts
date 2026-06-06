/**
 * Shared AttrValue emitter (#1290 step 2).
 *
 * The same drift hazard that motivated `ParsedExprEmitter` and
 * `IRNodeEmitter` also lives in every adapter's
 * `switch (v.kind)` over `AttrValue`. Two switches per adapter:
 *
 *   - `renderAttributes` (intrinsic-element attribute lowering)
 *   - `renderComponentProps` (component-prop lowering)
 *
 * Each adapter writes its own `default` arm; a new `AttrValue.kind`
 * silently disappears in any adapter that didn't get updated.
 *
 * This module gives `AttrValue` the same shape: one shared dispatcher
 * with an `assertNever` default, and a visitor interface
 * (`AttrValueEmitter`) per emission context.
 *
 * Two contexts → two emitters:
 *
 *   - **Element attribute** context (`renderAttributes`) — the result
 *     is an HTML attribute (`name="value"` or `name={expr}` in JSX).
 *   - **Component prop** context (`renderComponentProps`) — the result
 *     is a JSX-style prop on a component invocation
 *     (`propName={value}`, etc.).
 *
 * The two contexts produce different output for the same kind
 * (e.g. `expression` carries the boolean-attr fold in the attribute
 * context but not in the prop context). Rather than ctx-switching
 * inside each visitor method (which would re-introduce the very kind
 * of in-method branching the visitor is trying to eliminate),
 * adapters provide two `AttrValueEmitter` instances — one per context.
 *
 * Both emitters implement the same `AttrValueEmitter` interface, so
 * the kind-exhaustiveness check applies to both.
 */

import type {
  AttrValue,
  LiteralAttr,
  ExpressionAttr,
  BooleanAttr,
  BooleanShorthandAttr,
  TemplateAttr,
  SpreadAttr,
  JsxChildrenAttr,
} from '../types.ts'

/**
 * Per-kind methods carry an `emit` prefix (same convention as
 * `IRNodeEmitter`) so a single adapter class can implement multiple
 * visitor interfaces without name collisions. The `name` argument is
 * the attribute / prop name the kind is being lowered for; adapters
 * fold it into the emitted string (`name="value"`, `name={expr}`, …).
 */
export interface AttrValueEmitter {
  emitLiteral(value: LiteralAttr, name: string): string
  emitExpression(value: ExpressionAttr, name: string): string
  emitBooleanAttr(value: BooleanAttr, name: string): string
  emitBooleanShorthand(value: BooleanShorthandAttr, name: string): string
  emitTemplate(value: TemplateAttr, name: string): string
  emitSpread(value: SpreadAttr, name: string): string
  emitJsxChildren(value: JsxChildrenAttr, name: string): string
}

/**
 * Dispatch one `AttrValue` through the supplied visitor. The `name`
 * argument threads the attribute / prop name into the visitor methods
 * unchanged.
 *
 * The `assertNever` arm in the `default` makes a new `AttrValue.kind`
 * a TS compile error in every adapter that hasn't extended its
 * emitter implementations.
 */
export function emitAttrValue(
  value: AttrValue,
  emitter: AttrValueEmitter,
  name: string,
): string {
  switch (value.kind) {
    case 'literal':
      return emitter.emitLiteral(value, name)
    case 'expression':
      return emitter.emitExpression(value, name)
    case 'boolean-attr':
      return emitter.emitBooleanAttr(value, name)
    case 'boolean-shorthand':
      return emitter.emitBooleanShorthand(value, name)
    case 'template':
      return emitter.emitTemplate(value, name)
    case 'spread':
      return emitter.emitSpread(value, name)
    case 'jsx-children':
      return emitter.emitJsxChildren(value, name)
    default: {
      const _exhaustive: never = value
      throw new Error(
        `emitAttrValue: unhandled AttrValue kind ${(_exhaustive as { kind: string }).kind}`,
      )
    }
  }
}
