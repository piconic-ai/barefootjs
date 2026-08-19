#!/usr/bin/env bun
// bf-p hydration-props inventory for the twig adapter — thin self-
// registration over @barefootjs/adapter-tests's driver, the same
// dependency direction as `runAdapterConformanceTests` in
// `../src/__tests__/`: adapter-tests provides the constraint and knows
// no adapter but the Hono reference; each adapter wires itself in.
//
// Usage: bun run packages/adapter-twig/scripts/hydration-props-inventory.ts [outFile]
import { runHydrationPropsInventory } from '@barefootjs/adapter-tests'
import { TwigAdapter } from '../src/adapter'
import { renderTwigComponent, TwigNotAvailableError } from '../src/test-render'

await runHydrationPropsInventory(
  {
    name: 'twig',
    factory: () => new TwigAdapter(),
    render: renderTwigComponent,
    notAvailableErrors: [TwigNotAvailableError],
  },
  process.argv[2],
)
