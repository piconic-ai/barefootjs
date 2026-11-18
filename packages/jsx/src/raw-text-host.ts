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
 *     would be dropped silently.
 */

import { createError, ErrorCodes } from './errors.ts'
import { walkIR } from './ir-to-client-js/walker.ts'
import type { CompilerError, IRElement, IRExpression, IRNode } from './types.ts'

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
interface HostScope {
  place: HostPlace
  foreign: boolean
}

/**
 * Foreign-content elements whose children parse as HTML again: the SVG HTML
 * integration points and the MathML text integration points. `annotation-xml`
 * is one only for some `encoding` values (`isAnnotationXmlHtml`).
 */
const HTML_INTEGRATION_POINTS: ReadonlySet<string> = new Set([
  'foreignObject', 'desc', 'title', 'mi', 'mo', 'mn', 'ms', 'mtext',
])

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
  if (tag === 'svg' || tag === 'math') return { ...scope, foreign: true }
  if (scope.foreign && tag === 'annotation-xml') return { ...scope, foreign: !isAnnotationXmlHtml(el) }
  if (scope.foreign && HTML_INTEGRATION_POINTS.has(tag)) return { ...scope, foreign: false }
  return scope
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

function refusal(el: IRElement, node: IRNode, why: string): CompilerError {
  return createError(ErrorCodes.UNSUPPORTED_JSX_PATTERN, node.type === 'element' || node.type === 'expression' ? node.loc : el.loc, {
    message:
      `<${el.tag}> holds ${el.tag === 'textarea' || el.tag === 'title' ? 'RCDATA' : 'raw text'}, where the HTML parser ` +
      `reads no comment, so ${why}`,
    suggestion: {
      message:
        `Give <${el.tag}> a single string expression (or text) as its child, and keep reactive text out of loop rows, ` +
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
  walkIR<HostScope>(root, { place: 'body', foreign: false }, {
    element: ({ node, scope, descend }) => {
      if (!scope.foreign && isRawTextHostTag(node.tag)) lowerHost(node, scope.place, errors)
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
