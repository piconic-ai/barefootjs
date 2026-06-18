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

import { describe, test, expect } from 'bun:test'
import { searchParams } from '@barefootjs/client'
import { renderToHtml } from '../render'
import { runWithRequestEnv } from '../request-env'

// A plain hono/jsx component that reads the env signal at SSR — exactly what a
// compiled BarefootJS component lowers `{searchParams().get('sort') ?? 'none'}`
// to on the Hono adapter.
const SortLabel = () => <p>{searchParams().get('sort') ?? 'none'}</p>

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
