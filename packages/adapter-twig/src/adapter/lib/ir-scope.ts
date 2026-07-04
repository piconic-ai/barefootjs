/**
 * IR traversal helpers for the Twig template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/lib/ir-scope.ts`.
 * `resolveJsxChildrenProp` and `collectRootScopeNodes` are byte-identical
 * (adapter-agnostic IR walks).
 *
 * `extractTopLevelIdentifiers` scans the RENDERED template text (rather than
 * re-deriving free vars from the original JS AST) so it stays exactly in
 * sync with whatever the emitter actually produced — but Twig identifiers
 * have no sigil (unlike Kolon's `$`, which made a trivially safe
 * `\$([A-Za-z_]\w*)` scan possible): a bare word in the rendered text could
 * be a genuine context-var reference, a `bf.` runtime-helper method name, a
 * Twig grammar keyword emitted by this adapter's own condition/attribute-
 * omission lowering (`is`/`not`/`and`/`null`/`true`/`false`/`defined`), or
 * content inside a single-quoted string literal. This helper makes the scan
 * sound: it strips quoted string spans first, then matches identifier tokens
 * NOT immediately preceded by a `.` (excluding dotted property/method names
 * — the same exclusion the `$` sigil gave Kolon for free, since Kolon's
 * regex only ever matched right after `$`), then drops the closed set of
 * tokens this adapter's own codegen can emit that aren't context vars (`bf`
 * and the Twig keywords above). Note this set is SMALLER than the Jinja
 * port's — Twig's ternary is symbolic (`t ? a : b`, no `if`/`else` words)
 * and `??` is native (no `is defined and is not none` dance for THAT
 * operator), so `if`/`else` never appear in rendered EXPRESSION text here;
 * `is`/`defined`/`and`/`not null` still can, from the nullable-optional-prop
 * attribute-omission guard (`jinja-adapter.ts`'s Twig counterpart). `memo/
 * seed.ts` uses this to detect a constant lowering (no top-level identifier
 * at all) that should keep the static ssr-defaults seed instead of an
 * in-template `{% set %}`; scope AVAILABILITY itself is the shared
 * `computeSsrSeedPlan`'s job (packages/jsx/src/ssr-seed-plan.ts), not this
 * module's.
 */

import type { IRNode, IRProp, IRIfStatement, IRFragment } from '@barefootjs/jsx'

/** Tokens this adapter's own codegen can emit that are never context vars. */
const NON_VAR_TOKENS = new Set([
  'bf', 'not', 'and', 'true', 'false', 'null',
  // `is defined` / `is not null` — the nullable-optional-prop attribute-
  // omission guard (`twig-adapter.ts`) emits these Twig test keywords;
  // they're never context vars.
  'is', 'defined',
])

/**
 * Extract the set of "top-level identifier" tokens from a rendered Twig
 * expression: bare words, excluding quoted-string content, dotted
 * property/method names, and this adapter's own non-var keyword vocabulary.
 * See the file header for why this replaces a direct `\w+` scan.
 */
export function extractTopLevelIdentifiers(twigExpr: string): string[] {
  // Strip single-quoted string literals (this adapter only ever emits
  // single-quoted string literals, backslash-escaped) so their content can't
  // leak into the identifier scan.
  const stripped = twigExpr.replace(/'(?:\\.|[^'\\])*'/g, ' ')
  const out: string[] = []
  for (const m of stripped.matchAll(/(?<!\.)\b([A-Za-z_]\w*)\b/g)) {
    if (!NON_VAR_TOKENS.has(m[1])) out.push(m[1])
  }
  return out
}

/**
 * Find the `children` prop's `jsx-children` payload. Narrowed via the
 * AttrValue `kind` discriminator so adapter code stays type-safe if the IR
 * shape evolves.
 */
export function resolveJsxChildrenProp(props: readonly IRProp[]): IRNode[] {
  const prop = props.find(p => p.name === 'children')
  if (!prop) return []
  if (prop.value.kind !== 'jsx-children') return []
  return prop.value.children
}

/**
 * Collect the component's root scope element node(s) — the elements that
 * become the rendered root and so carry `data-key` for a keyed loop item. A
 * plain element root is itself; an `if-statement` (early-return) root
 * contributes the top element of each branch, since exactly one renders at
 * runtime. (#1297)
 */
export function collectRootScopeNodes(node: IRNode): Set<IRNode> {
  const out = new Set<IRNode>()
  const visit = (n: IRNode | null): void => {
    if (!n) return
    if (n.type === 'element') { out.add(n); return }
    if (n.type === 'if-statement') {
      const s = n as IRIfStatement
      visit(s.consequent)
      visit(s.alternate)
      return
    }
    if (n.type === 'fragment') {
      for (const c of (n as IRFragment).children) visit(c)
    }
  }
  visit(node)
  return out
}
