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
 */
export function templateRootIsSvg(template: string): boolean {
  // Skip leading whitespace and comments. `template` is a raw string
  // before backtick wrapping, so it should already start with `<` for
  // an element root.
  const m = template.trimStart().match(/^<\s*([A-Za-z][A-Za-z0-9-]*)/)
  if (!m) return false
  // SVG element names are case-sensitive in JSX (e.g., `linearGradient`)
  // and arrive lowercased to the renderer for the kebab-cased forms;
  // match case-insensitively against the canonical lower-case set, but
  // keep the canonical name's casing in the lookup table so JSX names
  // like `clipPath` still match.
  const tag = m[1]
  if (SVG_ROOT_TAGS.has(tag)) return true
  return SVG_ROOT_TAGS.has(tag.toLowerCase())
}

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
