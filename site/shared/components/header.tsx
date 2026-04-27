/**
 * Shared Header Component
 *
 * Unified header used across all sites (docs, ui, lp).
 * Layout: [leftSlot] Logo | Core UI Playground Integrations --- [searchSlot] GitHub ThemeSwitcher
 *
 * Server component (NOT "use client") — interactive parts are passed via slots.
 */

import { Logo } from './logo'

export interface HeaderProps {
  activePage?: 'core' | 'ui' | 'playground' | 'integrations'
  logoHref?: string
  coreHref?: string
  uiHref?: string
  playgroundHref?: string
  integrationsHref?: string
  searchSlot?: any
  leftSlot?: any
  themeSwitcher?: any
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  )
}

export function Header({
  activePage,
  logoHref = 'https://barefootjs.dev',
  coreHref = 'https://barefootjs.dev/docs/introduction',
  uiHref = 'https://ui.barefootjs.dev',
  playgroundHref = '/playground',
  integrationsHref = '/integrations',
  searchSlot,
  leftSlot,
  themeSwitcher,
}: HeaderProps) {
  const navLinkBase = 'relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors no-underline'
  const navLinkActive = `${navLinkBase} text-foreground`
  const navLinkInactive = `${navLinkBase} text-muted-foreground hover:text-foreground hover:bg-accent/50`
  const coreClass = activePage === 'core' ? navLinkActive : navLinkInactive
  const uiClass = activePage === 'ui' ? navLinkActive : navLinkInactive
  const playgroundClass = activePage === 'playground' ? navLinkActive : navLinkInactive
  const integrationsClass = activePage === 'integrations' ? navLinkActive : navLinkInactive

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[var(--header-height)] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="px-4 sm:px-6 h-[var(--header-height)] flex items-center justify-between gap-4">
        {/* Left section: leftSlot + Logo + Navigation */}
        <div className="flex items-center gap-3 sm:gap-6">
          {leftSlot}

          {/* Logo */}
          <a
            href={logoHref}
            className="text-foreground transition-colors no-underline"
          >
            <Logo />
          </a>

          {/* Navigation separator */}
          <div className="hidden sm:block h-5 w-px bg-border" />

          {/* Navigation links */}
          <nav className="hidden sm:flex items-center gap-1">
            <a href={coreHref} className={coreClass}>
              Core
              {activePage === 'core' && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style="background: linear-gradient(90deg, var(--gradient-start), var(--gradient-end))" />
              )}
            </a>
            <a href={uiHref} className={uiClass}>
              UI
              {activePage === 'ui' && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style="background: linear-gradient(90deg, var(--gradient-start), var(--gradient-end))" />
              )}
            </a>
            <a href={playgroundHref} className={playgroundClass}>
              Playground
              {activePage === 'playground' && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style="background: linear-gradient(90deg, var(--gradient-start), var(--gradient-end))" />
              )}
            </a>
            <a href={integrationsHref} className={integrationsClass}>
              Integrations
              {activePage === 'integrations' && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style="background: linear-gradient(90deg, var(--gradient-start), var(--gradient-end))" />
              )}
            </a>
          </nav>
        </div>

        {/* Right section: Search + GitHub + Theme */}
        <div className="flex items-center gap-2 sm:gap-4">
          {searchSlot}
          <a
            href="https://github.com/piconic-ai/barefootjs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-foreground hover:bg-accent transition-colors"
            aria-label="View on GitHub"
          >
            <GitHubIcon />
          </a>
          {themeSwitcher}
        </div>
      </div>
    </header>
  )
}
