/**
 * Helpers for emitting code that parses a template literal into a DOM
 * element clone, while preserving the SVG/MathML namespace when the loop
 * body root is a foreign-content element.
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
 * Fix: when the template's root tag is an SVG (or, #1096, MathML) element,
 * wrap the parsed markup in the matching synthetic namespace root
 * (`<svg>` / `<math>`) so the HTML5 parser walks into foreign content and
 * assigns the correct namespace, then descend one extra level to get the
 * real root. The two namespaces share every byte of this machinery —
 * only the wrap tag name differs — so `detectRootNamespaceWrapTag` and
 * `namespaceWrapForTemplate` below are the single door every emitter
 * (in this file and its consumers) reads the wrap decision through.
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
 * MathML root tags (#1096 — port of the SVG fix above). `math` itself is
 * included alongside the element vocabulary, mirroring how `svg` is
 * included in `SVG_ROOT_TAGS`: a template whose bare root is the
 * namespace container tag also needs the parser nudge (unlike the
 * MULTI-ROOT fragment case in `multiRootTemplateNeedsNamespaceWrap`,
 * where a container-first fragment already parses correctly on its own).
 */
const MATHML_ROOT_TAGS = new Set([
  'math',
  'mrow', 'mfrac', 'msup', 'msub', 'msubsup', 'mn', 'mi', 'mo', 'mtext',
  'munder', 'mover', 'munderover', 'mtable', 'mtr', 'mtd',
  'msqrt', 'mroot', 'mstyle', 'merror', 'mpadded', 'mphantom', 'menclose',
  'semantics', 'annotation', 'annotation-xml',
])

/** Namespaces whose root tags need the synthetic-wrap parser nudge. */
export type NamespaceWrapTag = 'svg' | 'math'

/**
 * Look up which foreign-content namespace (if any) a single tag name
 * belongs to. Case-insensitive fallback mirrors `templateRootIsSvg`'s
 * original comment: SVG/MathML element names are case-sensitive in JSX
 * (e.g. `linearGradient`, `annotation-xml`) but the canonical lower-case
 * set is checked first, then the lower-cased tag, so both spellings match.
 */
function namespaceForTag(tag: string): NamespaceWrapTag | null {
  if (SVG_ROOT_TAGS.has(tag) || SVG_ROOT_TAGS.has(tag.toLowerCase())) return 'svg'
  if (MATHML_ROOT_TAGS.has(tag) || MATHML_ROOT_TAGS.has(tag.toLowerCase())) return 'math'
  return null
}

/**
 * Decide whether a template literal needs foreign-content (SVG or MathML)
 * parsing, and which. Looks at the first opening tag in the literal. The
 * check is purely lexical so that interpolations inside attribute values
 * do not confuse it.
 *
 * Three shapes are recognised:
 *   1. Direct element root — `<circle .../>` / `<mrow>...</mrow>`
 *   2. Conditional body (#1088) — `${cond ? `<circle .../>` : `<rect .../>`}`
 *      where every result-position template literal (recursively) resolves
 *      to the SAME namespace. The compiler emits this shape for
 *      `.map(s => cond ? <a/> : <b/>)` bodies; without the wrap the cloned
 *      element ends up in the xhtml namespace and renders nothing.
 *   3. Reactive-conditional body — a branch wrapped in `<!--bf-cond-start:sX-->`
 *      / `<!--bf-cond-end:sX-->` markers (emitted for nested reactive
 *      conditionals). The check skips leading HTML comments and recurses
 *      into the inner `${...}`.
 *
 * Mixed-namespace branches (HTML+SVG, HTML+MathML, or SVG+MathML)
 * intentionally fall through to no-wrap so the user sees the same broken
 * output as before instead of a silent over-wrap that would drag one
 * branch into the wrong foreign-content namespace.
 */
export function detectRootNamespaceWrapTag(template: string): NamespaceWrapTag | null {
  const stripped = stripLeadingNonContent(template)

  // Shape 1: direct element root.
  const m = stripped.match(/^<\s*([A-Za-z][A-Za-z0-9-]*)/)
  if (m) return namespaceForTag(m[1])

  // Shapes 2 & 3: single `${...}` interpolation whose result-position
  // template literals all (recursively) resolve to the SAME namespace
  // (Option A in #1088, generalised to MathML in #1096).
  const branches = extractConditionalBranchTemplates(stripped)
  if (branches === null || branches.length === 0) return null
  let result: NamespaceWrapTag | null | undefined
  for (const branch of branches) {
    const branchNs = detectRootNamespaceWrapTag(branch)
    if (result === undefined) {
      result = branchNs
    } else if (result !== branchNs) {
      return null
    }
  }
  return result ?? null
}

/**
 * Wrap decision for MULTI-ROOT (fragment) templates, where the synthetic
 * namespace wrap swallows every sibling root at once (#2233 Copilot
 * review, generalised to MathML in #1096).
 *
 * `detectRootNamespaceWrapTag` inspects only the FIRST root tag. For
 * single-root templates that's exact, but a fragment whose first root is
 * the namespace CONTAINER itself (`<><svg/><span/></>`, `<><math/><span/></>`)
 * doesn't need the wrap at all — the HTML parser enters foreign content at
 * `<svg>`/`<math>` on its own — and wrapping would drag the HTML siblings
 * into the foreign namespace (`<span>` becomes an SVGUnknownElement/etc.,
 * silently undrawn). So container-first fragments skip the wrap; only
 * leaf-rooted fragments (`<line>`, `<circle>`, `<mrow>`, ...) get it.
 *
 * Known edge (degenerate, pre-existing): a container-first fragment with
 * LEAF siblings of the same namespace (`<><svg/><line/></>`) leaves the
 * bare leaf siblings in the HTML namespace — exactly the pre-#2219
 * behavior. Deciding that shape correctly needs a scan of every top-level
 * root tag; not worth the parser until a real component hits it.
 */
export function multiRootTemplateNeedsNamespaceWrap(template: string): NamespaceWrapTag | null {
  const m = stripLeadingNonContent(template).match(/^<\s*([A-Za-z][A-Za-z0-9-]*)/)
  if (m) {
    const tagLower = m[1].toLowerCase()
    if (tagLower === 'svg' || tagLower === 'math') return null
  }
  return detectRootNamespaceWrapTag(template)
}

/**
 * Single door for the "wrap tag + descent path" pair every namespace-aware
 * clone site needs. Consumers outside this file (`inner-loop.ts`,
 * `loop-child-arm.ts`, `loop.ts`) read the wrap decision through this
 * function instead of re-deriving `isSvg ? '<svg>' : ...` locally — keeps
 * the SVG/MathML wrap code path in exactly one place (#1096).
 */
export function namespaceWrapForTemplate(template: string): { wrapTag: NamespaceWrapTag | null; childPath: string } {
  const wrapTag = detectRootNamespaceWrapTag(template)
  return {
    wrapTag,
    childPath: wrapTag ? '.firstElementChild.firstElementChild' : '.firstElementChild',
  }
}

/** `namespaceWrapForTemplate`, but for the multi-root fragment predicate. */
export function multiRootNamespaceWrapForTemplate(template: string): { wrapTag: NamespaceWrapTag | null; childPath: string } {
  const wrapTag = multiRootTemplateNeedsNamespaceWrap(template)
  return {
    wrapTag,
    childPath: wrapTag ? '.firstElementChild' : '',
  }
}

/** Wrap `html` in the namespace's synthetic root tag, or return it as-is. */
function wrapHtmlForNamespace(html: string, wrapTag: NamespaceWrapTag | null): string {
  return wrapTag ? `<${wrapTag}>${html}</${wrapTag}>` : html
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
 * For SVG/MathML roots, the `innerHTML` is wrapped in the matching
 * namespace root tag and the traversal descends one extra level.
 */
export function emitTemplateCloneInline(template: string): string {
  const { wrapTag, childPath } = namespaceWrapForTemplate(template)
  const html = wrapHtmlForNamespace(template, wrapTag)
  return `const __tpl = document.createElement('template'); __tpl.innerHTML = \`${html}\`; return __tpl.content${childPath}.cloneNode(true)`
}

/**
 * Emit the ONE-TIME declaration of a loop's hoisted shared template (perf):
 * built once per loop, before the `mapArray` call, so every row clones from
 * an already-parsed node instead of re-running `document.createElement
 * ('template')` + an `innerHTML` parse per row. `skeletonTemplate` is the
 * STATIC-ONLY skeleton produced by `buildLoopSkeletonTemplate` (dynamic attrs
 * omitted, text markers empty) — never the per-row interpolated `template`.
 *
 * Namespace wrap mirrors `emitTemplateCloneLines` (#135 / #1088 / #1096):
 * `detectRootNamespaceWrapTag` is re-checked against the skeleton (same
 * root tag as the interpolated template, so the same wrap decision
 * applies).
 */
export function emitHoistedTemplateDecl(lines: string[], indent: string, tplVar: string, skeletonTemplate: string): void {
  const { wrapTag } = namespaceWrapForTemplate(skeletonTemplate)
  const html = wrapHtmlForNamespace(skeletonTemplate, wrapTag)
  lines.push(`${indent}const ${tplVar} = document.createElement('template')`)
  lines.push(`${indent}${tplVar}.innerHTML = \`${html}\``)
}

/**
 * Clone expression reading off a hoisted template variable declared via
 * `emitHoistedTemplateDecl`, in place of the per-row
 * `emitTemplateCloneInline` / `emitTemplateCloneLines` parse-and-clone.
 */
export function hoistedCloneExpr(tplVar: string, skeletonTemplate: string): string {
  return `${tplVar}.content${namespaceWrapForTemplate(skeletonTemplate).childPath}.cloneNode(true)`
}

/**
 * Multi-line variant for code paths that emit each line separately.
 * Returns three statements with no trailing newlines.
 */
export function emitTemplateCloneLines(template: string, indent: string): string[] {
  const { wrapTag, childPath } = namespaceWrapForTemplate(template)
  const html = wrapHtmlForNamespace(template, wrapTag)
  return [
    `${indent}const __tpl = document.createElement('template')`,
    `${indent}__tpl.innerHTML = \`${html}\``,
    `${indent}return __tpl.content${childPath}.cloneNode(true)`,
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
    /**
     * Emit `mountRowRoot(__el)` on the FRESH branch, connecting the row at the
     * mount point `mapArray` handed down before the body's tail runs.
     *
     * Only bodies that initialise something inside the row need it — the tail
     * is where `useContext` would otherwise resolve against a detached element
     * and fall through to the global last-writer-wins store. A row with no
     * nested init has nothing to resolve, so plain loops leave this off and
     * their emission (and the `mapArrayLazy` measurements) are untouched.
     *
     * Never on the hydration branch: that row came from SSR markup and is in
     * the document already.
     */
    mountRow?: boolean
  },
): void {
  const { template, bodyIsMultiRoot, indent, singleRootLayout, mountRow } = opts
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
    // After the stash: `mountRowRoot` attaches the primary, and an attached
    // primary makes `itemRootElements`' sibling walk the first thing a lookup
    // sees — it must find the stash already in place behind it.
    if (mountRow) lines.push(`${innerIndent}mountRowRoot(__el)`)
    lines.push(`${indent}}`)
    return
  }
  if (singleRootLayout === 'inline') {
    const cloneExpr = emitTemplateCloneInline(template)
    const clone = `__existing ?? (() => { ${cloneExpr} })()`
    lines.push(`${indent}const __el = ${mountRow ? `__existing ?? mountRowRoot((() => { ${cloneExpr} })())` : clone}`)
    return
  }
  lines.push(`${indent}const __el = __existing ?? ${mountRow ? 'mountRowRoot(' : ''}(() => {`)
  for (const ln of emitTemplateCloneLines(template, innerIndent)) lines.push(ln)
  lines.push(`${indent}})()${mountRow ? ')' : ''}`)
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
  const { wrapTag, childPath } = multiRootNamespaceWrapForTemplate(template)
  // Wrap in the namespace's root tag so the parser walks into foreign
  // content; we then descend one level to pick up the per-item roots.
  const innerHtmlExpr = `\`${wrapHtmlForNamespace(template, wrapTag)}\``
  // `parent` is the element whose direct children are the per-item roots
  // (the namespace wrap for SVG/MathML, the template's content for HTML).
  const parentExpr = `__tpl.content${childPath}`
  return [
    `${indent}const __tpl = document.createElement('template')`,
    `${indent}__tpl.innerHTML = ${innerHtmlExpr}`,
    `${indent}${varEl} = ${parentExpr}.firstElementChild.cloneNode(true)`,
    `${indent}${varExtras} = []`,
    `${indent}{ let __sib = ${parentExpr}.firstElementChild.nextElementSibling; while (__sib) { ${varExtras}.push(__sib.cloneNode(true)); __sib = __sib.nextElementSibling } }`,
  ]
}
