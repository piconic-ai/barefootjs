/**
 * BarefootJS — reserved `children` JSX-prop resolver
 *
 * Answers one question for every adapter: "which prop on this component
 * call supplies the reserved `children` slot?" Before this module existed,
 * two independently-maintained answers had drifted apart (issue #2773):
 *
 * - The seven DSL adapters (Blade/ERB/Jinja/Mojolicious/minijinja/Twig/
 *   Xslate) each carried a byte-identical private copy of this function in
 *   their own `lib/ir-scope.ts`, matching on the prop NAMED `children`.
 * - The Go template adapter's `jsxChildrenPropNodes` answered a different
 *   question: the FIRST prop of ANY name carrying a `jsx-children`
 *   payload. For a component with an earlier JSX-element prop (e.g.
 *   `header={<span/>}`) and no `children` prop at all, that silently
 *   backfilled `.Children` with the `header` payload — and when a
 *   `children` prop WAS also given, it lost `children`'s payload entirely
 *   in favor of the earlier prop's.
 *
 * Hono, the reference adapter, resolves `children` by name — ordinary JSX
 * semantics: `<Card header={<A/>} children={<B/>} />` binds `header` and
 * `children` to two separate props, exactly as `React.createElement`
 * would. The DSL adapters already agreed with Hono; this module makes
 * their shared answer the ONLY implementation, so Go template (and any
 * future adapter) calls it instead of growing its own copy that can
 * re-diverge.
 *
 * Generic and structurally typed rather than importing `IRProp`/`IRNode`
 * from `@barefootjs/jsx`: `@barefootjs/jsx` itself depends on
 * `@barefootjs/shared`, so importing the other direction would be a
 * dependency cycle. Callers pass their real IR prop array and get back a
 * concretely-typed node array — no cast, no parallel type declaration to
 * keep in sync with `@barefootjs/jsx`'s `AttrValue` union.
 */

/** Structural shape of an `AttrValue`-like prop value, generic over the node type a `jsx-children` payload carries. */
interface JsxChildrenAttrValueLike<TNode> {
  kind: string
  children?: TNode[]
}

/** Structural shape of one IR prop, generic over the node type. */
export interface ChildrenSlotPropLike<TNode> {
  name: string
  value: JsxChildrenAttrValueLike<TNode>
}

/**
 * Find the prop literally named `children` and, if its value carries a
 * `jsx-children` payload, return that payload's nodes. Returns `[]` when
 * no `children` prop exists, or when one exists but is not a resolved
 * JSX-children payload (e.g. an ordinary expression prop that merely
 * happens to be named `children`).
 */
export function resolveJsxChildrenProp<TNode>(
  props: ReadonlyArray<ChildrenSlotPropLike<TNode>>,
): TNode[] {
  const prop = props.find(p => p.name === 'children')
  if (!prop) return []
  if (prop.value.kind !== 'jsx-children') return []
  return prop.value.children ?? []
}
