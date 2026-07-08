/**
 * BarefootJS — DOM property classifier
 *
 * Single source of truth for "what does this JSX prop name mean in the DOM?"
 * Consumed by both the client runtime (applyRestAttrs, spreadAttrs) and the
 * compile-time emitter (emit-reactive, html-template). Adding a new special
 * case (e.g. a new boolean DOM attribute) is a one-file edit here.
 *
 * @see https://github.com/piconic-ai/barefootjs/issues/1369
 */

// ---------------------------------------------------------------------------
// Static tables
// ---------------------------------------------------------------------------

export const BOOLEAN_ATTRS: ReadonlySet<string> = new Set([
  'checked',
  'disabled',
  'readonly',
  'selected',
  'required',
  'hidden',
  'autofocus',
  'autoplay',
  'controls',
  'loop',
  'muted',
  'open',
  'multiple',
  'novalidate',
  'formnovalidate',
])

/**
 * SVG presentation attributes written camelCase in JSX that MUST be emitted
 * as kebab-case in the DOM (`strokeWidth` → `stroke-width`).
 */
const SVG_CAMEL_TO_KEBAB: Readonly<Record<string, string>> = {
  // stroke
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  // fill
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  // gradient stops
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  // text presentation
  textAnchor: 'text-anchor',
  dominantBaseline: 'dominant-baseline',
  alignmentBaseline: 'alignment-baseline',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  fontStyle: 'font-style',
  letterSpacing: 'letter-spacing',
  wordSpacing: 'word-spacing',
  // common presentation / interaction
  pointerEvents: 'pointer-events',
  vectorEffect: 'vector-effect',
  colorInterpolation: 'color-interpolation',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  // marker references
  markerStart: 'marker-start',
  markerMid: 'marker-mid',
  markerEnd: 'marker-end',
}

/**
 * HTML attributes written in React-style camelCase in JSX that map to a
 * lowercase (or hyphenated) HTML attribute name. Mirrors React DOM's
 * HTML attribute aliases. `className` / `htmlFor` are handled before
 * this table (they predate it); everything here is a plain rename —
 * value semantics are untouched (`readOnly` becomes the BOOLEAN_ATTRS
 * member `readonly`; `spellCheck` stays the *enumerated* — NOT boolean
 * — `spellcheck`).
 *
 * Consumed by `toHTMLAttrName` (compile-time Phase 1: `processAttributes`
 * normalizes IRAttribute.name so adapters emit the HTML name as-is) and
 * by `toHTMLAttrNameRuntime` (runtime spread paths). Names NOT in this
 * table pass through unchanged, so `data-*`, `aria-*`, and custom-element
 * attributes are never rewritten.
 */
const HTML_CAMEL_ALIASES: Readonly<Record<string, string>> = {
  acceptCharset: 'accept-charset',
  accessKey: 'accesskey',
  allowFullScreen: 'allowfullscreen',
  autoCapitalize: 'autocapitalize',
  autoComplete: 'autocomplete',
  autoCorrect: 'autocorrect',
  autoFocus: 'autofocus',
  autoPlay: 'autoplay',
  cellPadding: 'cellpadding',
  cellSpacing: 'cellspacing',
  charSet: 'charset',
  colSpan: 'colspan',
  contentEditable: 'contenteditable',
  controlsList: 'controlslist',
  crossOrigin: 'crossorigin',
  dateTime: 'datetime',
  dirName: 'dirname',
  encType: 'enctype',
  enterKeyHint: 'enterkeyhint',
  fetchPriority: 'fetchpriority',
  formAction: 'formaction',
  formEncType: 'formenctype',
  formMethod: 'formmethod',
  formNoValidate: 'formnovalidate',
  formTarget: 'formtarget',
  frameBorder: 'frameborder',
  hrefLang: 'hreflang',
  httpEquiv: 'http-equiv',
  imageSizes: 'imagesizes',
  imageSrcSet: 'imagesrcset',
  inputMode: 'inputmode',
  itemID: 'itemid',
  itemProp: 'itemprop',
  itemRef: 'itemref',
  itemScope: 'itemscope',
  itemType: 'itemtype',
  marginHeight: 'marginheight',
  marginWidth: 'marginwidth',
  maxLength: 'maxlength',
  minLength: 'minlength',
  noModule: 'nomodule',
  noValidate: 'novalidate',
  playsInline: 'playsinline',
  popoverTarget: 'popovertarget',
  popoverTargetAction: 'popovertargetaction',
  radioGroup: 'radiogroup',
  readOnly: 'readonly',
  referrerPolicy: 'referrerpolicy',
  rowSpan: 'rowspan',
  spellCheck: 'spellcheck',
  srcDoc: 'srcdoc',
  srcLang: 'srclang',
  srcSet: 'srcset',
  tabIndex: 'tabindex',
  useMap: 'usemap',
}

/**
 * SVG XML attribute names that are case-sensitive and MUST stay in camelCase.
 *
 * These are distinct from the CSS-style presentation attrs above: `viewBox`
 * lower-cased to `view-box` makes the browser treat it as an unknown attribute
 * and the SVG no longer renders. The list mirrors React DOM's `DOMProperty`
 * case-preserving entries.
 */
const SVG_XML_CAMEL_ATTRS: ReadonlySet<string> = new Set([
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

// ---------------------------------------------------------------------------
// Classification result
// ---------------------------------------------------------------------------

export type DOMPropKind =
  | 'skip'      // children — not a DOM concern
  | 'ref'       // ref callback — wire once, not an attribute
  | 'event'     // onClick, onKeyDown, … — addEventListener target
  | 'style'     // routes through styleToCss
  | 'property'  // value, checked — must use DOM property, not setAttribute
  | 'boolean'   // disabled, hidden, … — presence/absence attribute
  | 'attr'      // regular setAttribute target
  | 'innerHTML' // dangerouslySetInnerHTML — { __html } sets el.innerHTML, never an attribute

export interface DOMPropClassification {
  kind: DOMPropKind
  /** HTML attribute name after JSX→DOM mapping (className→class, strokeWidth→stroke-width, etc.) */
  attrName: string
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

function isEventProp(key: string): boolean {
  return key.length > 2 && key[0] === 'o' && key[1] === 'n' && key[2] >= 'A' && key[2] <= 'Z'
}

/**
 * Classify a JSX prop name into its DOM handling category.
 *
 * This is the single source of truth for "how should this prop reach the DOM?"
 * Both runtime helpers (applyRestAttrs, spreadAttrs) and compile-time emitters
 * (emitAttrUpdate, html-template) consume this classification.
 */
export function classifyDOMProp(key: string): DOMPropClassification {
  if (key === 'children') return { kind: 'skip', attrName: key }
  if (key === 'ref')      return { kind: 'ref', attrName: key }
  if (key === 'dangerouslySetInnerHTML') return { kind: 'innerHTML', attrName: key }
  if (isEventProp(key))   return { kind: 'event', attrName: key }

  const attrName = toHTMLAttrNameRuntime(key)

  if (attrName === 'style')   return { kind: 'style', attrName }
  if (attrName === 'value')   return { kind: 'property', attrName }
  if (attrName === 'checked') return { kind: 'property', attrName }
  if (BOOLEAN_ATTRS.has(attrName.toLowerCase())) return { kind: 'boolean', attrName }

  return { kind: 'attr', attrName }
}

// ---------------------------------------------------------------------------
// Attribute name mapping (also exported for compile-time use)
// ---------------------------------------------------------------------------

/**
 * Map a JSX prop name to the corresponding HTML/SVG attribute name.
 *
 * - `className` → `class`
 * - `htmlFor` → `for`
 * - SVG presentation attrs → kebab-case (`strokeWidth` → `stroke-width`)
 * - SVG XML attrs → preserved camelCase (`viewBox` stays `viewBox`)
 * - Everything else → passed through unchanged (HTML parsing is case-insensitive)
 *
 * Note: runtime spread paths that need generic camelCase→kebab conversion
 * (e.g. for data-* attributes written in camelCase) should use
 * `toHTMLAttrNameRuntime` instead.
 */
export function toHTMLAttrName(key: string): string {
  if (key === 'className') return 'class'
  if (key === 'htmlFor')   return 'for'
  const htmlAlias = HTML_CAMEL_ALIASES[key]
  if (htmlAlias !== undefined) return htmlAlias
  const svgKebab = SVG_CAMEL_TO_KEBAB[key]
  if (svgKebab !== undefined) return svgKebab
  return key
}

/**
 * Runtime variant of attribute name mapping that additionally applies
 * camelCase→kebab conversion for `data-*` and `aria-*` convenience
 * props (e.g. `dataTestId` → `data-test-id`) and preserves SVG XML
 * attribute casing. HTML camelCase aliases resolve through the same
 * `HTML_CAMEL_ALIASES` table as the compile-time variant (`tabIndex` →
 * `tabindex`); generic kebab-casing still applies ONLY to `data-*` /
 * `aria-*` — an unknown camelCase key passes through unchanged rather
 * than being guessed into a hyphenated non-attribute.
 */
export function toHTMLAttrNameRuntime(key: string): string {
  if (key === 'className') return 'class'
  if (key === 'htmlFor')   return 'for'
  const htmlAlias = HTML_CAMEL_ALIASES[key]
  if (htmlAlias !== undefined) return htmlAlias
  const svgKebab = SVG_CAMEL_TO_KEBAB[key]
  if (svgKebab !== undefined) return svgKebab
  if (SVG_XML_CAMEL_ATTRS.has(key)) return key
  if (key.startsWith('data') || key.startsWith('aria')) {
    return key.replace(/([A-Z])/g, '-$1').toLowerCase()
  }
  return key
}

/**
 * Check if an attribute name (HTML-level, not JSX-level) is a boolean attribute.
 */
export function isBooleanAttr(name: string): boolean {
  return BOOLEAN_ATTRS.has(name.toLowerCase())
}

/**
 * Check if a JSX prop name is an event handler (onXxx pattern).
 */
export { isEventProp }
