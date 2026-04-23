// Static blog post data for the /gallery/saas/blog demo.
// All content is SSR-rendered; no signals needed.

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  author: string
  authorRole: string
  authorInitials: string
  date: string
  readMinutes: number
  category: string
  tags: string[]
  content: string[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'edge-deployments-explained',
    title: 'Edge Deployments Explained: Why Your Users Will Thank You',
    excerpt:
      'Moving compute closer to your users cuts latency by orders of magnitude. Here is what changes — and what does not — when you deploy to the edge.',
    author: 'Lena Fischer',
    authorRole: 'Staff Engineer',
    authorInitials: 'LF',
    date: 'April 18, 2025',
    readMinutes: 6,
    category: 'Engineering',
    tags: ['Edge', 'Performance', 'Architecture'],
    content: [
      'When a user in Tokyo hits an endpoint deployed in us-east-1, they are paying a ~150ms round-trip tax before your application code even runs. Edge deployments eliminate this tax by running your code in a datacenter geographically close to each request.',
      'The shift is not just topological. Edge runtimes are typically V8-isolate-based (Cloudflare Workers, Deno Deploy) rather than Node.js processes, which means cold-start overhead drops from seconds to under a millisecond. You get a fundamentally different latency profile.',
      'The trade-off is runtime constraints: no filesystem access, limited CPU time per request, and a smaller subset of Node.js APIs. For most HTTP handlers — routing, authentication, SSR, API proxying — these constraints are invisible. For heavy CPU work or legacy Node.js dependencies, you will need a hybrid strategy.',
      'At Barefoot we run every deploy preview on the edge by default. Production traffic is automatically routed to the nearest region. The result: median TTFB under 40ms globally, without any application-level changes from our customers.',
      'Getting started is straightforward. Annotate your handlers with `@edge` or set `runtime: "edge"` in your config. Barefoot handles region rollout, health checks, and failover automatically. If an edge region degrades, traffic silently reroutes to the next nearest healthy node.',
    ],
  },
  {
    slug: 'zero-downtime-deploys',
    title: 'Zero-Downtime Deploys: A Practical Guide',
    excerpt:
      'Rolling updates, blue-green, and canary releases each solve different problems. Learn which strategy fits your team and how to implement it in under an hour.',
    author: 'Marcus Webb',
    authorRole: 'Platform Engineer',
    authorInitials: 'MW',
    date: 'April 10, 2025',
    readMinutes: 8,
    category: 'DevOps',
    tags: ['Deploy', 'Reliability', 'CI/CD'],
    content: [
      'The goal of zero-downtime deploys is simple: update your production application without any request receiving an error response. In practice there are three distinct strategies, each with its own complexity budget.',
      'Rolling updates replace instances one by one, keeping the cluster partially available throughout. They are the lowest-overhead option and work well when your new version is backward-compatible with the old one — i.e., you have not changed database schemas or API contracts in breaking ways.',
      'Blue-green deploys maintain two identical environments. Traffic flips atomically from blue to green at the DNS or load-balancer level. Rollback is instant — just flip back. The cost is double the infrastructure during the transition window.',
      'Canary releases send a small percentage of traffic (say 5%) to the new version, monitor error rates and latency, then gradually shift more traffic if metrics stay healthy. This is the highest-confidence strategy for risky changes, but requires observability tooling to be effective.',
      'Barefoot supports all three out of the box. Configure your strategy in `barefoot.config.ts`. Canary releases automatically pause and alert if p99 latency increases more than 20% or error rate crosses 0.5%.',
    ],
  },
  {
    slug: 'signals-and-ssr',
    title: 'Signals and SSR: How BarefootJS Bridges the Gap',
    excerpt:
      'Fine-grained reactivity and server-side rendering have historically been at odds. BarefootJS compiles signal-reactive components into SSR-safe marked templates with minimal client JS.',
    author: 'Yuki Tanaka',
    authorRole: 'Open Source Maintainer',
    authorInitials: 'YT',
    date: 'March 28, 2025',
    readMinutes: 10,
    category: 'Framework',
    tags: ['BarefootJS', 'Signals', 'SSR'],
    content: [
      'Traditional SPA frameworks send a large JavaScript bundle to the browser and re-render the entire page on the client. SSR frameworks render HTML on the server but then hydrate the whole tree — doubling the work.',
      'BarefootJS takes a different path. The compiler statically analyzes which parts of your component tree depend on signals, and emits only the minimal DOM operations needed to update those parts. Everything else stays as static HTML.',
      'The compilation happens in two phases. Phase 1 (JSX to IR) extracts the reactive dependency graph. Phase 2 (IR to Client JS) emits event bindings and DOM patches keyed to specific nodes using data-bf-* markers. The server renders the full HTML; the client attaches fine-grained effects to the marked nodes.',
      'The result is a drastically smaller client payload. A typical page with a few interactive islands ships 2-4 KB of client JS rather than 50-200 KB for a full framework bundle. Pages that have no reactive islands ship zero client JS.',
      'This architecture is particularly well-suited to marketing sites, documentation, and content-heavy applications — exactly the pages where SSR matters most for SEO and initial load performance.',
    ],
  },
  {
    slug: 'monitoring-your-first-week',
    title: 'Monitoring Your First Week in Production',
    excerpt:
      'The first week after a major deploy is the most dangerous. Here are the five dashboards you should build before you ship.',
    author: 'Priya Nair',
    authorRole: 'SRE Lead',
    authorInitials: 'PN',
    date: 'March 15, 2025',
    readMinutes: 5,
    category: 'Operations',
    tags: ['Observability', 'Monitoring', 'SRE'],
    content: [
      'Most incidents in production happen within the first 48 hours of a deploy. Not because engineers are careless, but because production traffic exposes edge cases that staging never will. Good observability is your early-warning system.',
      'Start with error rate by endpoint. A spike in 5xx errors on a specific route tells you exactly where the regression is. Set an alert threshold at 2x your baseline error rate and page your on-call when it fires.',
      'Second, track p50, p95, and p99 latency. p50 tells you what most users experience. p99 tells you about your worst-case tail. A widening gap between p50 and p99 often indicates a resource contention problem or an N+1 query.',
      'Third, watch memory and CPU per instance. Gradual memory growth (a leak) and sustained high CPU (a hot loop) both manifest slowly and are missed by simple error-rate monitors.',
      'Fourth, track your downstream dependencies: database query times, external API p99s, cache hit rates. Your application may be healthy while a dependency is quietly degrading.',
      'Fifth — and most often skipped — monitor your business metrics. Order completion rate, sign-up funnel conversion, and checkout success are lagging indicators, but they catch regressions that pure infrastructure metrics miss.',
    ],
  },
]

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}
