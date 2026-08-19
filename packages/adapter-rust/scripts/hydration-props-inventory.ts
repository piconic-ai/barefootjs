#!/usr/bin/env bun
// bf-p hydration-props inventory for the rust adapter — thin self-
// registration over @barefootjs/adapter-tests's driver, the same
// dependency direction as `runAdapterConformanceTests` in
// `../src/__tests__/`: adapter-tests provides the constraint and knows
// no adapter but the Hono reference; each adapter wires itself in.
//
// Usage: bun run packages/adapter-rust/scripts/hydration-props-inventory.ts [outFile]
import { runHydrationPropsInventory } from '@barefootjs/adapter-tests'
import { MinijinjaAdapter } from '../src/adapter'
import { renderMinijinjaComponent, RustNotAvailableError } from '../src/test-render'

await runHydrationPropsInventory(
  {
    name: 'rust',
    factory: () => new MinijinjaAdapter(),
    render: renderMinijinjaComponent,
    notAvailableErrors: [RustNotAvailableError],
  },
  process.argv[2],
)
