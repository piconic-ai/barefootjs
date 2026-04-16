// Resolve a component name or file path to a source file + optional component name.
//
// Resolution order:
// 1. Direct file path (absolute or relative)
// 2. ui/components/ui/<name>/index.tsx (monorepo layout)
// 3. barefoot.json configured component directory

import { existsSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'

export interface ResolvedSource {
  filePath: string
  componentName?: string
}

export function resolveComponentSource(nameOrPath: string, ctx: CliContext): ResolvedSource | null {
  // 1. Direct file path
  if (nameOrPath.endsWith('.tsx') || nameOrPath.endsWith('.ts')) {
    const abs = path.isAbsolute(nameOrPath) ? nameOrPath : path.resolve(nameOrPath)
    if (existsSync(abs)) {
      return { filePath: abs }
    }
  }

  // 2. ui/components/ui/<name>/index.tsx (monorepo)
  const monoPath = path.join(ctx.root, 'ui/components/ui', nameOrPath, 'index.tsx')
  if (existsSync(monoPath)) {
    return { filePath: monoPath }
  }

  // 3. barefoot.json configured directory
  if (ctx.config && ctx.projectDir) {
    const configPath = path.join(ctx.projectDir, ctx.config.paths.components, nameOrPath, 'index.tsx')
    if (existsSync(configPath)) {
      return { filePath: configPath }
    }
    // Also try direct file
    const directPath = path.join(ctx.projectDir, ctx.config.paths.components, `${nameOrPath}.tsx`)
    if (existsSync(directPath)) {
      return { filePath: directPath }
    }
  }

  // 4. Try as a PascalCase component name in current directory
  const cwdPath = path.resolve(`${nameOrPath}.tsx`)
  if (existsSync(cwdPath)) {
    return { filePath: cwdPath }
  }

  return null
}
