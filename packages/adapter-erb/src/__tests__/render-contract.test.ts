/**
 * ERB render-stage conformance contract (#2158).
 *
 * Thin wrapper around the shared `assertRenderContract` /
 * `renderContractFixture` from `@barefootjs/adapter-tests` — see
 * `packages/adapter-tests/src/render.contract.ts` for the full contract
 * rationale ("compile-clean ≠ renders-correctly") and the five checks it
 * asserts. Runs in this package's own CI workflow, where the Ruby
 * runtime is installed, so a render-stage regression (like #2157) is
 * caught here directly rather than only in the cross-adapter suite.
 */
import { test, expect } from 'bun:test'
import { assertRenderContract, renderContractFixture } from '@barefootjs/adapter-tests'
import { renderErbComponent, ErbNotAvailableError } from '../test-render'
import { erbAdapter } from '../adapter'

test('Counter+Button satisfies the render contract on ERB', async () => {
  let html: string
  try {
    html = await renderErbComponent({ adapter: erbAdapter, ...renderContractFixture })
  } catch (err) {
    if (err instanceof ErbNotAvailableError) return
    throw err
  }
  expect(html).toBeTruthy()
  assertRenderContract(html)
})
