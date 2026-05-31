/**
 * Button fixture lifted from `ui/components/ui/button/index.tsx`.
 *
 * First `site/ui` source-root fixture (#1467 Phase 2a). It exercises the
 * full infrastructure path the phase set out to enable:
 *   - `defineUiFixture` loads `ui/components/ui/button/index.tsx`
 *     (the `<name>/index.tsx` layout, not the flat shared one).
 *   - The sibling `Slot` dependency is auto-inferred from Button's
 *     `import { Slot } from '../slot'`. For SSR it is pre-compiled to a
 *     committed, export-intact module (`button.slot.ssr.tsx`) that the
 *     Hono render loads as a real module — no export stripping (#1467
 *     Phase 2a). For the client bundle it is combined via the
 *     `@bf-child:Slot` placeholder.
 *   - The `Record<ButtonVariant, string>[variant]` /
 *     `Record<ButtonSize, string>[size]` class composition is baked into
 *     the frozen HTML — the compiled template evaluates the indexed
 *     lookups at render time, so the non-default `secondary` / `sm`
 *     tokens land in the snapshot deterministically. (The
 *     `renderToTest`-only IR `.classes` limitation noted in CLAUDE.md
 *     does not affect this real compile + render path.)
 *   - The CSR harness honours `__instanceId`, so this fixture is NOT on
 *     the CSR `skipFixtures` list.
 *
 * Button is stateless, so the interactions only confirm hydration
 * preserves the server-rendered DOM (a no-op click leaves the label
 * intact); interactive `site/ui` components arrive in Phase 2b.
 *
 * Snapshots in `__snapshots__/button.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts button`.
 */

import { defineUiFixture, type SharedFixtureSpec } from './_helpers'

export const spec: SharedFixtureSpec = {
  id: 'button',
  componentName: 'Button',
  // UI dirs are lowercase/kebab (`button/`), but the hydration-registry
  // component name is PascalCase (`Button`); point `sourceFile` at the
  // directory so the loader resolves `ui/components/ui/button/index.tsx`.
  sourceFile: 'button',
  description:
    'site/ui Button — variant/size class composition + auto-inferred Slot sibling',
  props: { variant: 'secondary', size: 'sm', children: 'Click me' },
  interactions: [
    { type: 'expectText', selector: 'button', text: 'Click me' },
    // Stateless: a click changes nothing, but it proves the hydrated
    // root survives an event dispatch without tearing down the DOM.
    { type: 'click', selector: 'button' },
    { type: 'expectText', selector: 'button', text: 'Click me' },
  ],
}

export const fixture = defineUiFixture(spec)
