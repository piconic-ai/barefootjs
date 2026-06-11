/**
 * Client entry for the router-blog reference app.
 *
 * Two responsibilities:
 *   1. Boot a tiny "shell island" that lives OUTSIDE `[bf-outlet]`. Its
 *      state (a ticking uptime clock + a partial-navigation counter)
 *      must survive every navigation — that's the visible proof that the
 *      shell is never torn down.
 *   2. Start the BarefootJS router so same-origin links partial-update.
 *
 * The shell island here is plain JS on purpose: it keeps the reference
 * self-contained and underlines that the router is framework-agnostic.
 * In a full BarefootJS app this would be a compiled `"use client"`
 * island — the router treats both identically.
 */
import { startRouter } from '@barefootjs/router'

function bootShell(): void {
  const uptimeEl = document.getElementById('shell-uptime')
  const navEl = document.getElementById('shell-navs')
  const outlet = document.querySelector('[bf-outlet]')

  // Uptime clock — started once, on first load. A full page reload would
  // reset it to zero; a partial swap leaves it running.
  const start = Date.now()
  setInterval(() => {
    if (uptimeEl) uptimeEl.textContent = `${((Date.now() - start) / 1000).toFixed(1)}s`
  }, 100)

  // Count partial navigations by watching the outlet's children change.
  // Decoupled from the router internals — any swap of the content region
  // ticks this up, a full reload never would.
  let navs = 0
  if (outlet) {
    new MutationObserver(() => {
      navs += 1
      if (navEl) navEl.textContent = String(navs)
    }).observe(outlet, { childList: true })
  }
}

bootShell()
startRouter()
