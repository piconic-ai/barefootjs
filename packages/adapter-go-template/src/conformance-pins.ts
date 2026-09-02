/**
 * Per-fixture build-time contracts for shapes this adapter intentionally
 * refuses to lower. Declared per adapter, not on the shared fixtures, so
 * adding a new adapter never touches a cross-adapter file. Per-fixture
 * rationale lives on each fixture's docstring
 * (`packages/adapter-tests/fixtures/<id>.ts`) and spec/callback-fidelity.md;
 * comments below only mark where this adapter's set diverges from siblings.
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  'filter-typeof-predicate': [{ code: 'BF021', severity: 'error' }],
  'map-array-builder-body': [{ code: 'BF021', severity: 'error' }],
  'map-array-builder-escaping': [{ code: 'BF021', severity: 'error' }],
  'fill-unsupported': [{ code: 'BF101', severity: 'error' }],
  'find-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'some-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'every-typeof-predicate': [{ code: 'BF101', severity: 'error' }],
  'reduce-typeof-body': [{ code: 'BF101', severity: 'error' }],
  'reduce-right-typeof-body': [{ code: 'BF101', severity: 'error' }],
  'flatmap-typeof-projection': [{ code: 'BF101', severity: 'error' }],
  // A pure PROJECTION flatMap body (`flatmap-expression-body`) is NOT pinned —
  // it lowers to neutral nested-loop IR this adapter templatizes natively;
  // only the statement-carrying body refuses.
  'tag-cloud': [{ code: 'BF021', severity: 'error' }],
  'preamble-cells': [{ code: 'BF021', severity: 'error' }],
  // Refused for the COMPUTED loop array (`const entries = Object.entries(...)
  // .filter(...)`), not the destructure param (that lowers, #2087) — loud
  // BF101 instead of silently iterating an unbound name zero times.
  'static-array-from-props': [
    {
      code: 'BF101',
      severity: 'error',
      issue: 'https://github.com/piconic-ai/barefootjs/issues/2321',
    },
  ],
  // No BF103 pin: the harness registers sibling templates (#2205).
  'static-array-from-props-with-component': [
    {
      code: 'BF101',
      severity: 'error',
      issue: 'https://github.com/piconic-ai/barefootjs/issues/2321',
    },
  ],
  // #2038: `renderFilterExpr`'s `call` arm has no faithful Go form for a
  // nested arrow — loud BF101 instead of the old silent drop of the arrow
  // argument.
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' },
  ],
  'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2320' }],
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2356' }],
  'rich-prop-client-read': [{ code: 'BF049', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2648' }],
  // #2667: a ternary/array LITERALLY WRAPPING JSX at a non-children prop
  // position (e.g. `header={cond ? <a/> : <b/>}`) is refused ahead of
  // `adapter.generate()` in the shared jsx-to-ir.ts phase, so it is pinned
  // identically on every adapter (including Hono) — same reasoning as
  // `rich-prop-client-read` above.
  'jsx-element-prop-ternary': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2667' }],
  'jsx-element-prop-array': [{ code: 'BF021', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2667' }],
  // `jsx-element-prop-fragment-conditional` (#2703) is NOT pinned here — it
  // renders correctly since `queueDynamicPropDefine` (go-template-adapter.ts)
  // extended the reserved `children` slot's `bf_with_children`/`bf_tmpl`
  // dynamic-delivery route to named jsx-children props.
  // #2805: a named jsx-children prop routed into the child's rest bag (no
  // declared param — only reachable via the child's `...rest` spread) has
  // no named Go struct field for `bf_with_props`/`WithProps` to target at
  // all. `queueDynamicPropDefine` refuses loudly with BF101 rather than
  // silently no-op through `WithProps`'s unmatched-field passthrough.
  // `unescapable`: the capability gap (a rest-bag delivery route) is #2805
  // itself, not authored yet, so no `/* @client */` escape twin exists.
  'jsx-element-prop-rest-bag-dynamic': [{
    code: 'BF101',
    severity: 'error',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2805',
    unescapable: { issue: 'https://github.com/piconic-ai/barefootjs/issues/2805' },
  }],
  // #2700: a `derived` signal/memo (non-empty free set) seeded from an
  // object literal the constructor-time baker can't reproduce (identifier/
  // member/call operands defer, `parsed-literal-to-go.ts`) now refuses
  // loudly instead of silently keeping the Go zero value — this fixture's
  // `merged().id` / `merged().done` reads are exactly that shape. A working
  // `/* @client */` escape twin exists (`signal-object-spread-init-client`),
  // verified to render correctly, so no `unescapable`.
  'signal-object-spread-init': [{
    code: 'BF101',
    severity: 'error',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2700',
  }],
}
