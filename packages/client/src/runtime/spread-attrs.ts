/**
 * BarefootJS - Spread Attributes Helper (Template Mode)
 *
 * Converts an object to an HTML attribute string for use inside template literals.
 * Unlike applyRestAttrs (which manipulates DOM elements reactively), this produces
 * a static string for server/template rendering of computed local spreads.
 */

import { styleToCss } from './style'

/**
 * SVG attributes that are case-sensitive and MUST stay in camelCase.
 *
 * The default JSX-prop → HTML-attribute rewrite lower-cases camelCase
 * (`fooBar` → `foo-bar`), which is correct for HTML attrs and for the
 * CSS-style SVG presentation attrs (`strokeWidth` → `stroke-width`).
 * The XML-namespaced SVG attrs below, though, are case-sensitive in
 * the spec: `viewBox` lower-cased to `view-box` makes the browser
 * treat it as an unknown user attribute and the SVG no longer renders
 * (pointer events stop hitting the inner geometry — surfaced as the
 * Form Builder e2e regression in #1244's merge-emit follow-up).
 *
 * Coordinates with the compile-time `SVG_CAMEL_TO_KEBAB` table in
 * `packages/jsx/src/ir-to-client-js/utils.ts`: presentation attrs
 * (`clipPath`, `strokeWidth`, …) live there and must NOT appear here,
 * or the same JSX prop would lower to `clip-path` via the explicit-
 * attr path and stay `clipPath` via the spread path — a silent
 * divergence. The list below is XML attribute names that have no
 * kebab-case mirror (`viewBox`, `clipPathUnits`, …).
 *
 * The list mirrors React DOM's `DOMProperty` case-preserving entries
 * (only the attributes that appear on actual SVG elements; ARIA and
 * XLink namespaces are unrelated and handled by their `aria-*` /
 * `xlink:*` literal prefix).
 */
const SVG_CAMEL_CASE_ATTRS: ReadonlySet<string> = new Set([
  'allowReorder', 'attributeName', 'attributeType', 'autoReverse',
  'baseFrequency', 'baseProfile', 'calcMode', 'clipPathUnits',
  'contentScriptType', 'contentStyleType', 'diffuseConstant', 'edgeMode',
  'externalResourcesRequired', 'filterRes', 'filterUnits', 'glyphRef',
  'gradientTransform', 'gradientUnits', 'kernelMatrix', 'kernelUnitLength',
  'keyPoints', 'keySplines', 'keyTimes', 'lengthAdjust', 'limitingConeAngle',
  'markerHeight', 'markerUnits', 'markerWidth', 'maskContentUnits',
  'maskUnits', 'numOctaves', 'pathLength', 'patternContentUnits',
  'patternTransform', 'patternUnits', 'pointsAtX', 'pointsAtY', 'pointsAtZ',
  'preserveAlpha', 'preserveAspectRatio', 'primitiveUnits', 'refX', 'refY',
  'repeatCount', 'repeatDur', 'requiredExtensions', 'requiredFeatures',
  'specularConstant', 'specularExponent', 'spreadMethod', 'startOffset',
  'stdDeviation', 'stitchTiles', 'surfaceScale', 'systemLanguage',
  'tableValues', 'targetX', 'targetY', 'textLength', 'viewBox', 'viewTarget',
  'xChannelSelector', 'yChannelSelector', 'zoomAndPan',
])

/**
 * Convert an object to an HTML attribute string.
 * Aligned with applyRestAttrs conventions: skips null/undefined/false,
 * event handlers, maps className→class and htmlFor→for. The `style`
 * prop is routed through `styleToCss` so object literals serialize to
 * a real CSS string (matching the reactive `applyRestAttrs` path).
 *
 * SVG attributes listed in `SVG_CAMEL_CASE_ATTRS` are preserved
 * verbatim — the SVG XML spec is case-sensitive for those names.
 */
export function spreadAttrs(obj: Record<string, unknown>): string {
  if (!obj || typeof obj !== 'object') return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === false) continue
    // Skip event handlers
    if (key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()) continue
    // Skip children prop
    if (key === 'children') continue
    if (key === 'style') {
      const css = styleToCss(value)
      if (css != null) parts.push(`style="${css}"`)
      continue
    }
    // Map JSX prop names to HTML attribute names. Case-sensitive SVG
    // attrs keep their camelCase per the spec; HTML / CSS-style SVG
    // presentation attrs lower-case to kebab-case.
    const attr = key === 'className' ? 'class'
      : key === 'htmlFor' ? 'for'
      : SVG_CAMEL_CASE_ATTRS.has(key) ? key
      : key.replace(/([A-Z])/g, '-$1').toLowerCase()
    parts.push(value === true ? attr : `${attr}="${value}"`)
  }
  return parts.join(' ')
}
