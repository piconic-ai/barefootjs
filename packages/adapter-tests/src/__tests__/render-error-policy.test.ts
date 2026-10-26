import { afterEach, expect, test } from 'bun:test'
import { canSkipRenderError } from '../render-error-policy'

const previous = process.env.BF_REQUIRE_RENDER
afterEach(() => {
  if (previous === undefined) delete process.env.BF_REQUIRE_RENDER
  else process.env.BF_REQUIRE_RENDER = previous
})

test('ordinary local runs can handle an unavailable renderer', () => {
  delete process.env.BF_REQUIRE_RENDER
  const unavailable = new Error('runtime missing')
  expect(canSkipRenderError(unavailable, 'fixture', error => error === unavailable)).toBe(true)
  expect(canSkipRenderError(new Error('render failed'), 'fixture', () => false)).toBe(false)
  expect(canSkipRenderError(unavailable, 'fixture', undefined)).toBe(false)
})

test('required rendering cannot be bypassed by a skip handler', () => {
  process.env.BF_REQUIRE_RENDER = '1'
  expect(canSkipRenderError(new Error('runtime missing'), 'fixture', () => true)).toBe(false)
})
