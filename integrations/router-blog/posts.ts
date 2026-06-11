export interface Post {
  slug: string
  title: string
  date: string
  excerpt: string
  body: string[]
}

export const posts: Post[] = [
  {
    slug: 'partial-navigation',
    title: 'Partial navigation, without a SPA framework',
    date: '2026-06-01',
    excerpt:
      'A client router that swaps only the content region and leaves the shell mounted — no virtual DOM, no full-page rebuild.',
    body: [
      'Most "SPA feel" comes down to one trick: when you follow a link, replace only the part of the page that actually changed and keep everything else exactly where it is.',
      'BarefootJS already renders on the server and hydrates islands in place. The router adds the missing piece — intercept the link, fetch the next page, and swap just the content outlet.',
      'The header you are reading this in never reloads. Watch the live counters up there as you move between posts: the uptime keeps ticking and the navigation count climbs by one each time the body below is swapped.',
    ],
  },
  {
    slug: 'any-backend',
    title: 'Any backend, zero cooperation required',
    date: '2026-06-03',
    excerpt:
      'The server just returns HTML. The router pulls the [bf-outlet] region out of the response on the client.',
    body: [
      'There is no special protocol to implement. This blog is a plain Hono server returning HTML strings — no JSON envelope, no RSC payload, no build-time route manifest.',
      'On navigation the router sends an X-Barefoot-Navigate header so a backend can choose to return just the fragment and save bytes. But it is entirely optional: with no server change at all, the router extracts the outlet from a full-page response.',
      'That is why the same approach works against Go, Perl, or any other backend the adapters target — the rendering stays on the server.',
    ],
  },
  {
    slug: 'islands-stay-alive',
    title: 'Islands in the shell stay alive',
    date: '2026-06-05',
    excerpt:
      'Anything outside the outlet keeps its state across navigation: open menus, playing media, live counters.',
    body: [
      'Because only the outlet is replaced, every interactive island in the surrounding shell survives a navigation untouched.',
      'The uptime timer in the header was started exactly once, on first load. If these navigations were full page reloads it would reset to zero every time. It does not — proof that the shell was never torn down.',
      'A real app puts a search box, a theme toggle, or a media player up there and they all just keep working.',
    ],
  },
  {
    slug: 'reuses-the-runtime',
    title: 'It reuses the runtime you already ship',
    date: '2026-06-08',
    excerpt:
      'Re-hydration after a swap goes through the same walk the streaming primitive uses.',
    body: [
      'After the outlet is swapped, the freshly inserted islands need to hydrate. The router does not invent a new mechanism for that — it calls the same re-hydration walk the out-of-order streaming primitive already uses.',
      'New islands light up; the shell is left alone. The router package is tiny because the heavy lifting already lives in the client runtime.',
      'This is the last post — loop back to the start from the navigation below.',
    ],
  },
]

export function postIndex(slug: string): number {
  return posts.findIndex((p) => p.slug === slug)
}
