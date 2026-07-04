import type { IRLoop, IRNode, AttrValue, IRTemplatePart } from './types.ts'

/**
 * True when a loop's `.map()` destructure param is one of the shapes this
 * repo's per-adapter emitters can lower to a native accessor, WITHOUT
 * relying on the JS/CSR runtime to evaluate an arbitrary residual object.
 *
 * Admitted (all via `LoopParamBinding.segments` — the structured, non-string
 * accessor path built by `extractLoopParamBindings`; see #2087):
 *
 *   - fixed bindings at any depth / shape: `.field` (`{ id }`), array-index
 *     (`[k, v]`), and nested paths through either (`{ cells: [head] }`,
 *     `{ user: { name } }`) — anything the IR walker turned into a
 *     `segments` path. `segments` is required; a fixed binding with no
 *     `segments` is stale/foreign IR and refused conservatively.
 *   - array-rest bindings (`[first, ...tail]`): the lowered value IS the
 *     exact JS slice (`tail === item.slice(1)`), so there is no way for an
 *     adapter to observe a "wrong" value from any use of the name — no
 *     use-restriction scan needed, unlike object-rest below.
 *   - object-rest bindings (`{ id, ...rest }`) whose every use in the loop
 *     subtree is one of:
 *       (a) a member-access base (`rest.flag` / `rest?.flag` — the
 *           "read one field back off the rest" idiom), or
 *       (b) NEW: a spread attr (`{...rest}`) on an intrinsic ELEMENT node
 *           (`<li {...rest}>`) whose `expr` is *exactly* the rest name —
 *           "forward everything else onto this element" is a residual the
 *           adapters can express as "all attrs not already destructured",
 *           without ever materializing the residual object itself.
 *     A spread on a `component` or `provider` node still refuses — a
 *     component's own props lowering is a different code path with its own
 *     contract, not something this gate should reach into. A spread whose
 *     expr merely *contains* the name (`{...fn(rest)}`) still refuses too —
 *     that's an opaque call, not a literal forward.
 *
 * Still refused, and why:
 *
 *   - any OTHER use of an object-rest name (`String(rest)`, `{rest}` as a
 *     text/expression node, `onClick={() => fn(rest)}`, `{...fn(rest)}`)
 *     needs the actual residual *object*, which the non-JS template
 *     adapters can't build inline — only "read one field" (member access)
 *     and "spread all remaining attrs onto this element" (the new spread
 *     case) have an adapter-side answer that doesn't require constructing
 *     the value.
 *   - a chained `.filter().map(destructure)` needs the filter-param
 *     rewrite to retarget the synthetic per-item var; out of scope here.
 *   - a binding name (or `loop.index`) in the reserved `__bf_` namespace
 *     would collide with the synthetic per-item loop variable the SSR
 *     adapters emit (duplicate locals, ambiguous accessors).
 *   - computed property keys (`{ [k]: v }`) can't be expressed as any
 *     accessor path at all — they raise `BF025` at Phase 1 and never reach
 *     this gate (`loop.paramBindings` is simply absent).
 *
 * Unsupported shapes fall through to the adapters' BF104 diagnostic. The
 * scan is conservative: an ambiguous use refuses (false-negative is safe —
 * it keeps the existing build-time error rather than shipping wrong output).
 */
export function isLowerableLoopDestructure(loop: IRLoop): boolean {
  const bindings = loop.paramBindings
  if (!bindings || bindings.length === 0) return false
  if (loop.filterPredicate) return false
  // The SSR adapters emit a synthetic per-item loop variable in the reserved
  // `__bf_item` namespace (depth-suffixed on Go). A user destructure binding —
  // or the `index` param — in that namespace would collide with / shadow the
  // synthetic var (duplicate `my $__bf_item …` locals, ambiguous accessors), so
  // refuse the lowering (→ BF104) rather than emit broken template locals.
  for (const name of [...bindings.map(b => b.name), loop.index]) {
    if (name && name.startsWith('__bf_')) return false
  }
  for (const b of bindings) {
    if (b.rest) {
      // Both rest kinds require `segments` (the array-rest kind may
      // legitimately have an empty one, at the loop root — `([...rest]) =>`).
      if (!b.segments) return false
    } else if (!b.segments || b.segments.length === 0) {
      // Fixed binding with no structured path: stale/foreign IR built
      // before `segments` existed. Refuse rather than guess from `path`.
      return false
    }
  }
  const objectRestNames = bindings.filter(b => b.rest?.kind === 'object').map(b => b.name)
  if (objectRestNames.length === 0) return true
  return !restNamesMisused(loop, objectRestNames)
}

/** @deprecated Use {@link isLowerableLoopDestructure}. Kept as an alias so
 * existing template-adapter imports keep compiling; the underlying gate now
 * admits more shapes (array-index / nested paths / array-rest / the
 * spread-onto-element case) than the name suggests — see #2087 Phase A.
 */
export const isLowerableObjectRestDestructure = isLowerableLoopDestructure

/**
 * Walks the whole loop subtree (every node type, every expression-bearing
 * field) and reports whether any object-rest name is referenced as
 * something other than:
 *
 *   - a member-access base (`rest.flag` / `rest?.flag`), or
 *   - a spread attr on an intrinsic ELEMENT node whose expr is *exactly*
 *     the rest name (`<li {...rest}>`) — the one new admitted shape.
 *
 * A spread expr on a `component` / `provider` node, or a spread whose expr
 * merely contains the name, still counts as misuse (falls through to the
 * generic bare-value-use regex below). A property of an unrelated object
 * (`foo.rest`) is excluded by the lookbehind, same as before.
 *
 * The scan covers the gated loop's own non-children expression fields too
 * (`array` / `key` / `mapPreamble` / `flatMapCallback` body) — a bare rest
 * use can surface there (e.g. `.map(({ ...rest }) => { const x = rest; … })`
 * lifts `const x = rest` into `mapPreamble`), plus intrinsic element event
 * handlers (`onClick={() => fn(rest)}`).
 */
function restNamesMisused(loop: IRLoop, names: string[]): boolean {
  const nameSet = new Set(names)
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
  // `isIntrinsicElementAttrs` distinguishes `<li {...rest}>` (element,
  // admitted) from `<Child {...rest} />` / a provider's value prop
  // (still refused) — same spread AttrValue shape, different node kind.
  const attr = (v: AttrValue, isIntrinsicElementAttrs: boolean): void => {
    if (v.kind === 'spread' && isIntrinsicElementAttrs && nameSet.has(v.expr.trim())) {
      return
    }
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
  const visitLoop = (l: IRLoop): void => {
    if (misused) return
    check(l.array)
    check(l.templateArray)
    check(l.key)
    check(l.mapPreamble)
    check(l.templateMapPreamble)
    if (l.flatMapCallback) {
      check(l.flatMapCallback.body)
      check(l.flatMapCallback.templateBody)
      l.flatMapCallback.fragments.forEach(f => visit(f.ir))
    }
    l.children.forEach(visit)
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
        node.attrs.forEach(a => attr(a.value, true))
        node.events.forEach(e => check(e.handler))
        node.children.forEach(visit)
        break
      case 'component':
        node.props.forEach(p => attr(p.value, false))
        node.children.forEach(visit)
        break
      case 'provider':
        attr(node.valueProp.value, false)
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
        visitLoop(node)
        break
      case 'text':
      case 'slot':
        break
    }
  }
  visitLoop(loop)
  return misused
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
