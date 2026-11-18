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
 *   - a reactive expression whose host sits in a loop row or in a component's
 *     children, where the element-level update is not wired.
 */

import { createError, ErrorCodes } from './errors.ts'
import { walkIR } from './ir-to-client-js/walker.ts'
import type { CompilerError, IRElement, IRExpression, IRNode } from './types.ts'

const RAW_TEXT_HOST_TAGS: ReadonlySet<string> = new Set(['style', 'script', 'textarea', 'title'])

/** `style` / `script` hold raw text; `textarea` / `title` hold RCDATA. */
export function isRawTextHostTag(tag: string): boolean {
  return RAW_TEXT_HOST_TAGS.has(tag)
}

/** Where a host sits, which decides whether an element-level update is wired. */
type HostScope = 'component-body' | 'row-or-children'

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
      message: `Give <${el.tag}> a single string expression (or text) as its child.`,
      escape: [{ kind: 'rewrite' }],
    },
  })
}

function lowerHost(el: IRElement, scope: HostScope, errors: CompilerError[]): void {
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
  const live = expressions.find(e => e.slotId !== null && (e.reactive || e.callsReactiveGetters))
  if (live && scope === 'row-or-children') {
    errors.push(refusal(el, live, 'its reactive text cannot be updated from inside a loop row or a component\'s children.'))
    return
  }
  for (const e of expressions) e.slotId = null
  el.rawTextHost = true
}

/** Lowers every raw-text host in `root` (see the file header). */
export function lowerRawTextHosts(root: IRNode, errors: CompilerError[]): void {
  walkIR<HostScope>(root, 'component-body', {
    element: ({ node, scope, descend }) => {
      if (isRawTextHostTag(node.tag)) lowerHost(node, scope, errors)
      descend()
    },
    loop: ({ descend }) => descend('row-or-children'),
    component: ({ descend, descendJsxChildren }) => {
      descend('row-or-children')
      descendJsxChildren('row-or-children')
    },
  })
}
