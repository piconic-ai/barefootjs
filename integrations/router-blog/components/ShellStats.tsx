'use client'

import { createSignal, onMount } from '@barefootjs/client'

/**
 * A SHELL island (outside `[bf-region]`) that proves the shell stays mounted
 * across partial navigations:
 *
 *   - uptime — started once on first load; a full reload would reset it.
 *   - partial navs — a `MutationObserver` on the region ticks on every swap.
 *   - live islands — count of hydrated scopes (`[bf-s]`) inside the region,
 *     re-counted after each swap so disposal/re-hydration is observable.
 */
export function ShellStats() {
  const [uptime, setUptime] = createSignal('0.0s')
  const [navs, setNavs] = createSignal(0)
  const [islands, setIslands] = createSignal(0)

  onMount(() => {
    const start = Date.now()
    setInterval(() => setUptime(`${((Date.now() - start) / 1000).toFixed(1)}s`), 100)

    const region = document.querySelector('[bf-region]')
    if (!region) return
    const recount = () => setIslands(region.querySelectorAll('[bf-s]').length)
    recount()
    new MutationObserver(() => {
      setNavs((n) => n + 1)
      recount()
    }).observe(region, { childList: true })
  })

  return (
    <div className="shell-stats">
      <span className="chip">⏱ uptime <b>{uptime()}</b></span>
      <span className="chip">🔀 partial navs <b>{navs()}</b></span>
      <span className="chip">🧩 live islands <b>{islands()}</b></span>
    </div>
  )
}
