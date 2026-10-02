/**
 * #3217: `CLIENT_EXPORTS` (packages/jsx/src/analyzer.ts) is the compiler's
 * hand-maintained list of names a component may import from
 * `@barefootjs/client`. A recognised import is re-pointed at
 * `@barefootjs/client/runtime` in client JS and at this package's SSR shim
 * (`client-shim.ts`) on the server, so each name has to exist on both. The
 * three lists are maintained separately; this test pins them to each other.
 *
 * Every known difference is listed below with its reason, as an exact set:
 * a new export, a renamed one, or a shim that falls behind changes a
 * difference and fails here, instead of failing in a user's build.
 */
import { describe, test, expect } from 'bun:test'
import { CLIENT_EXPORTS } from '@barefootjs/jsx'
import * as clientRoot from '../../../client/src/index.ts'
import * as clientRuntime from '../../../client/src/runtime/index.ts'
import * as shim from '../client-shim.ts'

const sorted = (names: Iterable<string>): string[] => [...names].sort()
const minus = (a: Iterable<string>, b: Iterable<string>): string[] => {
  const drop = new Set(b)
  return sorted([...a].filter(n => !drop.has(n)))
}

const recognised = sorted(CLIENT_EXPORTS)

/**
 * Compile-away built-ins (#1915): importing them scopes `<Async>` /
 * `<Region>` recognition, and the compiler drops the import on emit, so
 * neither the runtime nor the shim needs them.
 */
const ELIDED_ON_EMIT = ['Async', 'Region']

/**
 * Real root exports a component can't import. They are profiler and SSR-host
 * hooks, not component API, and the shim does not provide them, so accepting
 * the import would break SSR.
 */
const ROOT_ONLY = [
  '__bfReportOutput',
  '__bfSetServerEnvReader',
  'beginTurn',
  'createRecordingSink',
  'endTurn',
  'setProfilerSink',
]

/**
 * Recognised but exported from `@barefootjs/client/runtime` only. The
 * compiler re-points the import there, so it resolves in compiled output.
 */
const RUNTIME_ONLY = ['provideContext']

describe('CLIENT_EXPORTS agrees with @barefootjs/client and the Hono shim (#3217)', () => {
  test('every recognised name the compiler keeps in its output exists on /runtime', () => {
    expect(minus(recognised, Object.keys(clientRuntime))).toEqual(ELIDED_ON_EMIT)
  })

  test('every recognised name the compiler keeps in its output exists on the SSR shim', () => {
    expect(minus(recognised, Object.keys(shim))).toEqual(ELIDED_ON_EMIT)
  })

  test('the root entry exports every recognised name except the runtime-only ones', () => {
    expect(minus(recognised, Object.keys(clientRoot))).toEqual(RUNTIME_ONLY)
  })

  test('every root export is recognised except the profiler / SSR-host hooks', () => {
    expect(minus(Object.keys(clientRoot), recognised)).toEqual(ROOT_ONLY)
  })
})
