"use client"
/**
 * InfiniteScrollDemo
 *
 * Async infinite scroll feed with IntersectionObserver-triggered pagination,
 * per-item like/save actions, and streaming SSR via <Async> boundary.
 *
 * Compiler stress targets:
 * - <Async> boundary wrapping items().map() — streaming IR paths (#135)
 * - mapArray append: setItems(prev => [...prev, ...newItems]) grows the list
 * - Effect cleanup: IntersectionObserver.disconnect via onCleanup
 * - Error and empty-state branches: conditional rendering on status signal
 * - createMemo chain: totalCount → likedCount → savedCount from items signal
 * - Per-item immutable updates inside a reactive loop
 */

import { createSignal, createMemo, onMount, onCleanup, Async } from '@barefootjs/client'
import { Avatar, AvatarFallback } from '@ui/components/ui/avatar'
import { Button } from '@ui/components/ui/button'
import { Separator } from '@ui/components/ui/separator'

// --- Types ---

type Article = {
  id: number
  title: string
  excerpt: string
  author: string
  initials: string
  category: string
  readTime: number
  publishedAt: string
  liked: boolean
  saved: boolean
}

type FetchStatus = 'idle' | 'loading' | 'error' | 'end'

// --- Data ---

const ARTICLES: Omit<Article, 'liked' | 'saved'>[] = [
  // Page 1 — initial (8 items)
  { id: 1, title: 'Type-Safe API Clients with Zod and TypeScript', excerpt: 'Build end-to-end type safety from your OpenAPI spec to your React components using Zod schema inference.', author: 'Maya Hoffman', initials: 'MH', category: 'TypeScript', readTime: 7, publishedAt: '2h ago' },
  { id: 2, title: 'React Server Components: A Practical Guide', excerpt: 'Move data fetching to the server without sacrificing interactivity. How RSC changes the mental model for building apps.', author: 'Leon Park', initials: 'LP', category: 'React', readTime: 12, publishedAt: '4h ago' },
  { id: 3, title: 'Core Web Vitals in 2025: What Changed', excerpt: 'INP replaced FID. Interaction to Next Paint measures responsiveness more accurately. Here is how to optimize for it.', author: 'Sara Chen', initials: 'SC', category: 'Performance', readTime: 9, publishedAt: '6h ago' },
  { id: 4, title: 'Testing the UI Layer Without a Browser', excerpt: 'Snapshot testing is dead. Here is how to write IR-level component tests that run in milliseconds with zero flakiness.', author: 'James Okafor', initials: 'JO', category: 'Testing', readTime: 6, publishedAt: '1d ago' },
  { id: 5, title: 'CSS Container Queries: Beyond Responsive Breakpoints', excerpt: 'Container queries let components adapt to their own size, not the viewport. The end of media query hacks.', author: 'Priya Nair', initials: 'PN', category: 'CSS', readTime: 8, publishedAt: '1d ago' },
  { id: 6, title: 'Zero-Downtime Deployments with Feature Flags', excerpt: 'Ship to production continuously without breaking users. A pragmatic guide to trunk-based development.', author: 'Tom Eriksen', initials: 'TE', category: 'DevOps', readTime: 11, publishedAt: '2d ago' },
  { id: 7, title: 'OWASP Top 10 for Frontend Developers', excerpt: 'XSS, CSRF, and clickjacking are still rampant. Concrete mitigations every frontend engineer should know.', author: 'Aisha Okonkwo', initials: 'AO', category: 'Security', readTime: 14, publishedAt: '2d ago' },
  { id: 8, title: 'Micro-Frontends: Lessons from the Trenches', excerpt: 'Three years running a micro-frontend architecture at scale. What worked, what did not, and what we would do differently.', author: 'Wei Zhang', initials: 'WZ', category: 'Architecture', readTime: 16, publishedAt: '3d ago' },
  // Page 2
  { id: 9, title: 'Discriminated Unions for Exhaustive State Machines', excerpt: 'Use TypeScript discriminated unions to make impossible states unrepresentable. A pattern that eliminates entire bug classes.', author: 'Maya Hoffman', initials: 'MH', category: 'TypeScript', readTime: 8, publishedAt: '3d ago' },
  { id: 10, title: 'useReducer vs. Signals: When to Choose What', excerpt: 'Both primitives manage state, but they excel in different scenarios. A practical decision framework.', author: 'Leon Park', initials: 'LP', category: 'React', readTime: 10, publishedAt: '4d ago' },
  { id: 11, title: 'JavaScript Bundle Analysis with Source Maps', excerpt: 'Your bundle is bigger than you think. How to identify and eliminate hidden dependencies dragging down performance.', author: 'Sara Chen', initials: 'SC', category: 'Performance', readTime: 7, publishedAt: '4d ago' },
  { id: 12, title: 'Property-Based Testing with fast-check', excerpt: 'Generate hundreds of edge-case inputs automatically. A hands-on introduction to property-based testing in TypeScript.', author: 'James Okafor', initials: 'JO', category: 'Testing', readTime: 9, publishedAt: '5d ago' },
  { id: 13, title: 'Cascade Layers and the Future of CSS Specificity', excerpt: '@layer gives you explicit control over cascade order. Bye-bye specificity wars, hello predictable styles.', author: 'Priya Nair', initials: 'PN', category: 'CSS', readTime: 6, publishedAt: '5d ago' },
  { id: 14, title: 'GitHub Actions for Frontend CI/CD', excerpt: 'Parallel jobs, caching, and matrix builds. Build a fast, reliable CI pipeline for your JavaScript monorepo.', author: 'Tom Eriksen', initials: 'TE', category: 'DevOps', readTime: 13, publishedAt: '6d ago' },
  { id: 15, title: 'Content Security Policy Without the Headache', excerpt: 'CSP is hard to configure correctly. A step-by-step approach that balances security and developer ergonomics.', author: 'Aisha Okonkwo', initials: 'AO', category: 'Security', readTime: 11, publishedAt: '6d ago' },
  { id: 16, title: 'Module Federation at Runtime', excerpt: 'Load remote modules dynamically without a build-time handshake. How Webpack 5 Module Federation works under the hood.', author: 'Wei Zhang', initials: 'WZ', category: 'Architecture', readTime: 15, publishedAt: '1w ago' },
  // Page 3
  { id: 17, title: 'Conditional Types and Mapped Types: A Deep Dive', excerpt: 'From infer to distributive conditionals, mapped type modifiers to template literal types — master the TypeScript type system.', author: 'Maya Hoffman', initials: 'MH', category: 'TypeScript', readTime: 13, publishedAt: '1w ago' },
  { id: 18, title: 'Concurrent Mode Explained: Transitions and Deferred Values', excerpt: 'React 18 concurrency primitives let you keep the UI responsive under load. Here is how to use them effectively.', author: 'Leon Park', initials: 'LP', category: 'React', readTime: 11, publishedAt: '1w ago' },
  { id: 19, title: 'Edge Functions: The New Frontend Backend', excerpt: 'Run server logic 50ms from every user. The tradeoffs of moving compute to the edge and when it makes sense.', author: 'Sara Chen', initials: 'SC', category: 'Performance', readTime: 9, publishedAt: '1w ago' },
  { id: 20, title: 'Playwright vs. Cypress in 2025', excerpt: 'Both tools have matured. A head-to-head comparison of DX, reliability, debugging experience, and CI integration.', author: 'James Okafor', initials: 'JO', category: 'Testing', readTime: 8, publishedAt: '2w ago' },
  { id: 21, title: 'Fluid Typography with clamp()', excerpt: 'One line of CSS scales type from mobile to desktop. No media queries, no JavaScript — just math.', author: 'Priya Nair', initials: 'PN', category: 'CSS', readTime: 5, publishedAt: '2w ago' },
  { id: 22, title: 'Secrets Management for the Frontend Dev', excerpt: 'Environment variables are not secrets. How to handle sensitive config safely from local dev to production.', author: 'Tom Eriksen', initials: 'TE', category: 'DevOps', readTime: 12, publishedAt: '2w ago' },
  { id: 23, title: 'Subresource Integrity for Third-Party Scripts', excerpt: 'SRI hashes guarantee the CDN cannot silently tamper with your scripts. Setting it up and keeping it current.', author: 'Aisha Okonkwo', initials: 'AO', category: 'Security', readTime: 7, publishedAt: '2w ago' },
  { id: 24, title: 'Vertical Slice Architecture in a Monorepo', excerpt: 'Organize by feature, not by layer. How vertical slices reduce coupling and make large repos navigable.', author: 'Wei Zhang', initials: 'WZ', category: 'Architecture', readTime: 14, publishedAt: '2w ago' },
  // Page 4
  { id: 25, title: 'Branded Types: Preventing Primitive Obsession', excerpt: 'Wrap your strings and numbers in branded types to make ID mix-ups a compile error, not a runtime surprise.', author: 'Maya Hoffman', initials: 'MH', category: 'TypeScript', readTime: 6, publishedAt: '3w ago' },
  { id: 26, title: 'Server Actions and the End of the API Route', excerpt: 'Call server functions directly from forms. How Next.js Server Actions simplify the full-stack data flow.', author: 'Leon Park', initials: 'LP', category: 'React', readTime: 10, publishedAt: '3w ago' },
  { id: 27, title: 'Virtual Scrolling for Large Lists', excerpt: 'Render 100,000 rows without DOM overhead. A from-scratch walkthrough of windowing algorithms in JavaScript.', author: 'Sara Chen', initials: 'SC', category: 'Performance', readTime: 12, publishedAt: '3w ago' },
  { id: 28, title: 'Visual Regression Testing with Storybook and Chromatic', excerpt: 'Catch UI regressions before they reach users. Integrating Storybook stories into a visual regression pipeline.', author: 'James Okafor', initials: 'JO', category: 'Testing', readTime: 9, publishedAt: '3w ago' },
  { id: 29, title: 'CSS Scroll-Driven Animations', excerpt: 'Animate elements as the user scrolls — without JavaScript. The new animation-timeline property and its power.', author: 'Priya Nair', initials: 'PN', category: 'CSS', readTime: 7, publishedAt: '3w ago' },
  { id: 30, title: 'OpenTelemetry for Node.js Services', excerpt: 'Traces, metrics, and logs in one standard. Adding observability to your backend without vendor lock-in.', author: 'Tom Eriksen', initials: 'TE', category: 'DevOps', readTime: 13, publishedAt: '4w ago' },
  { id: 31, title: 'Preventing Supply Chain Attacks in npm Projects', excerpt: 'Lockfiles, audit CIs, and provenance attestation. A layered defence for your JavaScript dependency tree.', author: 'Aisha Okonkwo', initials: 'AO', category: 'Security', readTime: 10, publishedAt: '4w ago' },
  { id: 32, title: 'Domain-Driven Design for Frontend Applications', excerpt: 'Ubiquitous language, bounded contexts, and anti-corruption layers applied to the frontend layer.', author: 'Wei Zhang', initials: 'WZ', category: 'Architecture', readTime: 17, publishedAt: '4w ago' },
  // Page 5 (last)
  { id: 33, title: 'TypeScript 5.4: What Is New and What Matters', excerpt: 'Preserved narrowing, NoInfer, and groupBy — the most impactful additions in the latest TypeScript release.', author: 'Maya Hoffman', initials: 'MH', category: 'TypeScript', readTime: 7, publishedAt: '1mo ago' },
  { id: 34, title: 'Fine-Grained Reactivity Without a Framework', excerpt: 'Implement a minimal signal-based reactive system from scratch. Understand what SolidJS and Preact Signals do under the hood.', author: 'Leon Park', initials: 'LP', category: 'React', readTime: 14, publishedAt: '1mo ago' },
  { id: 35, title: 'HTTP/3 and QUIC for Frontend Engineers', excerpt: 'Connection migration, 0-RTT, and stream multiplexing. How HTTP/3 reduces perceived latency for web apps.', author: 'Sara Chen', initials: 'SC', category: 'Performance', readTime: 8, publishedAt: '1mo ago' },
  { id: 36, title: 'Contract Testing with Pact', excerpt: 'Test the consumer-provider contract without running both services simultaneously. How Pact fits into a CI pipeline.', author: 'James Okafor', initials: 'JO', category: 'Testing', readTime: 10, publishedAt: '1mo ago' },
  { id: 37, title: 'The Anchor Positioning API', excerpt: 'Position tooltips, popovers, and dropdowns relative to their triggers — in CSS alone. No JavaScript calculations.', author: 'Priya Nair', initials: 'PN', category: 'CSS', readTime: 6, publishedAt: '1mo ago' },
  { id: 38, title: 'Immutable Infrastructure with Docker and Terraform', excerpt: 'Treat servers as cattle, not pets. Build a reproducible deployment pipeline where every deploy is identical.', author: 'Tom Eriksen', initials: 'TE', category: 'DevOps', readTime: 15, publishedAt: '1mo ago' },
  { id: 39, title: 'OAuth 2.0 PKCE Flow for Single-Page Apps', excerpt: 'Why implicit flow is dead and how PKCE protects your SPA from auth code interception attacks.', author: 'Aisha Okonkwo', initials: 'AO', category: 'Security', readTime: 11, publishedAt: '1mo ago' },
  { id: 40, title: 'Event Sourcing for the Frontend', excerpt: 'Store user intent as events, derive state on demand. How event sourcing solves undo/redo and audit trails at the UI layer.', author: 'Wei Zhang', initials: 'WZ', category: 'Architecture', readTime: 13, publishedAt: '1mo ago' },
]

const PAGE_SIZE = 8

function articlesForPage(page: number): Article[] {
  const start = page * PAGE_SIZE
  const items = ARTICLES.slice(start, start + PAGE_SIZE)
  return items.map(a => ({ ...a, liked: false, saved: false }))
}

async function fetchPage(page: number): Promise<Article[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.12) {
        reject(new Error('Network error — please retry'))
        return
      }
      resolve(articlesForPage(page))
    }, 700)
  })
}

const INITIAL_ITEMS: Article[] = articlesForPage(0)
const TOTAL_PAGES = Math.ceil(ARTICLES.length / PAGE_SIZE)

// --- Category badge color ---

const CATEGORY_COLOR: Record<string, string> = {
  TypeScript: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  React: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
  Performance: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  Testing: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  CSS: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  DevOps: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  Security: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  Architecture: 'bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300',
}

// --- Demo component ---

export function InfiniteScrollDemo() {
  const [items, setItems] = createSignal<Article[]>(INITIAL_ITEMS)
  const [cursor, setCursor] = createSignal(1)
  const [status, setStatus] = createSignal<FetchStatus>('idle')

  const totalCount = createMemo(() => items().length)
  const likedCount = createMemo(() => items().filter(a => a.liked).length)
  const savedCount = createMemo(() => items().filter(a => a.saved).length)

  const toggleLike = (id: number) => {
    setItems(prev => prev.map(a => a.id === id ? { ...a, liked: !a.liked } : a))
  }

  const toggleSave = (id: number) => {
    setItems(prev => prev.map(a => a.id === id ? { ...a, saved: !a.saved } : a))
  }

  const loadMore = async () => {
    if (status() === 'loading' || status() === 'end') return
    const page = cursor()
    if (page >= TOTAL_PAGES) {
      setStatus('end')
      return
    }
    setStatus('loading')
    try {
      const newItems = await fetchPage(page)
      setItems(prev => [...prev, ...newItems])
      setCursor(page + 1)
      setStatus(page + 1 >= TOTAL_PAGES ? 'end' : 'idle')
    } catch {
      setStatus('error')
    }
  }

  onMount(() => {
    const sentinel = document.querySelector('.is-sentinel')
    if (!sentinel) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadMore()
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    onCleanup(() => observer.disconnect())
  })

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Stats bar */}
      <div
        data-slot="stats-bar"
        className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3"
      >
        <div className="text-sm text-muted-foreground">
          <span className="scroll-total-count font-semibold text-foreground">{totalCount()}</span> articles
        </div>
        <Separator orientation="vertical" decorative className="h-4" />
        <div className="text-sm text-muted-foreground">
          <span className="scroll-liked-count font-semibold text-foreground">{likedCount()}</span> liked
        </div>
        <Separator orientation="vertical" decorative className="h-4" />
        <div className="text-sm text-muted-foreground">
          <span className="scroll-saved-count font-semibold text-foreground">{savedCount()}</span> saved
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          Page {cursor()} / {TOTAL_PAGES}
        </div>
      </div>

      {/* Article list — <Async> wraps the signal-driven map (streaming IR path) */}
      <Async
        fallback={
          <div data-slot="initial-skeleton" className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-lg border bg-muted"
              />
            ))}
          </div>
        }
      >
        <div data-slot="article-list" className="space-y-3">
          {items().map(article => (
            <article
              key={article.id}
              data-article-id={article.id}
              className="scroll-article rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start gap-3">
                <Avatar className="mt-0.5 size-8 shrink-0">
                  <AvatarFallback className="text-xs">{article.initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug">{article.title}</h3>
                    <span
                      className={`scroll-category-badge shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${CATEGORY_COLOR[article.category]}`}
                    >
                      {article.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{article.excerpt}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{article.author}</span>
                    <Separator orientation="vertical" decorative className="h-3" />
                    <span className="text-xs text-muted-foreground">{article.readTime} min read</span>
                    <Separator orientation="vertical" decorative className="h-3" />
                    <span className="text-xs text-muted-foreground">{article.publishedAt}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        data-slot="like-btn"
                        data-article-id={article.id}
                        data-liked={article.liked ? 'true' : 'false'}
                        aria-label={article.liked ? 'Unlike' : 'Like'}
                        aria-pressed={article.liked ? 'true' : 'false'}
                        className={`scroll-like-btn inline-flex size-7 items-center justify-center rounded text-xs transition-colors hover:bg-accent ${article.liked ? 'text-red-500' : 'text-muted-foreground'}`}
                        onClick={() => toggleLike(article.id)}
                      >
                        {article.liked ? '♥' : '♡'}
                      </button>
                      <button
                        data-slot="save-btn"
                        data-article-id={article.id}
                        data-saved={article.saved ? 'true' : 'false'}
                        aria-label={article.saved ? 'Unsave' : 'Save'}
                        aria-pressed={article.saved ? 'true' : 'false'}
                        className={`scroll-save-btn inline-flex size-7 items-center justify-center rounded text-xs transition-colors hover:bg-accent ${article.saved ? 'text-amber-500' : 'text-muted-foreground'}`}
                        onClick={() => toggleSave(article.id)}
                      >
                        {article.saved ? '★' : '☆'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Async>

      {/* Sentinel + status — IntersectionObserver anchor */}
      <div className="is-sentinel flex flex-col items-center gap-3 py-4">
        {status() === 'loading' ? (
          <div data-slot="loading-indicator" className="flex items-center gap-2 text-sm text-muted-foreground">
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading more articles…
          </div>
        ) : null}
        {status() === 'error' ? (
          <div data-slot="error-state" className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-destructive">Failed to load articles.</p>
            <Button
              variant="outline"
              size="sm"
              className="scroll-retry-btn"
              onClick={() => {
                setStatus('idle')
                loadMore()
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {status() === 'end' ? (
          <div data-slot="end-state" className="text-center">
            <p className="text-sm text-muted-foreground">
              You have reached the end · {totalCount()} articles
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
