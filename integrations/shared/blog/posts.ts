export interface Post {
  slug: string
  title: string
  date: string
  tags: string[]
  excerpt: string
  body: string[]
}

export const posts: Post[] = [
  {
    slug: 'partial-navigation',
    title: 'Partial navigation, without a SPA framework',
    date: '2026-06-01',
    tags: ['design', 'runtime'],
    excerpt: 'Swap only the content region and leave the shell mounted — no virtual DOM, no full rebuild.',
    body: [
      'Most "SPA feel" comes down to one trick: when you follow a link, replace only the part of the page that changed and keep everything else where it is.',
      'BarefootJS already renders on the server and hydrates islands in place. The router adds the missing piece — intercept the link, fetch the next page, swap just the content outlet, re-hydrate.',
      'The header you are reading this in never reloads. Watch the live counters as you move between posts.',
    ],
  },
  {
    slug: 'any-backend',
    title: 'Any backend, zero cooperation required',
    date: '2026-06-03',
    tags: ['backend', 'design'],
    excerpt: 'The server just returns HTML. The router pulls the outlet out of the response on the client.',
    body: [
      'There is no special protocol to implement. This blog is a plain Hono server returning HTML strings.',
      'The router sends no content-negotiation header: it just fetches the page and pulls the outlet out of the response on the client.',
      'That is why the same approach works against Go, Perl, or any other backend the adapters target — the server stays a plain HTML server.',
    ],
  },
  {
    slug: 'islands-stay-alive',
    title: 'Islands in the shell stay alive',
    date: '2026-06-05',
    tags: ['islands', 'runtime'],
    excerpt: 'Anything outside the outlet keeps its state: open menus, playing media, live counters, theme.',
    body: [
      'Because only the outlet is replaced, every interactive island in the surrounding shell survives a navigation untouched.',
      'The uptime timer in the header was started once, on first load. Full reloads would reset it. It does not.',
      'Toggle the theme switch up there, then navigate — the choice sticks because the shell was never torn down.',
    ],
  },
  {
    slug: 'reuses-the-runtime',
    title: 'It reuses the runtime you already ship',
    date: '2026-06-08',
    tags: ['runtime', 'design'],
    excerpt: 'Re-hydration after a swap goes through the same walk the streaming primitive uses.',
    body: [
      'After the outlet is swapped, the freshly inserted islands need to hydrate. The router calls the same re-hydration walk the streaming primitive already uses.',
      'New islands light up; the shell is left alone. The router package is tiny because the heavy lifting already lives in the runtime.',
      'The like button and "time on page" timer below are outlet islands — they are re-created on every navigation, and torn down when you leave.',
    ],
  },
  {
    slug: 'disposal-is-the-hard-part',
    title: 'Disposal is the hard part',
    date: '2026-06-10',
    tags: ['runtime', 'perf'],
    excerpt: 'Outgoing islands must release timers and listeners or they leak. The stress test measures it.',
    body: [
      'Swapping HTML in is easy. The subtle work is tearing the OLD islands down — their intervals, listeners, and subscriptions.',
      'This demo wires a dispose hook that clears each outlet island on the way out. With it off, the per-page timers keep firing forever.',
      "That is exactly why precise per-scope disposal is the router prototype's next step.",
    ],
  },
  {
    slug: 'history-back-forward',
    title: 'Back and forward, done right',
    date: '2026-06-12',
    tags: ['history', 'design'],
    excerpt: 'popstate swaps the outlet to match the URL without pushing duplicate entries.',
    body: [
      'A client router lives or dies on the back button. On popstate the router swaps the outlet to match the new URL — without recording a fresh history entry.',
      'The stress harness walks forward through several posts then mashes Back, asserting the content matches the URL at every step.',
      'Scroll restoration on back/forward is a known gap — the router resets to the top for now.',
    ],
  },
  {
    slug: 'rapid-fire',
    title: 'Rapid-fire clicks and the last-wins rule',
    date: '2026-06-14',
    tags: ['perf', 'runtime'],
    excerpt: 'Spam the links: the latest navigation must win even if an earlier response resolves last.',
    body: [
      'Users double-click. They click B before A has loaded. The router aborts the in-flight request and bails after each await, so the latest target always wins.',
      'The stress harness forces a slow response, then navigates away, and asserts the stale content never lands.',
      'This was a real race in the first cut — the prototype now has a regression test for it.',
    ],
  },
  {
    slug: 'query-string-nav',
    title: 'Filtering by tag is just navigation',
    date: '2026-06-16',
    tags: ['design', 'backend'],
    excerpt: 'Same path, different query string — the outlet swaps just like any other link.',
    body: [
      'Tag filters on the index are plain links to ?tag=x. To the router they are ordinary same-origin navigations.',
      'The outlet swaps to the filtered list; the shell and its theme stay put.',
      'Hash-only links, in contrast, are left to the browser so in-page anchors keep working.',
    ],
  },
  {
    slug: 'no-fragment-negotiation',
    title: 'Why there is no fragment negotiation',
    date: '2026-06-18',
    tags: ['backend', 'perf'],
    excerpt: 'Returning just the outlet fragment was considered and dropped — it shaves compressible markup but hurts caching.',
    body: [
      'A "smaller" fragment response only removes the shell markup, which gzip already compresses to almost nothing — while making the same URL return two different bodies, so it needs a Vary header that fragments the cache.',
      'It would also force every fragment to re-include its island <script type="module"> tags and <title>, or navigated-to islands go inert.',
      'The cost that actually matters is the round-trip, not the byte count — so the effort goes into prefetch, and the server stays a plain, cacheable HTML server.',
    ],
  },
  {
    slug: 'where-this-goes',
    title: 'Where this goes next',
    date: '2026-06-20',
    tags: ['design', 'islands'],
    excerpt: 'Compiler-derived outlets, morph for persistent islands, prefetch on hover, snapshot cache.',
    body: [
      'The outlet is authored by hand today. The end state is the compiler deriving it from the component tree.',
      'Add idiomorph-style morphing and data-bf-permanent for islands that should survive a swap, plus hover prefetch and a snapshot cache for instant back/forward.',
      'This is the last post — loop back to the start from the navigation below.',
    ],
  },
]

/** The item shape the index list renders — the post fields the list needs plus
 *  a pre-rendered `meta` line. */
export interface ListItem {
  slug: string
  title: string
  date: string
  tags: string[]
  /**
   * Pre-rendered meta line (`<date> · #tag #tag`). Computed here, NOT inside
   * the `PostList` island, on purpose: building it in the island needs a
   * value-producing tag-map-join, a shape the template-string adapters
   * (Go / Mojolicious / Xslate) can't lower for SSR (it trips the compiler's
   * `UNSUPPORTED_METHODS` gate → BF101). Pre-computing
   * it upstream keeps the island's template a plain member access (`p.meta`),
   * so the same shared component compiles on every adapter. JS-runtime adapters
   * (Hono / h3 / Elysia) render a byte-identical string.
   */
  meta: string
}

/** Index-list items derived from `posts`, with `meta` pre-rendered. The Perl
 *  adapters build the equivalent array in their own backend language. */
export const listItems: ListItem[] = posts.map((p) => ({
  slug: p.slug,
  title: p.title,
  date: p.date,
  tags: p.tags,
  meta: `${p.date} · ${p.tags.map((t) => `#${t}`).join(' ')}`,
}))

export const allTags: string[] = [...new Set(posts.flatMap((p) => p.tags))].sort()

export function postIndex(slug: string): number {
  return posts.findIndex((p) => p.slug === slug)
}
