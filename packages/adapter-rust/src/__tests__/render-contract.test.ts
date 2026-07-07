/**
 * minijinja (Rust) render-stage conformance contract (#2158).
 *
 * Thin wrapper around the shared `assertRenderContract` /
 * `renderContractFixture` from `@barefootjs/adapter-tests` — see
 * `packages/adapter-tests/src/render.contract.ts` for the full contract
 * rationale ("compile-clean ≠ renders-correctly") and the five checks it
 * asserts. Runs in this package's own CI workflow, where the Rust
 * toolchain / minijinja runner is available, so a render-stage
 * regression is caught here directly rather than only in the
 * cross-adapter suite.
 */
import { test, expect } from 'bun:test'
import { assertRenderContract, renderContractFixture } from '@barefootjs/adapter-tests'
import { renderMinijinjaComponent, RustNotAvailableError } from '../test-render'
import { minijinjaAdapter } from '../adapter'

test('Counter+Button satisfies the render contract on minijinja', async () => {
  let html: string
  try {
    html = await renderMinijinjaComponent({ adapter: minijinjaAdapter, ...renderContractFixture })
  } catch (err) {
    if (err instanceof RustNotAvailableError) return
    throw err
  }
  expect(html).toBeTruthy()
  assertRenderContract(html)
// A cold run compiles the `bf-render` binary via `cargo build` (memoized
// module-scope in test-render.ts) — same rationale as the sibling
// `minijinja-adapter.test.ts` conformance suite's generous timeout.
}, 120_000)
