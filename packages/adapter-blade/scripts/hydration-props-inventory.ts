#!/usr/bin/env bun
// bf-p hydration-props inventory for the blade adapter — thin self-
// registration over @barefootjs/adapter-tests's driver, the same
// dependency direction as `runAdapterConformanceTests` in
// `../src/__tests__/`: adapter-tests provides the constraint and knows
// no adapter but the Hono reference; each adapter wires itself in.
//
// Usage: bun run packages/adapter-blade/scripts/hydration-props-inventory.ts [outFile]
import { runHydrationPropsInventory } from '@barefootjs/adapter-tests'
import { BladeAdapter } from '../src/adapter'
import { renderBladeComponent, BladeNotAvailableError } from '../src/test-render'

await runHydrationPropsInventory(
  {
    name: 'blade',
    factory: () => new BladeAdapter(),
    render: renderBladeComponent,
    notAvailableErrors: [BladeNotAvailableError],
  },
  process.argv[2],
)
