import { defineConfig } from 'vite'
import { barefoot } from '../src/index.ts'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'

// Manual smoke-test config, matching the design doc's example exactly
// (adapter / components / templates — nothing else BarefootJS-specific).
// Run with `bunx vite build` from this directory. Not used by the
// automated test suite (e2e-vite-build.test.ts drives the same plugin via
// Vite's Node API instead, which is more robust in CI), but kept here so
// the plugin's real, file-based config-loading path has been exercised by
// hand at least once.
export default defineConfig({
  base: '/static/build/',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [
    barefoot({
      adapter: new GoTemplateAdapter({ packageName: 'main' }),
      components: ['src/components'],
      templates: 'internal/views',
    }),
  ],
})
