"use client"

/**
 * ThemeSwitcher Component (shared)
 *
 * A toggle button to switch between light and dark themes.
 * Uses system preference as initial default, persists user choice in a
 * cookie scoped to the parent domain so the preference is shared between
 * barefootjs.dev (site/core) and ui.barefootjs.dev (site/ui).
 * Inline SVG icons — no external icon dependency.
 */

import { createSignal, createEffect, createMemo } from '@barefootjs/client'

export type Theme = 'light' | 'dark'

export interface ThemeSwitcherProps {
  defaultTheme?: Theme | 'system'
  className?: string
}

const THEME_COOKIE_NAME = 'theme'
// Setting Domain=barefootjs.dev makes the cookie available on the apex
// and every subdomain (ui.*, future *). On other hosts (localhost,
// preview deployments) the cookie is host-only.
const THEME_COOKIE_PARENT_DOMAIN = 'barefootjs.dev'
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

function readThemeCookie(): Theme | null {
  const match = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/)
  if (!match) return null
  const value = decodeURIComponent(match[1])
  return value === 'light' || value === 'dark' ? value : null
}

function writeThemeCookie(theme: Theme): void {
  const host = location.hostname
  const useParent = host === THEME_COOKIE_PARENT_DOMAIN || host.endsWith('.' + THEME_COOKIE_PARENT_DOMAIN)
  const parts = [
    `${THEME_COOKIE_NAME}=${theme}`,
    'Path=/',
    `Max-Age=${ONE_YEAR_SECONDS}`,
    'SameSite=Lax',
  ]
  if (useParent) parts.push(`Domain=${THEME_COOKIE_PARENT_DOMAIN}`)
  if (location.protocol === 'https:') parts.push('Secure')
  document.cookie = parts.join('; ')
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function ThemeSwitcher(props: ThemeSwitcherProps) {
  const [theme, setTheme] = createSignal<Theme>('light')
  const [initialized, setInitialized] = createSignal(false)

  // Initialize theme from cookie or system preference (client-side only)
  createEffect(() => {
    if (initialized()) return
    setInitialized(true)

    const stored = readThemeCookie()
    if (stored) {
      setTheme(stored)
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    }
  })

  // Apply theme to document when theme changes
  createEffect(() => {
    if (!initialized()) return
    const currentTheme = theme()
    const root = document.documentElement
    root.classList.toggle('dark', currentTheme === 'dark')
    writeThemeCookie(currentTheme)
  })

  // Toggle with smooth transition animation
  const toggleTheme = () => {
    const root = document.documentElement
    root.classList.add('theme-transition')
    setTheme(theme() === 'light' ? 'dark' : 'light')
    setTimeout(() => {
      root.classList.remove('theme-transition')
    }, 300)
  }

  const isDark = createMemo(() => theme() === 'dark')

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={props.className || "inline-flex items-center justify-center w-9 h-9 rounded-md text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"}
      aria-label={isDark() ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark() ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
