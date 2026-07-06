/**
 * Landing-page header and footer: minimal chrome — the official
 * wordmark logo + four nav links, and a flat link footer. The logotype
 * asset is the brand's own; the display name everywhere else is
 * BarefootJS (enforced by styles/Barefoot/Naming.yml).
 */

import { ThemeSwitcher } from '@/components/theme-switcher'
import { Logo, LogoIcon } from '../../../shared/components/logo'

export function LpHeader({ uiHref = 'https://ui.barefootjs.dev' }: { uiHref?: string }) {
  return (
    <header className="lp-header">
      <div className="lp-wrap lp-nav">
        <a className="lp-logo" href="/" aria-label="BarefootJS home">
          {/* Full wordmark on desktop, footprint icon on narrow screens
              (the wordmark + four nav links overflow a 375px viewport). */}
          <span className="lp-logo-full"><Logo /></span>
          <span className="lp-logo-icon"><LogoIcon /></span>
        </a>
        <nav className="lp-nav-links" aria-label="Main">
          <a href="/docs">Docs</a>
          <a href={uiHref}>Components</a>
          <a href="/integrations">Integrations</a>
          <a href="https://github.com/piconic-ai/barefootjs">Source</a>
          <ThemeSwitcher />
        </nav>
      </div>
    </header>
  )
}

export function LpFooter({ uiHref = 'https://ui.barefootjs.dev' }: { uiHref?: string }) {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-foot-row">
        <div>
          <a href="/docs">Docs</a>
          <a href={uiHref}>Components</a>
          <a href="/integrations">Integrations</a>
          <a href="/docs/advanced/compatibility-matrix">Compatibility</a>
          <a href="https://github.com/piconic-ai/barefootjs">GitHub</a>
        </div>
        <div>© 2026 Piconic — open source (MIT).</div>
      </div>
    </footer>
  )
}
