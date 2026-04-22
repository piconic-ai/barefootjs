/**
 * ShopShell
 *
 * Shared layout for /gallery/shop/* pages. SSR-only chrome (top nav bar);
 * the cart count island (ShopCartBadge) lives in a sibling "use client" component.
 *
 * Top nav contrasts with AdminShell's sidebar — demonstrates two layout
 * archetypes in the same gallery.
 *
 * Compiler stress targets:
 * - Shared layout wrapping per-route reactive content (each page mounts
 *   its own signal scope inside this shell).
 * - Active-route class on nav items derived from currentRoute prop.
 */

import type { Child } from 'hono/jsx'
import { ShopCartBadge } from './shop-cart-badge'

export type ShopRouteKey = 'catalog' | 'cart' | 'checkout'

interface NavItem {
  key: ShopRouteKey
  href: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'catalog', href: '/gallery/shop', label: 'Catalog' },
  { key: 'cart', href: '/gallery/shop/cart', label: 'Cart' },
  { key: 'checkout', href: '/gallery/shop/checkout', label: 'Checkout' },
]

interface ShopShellProps {
  currentRoute: ShopRouteKey
  children?: Child
}

export function ShopShell({ currentRoute, children }: ShopShellProps) {
  return (
    <div className="shop-shell flex min-h-[calc(100vh-8rem)] w-full flex-col rounded-xl border bg-card overflow-hidden">
      {/* Top nav */}
      <header
        data-shop-header=""
        className="flex items-center gap-4 border-b px-4 py-3 bg-background/60"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
            S
          </div>
          <span className="text-sm font-semibold">Shop</span>
        </div>

        {/* Nav links */}
        <nav
          data-shop-nav=""
          className="flex items-center gap-1 overflow-x-auto"
          aria-label="Shop navigation"
        >
          {NAV_ITEMS.map((item) => {
            const active = item.key === currentRoute
            return (
              <a
                href={item.href}
                data-shop-nav-item={item.key}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`shop-nav-link flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors no-underline whitespace-nowrap ${
                  active
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {item.label}
                {item.key === 'cart' ? <ShopCartBadge /> : null}
              </a>
            )
          })}
        </nav>
      </header>

      {/* Page content */}
      <div className="shop-page flex-1 overflow-x-auto p-4 sm:p-6">
        {children}
      </div>
    </div>
  )
}
