#!/usr/bin/env bun
// bf-p hydration-props inventory for the jinja adapter — thin self-
// registration over @barefootjs/adapter-tests's driver, the same
// dependency direction as `runAdapterConformanceTests` in
// `../src/__tests__/`: adapter-tests provides the constraint and knows
// no adapter but the Hono reference; each adapter wires itself in.
//
// Usage: bun run packages/adapter-jinja/scripts/hydration-props-inventory.ts [outFile]
import { runHydrationPropsInventory } from '@barefootjs/adapter-tests'
import { JinjaAdapter } from '../src/adapter'
import { renderJinjaComponent, PythonNotAvailableError } from '../src/test-render'

await runHydrationPropsInventory(
  {
    name: 'jinja',
    factory: () => new JinjaAdapter(),
    render: renderJinjaComponent,
    notAvailableErrors: [PythonNotAvailableError],
  },
  process.argv[2],
)
