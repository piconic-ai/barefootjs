// barefoot preview — start preview dev server for visual check.
//
// `preview` is not shipped in the npm distribution of `@barefootjs/cli`.
// The current preview package is a monorepo-internal dev tool (hardcoded
// paths, Hono + Bun-specific `hono/bun`, `bunx unocss` shell-out). A
// publish-ready rewrite is tracked in
// https://github.com/piconic-ai/barefootjs/issues/885.
//
// When the CLI is run from inside the barefootjs monorepo (source tree
// available), we still delegate to the existing preview package.

import type { CliContext } from '../context'

export async function run(args: string[], _ctx: CliContext): Promise<void> {
  const component = args[0]
  if (!component) {
    console.error('Usage: barefoot preview <component>')
    console.error('Example: barefoot preview checkbox')
    process.exit(1)
  }

  let runPreview: ((name: string) => Promise<void>) | null = null
  try {
    // Build the specifier at runtime so the bundler does not statically
    // resolve (and inline) the monorepo-internal preview package.
    const specifier = ['..', '..', '..', 'preview', 'src', 'index'].join('/')
    const mod = (await import(specifier)) as { runPreview: (name: string) => Promise<void> }
    runPreview = mod.runPreview
  } catch {
    // Preview package not available in this distribution.
  }

  if (!runPreview) {
    console.error('barefoot preview is not available in the npm distribution yet.')
    console.error('Tracking issue: https://github.com/piconic-ai/barefootjs/issues/885')
    console.error('Workaround: run the barefootjs monorepo locally with bun.')
    process.exit(1)
  }

  await runPreview(component)
}
