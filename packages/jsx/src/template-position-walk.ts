/**
 * Every template-lowered position in a component's IR, as parsed expressions.
 *
 * Shared by the policy refusals that fire in the IR-build phase ahead of every
 * adapter's `generate()` — `checkAuthoredFormatDateCalls` (BF056) and
 * `checkAsyncActionReads` (BF117) — so "every position a template could
 * render" is decided once. Covered: text expressions, conditional and
 * if-statement conditions, element / component / provider attribute values
 * (expression, spread, and structured template parts), loop arrays, and the
 * children of elements, components, fragments, providers, async boundaries,
 * loops (including child components, nested components, and `flatMap` /
 * preamble JSX segments) and conditional branches.
 *
 * A `/* @client *\/`-marked position (`clientOnly`) is skipped: the whole read
 * is deferred to the client, where real JS evaluates it.
 *
 * Each position also reports its `role` — how the template USES the value
 * there (rendered as text, tested for truthiness, written as an attribute…)
 * — and, for the two roles a pass may rewrite in place, the IR `host` that
 * holds it. The action-accessor seed (`action-accessor.ts`, #3166) reads
 * both: a seed is only sound where it renders like the reference adapter,
 * which depends on the role, and BF117's refusal-lift and the seed itself
 * must see the SAME position set, which is why both ride this one walk.
 * BF056 reads neither.
 */

import type {
  AttrValue,
  ExpressionAttr,
  IRConditional,
  IRIfStatement,
  IRLoop,
  IRNode,
  IRTemplatePart,
  SourceLocation,
} from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import { parseExpression } from './expression-parser.ts'
import type { BindingScope } from './scope/binding-scope.ts'

/**
 * How the template uses the value at a position:
 *
 * - `text` — an `IRExpression` child, rendered as text.
 * - `condition` — an `IRConditional` / `IRIfStatement` condition, only ever
 *   tested for truthiness.
 * - `element-attr` — an intrinsic element's attribute value (an `expression`
 *   attr's whole parse), rendered as the attribute.
 * - `prop` — a component prop or a provider's `value`, handed on as a value.
 * - `spread` — a spread bag (`{...x}`), on an element or a component.
 * - `template-part` — a piece of a structured template attribute
 *   (`IRTemplatePart` ternary condition / branch, lookup key). These are raw
 *   text parsed on demand here; every adapter lowers them from that raw text,
 *   so nothing attached to the IR can stand in for them.
 * - `loop-array` — a loop's array expression.
 */
export type TemplatePositionRole =
  | 'text'
  | 'condition'
  | 'element-attr'
  | 'prop'
  | 'spread'
  | 'template-part'
  | 'loop-array'

/**
 * The IR slot a position's `expr` lives in, for a pass that rewrites the
 * position in place (the action-accessor seed). Only the two roles such a
 * pass may rewrite carry one: a `condition` (its `parsedCondition` /
 * `templateCondition`) and an `element-attr` (the `ExpressionAttr`'s
 * `parsed` / `templateExpr`).
 */
export type TemplatePositionHost =
  | { kind: 'condition'; node: IRConditional | IRIfStatement }
  | { kind: 'element-attr'; value: ExpressionAttr }

export interface TemplatePosition {
  expr: ParsedExpr
  loc: SourceLocation
  role: TemplatePositionRole
  /** The attribute or prop name, when the position is an attribute / prop value. */
  attrName?: string
  host?: TemplatePositionHost
  /**
   * The scope the position is read in, when the walk was given the
   * component's scope: each loop's children are read in its row
   * (`BindingScope.enterLoopRow`), its array outside it. The innermost
   * scope wins: an outer wrapper never replaces a row's.
   */
  scope?: BindingScope
}

/**
 * Visit every template-lowered position under `root`. With `scope` (the
 * component's), each position also carries the scope it is read in.
 */
export function walkTemplatePositions(root: IRNode, visit: (position: TemplatePosition) => void, scope?: BindingScope): void {
  walkNode(root, scope ? (position) => visit({ scope, ...position }) : visit, scope)
}

/**
 * `IRTemplatePart.ternary.condition` / `.lookup.key` carry no attached parse
 * (unlike every other position here), so parse on demand. `ternary.whenTrue`
 * / `.whenFalse` are ALSO raw, unparsed text (the per-branch rendered
 * snippet), so they get the same on-demand treatment — this is the
 * `format-date-ternary` shape (#2843): a call in a ternary CONSEQUENT inside a
 * structured template-literal attribute.
 */
function walkTemplateParts(
  parts: readonly IRTemplatePart[],
  loc: SourceLocation,
  attrName: string | undefined,
  visit: (position: TemplatePosition) => void,
): void {
  const visitText = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    visit({ expr: parseExpression(trimmed), loc, role: 'template-part', attrName })
  }
  for (const part of parts) {
    if (part.type === 'expression') {
      visit({ expr: part.parsed, loc, role: 'template-part', attrName })
    } else if (part.type === 'ternary') {
      visitText(part.condition)
      visitText(part.whenTrue)
      visitText(part.whenFalse)
    } else if (part.type === 'lookup') {
      visitText(part.key)
    }
  }
}

function walkAttrValue(
  value: AttrValue,
  clientOnly: boolean | undefined,
  loc: SourceLocation,
  attrName: string,
  onElement: boolean,
  visit: (position: TemplatePosition) => void,
): void {
  if (clientOnly) return
  if (value.kind === 'expression') {
    if (value.parsed) {
      visit(
        onElement
          ? { expr: value.parsed, loc, role: 'element-attr', attrName, host: { kind: 'element-attr', value } }
          : { expr: value.parsed, loc, role: 'prop', attrName },
      )
    }
    if (value.parts) walkTemplateParts(value.parts, loc, attrName, visit)
  } else if (value.kind === 'spread') {
    if (value.parsed) visit({ expr: value.parsed, loc, role: 'spread', attrName })
  } else if (value.kind === 'template') {
    walkTemplateParts(value.parts, loc, attrName, visit)
  }
}

function walkNode(node: IRNode, visit: (position: TemplatePosition) => void, scope?: BindingScope): void {
  if (node.type === 'expression') {
    if (!node.clientOnly && node.parsed) visit({ expr: node.parsed, loc: node.loc, role: 'text' })
  } else if (node.type === 'conditional') {
    if (!node.clientOnly && node.parsedCondition) {
      visit({ expr: node.parsedCondition, loc: node.loc, role: 'condition', host: { kind: 'condition', node } })
    }
  } else if (node.type === 'if-statement') {
    if (node.parsedCondition) {
      visit({ expr: node.parsedCondition, loc: node.loc, role: 'condition', host: { kind: 'condition', node } })
    }
  }

  if (node.type === 'element') {
    for (const attr of node.attrs) walkAttrValue(attr.value, attr.clientOnly, attr.loc, attr.name, true, visit)
  } else if (node.type === 'component') {
    for (const prop of node.props) walkAttrValue(prop.value, prop.clientOnly, prop.loc, prop.name, false, visit)
  } else if (node.type === 'provider') {
    walkAttrValue(node.valueProp.value, node.valueProp.clientOnly, node.valueProp.loc, 'value', false, visit)
  }

  switch (node.type) {
    case 'element':
    case 'component':
    case 'fragment':
    case 'provider':
      for (const child of node.children) walkNode(child, visit, scope)
      break
    case 'async':
      walkNode(node.fallback, visit, scope)
      for (const child of node.children) walkNode(child, visit, scope)
      break
    case 'loop':
      walkLoop(node, visit, scope)
      break
    case 'conditional':
      if (node.clientOnly) break
      walkNode(node.whenTrue, visit, scope)
      walkNode(node.whenFalse, visit, scope)
      break
    case 'if-statement':
      walkNode(node.consequent, visit, scope)
      if (node.alternate) walkNode(node.alternate, visit, scope)
      break
  }
}

/** A loop's array, then its row's positions, each read in the row's scope. */
function walkLoop(node: IRLoop, visit: (position: TemplatePosition) => void, scope?: BindingScope): void {
  if (node.clientOnly) return
  if (node.arrayParsed) visit({ expr: node.arrayParsed, loc: node.loc, role: 'loop-array' })
  const row = scope?.enterLoopRow(node)
  const rowVisit = row ? (position: TemplatePosition) => visit({ scope: row, ...position }) : visit
  const children = [
    ...node.children,
    ...(node.childComponent?.children ?? []),
    ...(node.nestedComponents ?? []).flatMap(nested => nested.children),
    ...(node.flatMapCallback?.segments ?? []).flatMap(seg => (seg.kind === 'jsx' ? [seg.ir] : [])),
    ...(node.preamble?.segments ?? []).flatMap(seg => (seg.kind === 'jsx' ? [seg.ir] : [])),
  ]
  for (const child of children) walkNode(child, rowVisit, row)
}
