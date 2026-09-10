/**
 * Shared Header Component
 *
 * Unified header used across all sites (docs, ui, lp).
 * Layout: [leftSlot] Logo | Core UI Playground Integrations --- [searchSlot] GitHub ThemeSwitcher
 *
 * Server component (NOT "use client") — interactive parts are passed via slots.
 */

import { Logo, LogoIcon } from './logo'
import { GitHubIcon } from './icons'

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

  // Mobile shortcut: when the visitor is on a known section, show the section
  // label next to the icon so it stays both a brand mark and a "back to section
  // home" link.
  const mobileShortcut = activePage === 'core'
    ? { label: 'Core', href: coreHref }
    : activePage === 'ui'
    ? { label: 'UI', href: uiHref }
    : activePage === 'playground'
    ? { label: 'Playground', href: playgroundHref }
    : activePage === 'integrations'
    ? { label: 'Integrations', href: integrationsHref }
    : null

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[var(--header-height)] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="px-4 sm:px-6 h-[var(--header-height)] flex items-center justify-between gap-4">
        {/* Left section: leftSlot + Logo + Navigation */}
        <div className="flex items-center gap-3 sm:gap-6">
          {leftSlot}

          {/* Logo: mobile = icon + section shortcut, desktop = full wordmark */}
          {mobileShortcut ? (
            <div className="flex sm:hidden items-center gap-2">
              <a
                href={logoHref}
                className="inline-flex items-center text-foreground transition-colors no-underline"
                aria-label="BarefootJS"
              >
                <LogoIcon />
              </a>
              <a
                href={mobileShortcut.href}
                className="text-sm font-medium text-foreground no-underline px-1"
              >
                {mobileShortcut.label}
              </a>
            </div>
          ) : (
            <a
              href={logoHref}
              className="sm:hidden text-foreground transition-colors no-underline"
              aria-label="BarefootJS"
            >
              <LogoIcon />
            </a>
          )}
          <a
            href={logoHref}
            className="hidden sm:inline-flex text-foreground transition-colors no-underline"
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
