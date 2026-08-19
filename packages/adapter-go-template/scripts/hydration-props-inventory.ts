#!/usr/bin/env bun
// bf-p hydration-props inventory for the go-template adapter — thin self-
// registration over @barefootjs/adapter-tests's driver, the same
// dependency direction as `runAdapterConformanceTests` in
// `../src/__tests__/`: adapter-tests provides the constraint and knows
// no adapter but the Hono reference; each adapter wires itself in.
//
// Usage: bun run packages/adapter-go-template/scripts/hydration-props-inventory.ts [outFile]
import { runHydrationPropsInventory } from '@barefootjs/adapter-tests'
import { GoTemplateAdapter } from '../src/adapter'
import { renderGoTemplateComponent, GoNotAvailableError } from '../src/test-render'

await runHydrationPropsInventory(
  {
    name: 'go-template',
    factory: () => new GoTemplateAdapter(),
    render: renderGoTemplateComponent,
    notAvailableErrors: [GoNotAvailableError],
  },
  process.argv[2],
)
