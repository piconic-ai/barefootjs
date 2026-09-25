/**
 * The client-JS scope gate's shrink-only ledger (`__tests__/client-js-scope.test.ts`):
 * fixtures whose emitted client JS is scope-unsound today. Each entry names the
 * undeclared identifiers and the registry limitation it is an instance of
 * (`packages/adapter-tests/limitations/<id>.ts`, kind `silent`). Extracted to
 * its own module so `packages/compat`'s limitation join reads it as a pin site
 * alongside the adapters' declarations and the e2e quarantine ledgers.
 */

export interface KnownHole {
  /** Undeclared identifier names, sorted, exactly as the gate reports them. */
  names: string[]
  /** Registry limitation id (`packages/adapter-tests/limitations/<id>.ts`, kind `silent`). */
  limitation: string
}

export const KNOWN_UNDECLARED: Record<string, KnownHole> = {
  // #2654 (env-signal getter referenced at module scope by the template
  // lambda) is FIXED — `buildTemplateDefPart` in `emit-registration.ts`
  // now gives the template lambda its own `const [<getter>] =
  // <envFactory>()` prelude, so `search-params` / `search-params-derived-filter`
  // / `search-params-derived-memo` / `search-params-derived-memo-bare`
  // graduated.
  // #2463 (signal-conditioned early return) is FIXED — the statement
  // form now lowers to the root-ternary insert() plan, so its template
  // substitutes the signal initial instead of leaking `loading`.
  // #2468 (CSR template lambdas referencing init-scoped bindings) is
  // FIXED — the seven fixtures it pinned (button, tooltip, kbd, command,
  // map-index-handler, reactive-props, props-reactivity-comparison)
  // graduated with the memo/`templateExpr`/getter-elided-signal emission
  // fixes; see the issue for the closing PR.
  // #2806 (a component reading its own rest-bag spread directly in JSX,
  // `{rest.header}`) is FIXED — the four template builders in
  // `html-template.ts` now thread `restPropsName` into the same
  // `rewritePropsObjectRef` door the init body already used (#2723), so
  // `rest.x` resolves to `_p.x` in the template the same way it always did
  // in init.
  // #2924 (a component prop whose value is a local signal/memo getter,
  // `<Display value={count} />`) is FIXED — `csrSubstitute` now treats a
  // BARE (uncalled) reference to a `call`-kind substitution entry (a
  // signal/memo getter) as the accessor itself, substituting a thunk over
  // its value (`(() => (5))`) instead of leaving the source-level `count`
  // untouched in the module-scope `template` lambda's `renderChild(...)`
  // props literal.

  // A component loop row whose callback destructures its row param
  // (`({ id, tone }) => <Mark key={id} tone={tone} />`): the row factory's
  // props getters read the destructured name bare (`get tone() { return
  // tone }`) instead of through the row accessor, so hydrating or creating
  // a row throws. Both fixtures reach it through a different prop position
  // (the row component's own prop; a component in its forwarded children).
  'loop-component-row-destructured-param': {
    names: ['tone'],
    limitation: 'loop-component-row-destructured-param',
  },
  'loop-row-child-children-nested-destructured-prop': {
    names: ['tone'],
    limitation: 'loop-component-row-destructured-param',
  },
}
