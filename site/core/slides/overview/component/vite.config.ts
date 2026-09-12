import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'
import { CSRAdapter } from '@barefootjs/client/csr-adapter'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // 日記の tetris/component と同じ理由でオブジェクト形式。
      // mount と各コンポーネントが同じ runtime チャンクを共有する必要がある。
      input: { mount: 'mount.ts', narration: 'narration.ts' },
    },
  },
  plugins: [
    barefoot({
      adapter: new CSRAdapter(),
      components: [
        './components',
        // The UI kit components composed by Showcase.tsx. Registered by
        // individual directory (not the whole `ui/components/ui`) so the
        // heavy chart/xyflow packages under sibling dirs never enter this
        // deck's discovery/compile pass.
        '../../../../../ui/components/ui/card',
        '../../../../../ui/components/ui/button',
        '../../../../../ui/components/ui/input',
        '../../../../../ui/components/ui/label',
        '../../../../../ui/components/ui/checkbox',
        '../../../../../ui/components/ui/switch',
        '../../../../../ui/components/ui/avatar',
        '../../../../../ui/components/ui/badge',
        '../../../../../ui/components/ui/separator',
        // Static dependencies of the above (Button/Badge import Slot for
        // `asChild`; Checkbox imports CheckIcon) — never used directly by
        // Showcase.tsx, but still need their own compiled entry.
        '../../../../../ui/components/ui/slot',
        '../../../../../ui/components/ui/icon',
      ],
      // CSRAdapter's own `generate()` output is always empty, but a
      // multi-export file (card/avatar/icon/etc. each export several named
      // components from one module) still produces a non-empty
      // `markedTemplate` independent of the adapter — `generateModuleExports`
      // synthesizes the file's `export { A, B, ... }` statement into the
      // template regardless of which adapter is active, so the plugin's
      // `assertNoRealTemplateOutput` refuses to compile without `templates`
      // set. Point it at a throwaway dir under the already-gitignored
      // `dist/` — nothing in the deck build reads it; only the resulting
      // client JS chunks (via `dist/.vite/manifest.json`) matter.
      templates: 'dist/templates',
    }),
  ],
})
