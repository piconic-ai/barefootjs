#!/usr/bin/env bun
// bf-p hydration-props inventory for the mojolicious adapter — thin self-
// registration over @barefootjs/adapter-tests's driver, the same
// dependency direction as `runAdapterConformanceTests` in
// `../src/__tests__/`: adapter-tests provides the constraint and knows
// no adapter but the Hono reference; each adapter wires itself in.
//
// Usage: bun run packages/adapter-mojolicious/scripts/hydration-props-inventory.ts [outFile]
import { runHydrationPropsInventory } from '@barefootjs/adapter-tests'
import { MojoAdapter } from '../src/adapter'
import { renderMojoComponent, PerlNotAvailableError } from '../src/test-render'

await runHydrationPropsInventory(
  {
    name: 'mojolicious',
    factory: () => new MojoAdapter(),
    render: renderMojoComponent,
    notAvailableErrors: [PerlNotAvailableError],
  },
  process.argv[2],
)
