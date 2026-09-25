/**
 * OG image URLs for the docs pages.
 *
 * Each title gets its own static-looking path, `/og/<base64url(title)>.png`,
 * instead of a `?title=` query: the site is served as static files (see
 * scripts/generate-static.tsx), and Workers Assets ignores the query
 * string, so a query-keyed image could not be pre-rendered. The encoding is
 * reversible, so the dev route (`og-route.ts`) recovers the title from the
 * path alone, and the static build writes one file per path.
 *
 * `ogImagePath` also records every title it was asked for. The static
 * build renders all pages first, then reads `requestedOgTitles()` to know
 * which images the rendered pages reference — the renderer is the single
 * place that decides a page's OG title.
 */

const requested = new Set<string>()

function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): string | null {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (ch) => ch.charCodeAt(0)),
    )
  } catch {
    return null
  }
}

/** Path of the OG image for a page title, e.g. `/og/UXVpY2sgU3RhcnQ.png`. */
export function ogImagePath(title: string): string {
  requested.add(title)
  return `/og/${toBase64Url(title)}.png`
}

/** The title an `/og/<name>` file name encodes, or null if it is not one. */
export function titleFromOgImageFile(file: string): string | null {
  if (!file.endsWith('.png')) return null
  return fromBase64Url(file.slice(0, -'.png'.length))
}

/** Every title `ogImagePath` has been called with in this process. */
export function requestedOgTitles(): string[] {
  return [...requested]
}
