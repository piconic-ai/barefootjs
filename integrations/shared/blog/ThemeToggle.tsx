'use client'

import { createSignal } from '@barefootjs/client'

/**
 * A SHELL island (lives outside `[bf-region]`). Toggling the theme flips a
 * `data-theme` attribute on `<html>`. The proof it matters: toggle it, then
 * navigate between posts — the choice sticks, because the shell is never
 * reloaded or re-hydrated by a partial navigation.
 */
export function ThemeToggle() {
  const [light, setLight] = createSignal(false)
  const toggle = () => {
    const next = !light()
    setLight(next)
    document.documentElement.dataset.theme = next ? 'light' : 'dark'
  }
  return (
    <button className="toggle" type="button" onClick={toggle}>
      {light() ? '☀️ light' : '🌙 dark'}
    </button>
  )
}
