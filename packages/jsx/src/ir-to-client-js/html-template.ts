/**
 * IR → HTML template string generation and validation.
 */

import type { AttrValue, IRAttribute, IRNode } from '../types'
import { isBooleanAttr } from '../html-constants'
import { toHtmlAttrName, attrValueToString, quotePropName, PROPS_PARAM, DATA_BF_PH, keyAttrName, loopStartMarker, loopEndMarker, freeIdsFromRefs, setIntersects, wrapExprWithLoopParams } from './utils'
import type { LoopParamSpec } from './utils'
import { nameForRegistryRef } from './component-scope'
import { assertNever } from './walker'
import { buildSignalMemoEnv, csrSubstitute, applyPropsRewrite, type CsrEnv } from './csr-substitute'
import type { ClientJsContext } from './types'
import { BF_PARENT_SCOPE_PLACEHOLDER, BF_SCOPE } from '@barefootjs/shared'

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

function childrenPropEntry(
  children: IRNode[],
  recurse: (n: IRNode) => string,
): string | null {
  if (children.length === 0) return null
  return `children: \`${children.map(recurse).join('')}\``
}

// #1320 / #1335: emit a `bf-s` placeholder on the top-level hoisted
// element so the runtime can substitute the outer component's scope.
// The bare-element form (`children={<span/>}`) sets `needsScope: true`
// directly; the fragment-wrapped form (`children={<><span/></>}`) is
// unwrapped at IR-collection time (`unwrapHoistedFragment` in
// `jsx-to-ir.ts`) into the same shape, so both forms reach this gate.
function maybeHoistedScopeAttr(
  inHoistedChildren: boolean,
  node: { needsScope?: boolean },
): string | null {
  return inHoistedChildren && node.needsScope
    ? `${BF_SCOPE}="${BF_PARENT_SCOPE_PLACEHOLDER}"`
    : null
}

/**
 * Sentinel returned by the CSR template's `transformExpr` when the expression
 * references an init-body-only name (#1128). Equality with this sentinel is
 * how downstream emit sites decide to drop a renderChild prop, swap a loop
 * array for an empty array literal, or short-circuit a text expression to
 * an empty string. Module-internal — never appears in test fixtures.
 */
const UNSAFE_TEMPLATE_EXPR = 'undefined'

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
function templateAttrExpr(attrName: string, valExpr: string, presenceOrUndefined?: boolean): string {
  if (isBooleanAttr(attrName) || presenceOrUndefined) {
    return `\${${valExpr} ? '${attrName}' : ''}`
  }
  if (attrName === 'style') {
    return `\${((v) => v != null ? 'style="' + v + '"' : '')(styleToCss(${valExpr}))}`
  }
  // `data-key` / `data-key-N` is a reconciliation contract — every loop item
  // must carry one. Emit unconditionally; if the user passes `key={undefined}`
  // we want it to surface as `data-key="undefined"` (and ultimately a runtime
  // assertion in mapArray) rather than silently fall back to "no key".
  if (attrName === 'data-key' || attrName.startsWith('data-key-')) {
    return `${attrName}="\${${valExpr}}"`
  }
  return `\${(${valExpr}) != null ? '${attrName}="' + (${valExpr}) + '"' : ''}`
}

/**
 * Project a prop's `AttrValue` into its JS-expression string form suitable
 * for the `renderChild(..., propsObj, KEY)` `KEY` argument. `transformExpr`
 * applies the constant-inlining / props-rewrite pass used by the CSR
 * template path; for non-`expression`/`spread`/`template` variants we
 * delegate to the canonical projection.
 */
function transformKeyValue(value: AttrValue, transformExpr: (expr: string, templateExpr?: string) => string): string {
  switch (value.kind) {
    case 'expression':
    case 'spread':
      return transformExpr(value.expr, value.templateExpr)
    case 'template':
      return transformExpr(attrValueToString(value, { useTemplate: true }) ?? '')
    case 'literal':
      return JSON.stringify(value.value)
    case 'boolean-shorthand':
    case 'boolean-attr':
      return 'true'
    case 'jsx-children':
      return 'undefined'
  }
}

/**
 * Render one element attribute into its template-literal substring for the
 * SSR template path. Switches on `AttrValue.kind` exhaustively so a new
 * variant becomes a type error.
 *
 * `wrap` is the loop-param-accessor rewrite (`task.title` → `task().title`)
 * applied to any runtime-evaluated expression.
 *
 * Returns `''` to skip the attribute entirely (spread whose source is a
 * known rest-prop, or `jsx-children` which never appears on intrinsic
 * elements in well-formed IR).
 */
function renderTemplateAttrPart(
  attr: IRAttribute,
  attrName: string,
  wrap: (expr: string) => string,
  restSpreadNames?: Set<string>,
): string {
  const v = attr.value
  switch (v.kind) {
    case 'boolean-attr':
      return attrName
    case 'literal':
      return `${attrName}="${v.value}"`
    case 'expression': {
      const valExpr = wrap(v.expr)
      return templateAttrExpr(attrName, valExpr, v.presenceOrUndefined)
    }
    case 'template': {
      const tmplStr = attrValueToString(v) ?? ''
      return templateAttrExpr(attrName, wrap(tmplStr))
    }
    case 'spread': {
      if (restSpreadNames?.has(v.expr)) return ''
      // `wrap` lowers loop-param references — including destructured rest
      // bindings (`...rest` lifted via `paramBindings`) — into their item
      // accessor. Skipping it here meant `{...rest}` inside a `.map()`
      // emitted `spreadAttrs(rest)` with `rest` undefined at the render-item
      // scope (#1244).
      return `\${spreadAttrs(${wrap(v.expr)})}`
    }
    case 'boolean-shorthand':
    case 'jsx-children':
      // Neither variant is legal as an intrinsic-element attribute in
      // well-formed IR. Emit nothing rather than crashing.
      return ''
  }
}

/** Convert an IR node tree to an HTML template string (for conditionals/loops).
 *  @param loopDepth - Current nesting depth inside inner loops. 0 = outer loop level.
 *    When > 0, `key` attributes are converted to `data-key-{depth}` instead of `data-key`.
 *  @param branchSlotsVar - When set, Child-position expression interpolations
 *    are wrapped with `__bfSlot(EXPR, <branchSlotsVar>)` so the runtime can
 *    splice live `Node` returns into the parsed fragment instead of
 *    stringifying them via the template literal (#1213).
 *  @param insideLoop - When true, component nodes omit their `slotId` from the
 *    `renderChild` call. Each loop iteration produces its own scope (identified
 *    by `data-key`), so the parent-slot suffix would create scopes that don't
 *    match the SSR shape — see #1268 and the matching `insideLoop` guard in
 *    `generateCsrTemplate` (case `'component'`). Set to `true` when generating
 *    the per-iteration `staticItemTemplate` for static loops.
 */
export function irToHtmlTemplate(node: IRNode, restSpreadNames?: Set<string>, loopDepth = 0, loopParams?: ReadonlyArray<string | LoopParamSpec>, branchSlotsVar?: string, insideLoop = false, inHoistedChildren = false): string {
  const recurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames, loopDepth, loopParams, branchSlotsVar, insideLoop, inHoistedChildren)
  const wrapExpr = (expr: string) => wrapExprWithLoopParams(expr, loopParams)
  const wrapInterpolation = (expr: string): string => branchSlotsVar
    ? `__bfSlot(${expr}, ${branchSlotsVar})`
    : expr

  switch (node.type) {
    case 'element': {
      const attrParts = node.attrs
        .map((a) => {
          const attrName = a.name === '...'
            ? '...'
            : (a.name === 'key' ? keyAttrName(loopDepth) : toHtmlAttrName(a.name))
          return renderTemplateAttrPart(a, attrName, wrapExpr, restSpreadNames)
        })
        .filter(Boolean)

      const hoistedScopeAttr = maybeHoistedScopeAttr(inHoistedChildren, node)
      if (hoistedScopeAttr) attrParts.push(hoistedScopeAttr)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const childrenRecurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames, loopDepth, loopParams, branchSlotsVar, insideLoop, false)
      const children = node.children.map(childrenRecurse).join('')

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
        return `<!--bf:${node.slotId}-->\${${wrapInterpolation(wrapExpr(node.expr))}}<!--/-->`
      }
      return `\${${wrapInterpolation(wrapExpr(node.expr))}}`

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${wrapExpr(node.condition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
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
          // `/* @client */` defers the prop to hydrate via initChild.
          if (p.clientOnly) return null
          switch (p.value.kind) {
            case 'jsx-children': {
              const hoistedRecurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames, loopDepth, loopParams, branchSlotsVar, insideLoop, true)
              const childHtml = p.value.children.map(c => hoistedRecurse(c)).join('')
              return `${quotePropName(p.name)}: \`${childHtml}\``
            }
            case 'literal':
              return `${quotePropName(p.name)}: ${JSON.stringify(p.value.value)}`
            case 'boolean-shorthand':
              return `${quotePropName(p.name)}: true`
            case 'boolean-attr':
              return `${quotePropName(p.name)}: true`
            case 'expression':
            case 'template':
            case 'spread': {
              const expr = attrValueToString(p.value) ?? 'undefined'
              return `${quotePropName(p.name)}: ${expr}`
            }
          }
        })
        .filter((entry): entry is string => entry !== null)
      const childrenEntry = childrenPropEntry(node.children, recurse)
      if (childrenEntry) propsEntries.push(childrenEntry)
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${attrValueToString(keyProp.value) ?? 'undefined'}` : ''
      // Pass slotId as suffix so $c() can find the child component by slot
      // after branch swap. Inside a loop body each iteration owns a
      // separate scope (identified by `data-key`), so the parent-slot
      // suffix is dropped to avoid anchoring a deeply-nested child to a
      // wrong component-wrapper scope (#1268).
      const slotArg = (!insideLoop && node.slotId) ? `, '${node.slotId}'` : ''
      return `\${renderChild('${nameForRegistryRef(node.name)}', ${propsExpr}${keyArg || (slotArg ? ', undefined' : '')}${slotArg})}`
    }

    case 'loop': {
      // Generate inline .map().join('') so loop variables are properly scoped
      // Increment loopDepth so inner key attrs become data-key-N
      // Forward loopParams so expressions referencing outer/inner loop params
      // get wrapped as signal accessors (e.g., task.title → task().title).
      // `insideLoop` is preserved (not forced to `true`): downstream branch /
      // inner-loop templates depend on the legacy slot-suffix-keeping shape
      // to find scopes via `findSsrScopeBySlotIn`. The opt-in at the entry
      // call site is the only place that wants the suffix dropped (#1268
      // Case 1 — childComponent body materialize); propagating it through
      // every nested loop regressed form-builder's inner-loop Select wiring.
      const innerRecurse = (n: IRNode): string => irToHtmlTemplate(n, restSpreadNames, loopDepth + 1, loopParams, branchSlotsVar, insideLoop)
      const childTemplate = node.children.map(innerRecurse).join('')
      const indexParam = node.index ? `, ${node.index}` : ''
      const wrappedArray = wrapExpr(node.array)
      let mapExpr: string
      if (node.mapPreamble) {
        mapExpr = `\${${wrappedArray}.map((${node.param}${indexParam}) => { ${node.mapPreamble} return \`${childTemplate}\` }).join('')}`
      } else {
        mapExpr = `\${${wrappedArray}.map((${node.param}${indexParam}) => \`${childTemplate}\`).join('')}`
      }
      // Wrap with loop boundary markers so reconciliation doesn't affect siblings
      return `<!--${loopStartMarker(node.markerId)}-->${mapExpr}<!--${loopEndMarker(node.markerId)}-->`
    }

    case 'if-statement':
      return ''

    case 'provider':
    case 'async':
      return node.children.map(recurse).join('')

    case 'slot':
      // Slots resolve at the host (parent component / template caller); they
      // never appear in the embedded HTML template. Preserves the pre-#1252
      // fall-through behaviour now that the switch is exhaustiveness-checked.
      return ''

    default:
      return assertNever(node)
  }
}

/**
 * Generate an HTML template for composite element reconciliation.
 * Identical to irToHtmlTemplate except component nodes become placeholder
 * elements (`<div data-bf-ph="sN"></div>`) instead of renderChild() calls.
 * The placeholders are replaced with real createComponent() elements at runtime.
 */
export function irToPlaceholderTemplate(node: IRNode, restSpreadNames?: Set<string>, loopDepth = 0, loopParams?: ReadonlyArray<string | LoopParamSpec>): string {
  const recurse = (n: IRNode): string => irToPlaceholderTemplate(n, restSpreadNames, loopDepth, loopParams)
  const wrapExpr = (expr: string) => wrapExprWithLoopParams(expr, loopParams)

  switch (node.type) {
    case 'element': {
      const attrParts = node.attrs
        .map((a) => {
          const attrName = a.name === '...'
            ? '...'
            : (a.name === 'key' ? keyAttrName(loopDepth) : toHtmlAttrName(a.name))
          return renderTemplateAttrPart(a, attrName, wrapExpr, restSpreadNames)
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
        return `<!--bf:${node.slotId}-->\${${wrapExpr(node.expr)}}<!--/-->`
      }
      return `\${${wrapExpr(node.expr)}}`

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${wrapExpr(node.condition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
    }

    case 'fragment':
      return node.children.map(recurse).join('')

    case 'component': {
      // Portal is a pass-through — render children directly
      if (node.name === 'Portal') {
        return node.children.map(recurse).join('')
      }
      // Emit a placeholder div that will be replaced with createComponent() at runtime
      const phId = node.slotId || node.name
      return `<div ${DATA_BF_PH}="${phId}"></div>`
    }

    case 'loop': {
      // Inner loops: generate inline .map().join('') with placeholders for components
      // Forward loopParams so inner loop param expressions get wrapped as signal accessors.
      const innerRecurse = (n: IRNode): string => irToPlaceholderTemplate(n, restSpreadNames, loopDepth + 1, loopParams)
      const childTemplate = node.children.map(innerRecurse).join('')
      const indexParam = node.index ? `, ${node.index}` : ''
      const wrappedArray = wrapExpr(node.array)
      let mapExpr: string
      if (node.mapPreamble) {
        mapExpr = `\${${wrappedArray}.map((${node.param}${indexParam}) => { ${node.mapPreamble} return \`${childTemplate}\` }).join('')}`
      } else {
        mapExpr = `\${${wrappedArray}.map((${node.param}${indexParam}) => \`${childTemplate}\`).join('')}`
      }
      return `<!--${loopStartMarker(node.markerId)}-->${mapExpr}<!--${loopEndMarker(node.markerId)}-->`
    }

    case 'if-statement':
      return ''

    case 'provider':
    case 'async':
      return node.children.map(recurse).join('')

    case 'slot':
      return ''

    default:
      return assertNever(node)
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
            return `${quotePropName(p.name)}: ${attrValueToString(p.value) ?? 'undefined'}`
          }
          switch (p.value.kind) {
            case 'jsx-children':
              return `get ${quotePropName(p.name)}() { return ${irChildrenToJsExpr(p.value.children)} }`
            case 'literal':
              return `get ${quotePropName(p.name)}() { return ${JSON.stringify(p.value.value)} }`
            case 'boolean-shorthand':
            case 'boolean-attr':
              return `get ${quotePropName(p.name)}() { return true }`
            case 'expression':
            case 'template':
            case 'spread':
              return `get ${quotePropName(p.name)}() { return ${attrValueToString(p.value) ?? 'undefined'} }`
          }
        })

      if (node.children.length > 0) {
        const childrenExpr = irChildrenToJsExpr(node.children)
        propsEntries.push(`get children() { return ${childrenExpr} }`)
      }

      const propsExpr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}'
      return [`createComponent('${nameForRegistryRef(node.name)}', ${propsExpr})`]
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

    // The kinds below previously fell through to `default: return []` and so
    // were silently dropped when used as a component child. The explicit
    // cases preserve that behaviour but make the exhaustiveness check
    // visible: any new IRNode kind added to the union will now be a
    // compile error here rather than disappearing at runtime (#1252).
    //
    // The historical drop is *not* obviously correct for `provider`,
    // `async`, `if-statement`, or `loop` appearing as a component child;
    // tracking those is a follow-up — this PR only locks in the schema
    // exhaustiveness, not behaviour fixes.
    case 'loop':
    case 'slot':
    case 'if-statement':
    case 'provider':
    case 'async':
      return []

    default:
      return assertNever(node)
  }
}

/**
 * Add bf-c attribute to the first element in an HTML template string.
 * This ensures cond() can find the element for subsequent swaps.
 */
export function addCondAttrToTemplate(html: string, condId: string): string {
  if (/^<\w+/.test(html) && isSingleRootElement(html)) {
    return html.replace(/^(<\w+)(\s|>)/, `$1 bf-c="${condId}"$2`)
  }
  // Text, fragments (multiple sibling elements), or comments use comment markers
  return `<!--bf-cond-start:${condId}-->${html}<!--bf-cond-end:${condId}-->`
}

/** Check if HTML string has a single root element (not multiple siblings). */
function isSingleRootElement(html: string): boolean {
  // Match the opening tag name, then find its closing tag
  const match = html.match(/^<(\w+)[\s>]/)
  if (!match) return false
  const tag = match[1]
  // Self-closing tags like <br/>, <input/>
  if (/^<\w+[^>]*\/>$/.test(html.trim())) return true
  // Check that the last closing tag matches and nothing follows it
  const closingPattern = new RegExp(`</${tag}>\\s*$`)
  return closingPattern.test(html.trim())
}

/**
 * Options for template generation functions (irToComponentTemplate, generateCsrTemplate).
 * Consolidates parameters to prevent argument-passing bugs during recursion.
 */
export interface TemplateOptions {
  inlinableConstants?: Map<string, string>
  restSpreadNames?: Set<string>
  propsObjectName?: string | null
  /**
   * Names that exist only in the init-body scope (or were demoted to unsafe
   * during chained-ref resolution). The CSR template runs at module scope
   * via `render()` / `renderChild()`, so any expression that reaches one
   * of these names would `ReferenceError` at template-call time (#1128).
   *
   * Substitution policy: `transformExpr` returns `UNSAFE_TEMPLATE_EXPR`
   * (the literal token `'undefined'`) whenever the resulting expression
   * still references one of these names. The init function's
   * `createEffect` / `initChild` bindings populate the real value once
   * init runs. Per-context guards (loop array, text expression) translate
   * the sentinel into something safe for that AST position.
   */
  unsafeLocalNames?: Set<string>
  /**
   * Signal+memo substitution env for the CSR template path. Built once
   * per component from `ClientJsContext` (signal initial values + memo
   * bodies, with the `propsObjectName.X → _p.X` props normalization
   * baked in). Constants flow through `inlinableConstants` separately
   * since their `csrInlinable.rewrittenValue` is already chain-closed
   * by `compute-inlinability` (#1277).
   */
  csrEnv?: CsrEnv
  insideLoop?: boolean
  loopDepth?: number
  /** Emit `bf-s` placeholder on scoped elements inside a jsx-children prop (#1320). */
  inHoistedChildren?: boolean
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
  inlinableConstants?: Map<string, string>,
  restSpreadNames?: Set<string>,
  propsObjectName?: string | null
): string {
  return irToComponentTemplateWithOpts(node, { inlinableConstants, restSpreadNames, propsObjectName, loopDepth: -1 })
}

function irToComponentTemplateWithOpts(node: IRNode, opts: TemplateOptions): string {
  const { inlinableConstants, restSpreadNames, propsObjectName, loopDepth = 0 } = opts
  // `recurse` preserves `inHoistedChildren` for structural pass-through
  // (fragment / conditional); `childrenRecurse` clears it so element
  // descendants don't re-emit the placeholder. (#1320)
  const recurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, opts)
  const childrenRecurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, { ...opts, inHoistedChildren: false })
  // Transform expression for client JS template.
  // Bare prop name prefixing (org → _p.org) is handled by templateExpr
  // from Phase 1 AST rewrite. Only constant inlining and props object
  // normalization are done here. (#807)
  const transformExpr = (expr: string, templateExpr?: string): string => {
    const { protect, restore } = createStringProtector()
    let result = protect(templateExpr ?? expr)

    // Inline constant references with their resolved values (#343)
    if (inlinableConstants && inlinableConstants.size > 0) {
      for (const [constName, constValue] of inlinableConstants) {
        result = result.replace(new RegExp(`(?<![-.])\\b${constName}\\b`, 'g'), `(${protect(constValue)})`)
      }
    }

    // Normalize source-level props object access (e.g., props.xxx → _p.xxx)
    if (propsObjectName && propsObjectName !== PROPS_PARAM) {
      result = result.replace(
        new RegExp(`\\b${propsObjectName}\\.`, 'g'),
        `${PROPS_PARAM}.`,
      )
    }

    return restore(result)
  }

  switch (node.type) {
    case 'element': {
      const attrParts = node.attrs
        .map((a) => {
          // `/* @client */` defers the attribute to hydrate via
          // `reactiveAttrs`. Skip from the SSR template so init's
          // createEffect is the sole authority on the attribute.
          if (a.clientOnly) return ''
          const v = a.value
          if (v.kind === 'spread') {
            const spreadExpr = v.templateExpr ?? v.expr
            if (restSpreadNames?.has(spreadExpr)) return ''
            return `\${spreadAttrs(${transformExpr(v.expr, v.templateExpr)})}`
          }
          // Skip key for outer loop elements (reconcileTemplates sets data-key at runtime).
          // But render data-key-N for inner loop elements (needed for event delegation).
          if (a.name === 'key') {
            if (loopDepth === 0) return ''  // outer loop: skip (runtime handles it)
            const keyName = keyAttrName(loopDepth)
            switch (v.kind) {
              case 'expression':
                return templateAttrExpr(keyName, transformExpr(v.expr, v.templateExpr), v.presenceOrUndefined)
              case 'template': {
                const tmplStr = attrValueToString(v, { useTemplate: true }) ?? ''
                return templateAttrExpr(keyName, transformExpr(tmplStr))
              }
              case 'literal':
                return `${keyName}="${v.value}"`
              default:
                return ''
            }
          }
          const attrName = toHtmlAttrName(a.name)
          switch (v.kind) {
            case 'boolean-attr':
              return attrName
            case 'literal':
              return `${attrName}="${v.value}"`
            case 'expression':
              return templateAttrExpr(attrName, transformExpr(v.expr, v.templateExpr), v.presenceOrUndefined)
            case 'template': {
              const tmplStr = attrValueToString(v, { useTemplate: true }) ?? ''
              return templateAttrExpr(attrName, transformExpr(tmplStr))
            }
            case 'boolean-shorthand':
            case 'jsx-children':
              return ''
          }
        })
        .filter(Boolean)

      const hoistedScopeAttr = maybeHoistedScopeAttr(!!opts.inHoistedChildren, node)
      if (hoistedScopeAttr) attrParts.push(hoistedScopeAttr)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const children = node.children.map(childrenRecurse).join('')

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
        return `<!--bf:${node.slotId}-->\${${transformExpr(node.expr, node.templateExpr)}}<!--/-->`
      }
      return `\${${transformExpr(node.expr, node.templateExpr)}}`

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${transformExpr(node.condition, node.templateCondition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
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
          // `/* @client */` defers the prop to hydrate via initChild.
          if (p.clientOnly) return null
          switch (p.value.kind) {
            case 'jsx-children': {
              const hoistedRecurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, { ...opts, inHoistedChildren: true })
              const childHtml = p.value.children.map(c => hoistedRecurse(c)).join('')
              return `${quotePropName(p.name)}: \`${childHtml}\``
            }
            case 'literal':
              return `${quotePropName(p.name)}: ${JSON.stringify(p.value.value)}`
            case 'boolean-shorthand':
            case 'boolean-attr':
              return `${quotePropName(p.name)}: true`
            case 'expression':
              return `${quotePropName(p.name)}: ${transformExpr(p.value.expr, p.value.templateExpr)}`
            case 'spread':
              return `${quotePropName(p.name)}: ${transformExpr(p.value.expr, p.value.templateExpr)}`
            case 'template': {
              const valueStr = attrValueToString(p.value, { useTemplate: true })!
              return `${quotePropName(p.name)}: ${transformExpr(valueStr)}`
            }
          }
        })
        .filter((entry): entry is string => entry !== null)
      const childrenEntry = childrenPropEntry(node.children, recurse)
      if (childrenEntry) propsEntries.push(childrenEntry)
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${transformKeyValue(keyProp.value, transformExpr)}` : ''
      return `\${renderChild('${nameForRegistryRef(node.name)}', ${propsExpr}${keyArg})}`
    }

    case 'loop': {
      const innerOpts = { ...opts, loopDepth: loopDepth + 1 }
      const innerRecurse = (n: IRNode): string => irToComponentTemplateWithOpts(n, innerOpts)
      return node.children.map(innerRecurse).join('')
    }

    case 'if-statement':
      return ''

    case 'provider':
    case 'async':
      return node.children.map(recurse).join('')

    case 'slot':
      return ''

    default:
      return assertNever(node)
  }
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
  const hasUnsafeRef = (freeIds: ReadonlySet<string> | undefined): boolean => {
    return !!(unsafeLocalNames && unsafeLocalNames.size > 0 && setIntersects(freeIds, unsafeLocalNames))
  }

  switch (node.type) {
    case 'loop':
      return false

    case 'component':
      return false

    case 'expression':
      if (hasUnsafeRef(freeIdsFromRefs(node.origin?.freeRefs))) return false
      // Use AST-derived flag when available, fall back to string check for older IR
      if ((node.hasFunctionCalls ?? node.expr.includes('()')) && !isSimplePropExpression(node.expr, propNames)) {
        return false
      }
      return true

    case 'element':
      for (const attr of node.attrs) {
        if (attr.name === '...') {
          // Computed local spreads are now handled by spreadAttrs() at runtime.
          // Only check for unsafe references that would fail at module scope.
          const valueStr = attrValueToString(attr.value)
          if (valueStr && hasUnsafeRef(attr.freeIdentifiers)) return false
          if (valueStr && valueStr.includes('()') && !isSimplePropExpression(valueStr, propNames)) return false
          continue
        }
        // Only `expression` / `template` carry runtime references worth probing.
        if (attr.value.kind === 'expression' || attr.value.kind === 'template' || attr.value.kind === 'spread') {
          const valueStr = attrValueToString(attr.value)
          if (valueStr) {
            if (hasUnsafeRef(attr.freeIdentifiers)) return false
            if (valueStr.includes('()') && !isSimplePropExpression(valueStr, propNames)) {
              return false
            }
          }
        }
      }
      return node.children.every((c) => canGenerateStaticTemplate(c, propNames, inlinableConstants, unsafeLocalNames))

    case 'conditional':
      if (hasUnsafeRef(freeIdsFromRefs(node.origin?.freeRefs))) return false
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
    case 'async':
      return node.children.every((c) => canGenerateStaticTemplate(c, propNames, inlinableConstants, unsafeLocalNames))

    case 'text':
      return true

    case 'slot':
      // Slots resolve at the host — they don't disqualify static generation
      // on their own. Preserves the pre-#1252 `default: true` behaviour.
      return true

    default:
      return assertNever(node)
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
 * The substitution data — signal initial values, memo bodies, and the
 * chain-closed inlinable-const values — is sourced from the IR's
 * `csrInlinable` / `initialFreeIdentifiers` / `computationFreeIdentifiers`
 * fields populated by `compute-inlinability` (#1277). `csrSubstitute`
 * walks the AST so member-access shadowing (`ctx.bars()`) is preserved
 * structurally instead of via the legacy `(?<![-.])` lookbehind.
 *
 * @param node - IR node to render
 * @param inlinableConstants - Map of constant names to their resolved CSR values
 * @param ctx - ClientJsContext supplying signals/memos for `csrSubstitute`
 */
export function generateCsrTemplate(
  node: IRNode,
  inlinableConstants: Map<string, string> | undefined,
  ctx: ClientJsContext,
  insideLoop?: boolean,
  restSpreadNames?: Set<string>,
  propsObjectName?: string | null,
  unsafeLocalNames?: Set<string>,
): string {
  // Build the substitution env once per component. Signals + memos come
  // from `buildSignalMemoEnv`; inlinable constants layer in here so
  // each call to `transformExpr` is a pure AST projection over the
  // shared env (no per-call Map cloning).
  const base = buildSignalMemoEnv(ctx.signals, ctx.memos, propsObjectName ?? null)
  const csrEnv: CsrEnv = { substitutions: new Map(base.substitutions), propsObjectName: base.propsObjectName }
  if (inlinableConstants) {
    for (const [name, value] of inlinableConstants) {
      if (!csrEnv.substitutions.has(name)) {
        csrEnv.substitutions.set(name, { kind: 'identifier', replacement: value, freeIdentifiers: new Set() })
      }
    }
  }
  return generateCsrTemplateWithOpts(node, { inlinableConstants, restSpreadNames, propsObjectName, csrEnv, insideLoop, unsafeLocalNames, loopDepth: -1 })
}

function generateCsrTemplateWithOpts(node: IRNode, opts: TemplateOptions): string {
  const { restSpreadNames, propsObjectName, csrEnv, insideLoop, unsafeLocalNames, loopDepth = 0 } = opts
  const env: CsrEnv = csrEnv ?? { substitutions: new Map(), propsObjectName: propsObjectName ?? null }
  const transformExpr = (expr: string, templateExpr?: string): string => {
    // Single AST substitution pass: replaces signal getter calls
    // (`count()` → `(initialValue)`), memo calls (`bars()` → `(body)`),
    // and inlinable-const refs (`label` → `(rewrittenValue)`) in one
    // walk. The walker uses structural position checks instead of
    // regex lookbehind, so `ctx.bars()` survives intact when a local
    // memo `bars` exists (#1100). All substitution values come from
    // the IR — emit does no string transformation of its own (#1277).
    const source = templateExpr ?? expr
    if (!source) return source
    const { rewritten, freeIdentifiers } = csrSubstitute(source, env)

    // The CSR template runs at module scope, so any post-substitution
    // free identifier that lands in `unsafeLocalNames` (init-body-only
    // bindings, demoted const refs) is unreachable. Surface the UNSAFE
    // sentinel; per-AST-context call sites translate it (loop array →
    // `[]`, text expression → `''`, child component prop → drop) and
    // init's createEffect / initChild bindings repaint the real value
    // once init runs (#1128).
    //
    // The check is now a pure set intersection of IR-tracked
    // identifiers; the legacy `tokenContainsAny` lexer scan
    // (and its `'foo-className'` / `a.className` false-match risk)
    // is gone (#1267 / #1277).
    if (unsafeLocalNames && unsafeLocalNames.size > 0 && setIntersects(freeIdentifiers, unsafeLocalNames)) {
      return UNSAFE_TEMPLATE_EXPR
    }
    // Final emit-form: rewrite `propsName.X → _p.X`. Deferred until
    // after the unsafe-name check because the check used raw form
    // (consistent with `populateCsrInlinable`'s `isInlinableInTemplate`
    // gate — #1138).
    return applyPropsRewrite(rewritten, propsObjectName ?? null)
  }

  // `recurse` preserves `inHoistedChildren` for structural pass-through
  // (fragment / conditional); `childrenRecurse` and `recurseInLoop`
  // clear it — a new element root or loop iteration starts a fresh
  // scope. (#1320)
  const recurse = (n: IRNode): string => generateCsrTemplateWithOpts(n, opts)
  const childrenRecurse = (n: IRNode): string => generateCsrTemplateWithOpts(n, { ...opts, inHoistedChildren: false })
  const recurseInLoop = (n: IRNode): string => generateCsrTemplateWithOpts(n, { ...opts, insideLoop: true, loopDepth: loopDepth + 1, inHoistedChildren: false })

  switch (node.type) {
    case 'element': {
      const attrParts = node.attrs
        .map((a) => {
          // `/* @client */` defers the attribute to hydrate. The
          // `reactiveAttrs` push in collect-elements wires a
          // `createEffect` that sets the attribute via the existing
          // hydrate-time path; the SSR template must not race that
          // by emitting an initial value, so skip the attribute
          // entirely here.
          if (a.clientOnly) return ''
          const v = a.value
          if (v.kind === 'spread') {
            const spreadExpr = v.templateExpr ?? v.expr
            if (restSpreadNames?.has(spreadExpr)) return ''
            return `\${spreadAttrs(${transformExpr(v.expr, v.templateExpr)})}`
          }
          const attrName = a.name === 'key'
            ? keyAttrName(loopDepth)
            : toHtmlAttrName(a.name)
          switch (v.kind) {
            case 'boolean-attr':
              return attrName
            case 'literal':
              return `${attrName}="${v.value}"`
            case 'expression':
              return templateAttrExpr(attrName, transformExpr(v.expr, v.templateExpr), v.presenceOrUndefined)
            case 'template': {
              const valueStr = attrValueToString(v, { useTemplate: true })
              return valueStr ? templateAttrExpr(attrName, transformExpr(valueStr)) : ''
            }
            case 'boolean-shorthand':
            case 'jsx-children':
              return ''
          }
        })
        .filter(Boolean)

      const hoistedScopeAttr = maybeHoistedScopeAttr(!!opts.inHoistedChildren, node)
      if (hoistedScopeAttr) attrParts.push(hoistedScopeAttr)

      if (node.slotId) {
        attrParts.push(`bf="${node.slotId}"`)
      }

      const attrs = attrParts.join(' ')
      const children = node.children.map(childrenRecurse).join('')

      if (children || !VOID_ELEMENTS.has(node.tag)) {
        return `<${node.tag}${attrs ? ' ' + attrs : ''}>${children}</${node.tag}>`
      }
      return `<${node.tag}${attrs ? ' ' + attrs : ''} />`
    }

    case 'text':
      return node.value

    case 'expression':
      if (node.expr === 'null' || node.expr === 'undefined') return ''
      if (node.clientOnly && node.slotId) {
        return `<!--bf-client:${node.slotId}--><!--/-->`
      }
      {
        const transformed = transformExpr(node.expr, node.templateExpr)
        // Init-body-only refs would render the literal text "undefined"
        // before init's createEffect overwrites the slot (#1128). Emit
        // an empty placeholder instead.
        const expr = transformed === UNSAFE_TEMPLATE_EXPR ? "''" : transformed
        if (node.slotId) {
          return `<!--bf:${node.slotId}-->\${${expr}}<!--/-->`
        }
        return `\${${expr}}`
      }

    case 'conditional': {
      const trueBranch = recurse(node.whenTrue)
      const falseBranch = recurse(node.whenFalse)
      const trueHtml = node.slotId ? addCondAttrToTemplate(trueBranch, node.slotId) : trueBranch
      const falseHtml = node.slotId ? addCondAttrToTemplate(falseBranch, node.slotId) : falseBranch
      return `\${${transformExpr(node.condition, node.templateCondition)} ? \`${trueHtml}\` : \`${falseHtml}\`}`
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
          // `/* @client */` defers the prop to hydrate. Drop from the
          // SSR `renderChild` props — `initChild`'s `propsExpr` getter
          // (built in collect-elements) reads the value once init
          // runs, mirroring the existing UNSAFE strip path below.
          if (p.clientOnly) return null
          switch (p.value.kind) {
            case 'jsx-children': {
              const hoistedRecurse = (n: IRNode): string => generateCsrTemplateWithOpts(n, { ...opts, inHoistedChildren: true })
              const childHtml = p.value.children.map(c => hoistedRecurse(c)).join('')
              return `${quotePropName(p.name)}: \`${childHtml}\``
            }
            case 'literal':
              return `${quotePropName(p.name)}: ${JSON.stringify(p.value.value)}`
            case 'boolean-shorthand':
            case 'boolean-attr':
              return `${quotePropName(p.name)}: true`
            case 'expression':
            case 'spread': {
              const transformed = transformExpr(p.value.expr, p.value.templateExpr)
              // When transformExpr emits the unsafe sentinel for an init-scope-only
              // reference (#1128), drop the prop from renderChild — initChild's
              // getter binding will populate it once init runs.
              if (transformed === UNSAFE_TEMPLATE_EXPR) return null
              return `${quotePropName(p.name)}: ${transformed}`
            }
            case 'template': {
              const valueStr = attrValueToString(p.value, { useTemplate: true })
              if (!valueStr) return null
              const transformed = transformExpr(valueStr)
              if (transformed === UNSAFE_TEMPLATE_EXPR) return null
              return `${quotePropName(p.name)}: ${transformed}`
            }
          }
        })
        .filter((entry): entry is string => entry !== null)
      const childrenEntry = childrenPropEntry(node.children, recurse)
      if (childrenEntry) propsEntries.push(childrenEntry)
      const propsExpr = propsEntries.length > 0 ? `{${propsEntries.join(', ')}}` : '{}'
      const keyProp = node.props.find(p => p.name === 'key')
      const keyArg = keyProp ? `, ${transformKeyValue(keyProp.value, transformExpr)}` : ''
      const slotArg = (!insideLoop && node.slotId) ? `, '${node.slotId}'` : ''
      return `\${renderChild('${nameForRegistryRef(node.name)}', ${propsExpr}${keyArg || (slotArg ? ', undefined' : '')}${slotArg})}`
    }

    case 'loop': {
      const childTemplate = node.children.map(recurseInLoop).join('')
      const indexParam = node.index ? `, ${node.index}` : ''
      // An init-scope-only array would `undefined.map(...)` ⇒ TypeError.
      // Substitute an empty array; init's reconcile pass populates the loop
      // once the real binding exists (#1128).
      const arrayExpr = transformExpr(node.array, node.templateArray)
      const safeArrayExpr = arrayExpr === UNSAFE_TEMPLATE_EXPR ? '[]' : arrayExpr
      let mapExpr: string
      if (node.mapPreamble) {
        const preamble = node.templateMapPreamble ?? node.mapPreamble
        mapExpr = `\${${safeArrayExpr}.map((${node.param}${indexParam}) => { ${preamble} return \`${childTemplate}\` }).join('')}`
      } else {
        mapExpr = `\${${safeArrayExpr}.map((${node.param}${indexParam}) => \`${childTemplate}\`).join('')}`
      }
      return `<!--${loopStartMarker(node.markerId)}-->${mapExpr}<!--${loopEndMarker(node.markerId)}-->`
    }

    case 'if-statement': {
      const consequent = recurse(node.consequent)
      const alternate = node.alternate ? recurse(node.alternate) : ''
      return `\${${transformExpr(node.condition, node.templateCondition)} ? \`${consequent}\` : \`${alternate}\`}`
    }

    case 'provider':
    case 'async':
      return node.children.map(recurse).join('')

    case 'slot':
      return ''

    default:
      return assertNever(node)
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
