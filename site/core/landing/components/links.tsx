/**
 * Links section component
 *
 * Displays navigation links to documentation and resources.
 */

const links = [
  {
    title: 'Documentation',
    description: 'Learn how to use Barefoot.js in your project.',
    href: 'https://github.com/barefootjs/barefootjs',
  },
  {
    title: 'UI Components',
    description: 'Pre-built components using Barefoot.js.',
    href: 'https://ui.barefootjs.dev/',
  },
  {
    title: 'GitHub',
    description: 'View the source code and contribute.',
    href: 'https://github.com/barefootjs/barefootjs',
  },
]

export function Links() {
  return (
    <section className="py-16">
      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground text-center mb-12">
        Resources
      </h2>
      <div className="grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
        {links.map((link) => (
          <a
            key={link.title}
            href={link.href}
            className="block p-4 rounded-lg border hover:border-ring hover:bg-accent transition-colors"
          >
            <h3 className="font-semibold text-foreground">{link.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{link.description}</p>
          </a>
        ))}
      </div>
    </section>
  )
}
