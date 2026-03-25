/**
 * IR → HTML template string generation and validation.
 */

import type { IRNode } from '../types'
import { isBooleanAttr } from '../html-constants'
import { toHtmlAttrName, attrValueToString, quotePropName, PROPS_PARAM } from './utils'

/**
 * Protect string literals from regex-based replacements.
 * Returns protect/restore functions that extract string literals before
 * regex replacements and restore them after.
 */
export function createStringProtector(): {
  protect: (s: string) => string
  restore: (s: string) => string
} {
  const strings: string[] = []
  const protect = (s: string): string => {
    return s.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, (match) => {
      const idx = strings.length
      strings.push(match)
      return `__STRLIT_${idx}__`
    })
  }
  const restore = (s: string): string => {
    return s.replace(/__STRLIT_(\d+)__/g, (_, idx) => strings[Number(idx)])
  }
  return { protect, restore }
}

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/**
 * Generate a template expression for a dynamic attribute.
 * Unifies boolean, presenceOrUndefined, and generic dynamic attribute handling.
 *
 * - Boolean attrs and presenceOrUndefined: render attribute name when truthy, empty string when falsy
 * - Generic dynamic attrs: render `name="value"` when non-null, empty string otherwise
 *
 * @param attrName - The HTML attribute name
 * @param valExpr - The already-transformed value expression string
 * @param attr - Attribute metadata (only presenceOrUndefined flag is used)
 */
function templateAttrExpr(attrName: string, valExpr: string, attr: { presenceOrUndefined?: boolean }): string {
  if (isBooleanAttr(attrName) || attr.presenceOrUndefined) {
    return `\${${valExpr} ? '${attrName}' : ''}`
  }
  return `\${(${valExpr}) != null ? '${attrName}="' + (${valExpr}) + '"' : ''}`
}

/** Convert an IR node tree to an HTML template string (for conditionals/loops). */
export function irToHtmlTemplate(node: IRNode, restSpreadNames?: Set<string>): string {
  const recurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames)

  switch (node.type) {
    case 'element': {
      const attrParts = node.attrs
        .map((a) => {
          if (a.name === '...') {
            const spreadValue = typeof a.value === 'string' ? a.value : null
            if (!spreadValue) return ''
            if (restSpreadNames?.has(spreadValue)) return ''
            return `\${spreadAttrs(${spreadValue})}`
          }
          // Convert JSX `key` to `data-key` so reconcileList can match elements
          const attrName = a.name === 'key' ? 'data-key' : toHtmlAttrName(a.name)
          if (a.value === null) return attrName
          // Resolve IRTemplateLiteral to string expression for use in template literals
          const valExpr = typeof a.value === 'string' ? a.value : attrValueToString(a.value)
          if (a.dynamic) return templateAttrExpr(attrName, valExpr, a)
          return `${attrName}="${valExpr}"`
        })
        .filter(Boolean)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const children = node.children.map(recurse).join('')

      // Non-void elements must use open+close tags (HTML parsers ignore self-closing on div, span, etc.)
      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      return node.value

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      if (node.slotId) {
        return `<!--bf:${node.slotId}-->\${${node.expr}}<!--/-->`
      }
      return `\${${node.expr}}`

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${node.condition} ? \`${trueHtml}\` : \`${falseHtml}\`}`
    }

    case 'fragment':
      return node.children.map(recurse).join('')

    case 'component': {
      // Portal is a special pass-through component - render its children directly
      // Portal moves content to document.body, so we need the actual content in templates
      if (node.name === 'Portal') {
        return node.children.map(recurse).join('')
      }

      // Use renderChild() to render child component's registered template at runtime.
      // This allows stateless components in conditional branches to render their content
      // instead of emitting empty placeholders (#435).
      const propsEntries = node.props
        .filter(p => p.name !== '...' && !p.name.startsWith('...') && p.name !== 'key')
        .filter(p => !(p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()))
        .map(p => {
          // JSX prop: render children inline as template literal
          if (p.jsxChildren?.length) {
            const childHtml = p.jsxChildren.map(c => recurse(c)).join('')
            return `${quotePropName(p.name)}: \`${childHtml}\``
          }
          if (p.isLiteral) return `${quotePropName(p.name)}: ${JSON.stringify(p.value)}`
          return `${quotePropName(p.name)}: ${p.value}`
        })
      // Include children as a prop for renderChild() template rendering
      if (node.children.length > 0) {
        const childHtml = node.children.map(recurse).join('')
        propsEntries.push(`children: \`${childHtml}\``)
      }
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${keyProp.value}` : ''
      // Pass slotId as suffix so $c() can find the child component by slot after branch swap
      const slotArg = node.slotId ? `, '${node.slotId}'` : ''
      return `\${renderChild('${node.name}', ${propsExpr}${keyArg || (slotArg ? ', undefined' : '')}${slotArg})}`
    }

    case 'loop': {
      // Generate inline .map().join('') so loop variables are properly scoped
      const childTemplate = node.children.map(recurse).join('')
      const indexParam = node.index ? `, ${node.index}` : ''
      if (node.mapPreamble) {
        return `\${${node.array}.map((${node.param}${indexParam}) => { ${node.mapPreamble} return \`${childTemplate}\` }).join('')}`
      }
      return `\${${node.array}.map((${node.param}${indexParam}) => \`${childTemplate}\`).join('')}`
    }

    case 'if-statement':
      return ''

    case 'provider':
      return node.children.map(recurse).join('')

    default:
      return ''
  }
}

/**
 * Convert IR children into a JavaScript expression string for createComponent.
 * Produces expressions suitable for use in `get children() { return <expr> }`.
 *
 * - IRComponent → createComponent('Name', { get prop() {...}, get children() {...} })
 * - IRExpression → the expression directly
 * - IRText → JSON string literal
 * - IRElement → template literal via irToHtmlTemplate()
 * - IRFragment → recurse into children
 * - IRConditional → ternary expression
 * - Single child → single expression; multiple → array literal
 */
export function irChildrenToJsExpr(children: IRNode[]): string {
  // Flatten fragments and filter empty text nodes
  const exprs = children.flatMap(c => irNodeToJsExprs(c)).filter(Boolean)
  if (exprs.length === 0) return "''"
  if (exprs.length === 1) return exprs[0]
  return `[${exprs.join(', ')}]`
}

function irNodeToJsExprs(node: IRNode): string[] {
  switch (node.type) {
    case 'component': {
      const propsEntries: string[] = node.props
        .filter(p => p.name !== 'key' && p.name !== '...' && !p.name.startsWith('...'))
        .map(p => {
          if (p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()) {
            return `${quotePropName(p.name)}: ${p.value}`
          }
          // JSX prop: generate getter using IR children → JS expression
          if (p.jsxChildren?.length) {
            return `get ${quotePropName(p.name)}() { return ${irChildrenToJsExpr(p.jsxChildren)} }`
          }
          if (p.isLiteral) {
            return `get ${quotePropName(p.name)}() { return ${JSON.stringify(p.value)} }`
          }
          return `get ${quotePropName(p.name)}() { return ${p.value} }`
        })

      if (node.children.length > 0) {
        const childrenExpr = irChildrenToJsExpr(node.children)
        propsEntries.push(`get children() { return ${childrenExpr} }`)
      }

      const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'
      return [`createComponent('${node.name}', ${propsExpr})`]
    }

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return []
      return [node.expr]

    case 'text':
      if (!node.value.trim()) return []
      return [JSON.stringify(node.value)]

    case 'element':
      return [`\`${irToHtmlTemplate(node)}\``]

    case 'fragment':
      return node.children.flatMap(c => irNodeToJsExprs(c))

    case 'conditional':
      return [`${node.condition} ? ${irChildrenToJsExpr([node.whenTrue])} : ${irChildrenToJsExpr([node.whenFalse])}`]

    default:
      return []
  }
}

/**
 * Add bf-c attribute to the first element in an HTML template string.
 * This ensures cond() can find the element for subsequent swaps.
 */
export function addCondAttrToTemplate(html: string, condId: string): string {
  if (/^<\w+/.test(html)) {
    return html.replace(/^(<\w+)(\s|>)/, `$1 bf-c="${condId}"$2`)
  }
  // Text nodes use comment markers instead of attributes
  return `<!--bf-cond-start:${condId}-->${html}<!--bf-cond-end:${condId}-->`
}

/**
 * Options for template generation functions (irToComponentTemplate, generateCsrTemplate).
 * Consolidates parameters to prevent argument-passing bugs during recursion.
 */
export interface TemplateOptions {
  propNames: Set<string>
  inlinableConstants?: Map<string, string>
  restSpreadNames?: Set<string>
  propsObjectName?: string | null
  // generateCsrTemplate-specific fields
  signalMap?: Map<string, string>
  memoMap?: Map<string, string>
  insideLoop?: boolean
}

/**
 * Generate HTML template for registerTemplate().
 * Used for client-side component creation via createComponent().
 *
 * This is similar to irToHtmlTemplate but:
 * - Expressions are transformed to use the template function's props parameter
 * - Local constant references are inlined with their resolved values (#343)
 * - bf markers ARE included so client code can find elements
 */
export function irToComponentTemplate(
  node: IRNode,
  propNames: Set<string>,
  inlinableConstants?: Map<string, string>,
  restSpreadNames?: Set<string>,
  propsObjectName?: string | null
): string {
  return irToComponentTemplateWithOpts(node, { propNames, inlinableConstants, restSpreadNames, propsObjectName })
}

function irToComponentTemplateWithOpts(node: IRNode, opts: TemplateOptions): string {
  const { propNames, inlinableConstants, restSpreadNames, propsObjectName } = opts
  const recurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, opts)
  const transformExpr = (expr: string): string => {
    const { protect, restore } = createStringProtector()
    let result = protect(expr)

    // First: inline constant references with their resolved values (#343)
    // Parenthesized to prevent operator precedence issues.
    // (?<![-.]) avoids matching inside CSS property names (e.g., `width` in `max-width`).
    if (inlinableConstants && inlinableConstants.size > 0) {
      for (const [constName, constValue] of inlinableConstants) {
        result = result.replace(new RegExp(`(?<![-.])\\b${constName}\\b`, 'g'), `(${protect(constValue)})`)
      }
    }

    // Normalize source-level props object access (e.g., props.xxx → _p.xxx)
    // before the bare propName prefixing step to avoid double-prefixing.
    if (propsObjectName && propsObjectName !== PROPS_PARAM) {
      result = result.replace(
        new RegExp(`\\b${propsObjectName}\\.`, 'g'),
        `${PROPS_PARAM}.`,
      )
    }

    // Then: prefix prop names with PROPS_PARAM
    for (const propName of propNames) {
      // Match propName as standalone identifier or followed by property/index/call access,
      // but not already prefixed with PROPS_PARAM or inside string literals.
      // Uses negative lookahead for identifier chars to avoid partial matches.
      const pattern = new RegExp(`(?<!${PROPS_PARAM}\\.)(?<!['"\\w-])\\b${propName}\\b(?![a-zA-Z0-9_$])`, 'g')
      result = result.replace(pattern, `${PROPS_PARAM}.${propName}`)
    }
    return restore(result)
  }

  switch (node.type) {
    case 'element': {
      const attrParts = node.attrs
        .map((a) => {
          if (a.name === '...') {
            const spreadValue = attrValueToString(a.value)
            if (!spreadValue) return ''
            if (restSpreadNames?.has(spreadValue)) return ''
            return `\${spreadAttrs(${transformExpr(spreadValue)})}`
          }
          if (a.name === 'key') return ''
          const attrName = toHtmlAttrName(a.name)
          if (a.value === null) return attrName
          const valueStr = attrValueToString(a.value)
          if (a.dynamic && valueStr) return templateAttrExpr(attrName, transformExpr(valueStr), a)
          if (valueStr) return `${attrName}="${valueStr}"`
          return attrName
        })
        .filter(Boolean)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const children = node.children.map(recurse).join('')

      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      return node.value

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      if (node.slotId) {
        return `<!--bf:${node.slotId}-->\${${transformExpr(node.expr)}}<!--/-->`
      }
      return `\${${transformExpr(node.expr)}}`

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${transformExpr(node.condition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
    }

    case 'fragment':
      return node.children.map(recurse).join('')

    case 'component': {
      if (node.name === 'Portal') {
        return node.children.map(recurse).join('')
      }

      // Use renderChild() to render child component's template at runtime (#435)
      const propsEntries = node.props
        .filter(p => p.name !== '...' && !p.name.startsWith('...') && p.name !== 'key')
        .filter(p => !(p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()))
        .map(p => {
          if (p.jsxChildren?.length) {
            const childHtml = p.jsxChildren.map(recurse).join('')
            return `${quotePropName(p.name)}: \`${childHtml}\``
          }
          if (p.isLiteral) return `${quotePropName(p.name)}: ${JSON.stringify(p.value)}`
          const valueStr = attrValueToString(p.value)
          return `${quotePropName(p.name)}: ${valueStr ? transformExpr(valueStr) : JSON.stringify(p.value)}`
        })
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${transformExpr(keyProp.value)}` : ''
      return `\${renderChild('${node.name}', ${propsExpr}${keyArg})}`
    }

    case 'loop':
      return node.children.map(recurse).join('')

    case 'if-statement':
      return ''

    case 'provider':
      return node.children.map(recurse).join('')

    default:
      return ''
  }
}

/**
 * Check if an expression references any identifier from the given set.
 * Used to detect unsafe local variable references in template expressions (#343).
 */
function expressionReferencesAny(expr: string, names: Set<string>): boolean {
  for (const name of names) {
    if (new RegExp(`\\b${name}\\b`).test(expr)) {
      return true
    }
  }
  return false
}

/**
 * Check if a component can have a simple static template generated.
 * Returns false if the component has:
 * - Loops (which use dynamic signal arrays)
 * - Child components (which can't be fully represented in templates)
 * - Signal calls in expressions (like todos().length)
 * - References to local variables not available at module scope (#343)
 *
 * Components that fail this check should not have registerTemplate() generated
 * as the template would reference undefined variables at module scope.
 *
 * @param node - IR node to check
 * @param propNames - Set of prop names (safe to reference via props parameter)
 * @param inlinableConstants - Constants that can be substituted with their values
 * @param unsafeLocalNames - Local names that cannot be used in module-scope templates
 */
export function canGenerateStaticTemplate(
  node: IRNode,
  propNames: Set<string>,
  inlinableConstants?: Map<string, string>,
  unsafeLocalNames?: Set<string>
): boolean {
  const hasUnsafeRef = (expr: string): boolean => {
    return !!(unsafeLocalNames && unsafeLocalNames.size > 0 && expressionReferencesAny(expr, unsafeLocalNames))
  }

  switch (node.type) {
    case 'loop':
      return false

    case 'component':
      return false

    case 'expression':
      if (hasUnsafeRef(node.expr)) return false
      if (node.expr.includes('()') && !isSimplePropExpression(node.expr, propNames)) {
        return false
      }
      return true

    case 'element':
      for (const attr of node.attrs) {
        if (attr.name === '...') {
          // Computed local spreads are now handled by spreadAttrs() at runtime.
          // Only check for unsafe references that would fail at module scope.
          const valueStr = attrValueToString(attr.value)
          if (valueStr && hasUnsafeRef(valueStr)) return false
          if (valueStr && valueStr.includes('()') && !isSimplePropExpression(valueStr, propNames)) return false
          continue
        }
        if (attr.dynamic && attr.value) {
          const valueStr = attrValueToString(attr.value)
          if (valueStr) {
            if (hasUnsafeRef(valueStr)) return false
            if (valueStr.includes('()') && !isSimplePropExpression(valueStr, propNames)) {
              return false
            }
          }
        }
      }
      return node.children.every((c) => canGenerateStaticTemplate(c, propNames, inlinableConstants, unsafeLocalNames))

    case 'conditional':
      if (hasUnsafeRef(node.condition)) return false
      if (node.condition.includes('()') && !isSimplePropExpression(node.condition, propNames)) {
        return false
      }
      return canGenerateStaticTemplate(node.whenTrue, propNames, inlinableConstants, unsafeLocalNames) &&
             canGenerateStaticTemplate(node.whenFalse, propNames, inlinableConstants, unsafeLocalNames)

    case 'fragment':
      return node.children.every((c) => canGenerateStaticTemplate(c, propNames, inlinableConstants, unsafeLocalNames))

    case 'if-statement':
      if (!canGenerateStaticTemplate(node.consequent, propNames, inlinableConstants, unsafeLocalNames)) {
        return false
      }
      if (node.alternate && !canGenerateStaticTemplate(node.alternate, propNames, inlinableConstants, unsafeLocalNames)) {
        return false
      }
      return true

    case 'provider':
      return node.children.every((c) => canGenerateStaticTemplate(c, propNames, inlinableConstants, unsafeLocalNames))

    case 'text':
      return true

    default:
      return true
  }
}

/**
 * Generate HTML template for CSR mode.
 * Unlike irToComponentTemplate(), this handles stateful components:
 * - Signal getter calls (e.g., count()) are replaced with initial value expressions
 * - Memo getter calls (e.g., doubled()) are replaced with their computation expressions
 * - Loops generate .map().join('') for inline rendering
 * - Child components use renderChild() for runtime template lookup
 *
 * @param node - IR node to render
 * @param propNames - Set of prop names to prefix with 'props.'
 * @param inlinableConstants - Map of constant names to their resolved values
 * @param signalMap - Map of signal getter names to their initial value expressions
 * @param memoMap - Map of memo names to their computation expressions (with signals already replaced)
 */
export function generateCsrTemplate(
  node: IRNode,
  propNames: Set<string>,
  inlinableConstants?: Map<string, string>,
  signalMap?: Map<string, string>,
  memoMap?: Map<string, string>,
  insideLoop?: boolean,
  restSpreadNames?: Set<string>,
  propsObjectName?: string | null,
): string {
  return generateCsrTemplateWithOpts(node, { propNames, inlinableConstants, restSpreadNames, propsObjectName, signalMap, memoMap, insideLoop })
}

function generateCsrTemplateWithOpts(node: IRNode, opts: TemplateOptions): string {
  const { propNames, inlinableConstants, restSpreadNames, propsObjectName, signalMap, memoMap, insideLoop } = opts
  const transformExpr = (expr: string): string => {
    const { protect, restore } = createStringProtector()
    let result = protect(expr)

    // Replace signal getter calls with initial values: count() → (props.initial ?? 0)
    // Protect new string literals from inlined values
    if (signalMap && signalMap.size > 0) {
      for (const [getter, initialValue] of signalMap) {
        result = result.replace(new RegExp(`\\b${getter}\\(\\)`, 'g'), `(${protect(initialValue)})`)
      }
    }

    // Replace memo getter calls with computation expressions: doubled() → ((props.initial ?? 0) * 2)
    if (memoMap && memoMap.size > 0) {
      for (const [name, computation] of memoMap) {
        result = result.replace(new RegExp(`\\b${name}\\(\\)`, 'g'), `(${protect(computation)})`)
      }
    }

    // Inline constant references with their resolved values.
    // (?<![-.]) avoids matching inside CSS property names (e.g., `width` in `max-width`).
    if (inlinableConstants && inlinableConstants.size > 0) {
      for (const [constName, constValue] of inlinableConstants) {
        result = result.replace(new RegExp(`(?<![-.])\\b${constName}\\b`, 'g'), `(${protect(constValue)})`)
      }
    }

    // Re-run signal/memo replacement after constant inlining.
    // Inlined constant values may contain signal/memo calls that need resolution.
    if (signalMap && signalMap.size > 0) {
      for (const [getter, initialValue] of signalMap) {
        result = result.replace(new RegExp(`\\b${getter}\\(\\)`, 'g'), `(${protect(initialValue)})`)
      }
    }
    if (memoMap && memoMap.size > 0) {
      for (const [name, computation] of memoMap) {
        result = result.replace(new RegExp(`\\b${name}\\(\\)`, 'g'), `(${protect(computation)})`)
      }
    }

    // Normalize source-level props object access (e.g., props.xxx → _p.xxx)
    if (propsObjectName && propsObjectName !== PROPS_PARAM) {
      result = result.replace(
        new RegExp(`\\b${propsObjectName}\\.`, 'g'),
        `${PROPS_PARAM}.`,
      )
    }

    // Prefix prop names with PROPS_PARAM
    for (const propName of propNames) {
      const pattern = new RegExp(`(?<!${PROPS_PARAM}\\.)(?<!['"\\w-])\\b${propName}\\b(?![a-zA-Z0-9_$])`, 'g')
      result = result.replace(pattern, `${PROPS_PARAM}.${propName}`)
    }
    return restore(result)
  }

  const recurse = (n: IRNode): string => generateCsrTemplateWithOpts(n, opts)
  const recurseInLoop = (n: IRNode): string => generateCsrTemplateWithOpts(n, { ...opts, insideLoop: true })

  switch (node.type) {
    case 'element': {
      const attrParts = node.attrs
        .map((a) => {
          if (a.name === '...') {
            const spreadValue = attrValueToString(a.value)
            if (!spreadValue) return ''
            if (restSpreadNames?.has(spreadValue)) return ''
            return `\${spreadAttrs(${transformExpr(spreadValue)})}`
          }
          const attrName = a.name === 'key' ? 'data-key' : toHtmlAttrName(a.name)
          if (a.value === null) return attrName
          const valueStr = attrValueToString(a.value)
          if (a.dynamic && valueStr) return templateAttrExpr(attrName, transformExpr(valueStr), a)
          if (valueStr) return `${attrName}="${valueStr}"`
          return attrName
        })
        .filter(Boolean)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const children = node.children.map(recurse).join('')

      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      return node.value

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      // clientOnly expressions use bf-client: markers (matched by updateClientMarker).
      // The initial value is injected by the effect, not the template.
      if (node.clientOnly && node.slotId) {
        return `<!--bf-client:${node.slotId}--><!--/-->`
      }
      if (node.slotId) {
        return `<!--bf:${node.slotId}-->\${${transformExpr(node.expr)}}<!--/-->`
      }
      return `\${${transformExpr(node.expr)}}`

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${transformExpr(node.condition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
    }

    case 'fragment':
      return node.children.map(recurse).join('')

    case 'component': {
      if (node.name === 'Portal') {
        return node.children.map(recurse).join('')
      }

      const propsEntries = node.props
        .filter(p => p.name !== '...' && !p.name.startsWith('...') && p.name !== 'key')
        .filter(p => !(p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase()))
        .map(p => {
          if (p.jsxChildren?.length) {
            const childHtml = p.jsxChildren.map(c => recurse(c)).join('')
            return `${quotePropName(p.name)}: \`${childHtml}\``
          }
          if (p.isLiteral) return `${quotePropName(p.name)}: ${JSON.stringify(p.value)}`
          const valueStr = attrValueToString(p.value)
          return `${quotePropName(p.name)}: ${valueStr ? transformExpr(valueStr) : JSON.stringify(p.value)}`
        })
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${transformExpr(keyProp.value)}` : ''
      // Pass slotId as suffix so $c() can find the child by slot.
      // Skip slotSuffix inside loops — loop children are found by name prefix, not slot suffix.
      const slotArg = (!insideLoop && node.slotId) ? `, '${node.slotId}'` : ''
      return `\${renderChild('${node.name}', ${propsExpr}${keyArg || (slotArg ? ', undefined' : '')}${slotArg})}`
    }

    case 'loop': {
      // Generate inline .map().join('') so loop variables are properly scoped
      const childTemplate = node.children.map(recurseInLoop).join('')
      const indexParam = node.index ? `, ${node.index}` : ''
      if (node.mapPreamble) {
        return `\${${transformExpr(node.array)}.map((${node.param}${indexParam}) => { ${node.mapPreamble} return \`${childTemplate}\` }).join('')}`
      }
      return `\${${transformExpr(node.array)}.map((${node.param}${indexParam}) => \`${childTemplate}\`).join('')}`
    }

    case 'if-statement': {
      const consequent = recurse(node.consequent)
      const alternate = node.alternate ? recurse(node.alternate) : ''
      return `\${${transformExpr(node.condition)} ? \`${consequent}\` : \`${alternate}\`}`
    }

    case 'provider':
      return node.children.map(recurse).join('')

    default:
      return ''
  }
}

/**
 * Check if an expression is a simple prop-based expression.
 * Simple prop expressions access props only: todo.done, todo.text, props.name
 * Non-prop expressions call signals: todos(), todos().length, todos().filter(...)
 */
export function isSimplePropExpression(expr: string, propNames: Set<string>): boolean {
  const match = expr.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/)
  if (!match) {
    // No identifier at start (e.g., template literal `${...}`) — check for signal calls
    return !expr.includes('()')
  }

  const rootIdent = match[1]
  if (propNames.has(rootIdent)) {
    // Even if root is a prop name, calling it as a function means it's a signal getter
    const rest = expr.slice(rootIdent.length)
    if (rest.startsWith('(')) return false
    return true
  }
  if (expr.includes('()')) return false

  return true
}
