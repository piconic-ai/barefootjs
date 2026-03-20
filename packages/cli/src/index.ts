#!/usr/bin/env bun
// CLI entry point: arg parse → switch dispatch.

import { createContext } from './context'

const args = process.argv.slice(2)
const jsonFlag = args.includes('--json')
const filteredArgs = args.filter(a => a !== '--json')
const command = filteredArgs[0]
const commandArgs = filteredArgs.slice(1)

const ctx = createContext(jsonFlag)

function printUsage() {
  console.log(`Usage: barefoot <command> [options]

Commands:
  build [--minify]            Compile components using barefoot.config.ts
  init [--name <name>] [--from <url>]  Initialize a new BarefootJS project
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

Options:
  --json                      Output in JSON format

Workflow:
  1. barefoot init                         — Initialize project
  2. barefoot search <query>               — Find components and docs
  3. barefoot add <component...>           — Add to your project
  4. barefoot ui <component>               — Learn props and usage
  5. barefoot core <topic>                 — Read framework docs
  6. bun test <path>                       — Verify
  7. barefoot preview <component>          — Visual preview in browser`)
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
    const { run } = await import('./commands/test')
    run(commandArgs, ctx)
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

  default:
    printUsage()
    break
}
