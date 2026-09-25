/**
 * Runtime-safe content types and utilities.
 *
 * This module has NO Node.js dependencies and is safe for Cloudflare Workers.
 * For build/dev-time content loading, use ./content-loader.
 */

export interface Page {
  /** URL slug, e.g. "advanced/vite-plugin". Empty string for index (README.md). */
  slug: string
  /** Filename without extension, e.g. "vite-plugin" */
  name: string
}

/** slug → raw markdown content (.md pages only). */
export type ContentMap = Record<string, string>

/**
 * slug → raw MDX source (.mdx pages only). Kept separate from
 * `ContentMap` so the standard markdown rendering loop never sees
 * MDX-shaped content — MDX pages register dedicated handlers
 * (e.g. `registerQuickStartRoutes`) that own their rendering.
 */
export type MdxContentMap = Record<string, string>
