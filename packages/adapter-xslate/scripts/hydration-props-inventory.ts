#!/usr/bin/env bun
// bf-p hydration-props inventory for the xslate adapter — thin self-
// registration over @barefootjs/adapter-tests's driver, the same
// dependency direction as `runAdapterConformanceTests` in
// `../src/__tests__/`: adapter-tests provides the constraint and knows
// no adapter but the Hono reference; each adapter wires itself in.
//
// Usage: bun run packages/adapter-xslate/scripts/hydration-props-inventory.ts [outFile]
import { runHydrationPropsInventory } from '@barefootjs/adapter-tests'
import { XslateAdapter } from '../src/adapter'
import { renderXslateComponent, XslateNotAvailableError } from '../src/test-render'

await runHydrationPropsInventory(
  {
    name: 'xslate',
    factory: () => new XslateAdapter(),
    render: renderXslateComponent,
    notAvailableErrors: [XslateNotAvailableError],
  },
  process.argv[2],
)
