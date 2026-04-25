/**
 * SaasShell
 *
 * Shared layout primitive for /gallery/saas/* pages. SSR-only chrome
 * (top nav + footer); interactive islands (pricing toggle, login form,
 * plan selection badge) live in sibling "use client" components.
 *
 * Compiler stress targets:
 * - Shared layout wrapping per-route SSR-heavy content (each page mounts
 *   its own signal scope inside this shell).
 * - Active-route class on nav items derived from currentRoute prop.
 * - Cross-page persistent state: billing cycle and selected plan carried
 *   from pricing page to login page via sessionStorage.
 * - SSR-heavy workload: landing, blog index, and blog post are fully
 *   server-rendered with no client JS at all.
 */

import type { Child } from 'hono/jsx'

export type SaasRouteKey = 'landing' | 'pricing' | 'blog' | 'login'

interface NavItem {
  key: SaasRouteKey
  href: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'landing', href: '/gallery/saas', label: 'Home' },
  { key: 'pricing', href: '/gallery/saas/pricing', label: 'Pricing' },
  { key: 'blog', href: '/gallery/saas/blog', label: 'Blog' },
]

interface SaasShellProps {
  currentRoute: SaasRouteKey
  children?: Child
}

export function SaasShell({ currentRoute, children }: SaasShellProps) {
  return (
    <div className="saas-shell flex min-h-[calc(100vh-8rem)] w-full flex-col rounded-xl border bg-background overflow-hidden">
      {/* Top navigation */}
      <header
        data-saas-header=""
        className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/95 backdrop-blur px-4 sm:px-6 py-3"
      >
        {/* Logo */}
        <a
          href="/gallery/saas"
          className="flex items-center gap-2 no-underline text-foreground"
        >
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            B
          </div>
          <span className="text-sm font-semibold">Barefoot</span>
        </a>

        {/* Desktop nav */}
        <nav
          data-saas-nav=""
          className="hidden sm:flex items-center gap-1"
          aria-label="SaaS site navigation"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.key === currentRoute
            return (
              <a
                key={item.key}
                href={item.href}
                data-saas-nav-item={item.key}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`saas-nav-link rounded-md px-3 py-1.5 text-sm transition-colors no-underline ${
                  active
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
                }`}
              >
                {item.label}
              </a>
            )
          })}
        </nav>

        {/* CTA */}
        <a
          href="/gallery/saas/login"
          data-saas-nav-item="login"
          data-active={currentRoute === 'login' ? 'true' : 'false'}
          aria-current={currentRoute === 'login' ? 'page' : undefined}
          className={`saas-cta-link rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors ${
            currentRoute === 'login'
              ? 'bg-primary text-primary-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          Sign in
        </a>
      </header>

      {/* Mobile nav strip */}
      <nav
        data-saas-mobile-nav=""
        className="sm:hidden flex overflow-x-auto gap-1 border-b px-3 py-2 bg-background/80"
        aria-label="SaaS site navigation (mobile)"
      >
        {NAV_ITEMS.map((item) => {
          const active = item.key === currentRoute
          return (
            <a
              key={item.key}
              href={item.href}
              data-saas-mobile-nav-item={item.key}
              data-active={active ? 'true' : 'false'}
              aria-current={active ? 'page' : undefined}
              className={`saas-mobile-nav-link shrink-0 rounded-md px-3 py-1.5 text-xs transition-colors no-underline ${
                active
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
              }`}
            >
              {item.label}
            </a>
          )
        })}
      </nav>

      {/* Page content */}
      <main className="saas-page flex-1 overflow-x-auto">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t px-4 sm:px-6 py-4 text-xs text-muted-foreground flex items-center justify-between gap-4">
        <span>© 2025 Barefoot, Inc.</span>
        <div className="flex gap-4">
          <a href="#" className="hover:text-foreground no-underline">Privacy</a>
          <a href="#" className="hover:text-foreground no-underline">Terms</a>
          <a href="#" className="hover:text-foreground no-underline">Contact</a>
        </div>
      </footer>
    </div>
  )
}
