import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToTest } from '@barefootjs/test'

// Smoke test for #1081 step 1: JSX infra wired into @barefootjs/xyflow.
// We feed `jsx-smoke.tsx` (a real JSX file living inside this package's
// source tree) through the JSX → IR pipeline and assert the analyzer
// accepts it. If the package's tsconfig or `@barefootjs/jsx` JSX runtime
// resolution regresses, this test fails.
const smokeSource = readFileSync(resolve(__dirname, 'jsx-smoke.tsx'), 'utf-8')

describe('JSX infra smoke (#1081 step 1)', () => {
  const result = renderToTest(smokeSource, 'jsx-smoke.tsx', 'JsxSmoke')

  test('JSX → IR pipeline reports no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('component is recognized as a client component', () => {
    expect(result.isClient).toBe(true)
  })

  test('createSignal is tracked as a reactive signal', () => {
    expect(result.signals).toContain('count')
  })

  test('IR exposes the rendered <button>', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
    expect(button!.props['type']).toBe('button')
  })
})
