#!/usr/bin/env node
// CLI entry point: arg parse → dispatch.

import { createContext } from './context'

const args = process.argv.slice(2)
const jsonFlag = args.includes('--json')
const filteredArgs = args.filter(a => a !== '--json')
const command = filteredArgs[0]
const sub = filteredArgs[1]
const rest = filteredArgs.slice(2)

const ctx = await createContext(jsonFlag)

function printUsage() {
  console.log(`Usage: bf <command> [options]

Scaffold a new project with \`npm create barefootjs@latest\`, then:

Daily:
  add <comp...> [--force] [--registry <url>]  Add component(s) to your project
  docs <component>                            Show docs for a component
  guide [topic]                               Show framework guides (concepts, API)
  search <query> [--dir <path>] [--registry <url>]  Search components and docs
  preview [component]                         Open visual preview (no arg lists previewable)
  build [--minify] [--force] [--watch]        Compile components using barefoot.config.ts

Create:
  gen component <name> <comp...>              Generate a new component skeleton + IR test
  gen test <component>                        Generate IR test from existing component
  gen preview <component> [--force]           Generate preview file from component metadata

Tokens:
  tokens [--category <cat>]                   List design tokens
  tokens apply <url>                          Apply token overrides from Studio URL

Debug:
  debug graph <component>                     Show signal dependency graph
  debug trace <component> <signal>            Trace update propagation for a signal/memo
  debug fallbacks <component>                 Show wrap-by-default fallback bindings (#937)
  debug signals <component>                   Show signal initialization trace

Options:
  --json                                      Output in JSON format

Workflow:
  1. npm create barefootjs@latest             — Scaffold a new project
  2. bf search <query>                        — Find components and docs
  3. bf add <comp...>                         — Add to your project
  4. bf docs <component>                      — Learn props and usage
  5. bf guide <topic>                         — Read framework docs
  6. bun test <path>                          — Verify
  7. bf preview <component>                   — Visual preview in browser
  8. bf debug graph <component>               — Debug: signal dependency graph
  9. bf debug trace <comp> <signal>           — Debug: update propagation path`)
}

switch (command) {
  case 'build': {
    const { run } = await import('./commands/build')
    await run(filteredArgs.slice(1), ctx)
    break
  }

  case 'init': {
    // Internal: gated by BAREFOOT_INIT_VIA_CREATE=1, which only
    // create-barefootjs sets. Direct `bf init` invocations are
    // refused inside ./commands/init with a redirect to
    // `npm create barefootjs@latest`. Not shown in --help.
    const { run } = await import('./commands/init')
    await run(filteredArgs.slice(1), ctx)
    break
  }

  case 'add': {
    const { run } = await import('./commands/add')
    await run(filteredArgs.slice(1), ctx)
    break
  }

  case 'search': {
    const { run } = await import('./commands/search')
    await run(filteredArgs.slice(1), ctx)
    break
  }

  case 'docs': {
    const { run } = await import('./commands/docs')
    run(filteredArgs.slice(1), ctx)
    break
  }

  case 'guide': {
    const { run } = await import('./commands/guide')
    run(filteredArgs.slice(1), ctx)
    break
  }

  case 'preview': {
    const { run } = await import('./commands/preview')
    await run(filteredArgs.slice(1), ctx)
    break
  }

  case 'tokens': {
    if (sub === 'apply') {
      const { run } = await import('./commands/tokens-apply')
      await run(rest, ctx)
    } else {
      const { run } = await import('./commands/tokens')
      await run(filteredArgs.slice(1), ctx)
    }
    break
  }

  case 'gen': {
    if (sub === 'component') {
      const { run } = await import('./commands/gen-component')
      run(rest, ctx)
    } else if (sub === 'test') {
      const { run } = await import('./commands/gen-test')
      run(rest, ctx)
    } else if (sub === 'preview') {
      const { run } = await import('./commands/gen-preview')
      await run(rest, ctx)
    } else {
      console.error('Usage: bf gen <component|test|preview> ...')
      process.exit(1)
    }
    break
  }

  case 'debug': {
    if (sub === 'graph') {
      const { run } = await import('./commands/debug-graph')
      await run(rest, ctx)
    } else if (sub === 'trace') {
      const { run } = await import('./commands/debug-trace')
      await run(rest, ctx)
    } else if (sub === 'fallbacks') {
      const { run } = await import('./commands/debug-fallbacks')
      await run(rest, ctx)
    } else if (sub === 'signals') {
      const { run } = await import('./commands/debug-signals')
      await run(rest, ctx)
    } else {
      console.error('Usage: bf debug <graph|trace|fallbacks|signals> ...')
      process.exit(1)
    }
    break
  }

  case 'meta': {
    // Internal: regenerates ui/meta/. Not shown in --help.
    if (sub === 'extract') {
      const { run } = await import('./commands/meta-extract')
      await run(rest, ctx)
    } else {
      console.error('Usage: bf meta extract')
      process.exit(1)
    }
    break
  }

  default:
    printUsage()
    break
}
