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
 */

import type {
  AttrValue,
  IRNode,
  IRTemplatePart,
  SourceLocation,
} from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import { parseExpression } from './expression-parser.ts'

export interface TemplatePosition {
  expr: ParsedExpr
  loc: SourceLocation
  /** The attribute or prop name, when the position is an attribute / prop value. */
  attrName?: string
}

export function walkTemplatePositions(root: IRNode, visit: (position: TemplatePosition) => void): void {
  walkNode(root, visit)
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
    visit({ expr: parseExpression(trimmed), loc, attrName })
  }
  for (const part of parts) {
    if (part.type === 'ternary') {
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
  visit: (position: TemplatePosition) => void,
): void {
  if (clientOnly) return
  if (value.kind === 'expression') {
    if (value.parsed) visit({ expr: value.parsed, loc, attrName })
    if (value.parts) walkTemplateParts(value.parts, loc, attrName, visit)
  } else if (value.kind === 'spread') {
    if (value.parsed) visit({ expr: value.parsed, loc, attrName })
  } else if (value.kind === 'template') {
    walkTemplateParts(value.parts, loc, attrName, visit)
  }
}

function walkNode(node: IRNode, visit: (position: TemplatePosition) => void): void {
  if (node.type === 'expression') {
    if (!node.clientOnly && node.parsed) visit({ expr: node.parsed, loc: node.loc })
  } else if (node.type === 'conditional') {
    if (!node.clientOnly && node.parsedCondition) visit({ expr: node.parsedCondition, loc: node.loc })
  } else if (node.type === 'if-statement') {
    if (node.parsedCondition) visit({ expr: node.parsedCondition, loc: node.loc })
  }

  if (node.type === 'element') {
    for (const attr of node.attrs) walkAttrValue(attr.value, attr.clientOnly, attr.loc, attr.name, visit)
  } else if (node.type === 'component') {
    for (const prop of node.props) walkAttrValue(prop.value, prop.clientOnly, prop.loc, prop.name, visit)
  } else if (node.type === 'provider') {
    walkAttrValue(node.valueProp.value, node.valueProp.clientOnly, node.valueProp.loc, 'value', visit)
  }

  switch (node.type) {
    case 'element':
    case 'component':
    case 'fragment':
    case 'provider':
      for (const child of node.children) walkNode(child, visit)
      break
    case 'async':
      walkNode(node.fallback, visit)
      for (const child of node.children) walkNode(child, visit)
      break
    case 'loop': {
      if (node.clientOnly) break
      if (node.arrayParsed) visit({ expr: node.arrayParsed, loc: node.loc })
      for (const child of node.children) walkNode(child, visit)
      if (node.childComponent) {
        for (const child of node.childComponent.children) walkNode(child, visit)
      }
      for (const nested of node.nestedComponents ?? []) {
        for (const child of nested.children) walkNode(child, visit)
      }
      for (const seg of node.flatMapCallback?.segments ?? []) {
        if (seg.kind === 'jsx') walkNode(seg.ir, visit)
      }
      for (const seg of node.preamble?.segments ?? []) {
        if (seg.kind === 'jsx') walkNode(seg.ir, visit)
      }
      break
    }
    case 'conditional':
      if (node.clientOnly) break
      walkNode(node.whenTrue, visit)
      walkNode(node.whenFalse, visit)
      break
    case 'if-statement':
      walkNode(node.consequent, visit)
      if (node.alternate) walkNode(node.alternate, visit)
      break
  }
}
