#!/usr/bin/env bun
// bf-p hydration-props inventory for the erb adapter — thin self-
// registration over @barefootjs/adapter-tests's driver, the same
// dependency direction as `runAdapterConformanceTests` in
// `../src/__tests__/`: adapter-tests provides the constraint and knows
// no adapter but the Hono reference; each adapter wires itself in.
//
// Usage: bun run packages/adapter-erb/scripts/hydration-props-inventory.ts [outFile]
import { runHydrationPropsInventory } from '@barefootjs/adapter-tests'
import { ErbAdapter } from '../src/adapter'
import { renderErbComponent, ErbNotAvailableError } from '../src/test-render'

await runHydrationPropsInventory(
  {
    name: 'erb',
    factory: () => new ErbAdapter(),
    render: renderErbComponent,
    notAvailableErrors: [ErbNotAvailableError],
  },
  process.argv[2],
)
