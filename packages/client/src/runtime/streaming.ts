/**
 * BarefootJS - Out-of-Order Streaming
 *
 * Client-side resolver for OOS (Out-of-Order Streaming) SSR.
 * Handles swapping fallback content with resolved content that arrives
 * via chunked HTTP responses.
 *
 * Protocol:
 * 1. Server sends HTML with fallback placeholders: <div bf-async="a0">...</div>
 * 2. As async data resolves, server appends chunks:
 *    <template bf-async-resolve="a0">...resolved...</template>
 *    <script>__bf_swap("a0")</script>
 * 3. This module swaps fallback → resolved content and triggers hydration.
 */

import { BF_ASYNC, BF_ASYNC_RESOLVE } from '@barefootjs/shared'
import { rehydrateAll } from './hydrate'

/**
 * Swap a streaming fallback placeholder with its resolved content.
 *
 * Finds the placeholder element (`[bf-async="<id>"]`) and the resolve
 * template (`<template bf-async-resolve="<id>">`), replaces the placeholder's
 * children with the resolved content, then triggers hydration.
 *
 * @param id - The async boundary ID (e.g., "a0")
 */
export function __bf_swap(id: string): void {
  const slot = document.querySelector(`[${BF_ASYNC}="${id}"]`)
  const tmpl = document.querySelector(`template[${BF_ASYNC_RESOLVE}="${id}"]`) as HTMLTemplateElement | null

  if (!slot || !tmpl) return

  // Replace fallback with resolved content
  slot.replaceChildren(tmpl.content.cloneNode(true))
  slot.removeAttribute(BF_ASYNC)

  // Clean up the template element
  tmpl.remove()

  // Trigger hydration for newly inserted content. `rehydrateAll()`
  // schedules its own microtask + rAF walk via `scheduleWalk()`, so the
  // extra rAF wrapper that used to live here is redundant — calling
  // through synchronously lets the microtask path catch the swap on
  // the same tick.
  rehydrateAll()
}

/**
 * Install the global streaming resolver.
 *
 * Makes `__bf_swap` available as `window.__bf_swap` so that inline
 * `<script>__bf_swap("a0")</script>` tags in streaming chunks can call it.
 *
 * Also exposes `window.__bf_hydrate` for manual re-hydration triggers.
 *
 * Call this once, early in the page (before any streaming chunks arrive).
 */
export function setupStreaming(): void {
  if (typeof window === 'undefined') return

  const w = window as unknown as Record<string, unknown>
  w.__bf_swap = __bf_swap
  w.__bf_hydrate = rehydrateAll
}
