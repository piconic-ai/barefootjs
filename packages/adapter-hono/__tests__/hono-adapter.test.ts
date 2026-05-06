/**
 * Hono Adapter Tests
 *
 * JSX conformance tests (shared across adapters).
 */

import { HonoAdapter } from '../src/adapter'
import {
  runJSXConformanceTests,
  runConformanceSuite,
  templatePrimitiveCases,
  runTemplatePrimitiveCase,
  type TemplatePrimitiveCaseId,
  type TemplatePrimitiveInput,
} from '@barefootjs/adapter-tests'
import { renderHonoComponent } from '@barefootjs/hono/test-render'

// =============================================================================
// JSX-Based Conformance Tests
// =============================================================================

runJSXConformanceTests({
  createAdapter: () => new HonoAdapter(),
  render: renderHonoComponent,
  // No referenceAdapter: compile + render success only
})

// =============================================================================
// Template-Primitive Conformance (#1187 phase 3)
// =============================================================================

// Hono's SSR runtime is JS, so it satisfies every case via broad
// `acceptsTemplateCall`. Empty skip set.
runConformanceSuite<TemplatePrimitiveCaseId, TemplatePrimitiveInput, string>({
  name: 'template primitives conformance',
  issue: '#1187 phase 3',
  adapter: {
    name: 'hono',
    factory: () => new HonoAdapter(),
    skip: new Set(),
  },
  cases: templatePrimitiveCases,
  run: runTemplatePrimitiveCase,
})
