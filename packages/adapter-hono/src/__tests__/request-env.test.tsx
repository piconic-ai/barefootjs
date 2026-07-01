/** @jsxImportSource hono/jsx */
/**
 * Request-scoped env signals for the framework-agnostic `renderToHtml` path
 * (h3 / Elysia / … hosts), spec/router.md v0.5, #1922.
 *
 * `runWithRequestEnv({ search }, () => renderToHtml(node))` binds the request's
 * env (here `searchParams()`) for that render's async context, so a host that
 * bypasses Hono's jsxRenderer still resolves the live query at SSR — and
 * concurrent renders never see each other's values (the spec forbids a
 * process-wide per-request global because it races). The env object is keyed, so
 * future signals (cookies, …) ride the same wrapper.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { createSearchParams } from '@barefootjs/client'
import { renderToHtml } from '../render'
import { runWithRequestEnv, withRequestEnv } from '../request-env'

// A plain hono/jsx component that reads the env signal at SSR — exactly what a
// compiled BarefootJS component lowers `{searchParams().get('sort') ?? 'none'}`
// to on the Hono adapter.
const [searchParams] = createSearchParams()
const SortLabel = () => <p>{searchParams().get('sort') ?? 'none'}</p>

// Install a prior keyed reader on the seam BEFORE the first `runWithRequestEnv`
// call below — `request-env` captures whatever reader is already there at
// install time and delegates to it (mirrors a process where Hono's auto-wire
// installed its reader first). The prior answers only a sentinel key and returns
// `undefined` for `search`, so the searchParams tests are unaffected while the
// delegation suite below can assert the chain.
const PRIOR_KEY = 'env-test-prior'
beforeAll(() => {
  ;(
    globalThis as unknown as { __bf_serverEnvReader?: (key: string) => string | undefined }
  ).__bf_serverEnvReader = (key) => (key === PRIOR_KEY ? 'from-prior' : undefined)
})

describe('runWithRequestEnv + renderToHtml', () => {
  test('binds searchParams() to the wrapped query', async () => {
    const html = await runWithRequestEnv({ search: '?sort=price' }, () => renderToHtml(<SortLabel />))
    expect(html).toBe('<p>price</p>')
  })

  test('a present-but-empty value is kept (URLSearchParams.get returns "")', async () => {
    // `?sort=` → get('sort') === '' (not null), and `'' ?? 'none'` === ''.
    const html = await runWithRequestEnv({ search: '?sort=' }, () => renderToHtml(<SortLabel />))
    expect(html).toBe('<p></p>')
  })

  test('an absent key falls back to the author default', async () => {
    const html = await runWithRequestEnv({ search: '?other=x' }, () => renderToHtml(<SortLabel />))
    expect(html).toBe('<p>none</p>')
  })

  test('a leading "?" is optional', async () => {
    const html = await runWithRequestEnv({ search: 'sort=price' }, () => renderToHtml(<SortLabel />))
    expect(html).toBe('<p>price</p>')
  })

  test('an omitted env key resolves to the empty default', async () => {
    // `{}` carries no `search`, so the reader delegates → empty query → default.
    const html = await runWithRequestEnv({}, () => renderToHtml(<SortLabel />))
    expect(html).toBe('<p>none</p>')
  })

  test('concurrent renders do not leak each other’s query (async-context scoped)', async () => {
    // Interleave many renders with distinct queries; each must resolve its own.
    const queries = Array.from({ length: 24 }, (_, i) => `?sort=v${i}`)
    const results = await Promise.all(
      queries.map((q, i) =>
        runWithRequestEnv({ search: q }, async () => {
          // Yield so the async contexts genuinely interleave before each reads.
          await new Promise((r) => setTimeout(r, i % 5))
          return renderToHtml(<SortLabel />)
        }),
      ),
    )
    results.forEach((html, i) => expect(html).toBe(`<p>v${i}</p>`))
  })

  test('outside any scope resolves to the empty query (default)', async () => {
    // No wrapping run() and no other reader wired in this test process → '' →
    // get('sort') is null → author default.
    const html = await renderToHtml(<SortLabel />)
    expect(html).toBe('<p>none</p>')
  })
})

describe('withRequestEnv (WinterCG fetch-handler wrapper)', () => {
  test('binds searchParams() from the Request — the handler just renders', async () => {
    const handler = withRequestEnv(
      async (_req: Request) =>
        new Response(await renderToHtml(<SortLabel />), {
          headers: { 'content-type': 'text/html' },
        }),
    )
    const res = await handler(new Request('https://x.test/list?sort=price'))
    expect(await res.text()).toBe('<p>price</p>')
  })

  test('derives env from the Request and passes extra args (server / env / ctx) through', async () => {
    const seen: unknown[] = []
    const handler = withRequestEnv(async (_req: Request, a: number, b: string) => {
      seen.push(a, b)
      return new Response(await renderToHtml(<SortLabel />))
    })
    const res = await handler(new Request('https://x.test/?sort=name'), 7, 'z')
    expect(seen).toEqual([7, 'z'])
    expect(await res.text()).toBe('<p>name</p>')
  })

  test('a request with no query resolves the author default', async () => {
    const handler = withRequestEnv(async () => new Response(await renderToHtml(<SortLabel />)))
    const res = await handler(new Request('https://x.test/list'))
    expect(await res.text()).toBe('<p>none</p>')
  })
})

describe('keyed seam — delegates to the prior reader', () => {
  // The reader currently published on the seam (the chained one once
  // `runWithRequestEnv` has installed it, else the raw prior — either way the
  // delegation behaviour is identical for these cases).
  const seam = () =>
    (globalThis as unknown as { __bf_serverEnvReader: (key: string) => string | undefined })
      .__bf_serverEnvReader

  test('an unknown key delegates to the prior reader (outside any scope)', () => {
    expect(seam()(PRIOR_KEY)).toBe('from-prior')
    // The prior returns undefined for `search`, so a non-request render still
    // resolves to the empty default rather than leaking a value.
    expect(seam()('search')).toBeUndefined()
  })

  test('a scoped env wins for its key; absent keys still delegate to the prior', () => {
    runWithRequestEnv({ search: '?sort=price' }, () => {
      expect(seam()('search')).toBe('?sort=price') // scoped value wins over the prior
      expect(seam()(PRIOR_KEY)).toBe('from-prior') // key not in env → delegate
    })
  })
})
