/**
 * Features section component
 *
 * Displays Fine-grained reactivity benchmark and UI components showcase.
 */

const features = [
  {
    num: '01',
    title: 'Backend Freedom',
    description: 'Go, Rust, Node... your choice',
  },
  {
    num: '02',
    title: 'MPA-style',
    description: 'Add to existing apps',
  },
  {
    num: '03',
    title: 'Fine-grained',
    description: 'Signal-based reactivity',
  },
  {
    num: '04',
    title: 'AI-native',
    description: 'CLI + fast IR tests',
  },
]

export function FeaturesSection() {
  return (
    <section className="py-32 px-6 sm:px-12 border-t">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap">
          {features.map((feature) => (
            <div className="w-full sm:w-1/2 lg:w-1/4 p-6 sm:p-8 flex flex-col border-b lg:border-b-0 lg:border-r last:border-r-0 sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r">
              <span className="text-xs font-mono text-[var(--gradient-start)] tracking-wider mb-4">
                {feature.num}
              </span>
              <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function UIComponentsSection() {
  return (
    <section className="py-24 px-6 sm:px-12 border-t">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Ready-to-use UI Components
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Beautiful, accessible components built with Barefoot.js.
            Copy and paste into your project.
          </p>
        </div>

        {/* Practical UI Examples using shadcn/ui style classes */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Login Card */}
          <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm">
            <div className="grid gap-1 px-6">
              <h3 className="text-lg font-semibold leading-tight">Sign In</h3>
              <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
            </div>
            <div className="px-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Email</label>
                <input type="email" className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground" placeholder="you@example.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Password</label>
                <input type="password" className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground" placeholder="••••••••" />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <span className="w-4 h-4 flex items-center justify-center text-xs rounded border bg-foreground text-background border-foreground">✓</span>
                <span>Remember me</span>
              </label>
              <button className="h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">Sign In</button>
            </div>
          </div>

          {/* Profile Card */}
          <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm">
            <div className="px-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center text-xl font-semibold text-primary-foreground bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-full">JD</div>
              <h3 className="text-lg font-semibold">Jane Doe</h3>
              <p className="text-sm text-muted-foreground mt-1">Software Engineer</p>
              <div className="flex justify-center gap-8 py-4 my-4 border-t border-b">
                <div className="text-center">
                  <span className="block text-lg font-semibold">128</span>
                  <span className="text-xs text-muted-foreground">Posts</span>
                </div>
                <div className="text-center">
                  <span className="block text-lg font-semibold">2.4k</span>
                  <span className="text-xs text-muted-foreground">Followers</span>
                </div>
                <div className="text-center">
                  <span className="block text-lg font-semibold">847</span>
                  <span className="text-xs text-muted-foreground">Following</span>
                </div>
              </div>
              <button className="w-full h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium border bg-background hover:bg-accent">View Profile</button>
            </div>
          </div>

          {/* Settings Card */}
          <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm">
            <div className="grid gap-1 px-6">
              <h3 className="text-lg font-semibold leading-tight">Notifications</h3>
              <p className="text-sm text-muted-foreground">Manage your preferences</p>
            </div>
            <div className="px-6 flex flex-col">
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="text-sm font-medium">Email alerts</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Receive email notifications</div>
                </div>
                <div className="w-10 h-5 bg-[var(--gradient-start)] rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 right-0.5 shadow-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <div>
                  <div className="text-sm font-medium">Push notifications</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Receive push alerts</div>
                </div>
                <div className="w-10 h-5 bg-muted rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 shadow-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">Weekly digest</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Summary of activity</div>
                </div>
                <div className="w-10 h-5 bg-[var(--gradient-start)] rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 right-0.5 shadow-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Card */}
          <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border border-[var(--gradient-start)] py-6 shadow-sm ring-1 ring-[var(--gradient-start)]">
            <div className="grid gap-1 px-6">
              <span className="inline-flex w-fit items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Popular</span>
              <h3 className="text-lg font-semibold leading-tight mt-2">Pro Plan</h3>
              <div className="mt-1">
                <span className="text-3xl font-bold">$29</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
            </div>
            <div className="px-6 flex flex-col gap-4">
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li>✓ Unlimited projects</li>
                <li>✓ Priority support</li>
                <li>✓ Advanced analytics</li>
                <li>✓ Custom integrations</li>
              </ul>
              <button className="h-9 px-4 py-2 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">Get Started</button>
            </div>
          </div>

          {/* Chat Card */}
          <div className="bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm md:col-span-2 lg:col-span-2">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold leading-tight">Messages</h3>
            </div>
            <div className="px-6 py-4 flex flex-col gap-4 min-h-48">
              {/* Received message */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-primary-foreground bg-primary rounded-full">AS</div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">Alex Smith</span>
                    <span className="text-xs text-muted-foreground">10:42 AM</span>
                  </div>
                  <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 text-sm max-w-xs">
                    Hey! How's the project going?
                  </div>
                </div>
              </div>
              {/* Sent message */}
              <div className="flex items-start gap-3 flex-row-reverse">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-primary-foreground bg-gradient-to-br from-[var(--gradient-start)] to-[var(--gradient-end)] rounded-full">JD</div>
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">10:44 AM</span>
                    <span className="text-sm font-medium">You</span>
                  </div>
                  <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-3 py-2 text-sm max-w-xs">
                    Going great! Just finished the UI components.
                  </div>
                </div>
              </div>
              {/* Received message */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xs font-semibold text-primary-foreground bg-primary rounded-full">AS</div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">Alex Smith</span>
                    <span className="text-xs text-muted-foreground">10:45 AM</span>
                  </div>
                  <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 text-sm max-w-xs">
                    Awesome! 🎉
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t">
              <div className="flex gap-2">
                <input type="text" className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground" placeholder="Type a message..." />
                <button className="h-9 px-4 inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90">Send</button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <a
            href="https://ui.barefootjs.dev"
            className="btn-secondary inline-flex"
          >
            Browse All Components →
          </a>
        </div>
      </div>
    </section>
  )
}
