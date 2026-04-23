/**
 * SaasLandingDemo
 *
 * Full-page marketing landing: hero, features, social proof, CTA.
 * SSR-only — no "use client" directive, no signals.
 *
 * Compiler stress targets:
 * - Deep static nesting (section > div > div > p)
 * - Static map() loops (feature list, testimonials, logo strip)
 * - Purely declarative JSX with no reactive islands
 */

const FEATURES = [
  {
    icon: '⚡',
    title: 'Instant Deploy',
    description: 'Ship from git to a global edge network in seconds. Zero config required.',
  },
  {
    icon: '🔒',
    title: 'Built-in Security',
    description: 'TLS, DDoS protection, and WAF included on every plan. Sleep soundly.',
  },
  {
    icon: '📊',
    title: 'Real-time Analytics',
    description: 'Traffic, errors, and performance metrics updated live. No third-party tools.',
  },
  {
    icon: '🔄',
    title: 'Auto Scaling',
    description: 'Handle traffic spikes automatically. Pay only for what you use.',
  },
  {
    icon: '🤝',
    title: 'Team Collaboration',
    description: 'Invite teammates, manage permissions, and review deploys together.',
  },
  {
    icon: '🛠',
    title: 'Developer First',
    description: 'CLI, GitHub Actions, REST API. Build the workflow that fits your team.',
  },
]

const TESTIMONIALS = [
  {
    quote: 'We cut our deployment pipeline from 20 minutes to under 60 seconds. Barefoot just works.',
    author: 'Mia Chen',
    role: 'CTO, Loopify',
    avatar: 'MC',
  },
  {
    quote: 'The analytics alone saved us three separate SaaS subscriptions. Excellent ROI.',
    author: 'James Park',
    role: 'Engineering Lead, Trellis',
    avatar: 'JP',
  },
  {
    quote: `Our team went from "what's deployed?" to full confidence in the release process.`,
    author: 'Sara Okonkwo',
    role: 'Staff Engineer, Nomad',
    avatar: 'SO',
  },
]

const LOGOS = ['Loopify', 'Trellis', 'Nomad', 'Petal', 'Arclight', 'Verdant']

const STATS = [
  { value: '10,000+', label: 'Projects deployed' },
  { value: '99.99%', label: 'Uptime SLA' },
  { value: '~50ms', label: 'Median deploy time' },
  { value: '180+', label: 'Edge locations' },
]

export function SaasLandingDemo() {
  return (
    <div className="saas-landing w-full">

      {/* Hero */}
      <section className="saas-hero px-4 sm:px-8 py-16 sm:py-24 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground mb-6">
          <span className="size-1.5 rounded-full bg-green-500" />
          Now in public beta — join 10,000 developers
        </div>
        <h1 className="saas-hero-title text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-6 leading-tight">
          Ship faster.<br />Scale effortlessly.<br />
          <span className="text-primary">Stay in control.</span>
        </h1>
        <p className="saas-hero-subtitle text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Barefoot is the deployment platform built for teams who move fast.
          From a single command to global scale — no DevOps required.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="/gallery/saas/pricing"
            className="saas-cta-primary inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90 transition-colors"
          >
            Start for free
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </a>
          <a
            href="/gallery/saas/blog"
            className="saas-cta-secondary inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium text-foreground no-underline hover:bg-accent transition-colors"
          >
            Read the blog
          </a>
        </div>
      </section>

      {/* Logo strip */}
      <section className="saas-logos border-y px-4 sm:px-8 py-8 bg-muted/30">
        <p className="text-center text-xs text-muted-foreground mb-6 uppercase tracking-wider font-medium">
          Trusted by teams at
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {LOGOS.map((name) => (
            <span key={name} className="saas-logo-item text-sm font-semibold text-muted-foreground/60">
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="saas-stats px-4 sm:px-8 py-12 max-w-4xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map((stat) => (
            <div key={stat.label} className="saas-stat-item space-y-1">
              <p className="text-3xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="saas-features px-4 sm:px-8 py-12 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            Everything you need, nothing you don't
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            A focused set of tools that cover the full deployment lifecycle — from push to production.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="saas-feature-card rounded-xl border bg-card p-5 space-y-3 hover:shadow-sm transition-shadow"
            >
              <div className="text-2xl">{feature.icon}</div>
              <h3 className="font-semibold text-foreground">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="saas-testimonials px-4 sm:px-8 py-12 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center text-foreground mb-8">
            Loved by developers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.author}
                className="saas-testimonial-card rounded-xl border bg-card p-5 space-y-4"
              >
                <p className="text-sm text-foreground leading-relaxed">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{t.author}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="saas-final-cta px-4 sm:px-8 py-16 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
          Ready to deploy with confidence?
        </h2>
        <p className="text-muted-foreground mb-8">
          Start free. Upgrade when you're ready. No credit card required.
        </p>
        <a
          href="/gallery/saas/pricing"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground no-underline hover:bg-primary/90 transition-colors"
        >
          View pricing
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </section>

    </div>
  )
}
