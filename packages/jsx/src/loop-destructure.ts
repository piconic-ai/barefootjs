import type { IRLoop, IRNode, AttrValue, IRTemplatePart } from './types.ts'

const SIMPLE_FIELD = /^\.[A-Za-z_$][\w$]*$/

/**
 * True when a loop's destructure param is the single shape the non-JS SSR
 * adapters (Go template / Mojolicious / Xslate) can lower today:
 *
 *   `arr.map(({ id, title, ...rest }) => …)`
 *
 * where every binding is a simple `.field` access or an **object-rest read only
 * via member access** (`rest.flag`). The adapters lower the rest binding as an
 * alias to the whole iteration item, which matches JS rest semantics only for
 * member reads of non-consumed keys — so any other use must be refused:
 *
 *   - array-rest / array-index / nested paths (`[a, ...t]`, `{ cells: [h] }`)
 *     need index/slice the `range`/`for` can't express inline;
 *   - spread (`{...rest}`) and bare value uses (`String(rest)`, `{rest}`,
 *     `fn(rest)`) would observe the consumed keys too — they need a residual
 *     object the templates can't build inline;
 *   - a chained `.filter().map(destructure)` would need the filter-param
 *     rewrite to target the synthetic per-item var, so it's refused as well.
 *
 * Unsupported shapes fall through to the adapters' BF104 diagnostic. The scan
 * is conservative: an ambiguous use refuses (false-negative is safe — it keeps
 * the existing build-time error rather than shipping wrong output).
 */
export function isLowerableObjectRestDestructure(loop: IRLoop): boolean {
  const bindings = loop.paramBindings
  if (!bindings || bindings.length === 0) return false
  if (loop.filterPredicate) return false
  for (const b of bindings) {
    if (b.rest) {
      if (b.rest.kind !== 'object') return false
    } else if (!SIMPLE_FIELD.test(b.path)) {
      return false
    }
  }
  const restNames = bindings.filter(b => b.rest).map(b => b.name)
  if (restNames.length === 0) return true
  return !restNamesMisused(loop.children, restNames)
}

/**
 * Walks the whole loop subtree (every node type, every expression-bearing
 * field) and reports whether any rest name is referenced as something other
 * than a member-access base (`rest.flag` / `rest?.flag`). A spread expr
 * (`{...rest}` → expr `"rest"`) and bare value uses are caught by the same
 * regex; a property of an unrelated object (`foo.rest`) is excluded by the
 * lookbehind.
 */
function restNamesMisused(nodes: IRNode[], names: string[]): boolean {
  const valueUse = names.map(
    n => new RegExp(`(?<![\\w.$])${escapeRe(n)}(?!\\s*\\??\\.)(?![\\w$])`),
  )
  let misused = false
  const check = (s: string | undefined | null): void => {
    if (!s || misused) return
    for (const re of valueUse) {
      if (re.test(s)) {
        misused = true
        return
      }
    }
  }
  const attr = (v: AttrValue): void => {
    if (v.kind === 'expression' || v.kind === 'spread') {
      check(v.expr)
      check(v.templateExpr)
    } else if (v.kind === 'template') {
      v.parts.forEach(part)
    }
  }
  const part = (p: IRTemplatePart): void => {
    if (p.type === 'ternary') {
      check(p.condition)
      check(p.templateCondition)
      check(p.whenTrue)
      check(p.whenFalse)
    } else if (p.type === 'lookup') {
      check(p.key)
      check(p.templateKey)
    }
  }
  const visit = (node: IRNode): void => {
    if (misused) return
    switch (node.type) {
      case 'expression':
        check(node.expr)
        check(node.templateExpr)
        break
      case 'conditional':
        check(node.condition)
        check(node.templateCondition)
        visit(node.whenTrue)
        visit(node.whenFalse)
        break
      case 'if-statement':
        check(node.condition)
        check(node.templateCondition)
        for (const sv of node.scopeVariables) {
          check(sv.initializer)
          check(sv.templateInitializer)
        }
        visit(node.consequent)
        if (node.alternate) visit(node.alternate)
        break
      case 'element':
        node.attrs.forEach(a => attr(a.value))
        node.children.forEach(visit)
        break
      case 'component':
        node.props.forEach(p => attr(p.value))
        node.children.forEach(visit)
        break
      case 'provider':
        attr(node.valueProp.value)
        node.children.forEach(visit)
        break
      case 'fragment':
        node.children.forEach(visit)
        break
      case 'async':
        visit(node.fallback)
        node.children.forEach(visit)
        break
      case 'loop':
        check(node.array)
        check(node.key)
        node.children.forEach(visit)
        break
      case 'text':
      case 'slot':
        break
    }
  }
  nodes.forEach(visit)
  return misused
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
