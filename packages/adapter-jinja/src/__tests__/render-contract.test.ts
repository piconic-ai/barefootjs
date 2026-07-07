/**
 * Jinja render-stage conformance contract (#2158).
 *
 * Thin wrapper around the shared `assertRenderContract` /
 * `renderContractFixture` from `@barefootjs/adapter-tests` — see
 * `packages/adapter-tests/src/render.contract.ts` for the full contract
 * rationale ("compile-clean ≠ renders-correctly") and the five checks it
 * asserts. Runs in this package's own CI workflow, where python3+jinja2
 * is installed, so a render-stage regression is caught here directly
 * rather than only in the cross-adapter suite.
 */
import { test, expect } from 'bun:test'
import { assertRenderContract, renderContractFixture } from '@barefootjs/adapter-tests'
import { renderJinjaComponent, PythonNotAvailableError } from '../test-render'
import { jinjaAdapter } from '../adapter'

test('Counter+Button satisfies the render contract on Jinja', async () => {
  let html: string
  try {
    html = await renderJinjaComponent({ adapter: jinjaAdapter, ...renderContractFixture })
  } catch (err) {
    if (err instanceof PythonNotAvailableError) return
    throw err
  }
  expect(html).toBeTruthy()
  assertRenderContract(html)
})
