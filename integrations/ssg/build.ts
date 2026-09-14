#!/usr/bin/env bun
import { resolve } from 'node:path'
import { build as viteBuild } from 'vite'
import { generateSite } from './scripts/generate-site.tsx'
import { BASE_PATH, OUT_DIR } from './constants.ts'

const ROOT = import.meta.dirname

await viteBuild({ configFile: resolve(ROOT, 'vite.config.ts') })
await generateSite({ projectDir: ROOT, outDir: resolve(ROOT, OUT_DIR), basePath: BASE_PATH })
