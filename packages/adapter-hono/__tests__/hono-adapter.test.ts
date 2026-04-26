/**
 * Hono Adapter Tests
 *
 * JSX conformance tests (shared across adapters).
 */

import { HonoAdapter } from '../src/adapter'
import { runJSXConformanceTests } from '@barefootjs/adapter-tests'
import { renderHonoComponent } from '@barefootjs/hono/test-render'

// =============================================================================
// JSX-Based Conformance Tests
// =============================================================================

runJSXConformanceTests({
  createAdapter: () => new HonoAdapter(),
  render: renderHonoComponent,
  // No referenceAdapter: compile + render success only
})
