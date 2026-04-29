#!/usr/bin/env node
// CLI entry point: arg parse → switch dispatch.

import { createContext } from './context'

const args = process.argv.slice(2)
const jsonFlag = args.includes('--json')
const filteredArgs = args.filter(a => a !== '--json')
const command = filteredArgs[0]
const commandArgs = filteredArgs.slice(1)

const ctx = await createContext(jsonFlag)

function printUsage() {
  console.log(`Usage: barefoot <command> [options]

Commands:
  build [--minify] [--force] [--watch]  Compile components using barefoot.config.ts
  init [--name <name>] [--adapter <name>]  Initialize a new BarefootJS project
  add <component...> [--force] [--registry <url>] Add components to your project
  search <query> [--dir <path>] [--registry <url>] Search components and documentation
  ui <component>              Show component documentation (props, examples, a11y)
  core [document]             Show core documentation (concepts, API, guides)
  scaffold <name> <comp...>   Generate component skeleton + IR test
  test [component]            Find and show test commands
  test:template <name>        Generate IR test from existing source
  preview <component>         Start preview dev server for visual check
  preview:generate <comp> [--force]  Generate preview file from component metadata
  tokens [--category <cat>]   List design tokens (categories: typography, spacing, etc.)
  meta:extract                Extract metadata from ui/components/ui/*.tsx
  inspect <component>         Show signal dependency graph from IR
  why-update <comp> <signal>  Show update propagation path for a signal/memo
  why-wrap <component>        Show Solid-style wrap-by-default fallback bindings (#937)

Options:
  --json                      Output in JSON format
  --debug                     (test) Output signal change trace log

Workflow:
  1. barefoot init                         — Initialize project
  2. barefoot search <query>               — Find components and docs
  3. barefoot add <component...>           — Add to your project
  4. barefoot ui <component>               — Learn props and usage
  5. barefoot core <topic>                 — Read framework docs
  6. bun test <path>                       — Verify
  7. barefoot preview <component>          — Visual preview in browser
  8. barefoot inspect <component>          — Debug: signal dependency graph
  9. barefoot why-update <comp> <signal>   — Debug: update propagation path`)
}

switch (command) {
  case 'build': {
    const { run } = await import('./commands/build')
    await run(commandArgs, ctx)
    break
  }

  case 'init': {
    const { run } = await import('./commands/init')
    await run(commandArgs, ctx)
    break
  }

  case 'add': {
    const { run } = await import('./commands/add')
    await run(commandArgs, ctx)
    break
  }

  case 'search': {
    const { run } = await import('./commands/search')
    await run(commandArgs, ctx)
    break
  }

  case 'ui': {
    const { run } = await import('./commands/ui')
    run(commandArgs, ctx)
    break
  }

  case 'core': {
    const { run } = await import('./commands/core')
    run(commandArgs, ctx)
    break
  }

  case 'test': {
    // barefoot test --debug <component> routes to debug-test command
    if (commandArgs.includes('--debug')) {
      const debugArgs = commandArgs.filter(a => a !== '--debug')
      const { run } = await import('./commands/debug-test')
      await run(debugArgs, ctx)
    } else {
      const { run } = await import('./commands/test')
      run(commandArgs, ctx)
    }
    break
  }

  case 'test:template': {
    const { run } = await import('./commands/test-template')
    run(commandArgs, ctx)
    break
  }

  case 'scaffold': {
    const { run } = await import('./commands/scaffold')
    run(commandArgs, ctx)
    break
  }

  case 'preview': {
    const { run } = await import('./commands/preview')
    await run(commandArgs, ctx)
    break
  }

  case 'preview:generate': {
    const { run } = await import('./commands/preview-generate')
    await run(commandArgs, ctx)
    break
  }

  case 'tokens': {
    const { run } = await import('./commands/tokens')
    await run(commandArgs, ctx)
    break
  }

  case 'meta:extract': {
    const { run } = await import('./commands/meta-extract')
    await run(commandArgs, ctx)
    break
  }

  case 'inspect': {
    const { run } = await import('./commands/inspect')
    await run(commandArgs, ctx)
    break
  }

  case 'why-update': {
    const { run } = await import('./commands/why-update')
    await run(commandArgs, ctx)
    break
  }

  case 'why-wrap': {
    const { run } = await import('./commands/why-wrap')
    await run(commandArgs, ctx)
    break
  }

  default:
    printUsage()
    break
}
