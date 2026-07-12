/**
 * Helpers for emitting code that parses a template literal into a DOM
 * element clone, while preserving the SVG namespace when the loop body
 * root is an SVG element.
 *
 * Background (#135): the standard pattern
 *   `const __tpl = document.createElement('template')`
 *   `__tpl.innerHTML = \`${template}\``
 *   `return __tpl.content.firstElementChild.cloneNode(true)`
 * works for HTML elements but produces an `HTMLUnknownElement` (xhtml
 * namespace, tagName uppercased) when `template` starts with an SVG
 * leaf like `<path>` or `<circle>`. The SVG renderer ignores those so
 * the element is invisible — bbox=(0,0,0,0). Surfaced by the Graph/DAG
 * Editor block when a new edge `<path>` was appended via mapArray and
 * never showed up on the canvas.
 *
 * Fix: when the template's root tag is an SVG element, wrap the parsed
 * markup in a synthetic `<svg>` so the HTML5 parser walks into SVG
 * foreign content and assigns the correct namespace, then descend one
 * extra level to get the real root.
 */

import { findInterpolationEnd, findTopLevelTemplateLiterals } from '../../../scanner/js-scanner.ts'

const SVG_ROOT_TAGS = new Set([
  'svg',
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
  'text', 'tspan', 'textPath',
  'g', 'defs', 'use', 'symbol', 'switch',
  'clipPath', 'mask', 'marker', 'pattern',
  'linearGradient', 'radialGradient', 'stop',
  'image', 'foreignObject',
  'filter', 'feBlend', 'feColorMatrix', 'feComposite', 'feFlood',
  'feGaussianBlur', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset',
  'feTurbulence',
  'animate', 'animateTransform', 'animateMotion',
])

/**
 * Decide whether a template literal needs SVG-context parsing.
 * Looks at the first opening tag in the literal. The check is purely
 * lexical so that interpolations inside attribute values do not
 * confuse it.
 *
 * Three shapes are recognised:
 *   1. Direct element root — `<circle .../>`
 *   2. Conditional body (#1088) — `${cond ? `<circle .../>` : `<rect .../>`}`
 *      where every result-position template literal starts with an SVG
 *      tag. The compiler emits this shape for `.map(s => cond ? <a/> : <b/>)`
 *      bodies; without the wrap the cloned element ends up in the xhtml
 *      namespace and renders nothing.
 *   3. Reactive-conditional body — a branch wrapped in `<!--bf-cond-start:sX-->`
 *      / `<!--bf-cond-end:sX-->` markers (emitted for nested reactive
 *      conditionals). The check skips leading HTML comments and recurses
 *      into the inner `${...}`.
 *
 * Mixed-namespace branches (one HTML, one SVG) intentionally fall through
 * to no-wrap so the user sees the same broken output as before instead of
 * a silent over-wrap into a `<foreignObject>`-style mismatch.
 */
export function templateRootIsSvg(template: string): boolean {
  const stripped = stripLeadingNonContent(template)

  // Shape 1: direct element root.
  const m = stripped.match(/^<\s*([A-Za-z][A-Za-z0-9-]*)/)
  if (m) {
    // SVG element names are case-sensitive in JSX (e.g., `linearGradient`)
    // and arrive lowercased to the renderer for the kebab-cased forms;
    // match case-insensitively against the canonical lower-case set, but
    // keep the canonical name's casing in the lookup table so JSX names
    // like `clipPath` still match.
    const tag = m[1]
    if (SVG_ROOT_TAGS.has(tag)) return true
    return SVG_ROOT_TAGS.has(tag.toLowerCase())
  }

  // Shapes 2 & 3: single `${...}` interpolation whose result-position
  // template literals all (recursively) resolve to SVG roots (Option A in
  // #1088).
  const branches = extractConditionalBranchTemplates(stripped)
  if (branches === null || branches.length === 0) return false
  return branches.every(templateRootIsSvg)
}

/**
 * Wrap decision for MULTI-ROOT (fragment) templates, where the synthetic
 * `<svg>` wrap swallows every sibling root at once (#2233 Copilot review).
 *
 * `templateRootIsSvg` inspects only the FIRST root tag. For single-root
 * templates that's exact, but a fragment whose first root is an `<svg>`
 * CONTAINER (`<><svg/><span/></>`) doesn't need the wrap at all — the
 * HTML parser enters foreign content at `<svg>` on its own — and wrapping
 * would drag the HTML siblings into the SVG namespace (`<span>` becomes an
 * SVGUnknownElement, silently undrawn). So `<svg>`-first fragments skip
 * the wrap; only leaf-rooted fragments (`<line>`, `<circle>`, ...) get it.
 *
 * Known edge (degenerate, pre-existing): an `<svg>`-first fragment with
 * SVG-LEAF siblings (`<><svg/><line/></>`) leaves the bare leaf siblings
 * in the HTML namespace — exactly the pre-#2219 behavior. Deciding that
 * shape correctly needs a scan of every top-level root tag; not worth the
 * parser until a real component hits it.
 */
export function multiRootTemplateNeedsSvgWrap(template: string): boolean {
  const m = stripLeadingNonContent(template).match(/^<\s*([A-Za-z][A-Za-z0-9-]*)/)
  if (m && m[1].toLowerCase() === 'svg') return false
  return templateRootIsSvg(template)
}

/**
 * Strip leading whitespace and HTML comment markers (`<!-- ... -->`) so
 * that a branch like `<!--bf-cond-start:s0-->${...}<!--bf-cond-end:s0-->`
 * is inspected at its first content node — the inner `${...}`.
 */
function stripLeadingNonContent(template: string): string {
  let s = template.trimStart()
  while (s.startsWith('<!--')) {
    const end = s.indexOf('-->')
    if (end < 0) return s
    s = s.slice(end + 3).trimStart()
  }
  return s
}

/**
 * If `template` begins with a `${jsExpr}` interpolation, return the
 * contents of every backtick template literal that appears at the top of
 * `jsExpr` — these are the result branches of a conditional like
 * `cond ? `<a/>` : `<b/>``. "Top of `jsExpr`" excludes backticks nested
 * inside another template literal's own `${...}`. Trailing HTML (typically
 * a `<!--bf-cond-end:sX-->` marker, all-whitespace) is ignored.
 *
 * Returns `null` when the shape doesn't match (no leading interpolation,
 * or the parser hits an unbalanced delimiter, or there is non-comment
 * trailing content) so callers conservatively bail to no-wrap.
 */
function extractConditionalBranchTemplates(template: string): string[] | null {
  if (!template.startsWith('${')) return null

  const exprEnd = findInterpolationEnd(template, 2)
  if (exprEnd < 0) return null

  // Anything after the closing `}` other than HTML comments / whitespace
  // means the template carries sibling HTML alongside the interpolation —
  // out of scope for the wrap heuristic.
  const trailing = stripLeadingNonContent(template.slice(exprEnd + 1))
  if (trailing.length > 0) return null

  const expr = template.slice(2, exprEnd)
  return findTopLevelTemplateLiterals(expr)
}

// Interpolation-boundary and top-level template-literal extraction now
// flow through the shared ts.createScanner-based helpers (#1254). The
// shared scanner adds correct regex-literal handling that the previous
// hand-rolled walkers lacked.

/**
 * Build the inline template-clone expression as one line.
 *
 *   ` const __tpl = document.createElement('template'); __tpl.innerHTML = \`${template}\`; return __tpl.content.firstElementChild.cloneNode(true) `
 *
 * For SVG roots, the `innerHTML` is wrapped in `<svg>...</svg>` and the
 * traversal descends one extra level.
 */
export function emitTemplateCloneInline(template: string): string {
  if (templateRootIsSvg(template)) {
    return `const __tpl = document.createElement('template'); __tpl.innerHTML = \`<svg>${template}</svg>\`; return __tpl.content.firstElementChild.firstElementChild.cloneNode(true)`
  }
  return `const __tpl = document.createElement('template'); __tpl.innerHTML = \`${template}\`; return __tpl.content.firstElementChild.cloneNode(true)`
}

/**
 * Emit the ONE-TIME declaration of a loop's hoisted shared template (perf):
 * built once per loop, before the `mapArray` call, so every row clones from
 * an already-parsed node instead of re-running `document.createElement
 * ('template')` + an `innerHTML` parse per row. `skeletonTemplate` is the
 * STATIC-ONLY skeleton produced by `buildLoopSkeletonTemplate` (dynamic attrs
 * omitted, text markers empty) — never the per-row interpolated `template`.
 *
 * SVG namespace wrap mirrors `emitTemplateCloneLines` (#135 / #1088):
 * `templateRootIsSvg` is re-checked against the skeleton (same root tag as
 * the interpolated template, so the same wrap decision applies).
 */
export function emitHoistedTemplateDecl(lines: string[], indent: string, tplVar: string, skeletonTemplate: string): void {
  const isSvg = templateRootIsSvg(skeletonTemplate)
  const html = isSvg ? `<svg>${skeletonTemplate}</svg>` : skeletonTemplate
  lines.push(`${indent}const ${tplVar} = document.createElement('template')`)
  lines.push(`${indent}${tplVar}.innerHTML = \`${html}\``)
}

/**
 * Clone expression reading off a hoisted template variable declared via
 * `emitHoistedTemplateDecl`, in place of the per-row
 * `emitTemplateCloneInline` / `emitTemplateCloneLines` parse-and-clone.
 */
export function hoistedCloneExpr(tplVar: string, skeletonTemplate: string): string {
  return templateRootIsSvg(skeletonTemplate)
    ? `${tplVar}.content.firstElementChild.firstElementChild.cloneNode(true)`
    : `${tplVar}.content.firstElementChild.cloneNode(true)`
}

/**
 * Multi-line variant for code paths that emit each line separately.
 * Returns three statements with no trailing newlines.
 */
export function emitTemplateCloneLines(template: string, indent: string): string[] {
  if (templateRootIsSvg(template)) {
    return [
      `${indent}const __tpl = document.createElement('template')`,
      `${indent}__tpl.innerHTML = \`<svg>${template}</svg>\``,
      `${indent}return __tpl.content.firstElementChild.firstElementChild.cloneNode(true)`,
    ]
  }
  return [
    `${indent}const __tpl = document.createElement('template')`,
    `${indent}__tpl.innerHTML = \`${template}\``,
    `${indent}return __tpl.content.firstElementChild.cloneNode(true)`,
  ]
}

/**
 * Emit the renderItem-body element-setup block for one dynamic loop item
 * (#1253). Shared by `stringifyPlainLoop`, `stringifyCompositeLoop`, and
 * `stringifyBranchLoop`'s plain arm — every byte of the multi-root path is
 * identical across them and the single-root path varies only on layout.
 *
 * Output:
 *
 *   bodyIsMultiRoot = true
 *     <indent>let __el, __extras
 *     <indent>if (__existing) {
 *     <indent+2>__el = __existing
 *     <indent>} else {
 *     <emitMultiRootTemplateCloneLines (indent+2)>
 *     <indent+2>__el.__bfExtras = __extras
 *     <indent>}
 *
 *   bodyIsMultiRoot = false, singleRootLayout = 'inline'  (plain / branch-plain)
 *     <indent>const __el = __existing ?? (() => { <emitTemplateCloneInline> })()
 *
 *   bodyIsMultiRoot = false, singleRootLayout = 'multiline'  (composite)
 *     <indent>const __el = __existing ?? (() => {
 *     <emitTemplateCloneLines (indent+2)>
 *     <indent>})()
 */
export function emitLoopItemElementSetup(
  lines: string[],
  opts: {
    template: string
    bodyIsMultiRoot: boolean
    indent: string
    /** Single-root layout: 'inline' (plain / branch-plain) or 'multiline' (composite). */
    singleRootLayout: 'inline' | 'multiline'
  },
): void {
  const { template, bodyIsMultiRoot, indent, singleRootLayout } = opts
  const innerIndent = indent + '  '
  if (bodyIsMultiRoot) {
    lines.push(`${indent}let __el, __extras`)
    lines.push(`${indent}if (__existing) {`)
    lines.push(`${innerIndent}__el = __existing`)
    lines.push(`${indent}} else {`)
    for (const ln of emitMultiRootTemplateCloneLines(template, innerIndent, '__el', '__extras')) {
      lines.push(ln)
    }
    lines.push(`${innerIndent}__el.__bfExtras = __extras`)
    lines.push(`${indent}}`)
    return
  }
  if (singleRootLayout === 'inline') {
    const cloneExpr = emitTemplateCloneInline(template)
    lines.push(`${indent}const __el = __existing ?? (() => { ${cloneExpr} })()`)
    return
  }
  lines.push(`${indent}const __el = __existing ?? (() => {`)
  for (const ln of emitTemplateCloneLines(template, innerIndent)) lines.push(ln)
  lines.push(`${indent}})()`)
}

/**
 * Multi-root template clone for loop bodies that emit a JSX Fragment with
 * two or more sibling elements (#1212). Initialises both `varEl` (the
 * primary, first root) and `varExtras` (an array of cloned sibling roots).
 * The runtime's `mapArray` reads the extras stash off `varEl.__bfExtras`
 * to keep all siblings of an item paired with its key.
 *
 * Single-root callers must keep using `emitTemplateCloneLines`; this
 * helper assumes the template literal carries `>= 2` top-level elements.
 */
export function emitMultiRootTemplateCloneLines(
  template: string,
  indent: string,
  varEl: string,
  varExtras: string,
): string[] {
  const isSvg = multiRootTemplateNeedsSvgWrap(template)
  // Wrap in `<svg>` so the parser walks into SVG foreign content; we then
  // descend one level to pick up the per-item roots.
  const innerHtmlExpr = isSvg ? `\`<svg>${template}</svg>\`` : `\`${template}\``
  // `parent` is the element whose direct children are the per-item roots
  // (the `<svg>` wrap for SVG, the template's content for HTML).
  const parentExpr = isSvg ? `__tpl.content.firstElementChild` : `__tpl.content`
  return [
    `${indent}const __tpl = document.createElement('template')`,
    `${indent}__tpl.innerHTML = ${innerHtmlExpr}`,
    `${indent}${varEl} = ${parentExpr}.firstElementChild.cloneNode(true)`,
    `${indent}${varExtras} = []`,
    `${indent}{ let __sib = ${parentExpr}.firstElementChild.nextElementSibling; while (__sib) { ${varExtras}.push(__sib.cloneNode(true)); __sib = __sib.nextElementSibling } }`,
  ]
}
