/**
 * barefootjs.dev is served as static files by Workers Assets (see
 * wrangler.toml and scripts/generate-static.tsx). These pin the parts of
 * the URL contract that used to be Worker code and are now asset config.
 */

import { test, expect } from '@playwright/test'

test.describe('static site', () => {
  test('a merged docs page answers with a 301 to its new page', async ({ request }) => {
    const res = await request.get('/docs/core-concepts/mpa-style', { maxRedirects: 0 })
    expect(res.status()).toBe(301)
    expect(new URL(res.headers()['location'], 'http://x').pathname).toBe('/docs/introduction')

    const md = await request.get('/docs/core-concepts/mpa-style.md', { maxRedirects: 0 })
    expect(md.status()).toBe(301)
    expect(new URL(md.headers()['location'], 'http://x').pathname).toBe('/docs/introduction.md')
  })

  test('a docs page is served at its bare path, and a trailing slash redirects to it', async ({ request }) => {
    const res = await request.get('/docs/quick-start')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/html')

    const slash = await request.get('/docs/quick-start/', { maxRedirects: 0 })
    expect([301, 307, 308]).toContain(slash.status())
    expect(new URL(slash.headers()['location'], 'http://x').pathname).toBe('/docs/quick-start')
  })

  test('the Markdown version of a page is served as Markdown', async ({ request }) => {
    const res = await request.get('/docs/quick-start.md')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/markdown')
    expect(await res.text()).toContain('title: Quick Start')
  })

  test("a page's OG image exists at the URL its <meta> names", async ({ page, request }) => {
    await page.goto('/docs/quick-start')
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(ogImage).toMatch(/^https:\/\/barefootjs\.dev\/og\/[A-Za-z0-9_-]+\.png$/)

    const res = await request.get(new URL(ogImage!).pathname)
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('image/png')
  })

  test('build intermediates are not served', async ({ request }) => {
    expect((await request.get('/bf-assets.ts')).status()).toBe(404)
    expect((await request.get('/components/theme-switcher.tsx')).status()).toBe(404)
    // …while the client chunks under /static/components/ are.
    const html = await (await request.get('/docs/quick-start')).text()
    const chunk = html.match(/\/static\/components\/assets\/router-entry-[\w-]+\.js/)?.[0]
    expect(chunk).toBeTruthy()
    expect((await request.get(chunk!)).status()).toBe(200)
  })
})
