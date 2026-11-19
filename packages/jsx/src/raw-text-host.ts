/**
 * Dynamic children of `<style>`, `<script>`, `<textarea>` and `<title>` (#3910).
 *
 * The content of these elements is raw text (`style`, `script`) or RCDATA
 * (`textarea`, `title`): the HTML parser reads no comment inside them, so the
 * `<!--bf:sN-->…<!--/-->` pair a text slot normally wears would become part
 * of the text itself (a CSS rule dropped, a script statement commented out,
 * a textarea that shows the markers), and the client's comment-based slot
 * lookup finds nothing to update.
 *
 * The one decision is made here, in Phase 1: an expression child of such an
 * element carries no slot (`slotId: null`), so every adapter and the CSR
 * template render the bare value without a marker, and the element is marked
 * `rawTextHost`. The client then rewrites the element's own content from its
 * children instead of looking for comment nodes (`collectFromElement`).
 *
 * Those tags in foreign content (SVG, MathML) are not hosts: their children
 * read comments, so the markers stay. Such an element is flagged
 * `foreignRawTextTag` so an adapter whose engine still treats the tag as raw
 * text or RCDATA by name (Go `html/template`) can refuse the shapes it cannot
 * render (#3937).
 *
 * `style` and `script` are raw text in the stricter sense: the parser decodes
 * no character reference there either, so an HTML-escaped value reaches the
 * CSS / JS parser with its entities (`a[href=&quot;x&quot;]`). Their text is
 * printed as written, with only the sequences that would end the element
 * rewritten (`escapeRawText`, `@barefootjs/shared`, #3934). `textarea` and
 * `title` decode references and keep the HTML escape.
 *
 * That rewrite is the only thing between a value and the markup after the
 * element, so it is applied to the element's WHOLE text, never to a child:
 *   - An end tag can be spelled across children. `{'<'}{v}` with `v` =
 *     `/style><img onerror=…>` holds `</style` in no single child, and the
 *     same goes for a static `</sty` before a dynamic `le>`, for three or
 *     more pieces, and for a fragment's children. So this pass lists the
 *     text and expression children in source order (fragments flattened) as
 *     `IRElement.rawTextContent`, and every emitter (each adapter's element
 *     door, the client template, the reactive update) joins the list's
 *     values and encodes the result in ONE call. Each listed child is marked
 *     `rawText`; a child emitter that is handed a marked node throws rather
 *     than print it alone.
 *   - Nothing else can stand in the element: an element, conditional, loop,
 *     component or slot child is refused below, so no part of the text is
 *     rendered outside that one call.
 *   - A value that is not a string (number, null, array, an object's
 *     `toString`) is turned into its text first and encoded afterwards, so
 *     the encoder always sees the characters that are printed.
 *   - The client computes the text from the same values and encodes it
 *     again on every update; nothing is read back from the DOM, and the
 *     encoding leaves its own output unchanged.
 *   - After the encoded text comes the element's own end tag. Text ending in
 *     `<`, `</` or a partial name (`</styl`, `<scrip`) gives `</styl</style>`:
 *     the tokenizer finds no end tag in the first `</styl<` (the name must
 *     be followed by whitespace, `/` or `>`) and re-reads the `<` as the
 *     start of the real one. A complete `</style` / `</script` at the end is
 *     an ordinary match and is rewritten. `</` followed by anything but an
 *     ASCII letter (a space, a NUL) starts no end tag.
 *   - In a `<script>`, `<!--` enters the escaped state, where `</script>`
 *     still ends the element; only a following `<script` reaches the
 *     double-escaped state, where it does not. Every `<script` in the whole
 *     text is rewritten, wherever the `<!--` came from, so that state is
 *     unreachable and `<!--` is left as written.
 *   - The tag name is matched ASCII case-insensitively, letter by letter,
 *     as the tokenizer does (`</STYLE`, `</ScRiPt`), and a non-ASCII case
 *     fold (U+017F) is not a match on either side.
 *
 * Shapes the element-level update cannot express are refused rather than
 * left to diverge silently:
 *   - a child that is not text or an expression (an element, a conditional,
 *     a loop, a component), whose own markers would land in the raw text;
 *   - a `/* @client *\/` expression, whose SSR form is an empty slot;
 *   - a reactive expression whose host sits in a conditional branch or a
 *     component's children, and any slotted expression (one that may read the
 *     row) in a loop row: the element-level update is wired only for hosts in
 *     the component body, and a branch template runs untracked (`insert()`
 *     owns its effects through the branch's own wiring), so a content change
 *     would be dropped silently;
 *   - a read of the component's `children` in a `<style>` / `<script>`: the
 *     children arrive as rendered, HTML-escaped markup, which cannot be turned
 *     back into the text they were written as.
 */

import { isRawTextTag } from '@barefootjs/shared'
import { createError, ErrorCodes } from './errors.ts'
import { walkIR } from './ir-to-client-js/walker.ts'
import type { CompilerError, IRElement, IRExpression, IRNode, IRText } from './types.ts'

const RAW_TEXT_HOST_TAGS: ReadonlySet<string> = new Set(['style', 'script', 'textarea', 'title'])

/** `style` / `script` hold raw text; `textarea` / `title` hold RCDATA. */
export function isRawTextHostTag(tag: string): boolean {
  return RAW_TEXT_HOST_TAGS.has(tag)
}

/**
 * Where a host sits, which decides whether an element-level update is wired.
 * Ordered by how much of the update wiring is missing: `body` is wired,
 * `conditional` and `children` have none for reactive content, and `loop`
 * rows have none for anything a row value may feed.
 */
type HostPlace = 'body' | 'conditional' | 'children' | 'loop'

const PLACE_RANK: Record<HostPlace, number> = { body: 0, conditional: 1, children: 2, loop: 3 }

/** The place of a node nested in `inner` inside `outer`: the less wired of the two. */
function nest(outer: HostPlace, inner: HostPlace): HostPlace {
  return PLACE_RANK[inner] > PLACE_RANK[outer] ? inner : outer
}

/**
 * The walk state: the place, and whether the element's children parse as
 * foreign content. Only HTML-namespace tags are hosts: inside `<svg>` /
 * `<math>`, `style` / `script` hold ordinary foreign content (comments are
 * read) and an SVG `title` is an HTML integration point, so the slot markers
 * stay valid there (#3265 row work relies on it).
 */
type Namespace = 'html' | 'svg' | 'math'

interface HostScope {
  place: HostPlace
  /** The namespace the element's children are created in (HTML integration points reset it to `html`). */
  namespace: Namespace
  /**
   * True for the children of a MathML `annotation-xml` that is NOT an HTML
   * integration point: the HTML parser still routes an `<svg>` start tag
   * directly under it to the SVG namespace, whatever the `encoding`.
   */
  annotationXmlChild?: boolean
}

/**
 * Elements whose children parse as HTML again, per namespace: the SVG HTML
 * integration points and the MathML text integration points are different
 * sets, so an SVG `mi` or a MathML `desc` is NOT one. MathML's
 * `annotation-xml` is one only for some `encoding` values
 * (`isAnnotationXmlHtml`).
 */
const SVG_INTEGRATION_POINTS: ReadonlySet<string> = new Set(['foreignObject', 'desc', 'title'])
const MATHML_TEXT_INTEGRATION_POINTS: ReadonlySet<string> = new Set(['mi', 'mo', 'mn', 'ms', 'mtext'])

/**
 * `<annotation-xml>` is an HTML integration point only when its `encoding`
 * attribute is `text/html` or `application/xhtml+xml` (ASCII case-insensitive).
 * A literal value is decided exactly; an `encoding` that is not a literal (or
 * that an attribute spread may supply) cannot be known, so it is treated as HTML — the host rules (bare value,
 * refusal of shapes that cannot update) are also valid on the foreign side,
 * where the opposite guess would leave comment markers in raw text.
 */
function isAnnotationXmlHtml(el: IRElement): boolean {
  // An attribute spread may supply or override `encoding` at runtime (a later
  // spread wins over an earlier literal), so an element that spreads anything
  // cannot be classified; treat it as HTML like any other non-literal value.
  if (el.attrs.some(a => a.name === '...')) return true
  const encoding = el.attrs.find(a => a.name === 'encoding')
  if (!encoding) return false
  if (encoding.value.kind !== 'literal') return true
  const value = encoding.value.value.toLowerCase()
  return value === 'text/html' || value === 'application/xhtml+xml'
}

/** The scope an element's children are walked in. */
function childScope(el: IRElement, scope: HostScope): HostScope {
  const tag = el.tag
  switch (scope.namespace) {
    case 'html':
      if (tag === 'svg') return { ...scope, namespace: 'svg' }
      if (tag === 'math') return { ...scope, namespace: 'math' }
      return scope
    case 'svg':
      return SVG_INTEGRATION_POINTS.has(tag) ? { ...scope, namespace: 'html' } : scope
    case 'math':
      if (tag === 'svg' && scope.annotationXmlChild) return { place: scope.place, namespace: 'svg' }
      if (MATHML_TEXT_INTEGRATION_POINTS.has(tag)) return { place: scope.place, namespace: 'html' }
      if (tag === 'annotation-xml') {
        return isAnnotationXmlHtml(el)
          ? { place: scope.place, namespace: 'html' }
          : { place: scope.place, namespace: 'math', annotationXmlChild: true }
      }
      return { place: scope.place, namespace: 'math' }
  }
}

/**
 * The expressions among `children` (fragments flattened), or the first child
 * that is neither text, an expression nor a fragment of those.
 */
function splitHostChildren(
  children: readonly IRNode[],
  expressions: IRExpression[],
): IRNode | null {
  for (const child of children) {
    if (child.type === 'text') continue
    if (child.type === 'expression') {
      expressions.push(child)
      continue
    }
    if (child.type === 'fragment') {
      const nested = splitHostChildren(child.children, expressions)
      if (nested) return nested
      continue
    }
    return child
  }
  return null
}

/**
 * Collects the text and expression children of a `<style>` / `<script>`
 * (fragments flattened) into `parts`, in source order, marking each with the
 * element it is the raw text of.
 */
function collectRawText(
  children: readonly IRNode[],
  tag: NonNullable<IRText['rawText']>,
  parts: (IRText | IRExpression)[],
): void {
  for (const child of children) {
    if (child.type === 'text' || child.type === 'expression') {
      child.rawText = tag
      parts.push(child)
    } else if (child.type === 'fragment') {
      collectRawText(child.children, tag, parts)
    }
  }
}

/** Sets `rawTextContent` on a `<style>` / `<script>` that has text to print. */
function lowerRawTextContent(el: IRElement): void {
  if (!isRawTextTag(el.tag)) return
  const parts: (IRText | IRExpression)[] = []
  collectRawText(el.children, el.tag, parts)
  if (parts.length > 0) el.rawTextContent = parts
}

function refusal(el: IRElement, node: IRNode, why: string): CompilerError {
  return tagRefusal(el.tag, node.type === 'element' || node.type === 'expression' ? node.loc : el.loc, why)
}

function tagRefusal(tag: string, loc: IRElement['loc'], why: string): CompilerError {
  return createError(ErrorCodes.UNSUPPORTED_JSX_PATTERN, loc, {
    message:
      `<${tag}> holds ${tag === 'textarea' || tag === 'title' ? 'RCDATA' : 'raw text'}, where the HTML parser ` +
      `reads no comment, so ${why}`,
    suggestion: {
      message:
        `Give <${tag}> a single string expression (or text) as its child, and keep reactive text out of loop rows, ` +
        "conditional branches and a component's children (render it in the component body, or use another element).",
      escape: [{ kind: 'rewrite' }],
    },
  })
}

const PLACE_LABEL: Record<HostPlace, string> = {
  body: 'component body',
  conditional: 'conditional branch',
  children: "component's children",
  loop: 'loop row',
}

function lowerHost(el: IRElement, scope: HostPlace, errors: CompilerError[]): void {
  const expressions: IRExpression[] = []
  const foreign = splitHostChildren(el.children, expressions)
  if (foreign) {
    errors.push(refusal(el, foreign, `a ${foreign.type} child cannot be rendered there.`))
    return
  }
  if (expressions.length === 0) return
  const deferred = expressions.find(e => e.clientOnly)
  if (deferred) {
    errors.push(refusal(el, deferred, 'a /* @client */ expression child cannot be rendered there.'))
    return
  }
  // Inside a loop row any slotted expression may read the row value (a
  // same-key item replacement must reach the element), so it counts as live.
  const live = expressions.find(
    e => e.slotId !== null && (scope === 'loop' || e.reactive || e.callsReactiveGetters),
  )
  if (live && scope !== 'body') {
    errors.push(refusal(el, live, `its reactive text cannot be updated from inside a ${PLACE_LABEL[scope]}.`))
    return
  }
  for (const e of expressions) e.slotId = null
  el.rawTextHost = true
}

/** Lowers every raw-text host in `root` (see the file header). */
export function lowerRawTextHosts(root: IRNode, errors: CompilerError[]): void {
  walkIR<HostScope>(root, { place: 'body', namespace: 'html' }, {
    element: ({ node, scope, descend }) => {
      if (isRawTextHostTag(node.tag)) {
        if (scope.namespace === 'html') {
          lowerRawTextContent(node)
          lowerHost(node, scope.place, errors)
        } else {
          node.foreignRawTextTag = true
        }
      }
      descend(childScope(node, scope))
    },
    loop: ({ scope, descend }) => descend({ ...scope, place: nest(scope.place, 'loop') }),
    conditional: ({ scope, descend }) => descend({ ...scope, place: nest(scope.place, 'conditional') }),
    ifStatement: ({ scope, descend }) => descend({ ...scope, place: nest(scope.place, 'conditional') }),
    component: ({ scope, descend, descendJsxChildren }) => {
      const inner: HostScope = { ...scope, place: nest(scope.place, 'children') }
      descend(inner)
      descendJsxChildren(inner)
    },
  })
}

/**
 * Refuses a read of the component's `children` in the text of a `<style>` /
 * `<script>` (#3934). The children arrive as rendered, HTML-escaped markup,
 * which cannot be turned back into the text they were written as, and the
 * element decodes no character reference. Runs after the expressions are
 * parsed, which is when `childrenRead` is known.
 */
export function refuseChildrenInRawText(root: IRNode, errors: CompilerError[]): void {
  walkIR<null>(root, null, {
    expression: ({ node }) => {
      if (!node.rawText || !node.childrenRead) return
      errors.push(
        tagRefusal(node.rawText, node.loc, "the component's children, which arrive as rendered markup, cannot be its text."),
      )
    },
    component: ({ descend, descendJsxChildren }) => {
      descend()
      descendJsxChildren()
    },
  })
}
